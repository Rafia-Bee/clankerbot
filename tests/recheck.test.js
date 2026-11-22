// Tests for /recheck: what to do with each member, the reply for one member, and the summary for everyone.
const test = require("node:test");
const assert = require("node:assert/strict");
const { recheckDecision, rolesMove, recheckMessage, recheckSummary } = require("../src/verify/recheck");

const saved = { discord_id: "100", char_name: "kfc", character_id: "abc=", legion: "Entropy", manual_roles: null };
const character = (extra = {}) => ({ name: "KFC", characterId: "abc=", legion: "Entropy", className: "Cleric", ...extra });
const found = (extra = {}, stale = false) => ({ status: "found", stale, character: character(extra) });
const decide = (row, result) => recheckDecision(row, result, { legion: "Entropy" });

test("a character still in the legion keeps the guild roles, with the current spelling", () => {
  assert.deepEqual(decide(saved, found()), {
    action: "update",
    outcome: "guild",
    nickname: "KFC",
    character: character(),
    keptByMod: false,
  });
});

test("a character that left the legion goes to guest", () => {
  assert.equal(decide(saved, found({ legion: "Aegis" })).outcome, "guest");
  assert.equal(decide(saved, found({ legion: null })).outcome, "guest");
});

test("a guest whose character joined the legion goes to guild", () => {
  assert.equal(decide({ ...saved, legion: null }, found({ legion: " entropy " })).outcome, "guild");
});

test("roles a mod picked by hand are kept, and say so when the legion disagrees", () => {
  const guild = decide({ ...saved, manual_roles: "guild" }, found({ legion: "Aegis" }));
  assert.equal(guild.outcome, "guild");
  assert.equal(guild.keptByMod, true);

  const guest = decide({ ...saved, manual_roles: "guest" }, found());
  assert.equal(guest.outcome, "guest");
  assert.equal(guest.keptByMod, true);

  const agrees = decide({ ...saved, manual_roles: "guild" }, found());
  assert.equal(agrees.keptByMod, false);
});

test("a saved character without an ID matches any character with that name", () => {
  assert.equal(decide({ ...saved, character_id: null }, found({ characterId: null })).action, "update");
});

test("a name now used by a different character counts as not found", () => {
  assert.deepEqual(decide(saved, found({ characterId: "zzz=" })), { action: "not_found" });
});

test("not found, older saved data and no answer", () => {
  assert.deepEqual(decide(saved, { status: "not_found" }), { action: "not_found" });
  assert.deepEqual(decide(saved, found({}, true)), { action: "try_later" });
  assert.deepEqual(decide(saved, { status: "unavailable" }), { action: "try_later" });
});

const config = { guildRoleId: "G", trustedRoleId: "T", guestRoleId: "U" };
const has = (...ids) => (id) => ids.includes(id);

test("rolesMove says when someone moves between guild and guest", () => {
  assert.equal(rolesMove("guild", has("U"), config), "guild");
  assert.equal(rolesMove("guild", has("G"), config), "guild");
  assert.equal(rolesMove("guild", has("G", "T"), config), null);
  assert.equal(rolesMove("guest", has("G", "T"), config), "guest");
  assert.equal(rolesMove("guest", has("U", "T"), config), "guest");
  assert.equal(rolesMove("guest", has("U"), config), null);
});

const message = (outcome) => recheckMessage(outcome, { user: "<@100>", legion: "Entropy" });
const updated = (extra = {}) => ({
  action: "update",
  nickname: "KFC",
  nicknameResult: "unchanged",
  move: null,
  roleProblem: false,
  keptByMod: false,
  ...extra,
});

test("one member: nothing to change", () => {
  assert.equal(message(updated()), "Nothing to change for <@100>: their nickname and roles are already right.");
});

test("one member: renamed and moved", () => {
  assert.equal(
    message(updated({ nicknameResult: "renamed", move: "guild" })),
    "Renamed <@100> to **KFC**. Gave them the Guild and Trusted roles: they're in Entropy now."
  );
  assert.equal(
    message(updated({ move: "guest" })),
    "Moved <@100> to Guest: they're not in Entropy any more."
  );
});

test("one member: problems and mod choices", () => {
  assert.equal(
    message(updated({ nicknameResult: "cannot", roleProblem: true })),
    "I can't rename <@100>: they're the server owner, or their role is above mine. I couldn't change their roles: check my role is above theirs and I have Manage Roles."
  );
  assert.equal(
    message(updated({ keptByMod: true })),
    "Nothing to change for <@100>: their nickname and roles are already right. Their roles were picked by a mod with /verify-manual, so I left them as they are."
  );
});

test("one member: not found or no answer", () => {
  assert.equal(
    recheckMessage({ action: "not_found" }, { user: "<@100>", legion: "Entropy", name: "kfc" }),
    "I couldn't find **kfc** in game any more (renamed or deleted?). <@100> needs to verify again."
  );
  assert.equal(message({ action: "try_later" }), "The lookup sites didn't answer. Try again in a few minutes.");
});

const empty = {
  renamed: [],
  toGuild: [],
  toGuest: [],
  keptByMod: [],
  unchanged: 0,
  notFound: [],
  cannotRename: [],
  roleProblems: [],
  tryLater: [],
  left: 0,
};

test("summary lists what happened to everyone", () => {
  const text = recheckSummary(
    {
      renamed: ["<@1>", "<@2>"],
      toGuild: ["<@6>"],
      toGuest: ["<@7>"],
      keptByMod: ["<@8>"],
      unchanged: 5,
      notFound: [{ member: "<@3>", name: "Gone" }],
      cannotRename: ["<@4>"],
      roleProblems: ["<@9>"],
      tryLater: ["<@5>"],
      left: 2,
    },
    { legion: "Entropy" }
  );
  assert.equal(
    text,
    [
      "**Recheck finished.**",
      "Renamed: 2 (<@1>, <@2>)",
      "Joined Entropy, gave Guild and Trusted: <@6>",
      "Left Entropy, moved to Guest: <@7>",
      "Nothing to change: 5",
      "Roles kept because a mod picked them: <@8>",
      "Not found in game, they need to verify again: <@3> (Gone)",
      "Couldn't rename (server owner, or their role is above mine): <@4>",
      "Couldn't change roles (check my role is above theirs): <@9>",
      "Lookup sites didn't answer, run it again later: <@5>",
      "Left the server: 2",
    ].join("\n")
  );
});

test("summary leaves out empty lines", () => {
  assert.equal(
    recheckSummary({ ...empty, unchanged: 3 }, { legion: "Entropy" }),
    "**Recheck finished.**\nRenamed: 0\nNothing to change: 3"
  );
});
