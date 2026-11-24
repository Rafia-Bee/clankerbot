// The bot's database: which character each verified member linked, plus the ticket, voice and /count tables.
//   addManualRolesColumn        adds the column for mod-picked roles to databases made before it existed
//   openStore                   opens (or creates) the database file and returns the functions below, the ticket, voice and /count ones
//   getVerification             a member's saved character
//   findClaimOwner              which member a character is linked to, by character ID or confirmed name
//   saveVerification            links a character to a member, replacing their old one (and any mod-picked roles); false if someone else has it
//   removeVerification          unlinks a member's character
//   listConfirmedVerifications  every member whose character was found on the server
//   updateCharacter             saves a character's current name and legion after /recheck; false if someone else has that name
//   getServerSettings           the roles admins picked with /settings, by their old .env name
//   setServerSetting            saves one of those settings, or removes it when the value is empty
//   importServerSettingsOnce    copies settings from the old .env lines the first time only; null after that
//   close                       closes the database
//   getStore                    the shared database, opened on first use from CLANKER_DB_PATH

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { TICKET_SCHEMA, createTicketStore } = require("./tickets/store");
const { VOICE_SCHEMA, createVoiceStore } = require("./voice/store");
const { COUNTER_SCHEMA, createCounterStore } = require("./counters/store");

const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "clanker.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS verifications (
  discord_id       TEXT PRIMARY KEY,
  char_name        TEXT NOT NULL,
  char_name_lower  TEXT NOT NULL,
  character_id     TEXT,
  legion           TEXT,
  manual_roles     TEXT,
  confirmed        INTEGER NOT NULL,
  verified_at      INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS verifications_confirmed_name
  ON verifications (char_name_lower) WHERE confirmed = 1;
CREATE UNIQUE INDEX IF NOT EXISTS verifications_character_id
  ON verifications (character_id) WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS server_settings (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL,
  updated_by       TEXT,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_state (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL
);
`;

let shared = null;

function isUniqueError(error) {
  return error?.code === "SQLITE_CONSTRAINT_UNIQUE";
}

function addManualRolesColumn(db) {
  const columns = db.prepare("PRAGMA table_info(verifications)").all().map((row) => row.name);
  if (!columns.includes("manual_roles")) db.exec("ALTER TABLE verifications ADD COLUMN manual_roles TEXT");
}

function openStore(dbPath = process.env.CLANKER_DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  addManualRolesColumn(db);
  db.exec(TICKET_SCHEMA);
  db.exec(VOICE_SCHEMA);
  db.exec(COUNTER_SCHEMA);

  const statements = {
    get: db.prepare("SELECT * FROM verifications WHERE discord_id = ?"),
    ownerById: db.prepare("SELECT discord_id FROM verifications WHERE character_id = ?"),
    ownerByName: db.prepare(
      "SELECT discord_id FROM verifications WHERE confirmed = 1 AND char_name_lower = ?"
    ),
    upsert: db.prepare(`
      INSERT INTO verifications
        (discord_id, char_name, char_name_lower, character_id, legion, manual_roles, confirmed, verified_at, updated_at)
      VALUES
        (@discordId, @charName, @charNameLower, @characterId, @legion, @manualRoles, @confirmed, @now, @now)
      ON CONFLICT (discord_id) DO UPDATE SET
        char_name = excluded.char_name,
        char_name_lower = excluded.char_name_lower,
        character_id = excluded.character_id,
        legion = excluded.legion,
        manual_roles = excluded.manual_roles,
        confirmed = excluded.confirmed,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
    `),
    remove: db.prepare("DELETE FROM verifications WHERE discord_id = ?"),
    listConfirmed: db.prepare("SELECT * FROM verifications WHERE confirmed = 1 ORDER BY verified_at"),
    updateCharacter: db.prepare(
      "UPDATE verifications SET char_name = ?, char_name_lower = ?, legion = ?, updated_at = ? WHERE discord_id = ?"
    ),
    serverSettings: db.prepare("SELECT key, value FROM server_settings"),
    serverSetting: db.prepare("SELECT value FROM server_settings WHERE key = ?"),
    setServerSetting: db.prepare(`
      INSERT INTO server_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET
        value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `),
    deleteServerSetting: db.prepare("DELETE FROM server_settings WHERE key = ?"),
    state: db.prepare("SELECT value FROM bot_state WHERE key = ?"),
    setState: db.prepare(`
      INSERT INTO bot_state (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `),
  };

  function findClaimOwner({ characterId, name }) {
    if (characterId) {
      const byId = statements.ownerById.get(characterId);
      if (byId) return byId.discord_id;
    }
    return statements.ownerByName.get(name.toLowerCase())?.discord_id ?? null;
  }

  const save = db.transaction((row) => {
    if (row.confirmed) {
      const owner = findClaimOwner({ characterId: row.characterId, name: row.charName });
      if (owner && owner !== row.discordId) return false;
    }
    statements.upsert.run({
      discordId: row.discordId,
      charName: row.charName,
      charNameLower: row.charName.toLowerCase(),
      characterId: row.confirmed ? row.characterId ?? null : null,
      legion: row.legion ?? null,
      manualRoles: row.manualRoles ?? null,
      confirmed: row.confirmed ? 1 : 0,
      now: Date.now(),
    });
    return true;
  });

  return {
    ...createTicketStore(db),
    ...createVoiceStore(db),
    ...createCounterStore(db),
    getVerification: (discordId) => statements.get.get(discordId),
    findClaimOwner,
    saveVerification(row) {
      try {
        return save(row);
      } catch (error) {
        if (isUniqueError(error)) return false;
        throw error;
      }
    },
    removeVerification: (discordId) => statements.remove.run(discordId).changes > 0,
    listConfirmedVerifications: () => statements.listConfirmed.all(),
    updateCharacter(discordId, { name, legion }) {
      try {
        return statements.updateCharacter.run(name, name.toLowerCase(), legion ?? null, Date.now(), discordId).changes > 0;
      } catch (error) {
        if (isUniqueError(error)) return false;
        throw error;
      }
    },
    getServerSettings() {
      return Object.fromEntries(statements.serverSettings.all().map((row) => [row.key, JSON.parse(row.value)]));
    },
    setServerSetting(key, value, updatedBy, now = Date.now()) {
      if (value == null) statements.deleteServerSetting.run(key);
      else statements.setServerSetting.run(key, JSON.stringify(value), updatedBy, now);
    },
    importServerSettingsOnce(entries, now = Date.now()) {
      return db.transaction(() => {
        if (statements.state.get("server_settings_imported")) return null;
        const imported = [];
        for (const { key, value } of entries) {
          if (statements.serverSetting.get(key)) continue;
          statements.setServerSetting.run(key, JSON.stringify(value), "imported from .env", now);
          imported.push(key);
        }
        statements.setState.run("server_settings_imported", String(now));
        return imported;
      })();
    },
    close: () => db.close(),
  };
}

function getStore() {
  shared ??= openStore();
  return shared;
}

module.exports = { openStore, getStore };
