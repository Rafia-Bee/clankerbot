// Tests for the streaming role rules: spotting a Twitch stream in someone's status, and when to add or remove the role.
const test = require("node:test");
const assert = require("node:assert/strict");
const { ActivityType } = require("discord.js");
const { isStreamingOnTwitch, streamingRoleChange } = require("../src/streaming/rules");

const streaming = (url) => ({ type: ActivityType.Streaming, url });

test("isStreamingOnTwitch is true for a Twitch stream", () => {
  assert.equal(isStreamingOnTwitch([streaming("https://www.twitch.tv/someone")]), true);
  assert.equal(isStreamingOnTwitch([streaming("https://twitch.tv/someone")]), true);
  assert.equal(isStreamingOnTwitch([{ type: ActivityType.Playing }, streaming("https://www.twitch.tv/x")]), true);
});

test("isStreamingOnTwitch is false for other streams, games or no status", () => {
  assert.equal(isStreamingOnTwitch([streaming("https://www.youtube.com/watch?v=1")]), false);
  assert.equal(isStreamingOnTwitch([streaming("https://nottwitch.tv/x")]), false);
  assert.equal(isStreamingOnTwitch([streaming(null)]), false);
  assert.equal(isStreamingOnTwitch([{ type: ActivityType.Playing, url: "https://www.twitch.tv/x" }]), false);
  assert.equal(isStreamingOnTwitch([]), false);
  assert.equal(isStreamingOnTwitch(undefined), false);
});

test("streamingRoleChange adds the role when someone goes live and removes it when they stop", () => {
  assert.equal(streamingRoleChange({ streaming: true, hasRole: false }), "add");
  assert.equal(streamingRoleChange({ streaming: false, hasRole: true }), "remove");
  assert.equal(streamingRoleChange({ streaming: true, hasRole: true }), null);
  assert.equal(streamingRoleChange({ streaming: false, hasRole: false }), null);
});
