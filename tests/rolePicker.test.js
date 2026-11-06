// Tests for the role picker rules: which roles can be given out, the button IDs and the replies.
const test = require("node:test");
const assert = require("node:assert/strict");
const { roleProblem, roleButtonId, roleFromButtonId, toggleReply, defaultPickerMessage } = require("../src/rolePicker");

const GUILD_ID = "1";
const role = (extra = {}) => ({ id: "500", name: "Raiders", position: 5, managed: false, ...extra });
const check = (extra = {}, who = {}) =>
  roleProblem({ role: role(extra), guildId: GUILD_ID, botTopPosition: 10, memberTopPosition: 8, isOwner: false, ...who });

test("a normal role below both the bot and the member is fine", () => {
  assert.equal(check(), null);
});

test("@everyone can't be given out", () => {
  assert.match(check({ id: GUILD_ID, name: "@everyone", position: 0 }), /everyone/);
});

test("roles that belong to a bot or integration can't be given out", () => {
  assert.match(check({ managed: true }), /bot or integration/);
});

test("roles at or above the bot's top role can't be given out", () => {
  assert.match(check({ position: 10 }), /my role/);
  assert.match(check({ position: 12 }), /my role/);
});

test("members can't make a button for a role at or above their own top role", () => {
  assert.match(check({ position: 8 }), /your top role/);
});

test("the server owner can make a button for any role the bot can give", () => {
  assert.equal(check({ position: 9 }, { isOwner: true, memberTopPosition: 0 }), null);
});

test("the role ID goes in the button ID and comes back out", () => {
  assert.equal(roleButtonId("500"), "rolepick:500");
  assert.equal(roleFromButtonId("rolepick:500"), "500");
  assert.equal(roleFromButtonId("rolepick:"), null);
  assert.equal(roleFromButtonId("rolepick:abc"), null);
});

test("replies say whether the role was given or removed", () => {
  assert.equal(toggleReply("500", true), "Done. You now have the <@&500> role. Click again to remove it.");
  assert.equal(toggleReply("500", false), "Done. Removed the <@&500> role. Click again to get it back.");
});

test("the default message names the role", () => {
  assert.equal(
    defaultPickerMessage("500"),
    "Click the button to get the <@&500> role. Click it again to remove it."
  );
});
