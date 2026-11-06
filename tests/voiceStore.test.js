// Tests for the voice hubs and the voice channels made from them, saved in the database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openStore } = require("../src/store");

let store;
test.beforeEach(() => {
  store = openStore(":memory:");
});

test("saves a hub and knows it's a hub", () => {
  assert.equal(store.addHub("1", "50"), true);
  assert.equal(store.isHub("50"), true);
  assert.equal(store.isHub("51"), false);
  assert.deepEqual(
    store.listHubs().map((hub) => [hub.guild_id, hub.channel_id]),
    [["1", "50"]]
  );
});

test("the same hub can't be added twice", () => {
  store.addHub("1", "50");
  assert.equal(store.addHub("1", "50"), false);
  assert.equal(store.listHubs().length, 1);
});

test("removes a hub", () => {
  store.addHub("1", "50");
  assert.equal(store.removeHub("50"), true);
  assert.equal(store.removeHub("50"), false);
  assert.equal(store.isHub("50"), false);
});

test("saves a member's voice channel and finds it by channel or by owner", () => {
  store.addTempChannel({ guildId: "1", channelId: "60", ownerId: "100", hubId: "50" });
  assert.equal(store.isTempChannel("60"), true);
  assert.equal(store.isTempChannel("61"), false);
  assert.equal(store.getTempChannelByOwner("1", "100").channel_id, "60");
  assert.equal(store.getTempChannelByOwner("2", "100"), undefined);
  assert.equal(store.getTempChannelByOwner("1", "200"), undefined);
});

test("lists and removes members' voice channels", () => {
  store.addTempChannel({ guildId: "1", channelId: "60", ownerId: "100", hubId: "50" });
  store.addTempChannel({ guildId: "1", channelId: "61", ownerId: "200", hubId: "50" });
  assert.deepEqual(
    store.listTempChannels().map((row) => row.channel_id),
    ["60", "61"]
  );
  assert.equal(store.removeTempChannel("60"), true);
  assert.equal(store.removeTempChannel("60"), false);
  assert.equal(store.isTempChannel("60"), false);
  assert.deepEqual(
    store.listTempChannels().map((row) => row.channel_id),
    ["61"]
  );
});
