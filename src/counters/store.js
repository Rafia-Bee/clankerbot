// The /count counters in the bot's database: each counter's name, trigger words, emoji and leaderboard name, and each member's count.
//   COUNTER_SCHEMA       the tables, created on startup if they don't exist yet
//   createCounterStore   the functions below, for an open database
//   moveOldBadWordsOnce  the first time counters are used, turns the old /badword counts and settings into a "Bad words" counter
//   listCounters         a server's counters, oldest first
//   getCounter           one counter by its ID, null if it isn't in that server
//   findCounter          one counter by name, capitals ignored, null if there's none
//   createCounter        makes a counter; null when the server already has one with that name
//   updateCounter        changes a counter's name, words, emoji or leaderboard name; false when the new name is taken
//   deleteCounter        deletes a counter and its counts
//   addToCount           adds to a member's count (1 unless told otherwise) and returns the new count
//   takeFromCount        takes from a member's count (1 unless told otherwise), never below 0, and returns the new count
//   resetCount           puts a member's count back to 0
//   getCount             a member's count, 0 if they've never been given one
//   getLeaderboard       a counter's highest counts, highest first (ties: who got there first)

const COUNTER_SCHEMA = `
CREATE TABLE IF NOT EXISTS counters (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  name_lower         TEXT NOT NULL,
  words              TEXT NOT NULL DEFAULT '[]',
  reaction           TEXT,
  leaderboard_title  TEXT,
  created_at         INTEGER NOT NULL,
  UNIQUE (guild_id, name_lower)
);

CREATE TABLE IF NOT EXISTS counter_counts (
  counter_id       INTEGER NOT NULL REFERENCES counters (id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  count            INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (counter_id, user_id)
);
`;

const OLD_SETTING_KEYS = ["BAD_WORDS", "BAD_WORD_REACTION", "BAD_WORD_LEADERBOARD_TITLE"];

function toCounter(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    words: JSON.parse(row.words),
    reaction: row.reaction,
    leaderboardTitle: row.leaderboard_title,
  };
}

function isUniqueError(error) {
  return error?.code === "SQLITE_CONSTRAINT_UNIQUE";
}

function createCounterStore(db) {
  const s = {
    list: db.prepare("SELECT * FROM counters WHERE guild_id = ? ORDER BY id"),
    get: db.prepare("SELECT * FROM counters WHERE guild_id = ? AND id = ?"),
    find: db.prepare("SELECT * FROM counters WHERE guild_id = ? AND name_lower = ?"),
    create: db.prepare(`
      INSERT INTO counters (guild_id, name, name_lower, words, reaction, leaderboard_title, created_at)
      VALUES (@guildId, @name, @nameLower, @words, @reaction, @leaderboardTitle, @now)
      RETURNING *
    `),
    update: db.prepare(`
      UPDATE counters SET name = @name, name_lower = @nameLower, words = @words, reaction = @reaction,
        leaderboard_title = @leaderboardTitle
      WHERE guild_id = @guildId AND id = @id
    `),
    remove: db.prepare("DELETE FROM counters WHERE guild_id = ? AND id = ?"),
    add: db.prepare(`
      INSERT INTO counter_counts (counter_id, user_id, count, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (counter_id, user_id) DO UPDATE SET
        count = count + excluded.count, updated_at = excluded.updated_at
      RETURNING count
    `),
    takeOne: db.prepare(`
      UPDATE counter_counts SET count = MAX(count - ?, 0), updated_at = ?
      WHERE counter_id = ? AND user_id = ?
      RETURNING count
    `),
    reset: db.prepare("DELETE FROM counter_counts WHERE counter_id = ? AND user_id = ?"),
    getCount: db.prepare("SELECT count FROM counter_counts WHERE counter_id = ? AND user_id = ?"),
    top: db.prepare(`
      SELECT user_id AS userId, count FROM counter_counts
      WHERE counter_id = ? AND count > 0
      ORDER BY count DESC, updated_at ASC
      LIMIT ?
    `),
    copyCount: db.prepare(
      "INSERT INTO counter_counts (counter_id, user_id, count, updated_at) VALUES (?, ?, ?, ?)"
    ),
    movedFlag: db.prepare("SELECT value FROM bot_state WHERE key = 'counters_moved'"),
    setMovedFlag: db.prepare("INSERT INTO bot_state (key, value) VALUES ('counters_moved', ?)"),
  };

  let moved = false;

  function readOldBadWords() {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bad_word_counts'").get();
    const counts = hasTable
      ? db.prepare("SELECT guild_id, user_id, count, updated_at FROM bad_word_counts WHERE count > 0").all()
      : [];
    const settings = Object.fromEntries(
      db
        .prepare(`SELECT key, value FROM server_settings WHERE key IN (${OLD_SETTING_KEYS.map(() => "?").join(", ")})`)
        .all(...OLD_SETTING_KEYS)
        .map((row) => [row.key, JSON.parse(row.value)])
    );
    return { counts, settings };
  }

  const moveOldBadWords = db.transaction((guildId) => {
    if (s.movedFlag.get()) return;
    const { counts, settings } = readOldBadWords();
    const guildIds = new Set(counts.map((row) => row.guild_id));
    if (Object.keys(settings).length) guildIds.add(guildId);
    for (const id of guildIds) {
      const counter = s.create.get({
        guildId: id,
        name: "Bad words",
        nameLower: "bad words",
        words: JSON.stringify(settings.BAD_WORDS ?? []),
        reaction: settings.BAD_WORD_REACTION ?? null,
        leaderboardTitle: settings.BAD_WORD_LEADERBOARD_TITLE ?? null,
        now: Date.now(),
      });
      for (const row of counts.filter((r) => r.guild_id === id)) {
        s.copyCount.run(counter.id, row.user_id, row.count, row.updated_at);
      }
    }
    s.setMovedFlag.run(String(Date.now()));
  });

  function moveOldBadWordsOnce(guildId) {
    if (moved) return;
    moveOldBadWords(guildId);
    moved = true;
  }

  function getCounter(guildId, id) {
    moveOldBadWordsOnce(guildId);
    return toCounter(s.get.get(guildId, id));
  }

  return {
    moveOldBadWordsOnce,
    listCounters(guildId) {
      moveOldBadWordsOnce(guildId);
      return s.list.all(guildId).map(toCounter);
    },
    getCounter,
    findCounter(guildId, name) {
      moveOldBadWordsOnce(guildId);
      return toCounter(s.find.get(guildId, name.trim().toLowerCase()));
    },
    createCounter(guildId, name) {
      moveOldBadWordsOnce(guildId);
      try {
        return toCounter(
          s.create.get({
            guildId,
            name,
            nameLower: name.toLowerCase(),
            words: "[]",
            reaction: null,
            leaderboardTitle: null,
            now: Date.now(),
          })
        );
      } catch (error) {
        if (isUniqueError(error)) return null;
        throw error;
      }
    },
    updateCounter(guildId, id, changes) {
      const counter = getCounter(guildId, id);
      if (!counter) return false;
      const next = { ...counter, ...changes };
      try {
        return (
          s.update.run({
            guildId,
            id,
            name: next.name,
            nameLower: next.name.toLowerCase(),
            words: JSON.stringify(next.words),
            reaction: next.reaction ?? null,
            leaderboardTitle: next.leaderboardTitle ?? null,
          }).changes > 0
        );
      } catch (error) {
        if (isUniqueError(error)) return false;
        throw error;
      }
    },
    deleteCounter: (guildId, id) => s.remove.run(guildId, id).changes > 0,
    addToCount: (counterId, userId, amount = 1) => s.add.get(counterId, userId, amount, Date.now()).count,
    takeFromCount: (counterId, userId, amount = 1) => s.takeOne.get(amount, Date.now(), counterId, userId)?.count ?? 0,
    resetCount: (counterId, userId) => {
      s.reset.run(counterId, userId);
    },
    getCount: (counterId, userId) => s.getCount.get(counterId, userId)?.count ?? 0,
    getLeaderboard: (counterId, limit) => s.top.all(counterId, limit),
  };
}

module.exports = { COUNTER_SCHEMA, createCounterStore };
