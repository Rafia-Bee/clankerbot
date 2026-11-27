// The channels where /hidegifs is turned on, in the bot's database: how long GIFs show and when the mode ends.
//   HIDE_GIFS_SCHEMA      the table, created on startup if it doesn't exist yet
//   createHideGifsStore   the functions below, for an open database
//   setHideGifs           turns the mode on for a channel, replacing any earlier settings there
//   getHideGifs           a channel's mode, null when it's off or has run out
//   listHideGifs          every channel where the mode is still running
//   stopHideGifs          turns the mode off for a channel; false if it wasn't on

const HIDE_GIFS_SCHEMA = `
CREATE TABLE IF NOT EXISTS hide_gif_channels (
  channel_id   TEXT PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  timer_ms     INTEGER NOT NULL,
  ends_at      INTEGER NOT NULL,
  started_by   TEXT NOT NULL,
  started_at   INTEGER NOT NULL
);
`;

function toMode(row) {
  if (!row) return null;
  return { guildId: row.guild_id, channelId: row.channel_id, timerMs: row.timer_ms, endsAt: row.ends_at };
}

function createHideGifsStore(db) {
  const s = {
    set: db.prepare(`
      INSERT INTO hide_gif_channels (channel_id, guild_id, timer_ms, ends_at, started_by, started_at)
      VALUES (@channelId, @guildId, @timerMs, @endsAt, @userId, @now)
      ON CONFLICT (channel_id) DO UPDATE SET
        guild_id = excluded.guild_id, timer_ms = excluded.timer_ms, ends_at = excluded.ends_at,
        started_by = excluded.started_by, started_at = excluded.started_at
    `),
    get: db.prepare("SELECT * FROM hide_gif_channels WHERE channel_id = ? AND ends_at > ?"),
    list: db.prepare("SELECT * FROM hide_gif_channels WHERE ends_at > ? ORDER BY started_at"),
    stop: db.prepare("DELETE FROM hide_gif_channels WHERE channel_id = ? AND ends_at > ?"),
    clearOld: db.prepare("DELETE FROM hide_gif_channels WHERE ends_at <= ?"),
  };

  return {
    setHideGifs({ guildId, channelId, timerMs, endsAt, userId }) {
      s.set.run({ guildId, channelId, timerMs, endsAt, userId, now: Date.now() });
    },
    getHideGifs: (channelId, now = Date.now()) => toMode(s.get.get(channelId, now)),
    listHideGifs(now = Date.now()) {
      s.clearOld.run(now);
      return s.list.all(now).map(toMode);
    },
    stopHideGifs(channelId, now = Date.now()) {
      const stopped = s.stop.run(channelId, now).changes > 0;
      s.clearOld.run(now);
      return stopped;
    },
  };
}

module.exports = { HIDE_GIFS_SCHEMA, createHideGifsStore };
