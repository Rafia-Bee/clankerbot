// Rules for /role-picker-setup, kept apart from Discord so they can be tested.
//   roleProblem           why a role can't be put on a button, or null when it can
//   roleButtonId          the button ID for a role
//   roleFromButtonId      the role ID from a button ID, or null if it isn't one
//   toggleReply           the private reply after a member clicks the button
//   defaultPickerMessage  the text above the button when none is given

const PREFIX = "rolepick";

function roleProblem({ role, guildId, botTopPosition, memberTopPosition, isOwner }) {
  if (role.id === guildId) return "Everyone already has @everyone, so it can't go on a button.";
  if (role.managed) return "That role belongs to a bot or integration, so it can't be given out by hand.";
  if (role.position >= botTopPosition) {
    return "That role is above or level with my role, so I can't give it out. Drag my role above it in Server Settings, Roles.";
  }
  if (!isOwner && role.position >= memberTopPosition) {
    return "That role is above or level with your top role, so you can't make a button for it.";
  }
  return null;
}

function roleButtonId(roleId) {
  return `${PREFIX}:${roleId}`;
}

function roleFromButtonId(customId) {
  const match = /^rolepick:(\d+)$/.exec(customId);
  return match ? match[1] : null;
}

function toggleReply(roleId, added) {
  return added
    ? `Done. You now have the <@&${roleId}> role. Click again to remove it.`
    : `Done. Removed the <@&${roleId}> role. Click again to get it back.`;
}

function defaultPickerMessage(roleId) {
  return `Click the button to get the <@&${roleId}> role. Click it again to remove it.`;
}

module.exports = { PREFIX, roleProblem, roleButtonId, roleFromButtonId, toggleReply, defaultPickerMessage };
