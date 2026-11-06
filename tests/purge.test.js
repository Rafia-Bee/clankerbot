// Tests for the /purge rules: sorting messages by age and the reply text.
const test = require("node:test");
const assert = require("node:assert/strict");
const { splitByAge, purgeSummary } = require("../src/purge");

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const message = (id, ageMs) => ({ id, createdTimestamp: NOW - ageMs });

test("messages newer than 14 days can be deleted, older ones are skipped", () => {
  const fresh = message("1", 60 * 1000);
  const week = message("2", 7 * DAY_MS);
  const old = message("3", 15 * DAY_MS);
  const { deletable, tooOld } = splitByAge([fresh, week, old], NOW);
  assert.deepEqual(deletable, [fresh, week]);
  assert.deepEqual(tooOld, [old]);
});

test("messages right at the 14 day limit are skipped, so Discord never rejects the batch", () => {
  const edge = message("1", 14 * DAY_MS - 30 * 1000);
  const { deletable, tooOld } = splitByAge([edge], NOW);
  assert.deepEqual(deletable, []);
  assert.deepEqual(tooOld, [edge]);
});

test("no messages gives two empty lists", () => {
  assert.deepEqual(splitByAge([], NOW), { deletable: [], tooOld: [] });
});

test("summary counts deleted messages", () => {
  assert.equal(purgeSummary({ deleted: 5, tooOld: 0 }), "Deleted 5 messages.");
  assert.equal(purgeSummary({ deleted: 1, tooOld: 0 }), "Deleted 1 message.");
});

test("summary explains skipped old messages", () => {
  assert.equal(
    purgeSummary({ deleted: 3, tooOld: 2 }),
    "Deleted 3 messages. Skipped 2 messages older than 14 days, because Discord doesn't let bots bulk delete those."
  );
  assert.equal(
    purgeSummary({ deleted: 0, tooOld: 1 }),
    "Deleted 0 messages. Skipped 1 message older than 14 days, because Discord doesn't let bots bulk delete those."
  );
});

test("summary for an empty channel", () => {
  assert.equal(purgeSummary({ deleted: 0, tooOld: 0 }), "There are no messages to delete here.");
});
