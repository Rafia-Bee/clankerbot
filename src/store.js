// The bot's database: which character each verified member linked, plus the ticket tables from tickets/store.js.
//   openStore                   opens (or creates) the database file and returns the functions below and the ticket ones
//   getVerification             a member's saved character
//   findClaimOwner              which member a character is linked to, by character ID or confirmed name
//   saveVerification            links a character to a member, replacing their old one; false if someone else has it
//   removeVerification          unlinks a member's character
//   listConfirmedVerifications  every member whose character was found on the server
//   updateCharacterName         saves a character's new spelling after a rename
//   getStore                    the shared database, opened on first use from CLANKER_DB_PATH

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { TICKET_SCHEMA, createTicketStore } = require("./tickets/store");

const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "clanker.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS verifications (
  discord_id       TEXT PRIMARY KEY,
  char_name        TEXT NOT NULL,
  char_name_lower  TEXT NOT NULL,
  character_id     TEXT,
  legion           TEXT,
  confirmed        INTEGER NOT NULL,
  verified_at      INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS verifications_confirmed_name
  ON verifications (char_name_lower) WHERE confirmed = 1;
CREATE UNIQUE INDEX IF NOT EXISTS verifications_character_id
  ON verifications (character_id) WHERE character_id IS NOT NULL;
`;

let shared = null;

function isUniqueError(error) {
  return error?.code === "SQLITE_CONSTRAINT_UNIQUE";
}

function openStore(dbPath = process.env.CLANKER_DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(TICKET_SCHEMA);

  const statements = {
    get: db.prepare("SELECT * FROM verifications WHERE discord_id = ?"),
    ownerById: db.prepare("SELECT discord_id FROM verifications WHERE character_id = ?"),
    ownerByName: db.prepare(
      "SELECT discord_id FROM verifications WHERE confirmed = 1 AND char_name_lower = ?"
    ),
    upsert: db.prepare(`
      INSERT INTO verifications
        (discord_id, char_name, char_name_lower, character_id, legion, confirmed, verified_at, updated_at)
      VALUES
        (@discordId, @charName, @charNameLower, @characterId, @legion, @confirmed, @now, @now)
      ON CONFLICT (discord_id) DO UPDATE SET
        char_name = excluded.char_name,
        char_name_lower = excluded.char_name_lower,
        character_id = excluded.character_id,
        legion = excluded.legion,
        confirmed = excluded.confirmed,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
    `),
    remove: db.prepare("DELETE FROM verifications WHERE discord_id = ?"),
    listConfirmed: db.prepare("SELECT * FROM verifications WHERE confirmed = 1 ORDER BY verified_at"),
    rename: db.prepare(
      "UPDATE verifications SET char_name = ?, char_name_lower = ?, updated_at = ? WHERE discord_id = ?"
    ),
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
      confirmed: row.confirmed ? 1 : 0,
      now: Date.now(),
    });
    return true;
  });

  return {
    ...createTicketStore(db),
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
    updateCharacterName(discordId, name) {
      try {
        return statements.rename.run(name, name.toLowerCase(), Date.now(), discordId).changes > 0;
      } catch (error) {
        if (isUniqueError(error)) return false;
        throw error;
      }
    },
  };
}

function getStore() {
  shared ??= openStore();
  return shared;
}

module.exports = { openStore, getStore };
