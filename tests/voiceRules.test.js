// Tests for the voice hub rules: channel names, what to do when someone moves, and the owner's permissions.
const test = require("node:test");
const assert = require("node:assert/strict");
const { OverwriteType, PermissionFlagsBits } = require("discord.js");
const { voiceChannelName, planVoiceMove, tempChannelOverwrites, OWNER_PERMISSIONS } = require("../src/voice/rules");

const hubs = new Set(["hub"]);
const temps = new Set(["kfc-vc", "other-vc"]);
const plan = (fromId, toId) =>
  planVoiceMove({ fromId, toId, isHub: (id) => hubs.has(id), isTemp: (id) => temps.has(id) });

test("names the channel after the member's nickname", () => {
  assert.equal(voiceChannelName("KFC"), "KFC's VC");
});

test("cuts long names so the channel name fits Discord's 100 character limit", () => {
  const name = voiceChannelName("a".repeat(150));
  assert.equal(name.length, 100);
  assert.ok(name.endsWith("'s VC"));
});

test("joining the hub makes a channel", () => {
  assert.deepEqual(plan(null, "hub"), { makeChannel: true, keepChannel: null, checkEmpty: null });
});

test("moving from a member's channel to the hub makes a channel and checks the old one", () => {
  assert.deepEqual(plan("kfc-vc", "hub"), { makeChannel: true, keepChannel: null, checkEmpty: "kfc-vc" });
});

test("joining a member's channel stops it being deleted", () => {
  assert.deepEqual(plan(null, "kfc-vc"), { makeChannel: false, keepChannel: "kfc-vc", checkEmpty: null });
});

test("leaving a member's channel checks if it's empty", () => {
  assert.deepEqual(plan("kfc-vc", null), { makeChannel: false, keepChannel: null, checkEmpty: "kfc-vc" });
});

test("moving between two members' channels does both", () => {
  assert.deepEqual(plan("kfc-vc", "other-vc"), { makeChannel: false, keepChannel: "other-vc", checkEmpty: "kfc-vc" });
});

test("muting or deafening in the same channel does nothing", () => {
  assert.deepEqual(plan("hub", "hub"), { makeChannel: false, keepChannel: null, checkEmpty: null });
  assert.deepEqual(plan("kfc-vc", "kfc-vc"), { makeChannel: false, keepChannel: null, checkEmpty: null });
});

test("other voice channels are ignored", () => {
  assert.deepEqual(plan("general", "music"), { makeChannel: false, keepChannel: null, checkEmpty: null });
});

test("copies the hub's permissions and adds the owner's", () => {
  const hubOverwrites = [{ id: "everyone", type: OverwriteType.Role, allow: 0n, deny: PermissionFlagsBits.Speak }];
  assert.deepEqual(tempChannelOverwrites(hubOverwrites, "100"), [
    { id: "everyone", type: OverwriteType.Role, allow: 0n, deny: PermissionFlagsBits.Speak },
    { id: "100", type: OverwriteType.Member, allow: OWNER_PERMISSIONS, deny: 0n },
  ]);
});

test("replaces a hub permission that was set for the owner", () => {
  const hubOverwrites = [{ id: "100", type: OverwriteType.Member, allow: 0n, deny: PermissionFlagsBits.Connect }];
  assert.deepEqual(tempChannelOverwrites(hubOverwrites, "100"), [
    { id: "100", type: OverwriteType.Member, allow: OWNER_PERMISSIONS, deny: 0n },
  ]);
});

test("the owner can manage, move people in and lock their channel", () => {
  for (const flag of ["ManageChannels", "MoveMembers", "ManageRoles", "ViewChannel", "Connect"]) {
    assert.ok((OWNER_PERMISSIONS & PermissionFlagsBits[flag]) !== 0n, flag);
  }
});
