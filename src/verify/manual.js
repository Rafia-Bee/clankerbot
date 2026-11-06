// Rules for /verify-manual, kept apart from Discord so they can be tested.
//   decideManual   what a lookup result and the mod's role choice mean: guild, guest, taken, pick roles, and so on
//   legionNote     a short note when the character isn't in the legion
//   manualMessage  the reply to the mod

const { escapeMarkdown } = require("discord.js");
const { sameLegion, nicknameFor } = require("./rules");

const ROLE_NAMES = { guild: "the Guild and Trusted roles", guest: "the Guest role" };

function decideManual({ typedName, result, roles, claimOwnerId = null, discordId, legion }) {
  if (result.status === "invalid_name") return { outcome: "invalid_name" };

  if (result.status === "found") {
    const { character } = result;
    if (claimOwnerId && claimOwnerId !== discordId) return { outcome: "taken", character, ownerId: claimOwnerId };
    const outcome = roles === "auto" ? (sameLegion(character.legion, legion) ? "guild" : "guest") : roles;
    return { outcome, character, nickname: nicknameFor(character.name), confirmed: true, stale: result.stale };
  }

  const reason = result.status === "not_found" ? "not_found" : "unavailable";
  if (roles === "auto") return { outcome: "need_roles", reason, name: typedName };
  return { outcome: roles, nickname: nicknameFor(typedName), confirmed: false, reason };
}

function legionNote(character, legion) {
  if (sameLegion(character.legion, legion)) return null;
  if (!character.legion) return "They're not in a legion.";
  return `Their legion is ${escapeMarkdown(character.legion)}, not ${legion}.`;
}

function manualMessage(decision, { member, legion, serverName, maxNameLength }) {
  const bold = (value) => `**${escapeMarkdown(value)}**`;
  switch (decision.outcome) {
    case "guild":
    case "guest": {
      const name = decision.character?.name ?? decision.nickname;
      const parts = [`Verified ${member} as ${bold(name)} with ${ROLE_NAMES[decision.outcome]}.`];
      if (decision.character) {
        const note = legionNote(decision.character, legion);
        if (note) parts.push(note);
      }
      if (decision.stale) {
        const at = decision.character.profileUpdatedAt;
        const from = at ? `<t:${Math.floor(at / 1000)}:R>` : "an unknown time";
        parts.push(`The game wasn't answering, so this used saved data from ${from}.`);
      }
      if (decision.reason === "not_found") {
        parts.push(`That name wasn't found on ${serverName}, so it was saved as typed and /rename-members will skip them.`);
      }
      if (decision.reason === "unavailable") {
        parts.push("The lookup sites didn't answer, so the name was saved as typed and /rename-members will skip them.");
      }
      return parts.join(" ");
    }
    case "taken":
      return `${bold(decision.character.name)} is already linked to <@${decision.ownerId}>. Run /unverify on them first.`;
    case "need_roles":
      if (decision.reason === "not_found") {
        return `${bold(decision.name)} wasn't found on ${serverName}. Check the spelling, or pick the roles yourself with the \`roles\` option.`;
      }
      return "The lookup sites didn't answer, so I can't tell their legion. Try again in a few minutes, or pick the roles yourself with the `roles` option.";
    default:
      return `That doesn't look like a character name. Names are up to ${maxNameLength} characters, with no spaces or symbols like / ? # %.`;
  }
}

module.exports = { decideManual, manualMessage };
