// Rules for /rename-members, kept apart from Discord so they can be tested.
//   renameDecision  what to do with one member after looking their saved character up again
//   renameSummary   the message posted when renaming everyone is finished

const { nicknameFor } = require("./rules");

function renameDecision(saved, result) {
  if (result.status === "not_found") return { action: "not_found" };
  if (result.status !== "found" || result.stale) return { action: "try_later" };

  const { character } = result;
  if (saved.character_id && character.characterId && saved.character_id !== character.characterId) {
    return { action: "not_found" };
  }
  return { action: "rename", nickname: nicknameFor(character.name) };
}

function renameSummary({ renamed, unchanged, notFound, cannotRename, tryLater, left }) {
  const lines = ["**Rename finished.**"];
  lines.push(renamed.length > 0 ? `Renamed: ${renamed.length} (${renamed.join(", ")})` : "Renamed: 0");
  lines.push(`Already right: ${unchanged}`);
  if (notFound.length > 0) {
    const list = notFound.map(({ member, name }) => `${member} (${name})`).join(", ");
    lines.push(`Not found in game, they need to verify again: ${list}`);
  }
  if (cannotRename.length > 0) {
    lines.push(`Couldn't rename (server owner, or their role is above mine): ${cannotRename.join(", ")}`);
  }
  if (tryLater.length > 0) {
    lines.push(`Lookup sites didn't answer, run it again later: ${tryLater.join(", ")}`);
  }
  if (left > 0) lines.push(`Left the server: ${left}`);
  return lines.join("\n");
}

module.exports = { renameDecision, renameSummary };
