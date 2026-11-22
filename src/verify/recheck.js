// Rules for /recheck, kept apart from Discord so they can be tested.
//   recheckDecision  what to do with one member after looking their saved character up again
//   rolesMove        whether the new roles move a member to guild or guest, or leave them where they are
//   recheckMessage   the reply when one member is rechecked
//   recheckSummary   the message posted when rechecking everyone is finished

const { escapeMarkdown } = require("discord.js");
const { sameLegion, nicknameFor } = require("./rules");

function recheckDecision(saved, result, { legion }) {
  if (result.status === "not_found") return { action: "not_found" };
  if (result.status !== "found" || result.stale) return { action: "try_later" };

  const { character } = result;
  if (saved.character_id && character.characterId && saved.character_id !== character.characterId) {
    return { action: "not_found" };
  }
  const legionOutcome = sameLegion(character.legion, legion) ? "guild" : "guest";
  const outcome = saved.manual_roles ?? legionOutcome;
  return {
    action: "update",
    outcome,
    nickname: nicknameFor(character.name),
    character,
    keptByMod: outcome !== legionOutcome,
  };
}

function rolesMove(outcome, hasRole, { guildRoleId, trustedRoleId, guestRoleId }) {
  if (outcome === "guild") {
    return !hasRole(guildRoleId) || !hasRole(trustedRoleId) || hasRole(guestRoleId) ? "guild" : null;
  }
  return hasRole(guildRoleId) || hasRole(trustedRoleId) || !hasRole(guestRoleId) ? "guest" : null;
}

function recheckMessage(outcome, { user, legion, name }) {
  if (outcome.action === "not_found") {
    return `I couldn't find **${escapeMarkdown(name)}** in game any more (renamed or deleted?). ${user} needs to verify again.`;
  }
  if (outcome.action !== "update") return "The lookup sites didn't answer. Try again in a few minutes.";

  const parts = [];
  if (outcome.nicknameResult === "renamed") parts.push(`Renamed ${user} to **${escapeMarkdown(outcome.nickname)}**.`);
  if (outcome.nicknameResult === "cannot") {
    parts.push(`I can't rename ${user}: they're the server owner, or their role is above mine.`);
  }
  const subject = parts.length > 0 ? "them" : user;
  if (outcome.move === "guild") parts.push(`Gave ${subject} the Guild and Trusted roles: they're in ${legion} now.`);
  if (outcome.move === "guest") parts.push(`Moved ${subject} to Guest: they're not in ${legion} any more.`);
  if (outcome.roleProblem) {
    parts.push("I couldn't change their roles: check my role is above theirs and I have Manage Roles.");
  }
  if (parts.length === 0) parts.push(`Nothing to change for ${user}: their nickname and roles are already right.`);
  if (outcome.keptByMod) {
    parts.push("Their roles were picked by a mod with /verify-manual, so I left them as they are.");
  }
  return parts.join(" ");
}

function recheckSummary(totals, { legion }) {
  const { renamed, toGuild, toGuest, keptByMod, unchanged, notFound, cannotRename, roleProblems, tryLater, left } = totals;
  const lines = ["**Recheck finished.**"];
  lines.push(renamed.length > 0 ? `Renamed: ${renamed.length} (${renamed.join(", ")})` : "Renamed: 0");
  if (toGuild.length > 0) lines.push(`Joined ${legion}, gave Guild and Trusted: ${toGuild.join(", ")}`);
  if (toGuest.length > 0) lines.push(`Left ${legion}, moved to Guest: ${toGuest.join(", ")}`);
  lines.push(`Nothing to change: ${unchanged}`);
  if (keptByMod.length > 0) lines.push(`Roles kept because a mod picked them: ${keptByMod.join(", ")}`);
  if (notFound.length > 0) {
    const list = notFound.map(({ member, name }) => `${member} (${name})`).join(", ");
    lines.push(`Not found in game, they need to verify again: ${list}`);
  }
  if (cannotRename.length > 0) {
    lines.push(`Couldn't rename (server owner, or their role is above mine): ${cannotRename.join(", ")}`);
  }
  if (roleProblems.length > 0) {
    lines.push(`Couldn't change roles (check my role is above theirs): ${roleProblems.join(", ")}`);
  }
  if (tryLater.length > 0) {
    lines.push(`Lookup sites didn't answer, run it again later: ${tryLater.join(", ")}`);
  }
  if (left > 0) lines.push(`Left the server: ${left}`);
  return lines.join("\n");
}

module.exports = { recheckDecision, rolesMove, recheckMessage, recheckSummary };
