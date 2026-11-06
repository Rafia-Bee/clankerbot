// Changes a member's roles and nickname on Discord, reporting what couldn't be done instead of failing.
//   canRename        whether the bot is allowed to change this member's nickname
//   setNickname      sets the nickname if it's different: "renamed", "unchanged" or "cannot"
//   applyRoles       adds and removes roles, skipping ones the member already has or doesn't have
//   applyVerification  roles and nickname together, returning a list of problems (empty when all went well)

function canRename(member) {
  return member.id !== member.guild.ownerId && member.manageable;
}

async function setNickname(member, nickname, reason) {
  if (member.nickname === nickname) return "unchanged";
  if (!canRename(member)) return "cannot";
  await member.setNickname(nickname, reason);
  return "renamed";
}

async function applyRoles(member, { add, remove }, reason) {
  const toRemove = remove.filter((id) => member.roles.cache.has(id));
  const toAdd = add.filter((id) => !member.roles.cache.has(id));
  if (toRemove.length > 0) await member.roles.remove(toRemove, reason);
  if (toAdd.length > 0) await member.roles.add(toAdd, reason);
}

async function applyVerification(member, changes, nickname) {
  const problems = [];
  try {
    await applyRoles(member, changes, "Verified");
  } catch (error) {
    problems.push(`roles: ${error.message}`);
  }
  try {
    if ((await setNickname(member, nickname, "Verified character name")) === "cannot") {
      problems.push("nickname: server owner, or their role is above the bot's");
    }
  } catch (error) {
    problems.push(`nickname: ${error.message}`);
  }
  return problems;
}

module.exports = { canRename, setNickname, applyRoles, applyVerification };
