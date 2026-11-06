// Tests for the verification rules: what a lookup result means for roles, nickname and the member's message.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadVerifyConfig } = require("../src/verify/config");
const { decideVerification, roleChanges, verifyMessage, nicknameFor } = require("../src/verify/rules");

const config = { legion: "Entropy", guildRoleId: "G", trustedRoleId: "T", guestRoleId: "U" };
const character = (extra = {}) => ({ name: "KFC", characterId: "abc=", legion: "Entropy", ...extra });
const found = (extra = {}, stale = false) => ({ status: "found", stale, character: character(extra) });
const decide = (result, claimOwnerId = null) =>
  decideVerification({ typedName: "kfc", result, claimOwnerId, discordId: "100", legion: "Entropy" });

test("reads the verification settings", () => {
  assert.deepEqual(
    loadVerifyConfig({ GUILD_ROLE_ID: " 1 ", TRUSTED_ROLE_ID: "2", GUEST_ROLE_ID: "3" }),
    { legion: "Entropy", guildRoleId: "1", trustedRoleId: "2", guestRoleId: "3" }
  );
  assert.equal(
    loadVerifyConfig({ GUILD_ROLE_ID: "1", TRUSTED_ROLE_ID: "2", GUEST_ROLE_ID: "3", VERIFY_LEGION: "Other" }).legion,
    "Other"
  );
  assert.throws(() => loadVerifyConfig({ GUILD_ROLE_ID: "1" }), /TRUSTED_ROLE_ID, GUEST_ROLE_ID/);
});

test("a character in the legion gets the guild roles", () => {
  assert.deepEqual(decide(found()), { outcome: "guild", character: character(), nickname: "KFC" });
});

test("the legion is matched without caring about capitals or spaces", () => {
  assert.equal(decide(found({ legion: " entropy " })).outcome, "guild");
});

test("a character in another legion, or none, gets guest", () => {
  assert.equal(decide(found({ legion: "Aegis" })).outcome, "guest");
  assert.deepEqual(decide(found({ legion: null })), {
    outcome: "guest",
    character: character({ legion: null }),
    nickname: "KFC",
  });
});

test("a name not on the server gets guest under the name as typed", () => {
  assert.deepEqual(decide({ status: "not_found" }), { outcome: "guest_unconfirmed", nickname: "kfc" });
});

test("a character linked to someone else is turned away", () => {
  assert.deepEqual(decide(found(), "200"), { outcome: "taken", character: character() });
  assert.equal(decide(found(), "100").outcome, "guild");
});

test("older saved data or no answer means try again later", () => {
  assert.deepEqual(decide(found({}, true)), { outcome: "try_later" });
  assert.deepEqual(decide({ status: "unavailable", reason: "x" }), { outcome: "try_later" });
});

test("an invalid name is turned away", () => {
  assert.deepEqual(decide({ status: "invalid_name" }), { outcome: "invalid_name" });
});

test("nicknames are cut to Discord's 32 characters", () => {
  assert.equal(nicknameFor("KFC"), "KFC");
  assert.equal(nicknameFor("a".repeat(40)), "a".repeat(32));
});

test("roles to add and remove for each outcome", () => {
  assert.deepEqual(roleChanges("guild", config), { add: ["G", "T"], remove: ["U"] });
  assert.deepEqual(roleChanges("guest", config), { add: ["U"], remove: ["G", "T"] });
  assert.deepEqual(roleChanges("guest_unconfirmed", config), { add: ["U"], remove: ["G", "T"] });
  assert.equal(roleChanges("taken", config), null);
  assert.equal(roleChanges("try_later", config), null);
});

const message = (decision) =>
  verifyMessage(decision, { legion: "Entropy", serverName: "Israphel", maxNameLength: 32 });

test("messages for the member", () => {
  assert.equal(message(decide(found())), "Done. You're verified as **KFC** in Entropy.");
  assert.equal(
    message(decide(found({ legion: "Aegis" }))),
    "Done. You're verified as **KFC**. You're not in Entropy, so you got the Guest role."
  );
  assert.equal(
    message(decide({ status: "not_found" })),
    "I couldn't find **kfc** on Israphel, so you got the Guest role. If you're in Entropy, check the spelling and verify again."
  );
  assert.equal(
    message(decide(found(), "200")),
    "**KFC** is already linked to another member. If it's your character, please contact a mod."
  );
  assert.equal(message(decide({ status: "unavailable" })), "I can't check characters right now. Please try again in a few minutes.");
  assert.equal(
    message(decide({ status: "invalid_name" })),
    "That doesn't look like a character name. Names are up to 32 characters, with no spaces or symbols like / ? # %."
  );
});

test("names in messages can't add formatting", () => {
  assert.equal(
    message(decideVerification({ typedName: "k_f*c", result: { status: "not_found" }, discordId: "1", legion: "Entropy" })),
    "I couldn't find **k\\_f\\*c** on Israphel, so you got the Guest role. If you're in Entropy, check the spelling and verify again."
  );
});
