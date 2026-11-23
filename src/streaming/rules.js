// The rules for the streaming role, kept apart from Discord so they're easy to test.
//   isStreamingOnTwitch   true when someone's Discord status says they're live on Twitch
//   streamingRoleChange   whether to add the role, remove it, or leave it ("add", "remove" or null)

const { ActivityType } = require("discord.js");

const TWITCH_LINK = /^https?:\/\/(www\.|m\.)?twitch\.tv\//i;

function isStreamingOnTwitch(activities = []) {
  return activities.some((activity) => activity.type === ActivityType.Streaming && TWITCH_LINK.test(activity.url ?? ""));
}

function streamingRoleChange({ streaming, hasRole }) {
  if (streaming && !hasRole) return "add";
  if (!streaming && hasRole) return "remove";
  return null;
}

module.exports = { isStreamingOnTwitch, streamingRoleChange };
