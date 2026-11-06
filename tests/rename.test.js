// Tests for /rename-members: what to do with each member, and the summary at the end.
const test = require("node:test");
const assert = require("node:assert/strict");
const { renameDecision, renameSummary } = require("../src/verify/rename");

const saved = { discord_id: "100", char_name: "kfc", character_id: "abc=" };
const found = (extra = {}, stale = false) => ({
  status: "found",
  stale,
  character: { name: "KFC", characterId: "abc=", ...extra },
});

test("a found character gives its current spelling", () => {
  assert.deepEqual(renameDecision(saved, found()), { action: "rename", nickname: "KFC" });
});

test("a saved character without an ID matches any character with that name", () => {
  assert.deepEqual(renameDecision({ ...saved, character_id: null }, found({ characterId: null })), {
    action: "rename",
    nickname: "KFC",
  });
});

test("a name now used by a different character counts as not found", () => {
  assert.deepEqual(renameDecision(saved, found({ characterId: "zzz=" })), { action: "not_found" });
});

test("not found, older saved data and no answer", () => {
  assert.deepEqual(renameDecision(saved, { status: "not_found" }), { action: "not_found" });
  assert.deepEqual(renameDecision(saved, found({}, true)), { action: "try_later" });
  assert.deepEqual(renameDecision(saved, { status: "unavailable" }), { action: "try_later" });
});

test("summary lists what happened to everyone", () => {
  const text = renameSummary({
    renamed: ["<@1>", "<@2>"],
    unchanged: 5,
    notFound: [{ member: "<@3>", name: "Gone" }],
    cannotRename: ["<@4>"],
    tryLater: ["<@5>"],
    left: 2,
  });
  assert.equal(
    text,
    [
      "**Rename finished.**",
      "Renamed: 2 (<@1>, <@2>)",
      "Already right: 5",
      "Not found in game, they need to verify again: <@3> (Gone)",
      "Couldn't rename (server owner, or their role is above mine): <@4>",
      "Lookup sites didn't answer, run it again later: <@5>",
      "Left the server: 2",
    ].join("\n")
  );
});

test("summary leaves out empty lines", () => {
  assert.equal(
    renameSummary({ renamed: [], unchanged: 3, notFound: [], cannotRename: [], tryLater: [], left: 0 }),
    "**Rename finished.**\nRenamed: 0\nAlready right: 3"
  );
});
