// Rules for verifying, kept apart from Discord so they can be tested.
//   sameLegion          compares legion names without caring about capitals or spaces
//   nicknameFor         the nickname for a character name, cut to Discord's 32 characters
//   decideVerification  what a lookup result means: guild, guest, taken, try again, and so on
//   classRoleChanges    the class role to add for a class, and the other class roles to remove
//   roleChanges         which roles to add and remove for an outcome and the character's class
//   verifyMessage       what to tell the member

const { escapeMarkdown } = require("discord.js");

const MAX_NICKNAME_LENGTH = 32;

function sameLegion(a, b) {
  return Boolean(a) && Boolean(b) && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function nicknameFor(name) {
  return name.slice(0, MAX_NICKNAME_LENGTH);
}

function decideVerification({ typedName, result, claimOwnerId = null, discordId, legion }) {
  if (result.status === "invalid_name") return { outcome: "invalid_name" };
  if (result.status === "not_found") return { outcome: "guest_unconfirmed", nickname: nicknameFor(typedName) };
  if (result.status !== "found" || result.stale) return { outcome: "try_later" };

  const { character } = result;
  if (claimOwnerId && claimOwnerId !== discordId) return { outcome: "taken", character };
  const outcome = sameLegion(character.legion, legion) ? "guild" : "guest";
  return { outcome, character, nickname: nicknameFor(character.name) };
}

function classRoleChanges(classRoles = {}, className) {
  if (!className) return { add: [], remove: [] };
  const own = classRoles[className.trim().toLowerCase()];
  return { add: own ? [own] : [], remove: Object.values(classRoles).filter((id) => id !== own) };
}

function roleChanges(outcome, config, className = null) {
  const guildRoles = [config.guildRoleId, config.trustedRoleId];
  let changes;
  if (outcome === "guild") changes = { add: guildRoles, remove: [config.guestRoleId] };
  else if (outcome === "guest" || outcome === "guest_unconfirmed") changes = { add: [config.guestRoleId], remove: guildRoles };
  else return null;
  const classes = classRoleChanges(config.classRoles, className);
  return { add: [...changes.add, ...classes.add], remove: [...changes.remove, ...classes.remove] };
}

function verifyMessage(decision, { legion, serverName, maxNameLength }) {
  const name = (value) => `**${escapeMarkdown(value)}**`;
  switch (decision.outcome) {
    case "guild":
      return `Done. You're verified as ${name(decision.character.name)} in ${legion}.`;
    case "guest":
      return `Done. You're verified as ${name(decision.character.name)}. You're not in ${legion}, so you got the Guest role.`;
    case "guest_unconfirmed":
      return `I couldn't find ${name(decision.nickname)} on ${serverName}, so you got the Guest role. If you're in ${legion}, check the spelling and verify again.`;
    case "taken":
      return `${name(decision.character.name)} is already linked to another member. If it's your character, please contact a mod.`;
    case "invalid_name":
      return `That doesn't look like a character name. Names are up to ${maxNameLength} characters, with no spaces or symbols like / ? # %.`;
    default:
      return "I can't check characters right now. Please try again in a few minutes.";
  }
}

module.exports = { sameLegion, nicknameFor, decideVerification, roleChanges, verifyMessage };
