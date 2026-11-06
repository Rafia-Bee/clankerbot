// Tests for /verify-manual: what a lookup result and the mod's role choice mean, and the reply to the mod.
const test = require("node:test");
const assert = require("node:assert/strict");
const { decideManual, manualMessage } = require("../src/verify/manual");

const UPDATED = Date.parse("2026-10-30T21:55:45.108Z");
const character = (extra = {}) => ({ name: "KFC", characterId: "abc=", legion: "Entropy", profileUpdatedAt: UPDATED, ...extra });
const found = (extra = {}, stale = false) => ({ status: "found", stale, character: character(extra) });
const decide = (result, roles = "auto", claimOwnerId = null) =>
  decideManual({ typedName: "kfc", result, roles, claimOwnerId, discordId: "100", legion: "Entropy" });
const message = (decision) =>
  manualMessage(decision, { member: "<@100>", legion: "Entropy", serverName: "Israphel", maxNameLength: 32 });

test("auto uses the character's legion", () => {
  assert.deepEqual(decide(found()), {
    outcome: "guild",
    character: character(),
    nickname: "KFC",
    confirmed: true,
    stale: false,
  });
  assert.equal(decide(found({ legion: "Aegis" })).outcome, "guest");
});

test("a picked role wins over the legion", () => {
  assert.equal(decide(found({ legion: "Aegis" }), "guild").outcome, "guild");
  assert.equal(decide(found(), "guest").outcome, "guest");
});

test("older saved data is used, and marked", () => {
  const decision = decide(found({}, true));
  assert.equal(decision.outcome, "guild");
  assert.equal(decision.stale, true);
});

test("a character linked to someone else is refused, whatever the roles", () => {
  assert.deepEqual(decide(found(), "guild", "200"), { outcome: "taken", character: character(), ownerId: "200" });
  assert.equal(decide(found(), "auto", "100").outcome, "guild");
});

test("not found or no answer with auto asks the mod to pick", () => {
  assert.deepEqual(decide({ status: "not_found" }), { outcome: "need_roles", reason: "not_found", name: "kfc" });
  assert.deepEqual(decide({ status: "unavailable" }), { outcome: "need_roles", reason: "unavailable", name: "kfc" });
});

test("not found or no answer with picked roles saves the name as typed", () => {
  assert.deepEqual(decide({ status: "not_found" }, "guild"), {
    outcome: "guild",
    nickname: "kfc",
    confirmed: false,
    reason: "not_found",
  });
  assert.deepEqual(decide({ status: "unavailable" }, "guest"), {
    outcome: "guest",
    nickname: "kfc",
    confirmed: false,
    reason: "unavailable",
  });
});

test("an invalid name is refused", () => {
  assert.deepEqual(decide({ status: "invalid_name" }, "guild"), { outcome: "invalid_name" });
});

test("replies to the mod", () => {
  assert.equal(message(decide(found())), "Verified <@100> as **KFC** with the Guild and Trusted roles.");
  assert.equal(
    message(decide(found({ legion: "Aegis" }))),
    "Verified <@100> as **KFC** with the Guest role. Their legion is Aegis, not Entropy."
  );
  assert.equal(
    message(decide(found({ legion: null }))),
    "Verified <@100> as **KFC** with the Guest role. They're not in a legion."
  );
  assert.equal(
    message(decide(found({ legion: "Aegis" }), "guild")),
    "Verified <@100> as **KFC** with the Guild and Trusted roles. Their legion is Aegis, not Entropy."
  );
  assert.equal(
    message(decide(found({}, true))),
    `Verified <@100> as **KFC** with the Guild and Trusted roles. The game wasn't answering, so this used saved data from <t:${Math.floor(UPDATED / 1000)}:R>.`
  );
  assert.equal(
    message(decide({ status: "not_found" }, "guild")),
    "Verified <@100> as **kfc** with the Guild and Trusted roles. That name wasn't found on Israphel, so it was saved as typed and /rename-members will skip them."
  );
  assert.equal(
    message(decide({ status: "unavailable" }, "guest")),
    "Verified <@100> as **kfc** with the Guest role. The lookup sites didn't answer, so the name was saved as typed and /rename-members will skip them."
  );
  assert.equal(
    message(decide(found(), "auto", "200")),
    "**KFC** is already linked to <@200>. Run /unverify on them first."
  );
  assert.equal(
    message(decide({ status: "not_found" })),
    "**kfc** wasn't found on Israphel. Check the spelling, or pick the roles yourself with the `roles` option."
  );
  assert.equal(
    message(decide({ status: "unavailable" })),
    "The lookup sites didn't answer, so I can't tell their legion. Try again in a few minutes, or pick the roles yourself with the `roles` option."
  );
  assert.equal(
    message(decide({ status: "invalid_name" })),
    "That doesn't look like a character name. Names are up to 32 characters, with no spaces or symbols like / ? # %."
  );
});
