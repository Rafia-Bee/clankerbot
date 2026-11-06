// The voice tables in the bot's database: hub channels, and the voice channels the bot made for members.
//   VOICE_SCHEMA           the tables, created on startup if they don't exist yet
//   createVoiceStore       the voice functions below, for an open database
//   addHub                 saves a channel as a hub (false if it already is one)
//   removeHub              forgets a hub
//   isHub                  whether a channel is a hub
//   listHubs               every hub
//   addTempChannel         saves a voice channel the bot made for a member
//   removeTempChannel      forgets one
//   isTempChannel          whether the bot made this channel for a member
//   getTempChannelByOwner  the channel the bot made for a member in a server
//   listTempChannels       every channel the bot made for members

const VOICE_SCHEMA = `
CREATE TABLE IF NOT EXISTS voice_hubs (
  channel_id       TEXT PRIMARY KEY,
  guild_id         TEXT NOT NULL,
  created_at       INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_channels (
  channel_id       TEXT PRIMARY KEY,
  guild_id         TEXT NOT NULL,
  owner_id         TEXT NOT NULL,
  hub_id           TEXT NOT NULL,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS voice_channels_by_owner ON voice_channels (guild_id, owner_id);
`;

function createVoiceStore(db) {
  const s = {
    addHub: db.prepare(
      "INSERT OR IGNORE INTO voice_hubs (channel_id, guild_id, created_at) VALUES (?, ?, ?)"
    ),
    removeHub: db.prepare("DELETE FROM voice_hubs WHERE channel_id = ?"),
    getHub: db.prepare("SELECT 1 FROM voice_hubs WHERE channel_id = ?"),
    listHubs: db.prepare("SELECT * FROM voice_hubs ORDER BY created_at, channel_id"),
    addTemp: db.prepare(`
      INSERT OR REPLACE INTO voice_channels (channel_id, guild_id, owner_id, hub_id, created_at)
      VALUES (@channelId, @guildId, @ownerId, @hubId, @now)
    `),
    removeTemp: db.prepare("DELETE FROM voice_channels WHERE channel_id = ?"),
    getTemp: db.prepare("SELECT 1 FROM voice_channels WHERE channel_id = ?"),
    tempByOwner: db.prepare(
      "SELECT * FROM voice_channels WHERE guild_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 1"
    ),
    listTemp: db.prepare("SELECT * FROM voice_channels ORDER BY created_at, channel_id"),
  };

  return {
    addHub: (guildId, channelId) => s.addHub.run(channelId, guildId, Date.now()).changes > 0,
    removeHub: (channelId) => s.removeHub.run(channelId).changes > 0,
    isHub: (channelId) => Boolean(s.getHub.get(channelId)),
    listHubs: () => s.listHubs.all(),
    addTempChannel: (row) => s.addTemp.run({ ...row, now: Date.now() }),
    removeTempChannel: (channelId) => s.removeTemp.run(channelId).changes > 0,
    isTempChannel: (channelId) => Boolean(s.getTemp.get(channelId)),
    getTempChannelByOwner: (guildId, ownerId) => s.tempByOwner.get(guildId, ownerId),
    listTempChannels: () => s.listTemp.all(),
  };
}

module.exports = { VOICE_SCHEMA, createVoiceStore };
