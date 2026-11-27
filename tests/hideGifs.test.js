// Tests for /hidegifs: reading times, spotting GIFs, the saved channels, hiding previews on a timer and the command's limits.
const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const { parseTime, formatTime, isGifMessage, hideDelay } = require("../src/hideGifs/rules");
const { createGifHider } = require("../src/hideGifs/hider");
const { openStore } = require("../src/store");

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("reads seconds, minutes, hours and days", () => {
  assert.deepEqual(parseTime("30s"), { ms: 30 * SECOND });
  assert.deepEqual(parseTime("5m"), { ms: 5 * MINUTE });
  assert.deepEqual(parseTime("2h"), { ms: 2 * HOUR });
  assert.deepEqual(parseTime("3d"), { ms: 3 * DAY });
  assert.deepEqual(parseTime("1h 30m"), { ms: 90 * MINUTE });
  assert.deepEqual(parseTime("1m30s"), { ms: 90 * SECOND });
  assert.deepEqual(parseTime(" 10 MIN "), { ms: 10 * MINUTE });
  assert.deepEqual(parseTime("2 hours"), { ms: 2 * HOUR });
});

test("a plain number is seconds", () => {
  assert.deepEqual(parseTime("45"), { ms: 45 * SECOND });
  assert.deepEqual(parseTime("0"), { ms: 0 });
});

test("text that isn't a time gives an error", () => {
  for (const raw of ["", "soon", "5x", "m5", "1h 1h", "-5s"]) {
    assert.ok(parseTime(raw).error, `expected an error for "${raw}"`);
  }
});

test("times are written out in words", () => {
  assert.equal(formatTime(0), "0 seconds");
  assert.equal(formatTime(1 * SECOND), "1 second");
  assert.equal(formatTime(30 * SECOND), "30 seconds");
  assert.equal(formatTime(90 * MINUTE), "1 hour 30 minutes");
  assert.equal(formatTime(DAY + 2 * HOUR + 5 * SECOND), "1 day 2 hours 5 seconds");
});

test("spots GIF links from Tenor, Giphy, Klipy and links ending in .gif", () => {
  const gifLinks = [
    "https://tenor.com/view/cat-dance-gif-123",
    "look https://media.tenor.com/abc/cat.gif lol",
    "https://giphy.com/gifs/funny-abc",
    "https://media1.giphy.com/media/abc/giphy.webp",
    "https://klipy.com/gifs/cat-123",
    "https://cdn.discordapp.com/attachments/1/2/dance.gif?ex=1",
    "https://example.com/thing.GIF",
  ];
  for (const content of gifLinks) {
    assert.equal(isGifMessage({ content, embeds: [] }), true, content);
  }
});

test("ignores messages without a GIF", () => {
  const notGifs = [
    "hello",
    "https://youtube.com/watch?v=abc",
    "https://example.com/gifts",
    "https://example.com/image.png",
    "I like tenor.com",
  ];
  for (const content of notGifs) {
    assert.equal(isGifMessage({ content, embeds: [] }), false, content);
  }
});

test("a gifv embed counts as a GIF even without a matching link", () => {
  assert.equal(isGifMessage({ content: "https://example.com/x", embeds: [{ data: { type: "gifv" } }] }), true);
  assert.equal(isGifMessage({ content: "", embeds: [{ data: { type: "rich" } }] }), false);
});

test("hide delay counts from when the GIF was posted", () => {
  const now = 100 * MINUTE;
  assert.equal(hideDelay(now - 10 * SECOND, 30 * SECOND, now), 20 * SECOND);
  assert.equal(hideDelay(now - 5 * MINUTE, 30 * SECOND, now), 0);
  assert.equal(hideDelay(now, 0, now), 0);
});

test("saves a channel's hide mode and forgets it once it runs out", () => {
  const store = openStore(":memory:");
  store.setHideGifs({ guildId: "1", channelId: "50", timerMs: 30 * SECOND, endsAt: 2000, userId: "9" });
  assert.deepEqual(store.getHideGifs("50", 1000), { guildId: "1", channelId: "50", timerMs: 30 * SECOND, endsAt: 2000 });
  assert.equal(store.getHideGifs("50", 2000), null);
  assert.equal(store.getHideGifs("51", 1000), null);
});

test("starting again on the same channel replaces the old mode", () => {
  const store = openStore(":memory:");
  store.setHideGifs({ guildId: "1", channelId: "50", timerMs: 1, endsAt: 2000, userId: "9" });
  store.setHideGifs({ guildId: "1", channelId: "50", timerMs: 5, endsAt: 3000, userId: "9" });
  assert.equal(store.getHideGifs("50", 1000).timerMs, 5);
  assert.equal(store.listHideGifs(1000).length, 1);
});

test("stopping removes the mode, and lists only show running ones", () => {
  const store = openStore(":memory:");
  store.setHideGifs({ guildId: "1", channelId: "50", timerMs: 1, endsAt: 2000, userId: "9" });
  store.setHideGifs({ guildId: "1", channelId: "60", timerMs: 1, endsAt: 500, userId: "9" });
  assert.deepEqual(store.listHideGifs(1000).map((row) => row.channelId), ["50"]);
  assert.equal(store.stopHideGifs("50", 1000), true);
  assert.equal(store.stopHideGifs("50", 1000), false);
  assert.deepEqual(store.listHideGifs(1000), []);
});

function fakeMessage(id, content, createdTimestamp, { suppressed = false } = {}) {
  const message = {
    id,
    content,
    embeds: [],
    createdTimestamp,
    hidden: suppressed,
    flags: { has: (flag) => flag === MessageFlags.SuppressEmbeds && message.hidden },
    suppressEmbeds: async () => {
      message.hidden = true;
    },
    inGuild: () => true,
  };
  return message;
}

function fakeChannel(id, messages) {
  return {
    id,
    guildId: "1",
    messages: {
      async fetch({ limit, before }) {
        const start = before ? messages.findIndex((m) => m.id === before) + 1 : 0;
        const page = messages.slice(start, start + limit);
        return new Map(page.map((m) => [m.id, m]));
      },
    },
  };
}

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10 * HOUR });
  const store = openStore(":memory:");
  const hider = createGifHider({ store });
  return { store, hider };
}

test("starting hides old GIFs right away and new-ish ones when their timer runs out", async (t) => {
  const { hider } = setup(t);
  const now = Date.now();
  const old = fakeMessage("3", "https://tenor.com/view/a", now - 5 * MINUTE);
  const recent = fakeMessage("2", "https://tenor.com/view/b", now - 10 * SECOND);
  const text = fakeMessage("1", "just chatting", now - 1 * SECOND);
  const channel = fakeChannel("50", [text, recent, old]);

  const result = await hider.start(channel, { timerMs: 30 * SECOND, endsAt: now + HOUR, userId: "9" });

  assert.deepEqual(result, { hidden: 1, scheduled: 1 });
  assert.equal(old.hidden, true);
  assert.equal(recent.hidden, false);
  t.mock.timers.tick(20 * SECOND);
  await Promise.resolve();
  assert.equal(recent.hidden, true);
  assert.equal(text.hidden, false);
});

test("GIFs that are already hidden are left alone", async (t) => {
  const { hider } = setup(t);
  const done = fakeMessage("1", "https://tenor.com/view/a", Date.now() - HOUR, { suppressed: true });
  const result = await hider.start(fakeChannel("50", [done]), { timerMs: 0, endsAt: Date.now() + HOUR, userId: "9" });
  assert.deepEqual(result, { hidden: 0, scheduled: 0 });
});

test("looks back through the last 200 messages when starting", async (t) => {
  const { hider } = setup(t);
  const now = Date.now();
  const messages = Array.from({ length: 250 }, (_, i) =>
    fakeMessage(String(1000 - i), "https://tenor.com/view/x", now - HOUR)
  );
  const result = await hider.start(fakeChannel("50", messages), { timerMs: 0, endsAt: now + HOUR, userId: "9" });
  assert.equal(result.hidden, 200);
  assert.equal(messages[199].hidden, true);
  assert.equal(messages[200].hidden, false);
});

test("new GIFs in a watched channel are hidden after the timer", async (t) => {
  const { hider } = setup(t);
  const channel = fakeChannel("50", []);
  await hider.start(channel, { timerMs: 30 * SECOND, endsAt: Date.now() + HOUR, userId: "9" });

  const gif = { ...fakeMessage("7", "https://giphy.com/gifs/x", Date.now()), channelId: "50" };
  gif.suppressEmbeds = async () => {
    gif.hidden = true;
  };
  hider.handleMessage(gif);
  t.mock.timers.tick(29 * SECOND);
  await Promise.resolve();
  assert.equal(gif.hidden, false);
  t.mock.timers.tick(1 * SECOND);
  await Promise.resolve();
  assert.equal(gif.hidden, true);
});

test("GIFs in other channels, or after the mode ran out, are left alone", async (t) => {
  const { hider } = setup(t);
  await hider.start(fakeChannel("50", []), { timerMs: 0, endsAt: Date.now() + HOUR, userId: "9" });

  const elsewhere = { ...fakeMessage("7", "https://giphy.com/gifs/x", Date.now()), channelId: "60" };
  hider.handleMessage(elsewhere);
  t.mock.timers.tick(HOUR + SECOND);
  await Promise.resolve();
  const late = { ...fakeMessage("8", "https://giphy.com/gifs/x", Date.now()), channelId: "50" };
  late.suppressEmbeds = async () => {
    late.hidden = true;
  };
  hider.handleMessage(late);
  t.mock.timers.tick(SECOND);
  await Promise.resolve();
  assert.equal(elsewhere.hidden, false);
  assert.equal(late.hidden, false);
});

test("stopping cancels GIFs still waiting to be hidden", async (t) => {
  const { hider } = setup(t);
  const recent = fakeMessage("2", "https://tenor.com/view/b", Date.now());
  const channel = fakeChannel("50", [recent]);
  await hider.start(channel, { timerMs: 30 * SECOND, endsAt: Date.now() + HOUR, userId: "9" });

  assert.equal(hider.stop(channel), true);
  assert.equal(hider.stop(channel), false);
  t.mock.timers.tick(MINUTE);
  await Promise.resolve();
  assert.equal(recent.hidden, false);
});

test("on startup, running modes catch up on GIFs posted while the bot was off", async (t) => {
  const { store, hider } = setup(t);
  const missed = fakeMessage("1", "https://tenor.com/view/a", Date.now() - 10 * MINUTE);
  const channel = fakeChannel("50", [missed]);
  store.setHideGifs({ guildId: "1", channelId: "50", timerMs: 30 * SECOND, endsAt: Date.now() + HOUR, userId: "9" });
  store.setHideGifs({ guildId: "1", channelId: "60", timerMs: 0, endsAt: Date.now() - 1, userId: "9" });
  const client = { channels: { fetch: async (id) => (id === "50" ? channel : null) } };

  await hider.checkOnStartup(client);

  assert.equal(missed.hidden, true);
});

test("a GIF deleted before its timer runs out doesn't break anything", async (t) => {
  const { hider } = setup(t);
  await hider.start(fakeChannel("50", []), { timerMs: 5 * SECOND, endsAt: Date.now() + HOUR, userId: "9" });
  const gone = { ...fakeMessage("7", "https://tenor.com/view/x", Date.now()), channelId: "50" };
  gone.suppressEmbeds = async () => {
    throw Object.assign(new Error("Unknown Message"), { code: 10008 });
  };
  hider.handleMessage(gone);
  t.mock.timers.tick(5 * SECOND);
  await Promise.resolve();
  await Promise.resolve();
});

test("the command checks the timer and how long it runs for", () => {
  const { checkTimes } = require("../src/commands/hideGifs");
  assert.deepEqual(checkTimes("30s", "2h"), { timerMs: 30 * SECOND, forMs: 2 * HOUR });
  assert.deepEqual(checkTimes("0", "1m"), { timerMs: 0, forMs: MINUTE });
  assert.match(checkTimes("2d", "2h").error, /at most 1 day/);
  assert.match(checkTimes("30s", "30s").error, /1 minute up to 30 days/);
  assert.match(checkTimes("30s", "31d").error, /1 minute up to 30 days/);
  assert.match(checkTimes("soon", "2h").error, /^Timer:/);
  assert.match(checkTimes("30s", "later").error, /^For:/);
});
