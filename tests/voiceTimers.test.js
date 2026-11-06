// Tests for the countdowns that delete empty voice channels.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDeleteTimers } = require("../src/voice/timers");

test.beforeEach((t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
});

test("runs after the delay", (t) => {
  const expired = [];
  const timers = createDeleteTimers(10_000, (id) => expired.push(id));
  timers.schedule("60");
  t.mock.timers.tick(9_999);
  assert.deepEqual(expired, []);
  assert.equal(timers.has("60"), true);
  t.mock.timers.tick(1);
  assert.deepEqual(expired, ["60"]);
  assert.equal(timers.has("60"), false);
});

test("cancelling stops it", (t) => {
  const expired = [];
  const timers = createDeleteTimers(10_000, (id) => expired.push(id));
  timers.schedule("60");
  t.mock.timers.tick(5_000);
  timers.cancel("60");
  t.mock.timers.tick(10_000);
  assert.deepEqual(expired, []);
  assert.equal(timers.has("60"), false);
});

test("scheduling again starts the countdown over", (t) => {
  const expired = [];
  const timers = createDeleteTimers(10_000, (id) => expired.push(id));
  timers.schedule("60");
  t.mock.timers.tick(8_000);
  timers.schedule("60");
  t.mock.timers.tick(8_000);
  assert.deepEqual(expired, []);
  t.mock.timers.tick(2_000);
  assert.deepEqual(expired, ["60"]);
});

test("each channel has its own countdown", (t) => {
  const expired = [];
  const timers = createDeleteTimers(10_000, (id) => expired.push(id));
  timers.schedule("60");
  t.mock.timers.tick(5_000);
  timers.schedule("61");
  t.mock.timers.tick(5_000);
  assert.deepEqual(expired, ["60"]);
  t.mock.timers.tick(5_000);
  assert.deepEqual(expired, ["60", "61"]);
});
