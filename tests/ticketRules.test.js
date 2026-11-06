// Tests for the ticket rules: who can press which button, when, and when closed tickets are deleted.
const test = require("node:test");
const assert = require("node:assert/strict");
const { canUse, transitionError, isDueForDeletion, memberAccess, isCategoryFull } = require("../src/tickets/rules");

const DAY_MS = 24 * 60 * 60 * 1000;

test("staff can use every button", () => {
  for (const action of ["close", "reopen", "delete"]) {
    assert.equal(canUse(action, { isStaff: true, isOpener: false }), true, action);
  }
});

test("the member who opened it can only close it", () => {
  const opener = { isStaff: false, isOpener: true };
  assert.equal(canUse("close", opener), true);
  assert.equal(canUse("reopen", opener), false);
  assert.equal(canUse("delete", opener), false);
});

test("anyone else can't use any button", () => {
  for (const action of ["close", "reopen", "delete"]) {
    assert.equal(canUse(action, { isStaff: false, isOpener: false }), false, action);
  }
});

test("close only works on open tickets", () => {
  assert.equal(transitionError("close", "open"), null);
  assert.equal(transitionError("close", "closed"), "This ticket is already closed.");
});

test("reopen only works on closed tickets", () => {
  assert.equal(transitionError("reopen", "closed"), null);
  assert.equal(transitionError("reopen", "open"), "This ticket isn't closed.");
});

test("delete works on any ticket that still exists", () => {
  for (const status of ["open", "closed"]) assert.equal(transitionError("delete", status), null);
  assert.equal(transitionError("delete", "deleted"), "This ticket was deleted.");
  assert.equal(transitionError("close", "deleted"), "This ticket was deleted.");
});

test("closed tickets are due once their days have passed", () => {
  const closedAt = Date.UTC(2026, 10, 1);
  const ticket = (extra) => ({ status: "closed", closed_at: closedAt, delete_after_days: 7, ...extra });
  assert.equal(isDueForDeletion(ticket(), closedAt + 7 * DAY_MS), true);
  assert.equal(isDueForDeletion(ticket(), closedAt + 7 * DAY_MS - 1), false);
  assert.equal(isDueForDeletion(ticket({ delete_after_days: 0 }), closedAt + 365 * DAY_MS), false);
  assert.equal(isDueForDeletion(ticket({ status: "open" }), closedAt + 30 * DAY_MS), false);
});

test("members can type in open tickets and only read closed ones", () => {
  assert.deepEqual(memberAccess(true), {
    allow: ["ViewChannel", "ReadMessageHistory", "SendMessages", "AddReactions", "AttachFiles", "EmbedLinks"],
    deny: [],
  });
  assert.deepEqual(memberAccess(false), {
    allow: ["ViewChannel", "ReadMessageHistory"],
    deny: ["SendMessages", "AddReactions", "AttachFiles", "EmbedLinks"],
  });
});

test("categories are full at 50 channels", () => {
  assert.equal(isCategoryFull(49), false);
  assert.equal(isCategoryFull(50), true);
});
