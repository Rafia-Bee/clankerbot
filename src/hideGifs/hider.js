// Hides GIF previews in channels where /hidegifs is on, a set time after each GIF is posted. The link itself stays.
//   createGifHider  returns the functions below
//   start           turns the mode on for a channel and handles GIFs in its last 200 messages
//   stop            turns the mode off for a channel and cancels GIFs still waiting to be hidden
//   handleMessage   schedules a new GIF's preview to be hidden, if its channel has the mode on
//   checkOnStartup  catches up on GIFs posted while the bot was off, in every channel where the mode is running
//   sweep           goes through a channel's recent messages, hiding GIFs that are due and scheduling the rest
//   schedule        hides one GIF's preview after a delay (straight away when the delay is 0)
//   hide            hides one GIF's preview, ignoring GIFs that were deleted in the meantime
//   getGifHider     the shared hider used by the bot and the /hidegifs command

const { MessageFlags } = require("discord.js");
const { getStore } = require("../store");
const { isGifMessage, hideDelay } = require("./rules");

const START_LOOKBACK = 200;
const STARTUP_LOOKBACK = 100;
const PAGE_SIZE = 100;
const UNKNOWN_MESSAGE = 10008;

let shared = null;

function createGifHider({ store = getStore() } = {}) {
  const pending = new Map();

  async function hide(message) {
    try {
      await message.suppressEmbeds(true);
    } catch (error) {
      if (error?.code !== UNKNOWN_MESSAGE) console.error(`Couldn't hide the GIF preview on message ${message.id}:`, error);
    }
  }

  function schedule(message, channelId, delayMs) {
    clearTimeout(pending.get(message.id)?.timeout);
    const timeout = setTimeout(() => {
      pending.delete(message.id);
      hide(message);
    }, delayMs);
    pending.set(message.id, { timeout, channelId });
  }

  function cancelChannel(channelId) {
    for (const [id, entry] of pending) {
      if (entry.channelId !== channelId) continue;
      clearTimeout(entry.timeout);
      pending.delete(id);
    }
  }

  async function sweep(channel, timerMs, limit) {
    let hidden = 0;
    let scheduled = 0;
    let before;
    for (let seen = 0; seen < limit; ) {
      const page = [...(await channel.messages.fetch({ limit: Math.min(PAGE_SIZE, limit - seen), before })).values()];
      if (page.length === 0) break;
      seen += page.length;
      before = page[page.length - 1].id;
      for (const message of page) {
        if (!isGifMessage(message) || message.flags.has(MessageFlags.SuppressEmbeds)) continue;
        const delay = hideDelay(message.createdTimestamp, timerMs, Date.now());
        if (delay === 0) {
          await hide(message);
          hidden += 1;
        } else {
          schedule(message, channel.id, delay);
          scheduled += 1;
        }
      }
    }
    return { hidden, scheduled };
  }

  return {
    async start(channel, { timerMs, endsAt, userId }) {
      store.setHideGifs({ guildId: channel.guildId, channelId: channel.id, timerMs, endsAt, userId });
      cancelChannel(channel.id);
      return sweep(channel, timerMs, START_LOOKBACK);
    },

    stop(channel) {
      cancelChannel(channel.id);
      return store.stopHideGifs(channel.id);
    },

    handleMessage(message) {
      if (!message.inGuild() || !isGifMessage(message)) return;
      const mode = store.getHideGifs(message.channelId, Date.now());
      if (!mode) return;
      schedule(message, message.channelId, hideDelay(message.createdTimestamp, mode.timerMs, Date.now()));
    },

    async checkOnStartup(client) {
      for (const mode of store.listHideGifs(Date.now())) {
        const channel = await client.channels.fetch(mode.channelId).catch(() => null);
        if (!channel) continue;
        await sweep(channel, mode.timerMs, STARTUP_LOOKBACK).catch((error) =>
          console.error(`Couldn't catch up on GIFs in channel ${mode.channelId}:`, error)
        );
      }
    },
  };
}

function getGifHider() {
  shared ??= createGifHider();
  return shared;
}

module.exports = { createGifHider, getGifHider };
