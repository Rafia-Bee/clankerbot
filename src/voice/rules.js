// The rules for voice hubs, kept apart from Discord so they're easy to test.
//   voiceChannelName       "KFC's VC", cut short to fit Discord's name limit
//   planVoiceMove          what to do when a member joins, leaves or moves between voice channels
//   tempChannelOverwrites  the hub's permissions, plus the owner's own permissions for their channel

const { OverwriteType, PermissionFlagsBits } = require("discord.js");

const EMPTY_DELETE_SECONDS = 10;
const MAX_CHANNEL_NAME = 100;
const NAME_ENDING = "'s VC";

const OWNER_PERMISSIONS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.Connect |
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.MoveMembers;

function voiceChannelName(displayName) {
  return displayName.slice(0, MAX_CHANNEL_NAME - NAME_ENDING.length) + NAME_ENDING;
}

function planVoiceMove({ fromId, toId, isHub, isTemp }) {
  if (fromId === toId) return { makeChannel: false, keepChannel: null, checkEmpty: null };
  return {
    makeChannel: Boolean(toId && isHub(toId)),
    keepChannel: toId && isTemp(toId) ? toId : null,
    checkEmpty: fromId && isTemp(fromId) ? fromId : null,
  };
}

function tempChannelOverwrites(hubOverwrites, ownerId) {
  return [
    ...hubOverwrites.filter((overwrite) => overwrite.id !== ownerId),
    { id: ownerId, type: OverwriteType.Member, allow: OWNER_PERMISSIONS, deny: 0n },
  ];
}

module.exports = { voiceChannelName, planVoiceMove, tempChannelOverwrites, OWNER_PERMISSIONS, EMPTY_DELETE_SECONDS };
