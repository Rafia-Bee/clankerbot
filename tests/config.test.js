// Tests for checking that required settings are filled in.
const test = require("node:test");
const assert = require("node:assert/strict");
const { missingSettings } = require("../src/config");

test("lists settings that are missing or blank", () => {
  const env = { BOT_TOKEN: "abc", CLIENT_ID: "  ", OTHER: "x" };
  assert.deepEqual(missingSettings(env, ["BOT_TOKEN", "CLIENT_ID", "GUILD_ID"]), [
    "CLIENT_ID",
    "GUILD_ID",
  ]);
});

test("nothing missing gives an empty list", () => {
  assert.deepEqual(missingSettings({ BOT_TOKEN: "abc" }, ["BOT_TOKEN"]), []);
});
