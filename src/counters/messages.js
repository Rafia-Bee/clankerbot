// The replies for /count, kept apart from Discord so they can be tested.
//   addedReply             the reply after adding to a member's count
//   countReply             the reply showing a member's count
//   removedReply           the reply after taking from a count, or saying it was already 0
//   resetReply             the reply after putting a count back to 0
//   noCounterReply         the reply when the typed counter doesn't exist
//   rankRows               gives each row its place, with equal counts sharing a place (1, 1, 3)
//   leaderboardReply       the leaderboard: its name, then place, member and count on each line
//   parseLeaderboardTitle  checks a typed leaderboard name and tidies its spaces; null when empty
//   leaderboardTitleFor    the counter's leaderboard name, or "<counter name> leaderboard"

const MAX_TITLE_LENGTH = 100;

function addedReply(counter, userId, count, amount = 1) {
  return `Added ${amount} to <@${userId}>'s **${counter.name}** count. It's now ${count}.`;
}

function countReply(counter, userId, count) {
  return `<@${userId}>'s **${counter.name}** count is ${count}.`;
}

function removedReply(counter, userId, before, count) {
  if (before === 0) return `<@${userId}>'s **${counter.name}** count is already 0.`;
  return `Took ${before - count} off <@${userId}>'s **${counter.name}** count. It's now ${count}.`;
}

function resetReply(counter, userId) {
  return `Reset <@${userId}>'s **${counter.name}** count to 0.`;
}

function noCounterReply(typed, counterTotal) {
  if (counterTotal === 0) return "There are no counters yet. Admins can make one in /settings.";
  return `There's no counter called **${typed}**. Pick one from the list as you type.`;
}

function rankRows(rows) {
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || rows[i - 1].count !== row.count) rank = i + 1;
    return { ...row, rank };
  });
}

function leaderboardReply(counter, rows) {
  if (rows.length === 0) return `Nobody has a **${counter.name}** count yet.`;
  const lines = rankRows(rows).map((row) => `**#${row.rank}** <@${row.userId}>: ${row.count}`);
  return [`**${leaderboardTitleFor(counter)}**`, ...lines].join("\n");
}

function parseLeaderboardTitle(raw) {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) return null;
  if (title.length > MAX_TITLE_LENGTH) throw new Error(`The name can be up to ${MAX_TITLE_LENGTH} letters long.`);
  return title;
}

function leaderboardTitleFor(counter) {
  return counter.leaderboardTitle || `${counter.name} leaderboard`;
}

module.exports = {
  addedReply,
  countReply,
  removedReply,
  resetReply,
  noCounterReply,
  rankRows,
  leaderboardReply,
  parseLeaderboardTitle,
  leaderboardTitleFor,
};
