// The /badword counts in the bot's database: how many times each member has been given one, per server.
//   BAD_WORD_SCHEMA       the table, created on startup if it doesn't exist yet
//   createBadWordStore   the functions below, for an open database
//   addBadWord           adds 1 to a member's count and returns the new count
//   getBadWordCount      a member's count, 0 if they've never been given one

const BAD_WORD_SCHEMA = `
CREATE TABLE IF NOT EXISTS bad_word_counts (
  guild_id         TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  count            INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
`;

function createBadWordStore(db) {
  const s = {
    add: db.prepare(`
      INSERT INTO bad_word_counts (guild_id, user_id, count, updated_at) VALUES (?, ?, 1, ?)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET
        count = count + 1, updated_at = excluded.updated_at
      RETURNING count
    `),
    get: db.prepare("SELECT count FROM bad_word_counts WHERE guild_id = ? AND user_id = ?"),
  };

  return {
    addBadWord: (guildId, userId) => s.add.get(guildId, userId, Date.now()).count,
    getBadWordCount: (guildId, userId) => s.get.get(guildId, userId)?.count ?? 0,
  };
}

module.exports = { BAD_WORD_SCHEMA, createBadWordStore };
