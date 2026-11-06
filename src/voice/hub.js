// Runs the voice hubs: gives a member their own voice channel when they join a hub, and deletes it once it's been empty for a while.
//   createVoiceHubs     the functions below, for a logged-in client
//   handleVoiceUpdate   reacts to a member joining, leaving or moving between voice channels
//   makeMemberChannel   moves a member to their own channel, making it first if they don't have one
//   scheduleIfEmpty     starts the delete countdown for a member's channel when nobody is in it
//   deleteIfEmpty       deletes a member's channel when its countdown runs out and it's still empty
//   checkOnStartup      forgets hubs and channels deleted while the bot was off, and catches up on what it missed
//   forgetChannel       forgets a hub or member's channel that was deleted

const { ChannelType } = require("discord.js");
const { getStore } = require("../store");
const { voiceChannelName, planVoiceMove, tempChannelOverwrites, EMPTY_DELETE_SECONDS } = require("./rules");
const { createDeleteTimers } = require("./timers");

const UNKNOWN_CHANNEL = 10003;

function createVoiceHubs(client, store = getStore()) {
  const timers = createDeleteTimers(EMPTY_DELETE_SECONDS * 1000, (channelId) => {
    deleteIfEmpty(channelId).catch((error) => console.error(`Couldn't delete voice channel ${channelId}:`, error));
  });
  const making = new Set();

  function scheduleIfEmpty(channel) {
    if (channel && channel.members.size === 0) timers.schedule(channel.id);
  }

  async function deleteIfEmpty(channelId) {
    if (!store.isTempChannel(channelId)) return;
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      store.removeTempChannel(channelId);
      return;
    }
    if (channel.members.size > 0) return;
    try {
      await channel.delete("Nobody was in it");
    } catch (error) {
      if (error.code !== UNKNOWN_CHANNEL) throw error;
    }
    store.removeTempChannel(channelId);
  }

  async function makeMemberChannel(member, hub) {
    if (making.has(member.id)) return;
    making.add(member.id);
    try {
      const { guild } = member;
      const saved = store.getTempChannelByOwner(guild.id, member.id);
      let channel = saved && guild.channels.cache.get(saved.channel_id);
      if (saved && !channel) store.removeTempChannel(saved.channel_id);
      if (!channel) {
        const hubOverwrites = hub.permissionOverwrites.cache.map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield,
        }));
        channel = await guild.channels.create({
          name: voiceChannelName(member.displayName),
          type: ChannelType.GuildVoice,
          parent: hub.parentId,
          bitrate: hub.bitrate,
          permissionOverwrites: tempChannelOverwrites(hubOverwrites, member.id),
          reason: `Voice channel for ${member.user.tag}`,
        });
        store.addTempChannel({ guildId: guild.id, channelId: channel.id, ownerId: member.id, hubId: hub.id });
      }
      if (member.voice.channelId === hub.id) {
        await member.voice.setChannel(channel).catch((error) => {
          console.warn(`Couldn't move ${member.user.tag} to their voice channel: ${error.message}`);
        });
      }
      scheduleIfEmpty(channel);
    } catch (error) {
      console.error(`Couldn't make a voice channel for ${member.user.tag}:`, error);
    } finally {
      making.delete(member.id);
    }
  }

  async function handleVoiceUpdate(oldState, newState) {
    const plan = planVoiceMove({
      fromId: oldState.channelId,
      toId: newState.channelId,
      isHub: store.isHub,
      isTemp: store.isTempChannel,
    });
    if (plan.keepChannel) timers.cancel(plan.keepChannel);
    if (plan.checkEmpty) scheduleIfEmpty(oldState.channel);
    if (plan.makeChannel && newState.member && !newState.member.user.bot) {
      await makeMemberChannel(newState.member, newState.channel);
    }
  }

  async function checkOnStartup() {
    const isAvailable = (guildId) => client.guilds.cache.get(guildId)?.available;
    for (const row of store.listTempChannels()) {
      if (!isAvailable(row.guild_id)) continue;
      const channel = client.channels.cache.get(row.channel_id);
      if (channel) scheduleIfEmpty(channel);
      else store.removeTempChannel(row.channel_id);
    }
    for (const row of store.listHubs()) {
      if (!isAvailable(row.guild_id)) continue;
      const hub = client.channels.cache.get(row.channel_id);
      if (!hub) {
        store.removeHub(row.channel_id);
        continue;
      }
      for (const member of hub.members.values()) {
        if (!member.user.bot) await makeMemberChannel(member, hub);
      }
    }
  }

  function forgetChannel(channelId) {
    timers.cancel(channelId);
    store.removeHub(channelId);
    store.removeTempChannel(channelId);
  }

  return { handleVoiceUpdate, checkOnStartup, forgetChannel };
}

module.exports = { createVoiceHubs };
