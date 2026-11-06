// Tests for ticket channel names made from the naming schema.
const test = require("node:test");
const assert = require("node:assert/strict");
const { slugify, channelName } = require("../src/tickets/naming");

const parts = (extra = {}) => ({ type: "apply", number: 7, username: "rafia", displayName: "Rafia", ...extra });

test("short names for ticket types", () => {
  assert.equal(slugify("Apply"), "apply");
  assert.equal(slugify("Report a problem!"), "report-a-problem");
  assert.equal(slugify("  Gear   check "), "gear-check");
});

test("fills in the placeholders", () => {
  assert.equal(channelName("{type}-{number}-{user}", parts()), "apply-0007-rafia");
  assert.equal(channelName("ticket-{name}", parts({ displayName: "Big Boss" })), "ticket-big-boss");
});

test("numbers are padded to 4 digits, longer ones are kept", () => {
  assert.equal(channelName("{number}", parts({ number: 12345 })), "12345");
  assert.equal(channelName("t{number}", parts({ number: 1 })), "t0001");
});

test("capitals, spaces and symbols are cleaned up like Discord does", () => {
  assert.equal(channelName("{type} {user}!!", parts({ username: "r.fia" })), "apply-rfia");
  assert.equal(channelName("{name}", parts({ displayName: "Säde 🌸 ✨" })), "säde");
  assert.equal(channelName("--{type}--{user}--", parts()), "apply-rafia");
});

test("a name that ends up empty falls back to ticket and the number", () => {
  assert.equal(channelName("{name}", parts({ displayName: "🌸🌸" })), "ticket-0007");
});

test("names are cut at 100 characters", () => {
  const name = channelName("{name}", parts({ displayName: "a".repeat(150) }));
  assert.equal(name.length, 100);
});
