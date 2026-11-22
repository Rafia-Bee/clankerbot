// The replies for /badword, /badword-count and /badword-leaderboard, kept apart from Discord so they can be tested.
//   badWordAddedReply        the reply after adding 1 to a member's count
//   badWordCountReply        the reply showing a member's count
//   rankBadWords             gives each row its place, with equal counts sharing a place (1, 1, 3)
//   badWordLeaderboardReply  the leaderboard: its name, then place, member and count on each line
//   parseLeaderboardTitle    checks a typed leaderboard name and tidies its spaces; null when empty
//   leaderboardTitleFor      the leaderboard name from the saved settings, or the default

const DEFAULT_LEADERBOARD_TITLE = "Bad word leaderboard";
const MAX_TITLE_LENGTH = 100;

function badWordAddedReply(userId, count) {
  return `Added 1 to <@${userId}>. Their count is now ${count}.`;
}

function badWordCountReply(userId, count) {
  return `<@${userId}>'s count is ${count}.`;
}

function rankBadWords(rows) {
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || rows[i - 1].count !== row.count) rank = i + 1;
    return { ...row, rank };
  });
}

function badWordLeaderboardReply(rows, title = DEFAULT_LEADERBOARD_TITLE) {
  if (rows.length === 0) return "Nobody has a count yet.";
  const lines = rankBadWords(rows).map((row) => `**#${row.rank}** <@${row.userId}>: ${row.count}`);
  return [`**${title}**`, ...lines].join("\n");
}

function parseLeaderboardTitle(raw) {
  const title = raw.trim().replace(/\s+/g, " ");
  if (!title) return null;
  if (title.length > MAX_TITLE_LENGTH) throw new Error(`The name can be up to ${MAX_TITLE_LENGTH} letters long.`);
  return title;
}

function leaderboardTitleFor(settings) {
  return settings.BAD_WORD_LEADERBOARD_TITLE || DEFAULT_LEADERBOARD_TITLE;
}

module.exports = {
  DEFAULT_LEADERBOARD_TITLE,
  badWordAddedReply,
  badWordCountReply,
  rankBadWords,
  badWordLeaderboardReply,
  parseLeaderboardTitle,
  leaderboardTitleFor,
};
