// The ticket tables in the bot's database: panels, ticket types with their staff roles and messages, and tickets.
//   TICKET_SCHEMA      the tables, created on startup if they don't exist yet
//   createTicketStore  the ticket functions below, for an open database
//   createPanel        saves a panel and its types in one go, returning their IDs
//   setPanelMessage    saves the ID of the posted panel message
//   deletePanel        removes a panel and its types (used when posting it failed)
//   getPanel           a panel with its types in order
//   getType            a ticket type with its panel colour, staff roles and opening messages
//   nextTicketNumber   counts up the type's ticket number and returns the new one
//   createTicket       saves a new open ticket
//   getTicket          a ticket by its ID
//   getTicketByChannel a ticket by its channel
//   activeTickets      a member's open tickets of one type
//   closeTicket        open to closed (false if it wasn't open)
//   reopenTicket       closed back to open (false if it wasn't closed)
//   deleteTicket       any status to deleted (false if it already was)
//   listClosedTickets  closed tickets with their type's delete-after days
//   markChannelDeleted marks a ticket deleted when its channel was deleted by hand
//   getDraft           a member's unfinished /ticket-setup draft for a server, or null
//   saveDraft          saves (or replaces) that draft
//   deleteDraft        removes it once it's published or cancelled

const TICKET_SCHEMA = `
CREATE TABLE IF NOT EXISTS ticket_panels (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id         TEXT NOT NULL,
  channel_id       TEXT NOT NULL,
  message_id       TEXT,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  colour           INTEGER NOT NULL,
  image            TEXT,
  created_at       INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  panel_id            INTEGER NOT NULL REFERENCES ticket_panels (id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  label               TEXT NOT NULL,
  slug                TEXT NOT NULL,
  emoji               TEXT,
  style               TEXT NOT NULL,
  name_schema         TEXT NOT NULL,
  open_category_id    TEXT NOT NULL,
  closed_category_id  TEXT NOT NULL,
  open_limit          INTEGER NOT NULL,
  delete_after_days   INTEGER NOT NULL,
  counter             INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ticket_type_roles (
  type_id          INTEGER NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  role_id          TEXT NOT NULL,
  PRIMARY KEY (type_id, role_id)
);
CREATE TABLE IF NOT EXISTS ticket_type_messages (
  type_id          INTEGER NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,
  kind             TEXT NOT NULL,
  content          TEXT NOT NULL,
  PRIMARY KEY (type_id, position)
);
CREATE TABLE IF NOT EXISTS tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id         TEXT NOT NULL,
  channel_id       TEXT NOT NULL UNIQUE,
  type_id          INTEGER NOT NULL,
  opener_id        TEXT NOT NULL,
  number           INTEGER NOT NULL,
  status           TEXT NOT NULL,
  closed_by        TEXT,
  deleted_by       TEXT,
  created_at       INTEGER NOT NULL,
  closed_at        INTEGER,
  deleted_at       INTEGER
);
CREATE INDEX IF NOT EXISTS tickets_by_opener ON tickets (type_id, opener_id, status);
CREATE INDEX IF NOT EXISTS tickets_by_status ON tickets (status);
CREATE TABLE IF NOT EXISTS setup_drafts (
  user_id          TEXT NOT NULL,
  guild_id         TEXT NOT NULL,
  data             TEXT NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, guild_id)
);
`;

function createTicketStore(db) {
  const s = {
    insertPanel: db.prepare(`
      INSERT INTO ticket_panels (guild_id, channel_id, title, description, colour, image, created_at)
      VALUES (@guildId, @channelId, @title, @description, @colour, @image, @now)
    `),
    insertType: db.prepare(`
      INSERT INTO ticket_types (panel_id, position, label, slug, emoji, style, name_schema, open_category_id,
        closed_category_id, open_limit, delete_after_days)
      VALUES (@panelId, @position, @label, @slug, @emoji, @style, @nameSchema, @openCategoryId,
        @closedCategoryId, @openLimit, @deleteAfterDays)
    `),
    insertRole: db.prepare("INSERT OR IGNORE INTO ticket_type_roles (type_id, role_id) VALUES (?, ?)"),
    insertMessage: db.prepare(
      "INSERT INTO ticket_type_messages (type_id, position, kind, content) VALUES (?, ?, ?, ?)"
    ),
    setPanelMessage: db.prepare("UPDATE ticket_panels SET message_id = ? WHERE id = ?"),
    deletePanel: db.prepare("DELETE FROM ticket_panels WHERE id = ?"),
    getPanel: db.prepare("SELECT * FROM ticket_panels WHERE id = ?"),
    typesOfPanel: db.prepare("SELECT * FROM ticket_types WHERE panel_id = ? ORDER BY position"),
    getType: db.prepare(`
      SELECT t.*, p.colour AS panel_colour FROM ticket_types t
      JOIN ticket_panels p ON p.id = t.panel_id WHERE t.id = ?
    `),
    rolesOfType: db.prepare("SELECT role_id FROM ticket_type_roles WHERE type_id = ? ORDER BY rowid"),
    messagesOfType: db.prepare(
      "SELECT kind, content FROM ticket_type_messages WHERE type_id = ? ORDER BY position"
    ),
    nextNumber: db.prepare("UPDATE ticket_types SET counter = counter + 1 WHERE id = ? RETURNING counter"),
    insertTicket: db.prepare(`
      INSERT INTO tickets (guild_id, channel_id, type_id, opener_id, number, status, created_at)
      VALUES (@guildId, @channelId, @typeId, @openerId, @number, 'open', @now)
    `),
    getTicket: db.prepare("SELECT * FROM tickets WHERE id = ?"),
    getTicketByChannel: db.prepare("SELECT * FROM tickets WHERE channel_id = ?"),
    activeTickets: db.prepare(
      "SELECT * FROM tickets WHERE type_id = ? AND opener_id = ? AND status = 'open' ORDER BY id"
    ),
    close: db.prepare(
      "UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ? AND status = 'open'"
    ),
    reopen: db.prepare(
      "UPDATE tickets SET status = 'open', closed_by = NULL, closed_at = NULL WHERE id = ? AND status = 'closed'"
    ),
    delete: db.prepare(
      "UPDATE tickets SET status = 'deleted', deleted_by = ?, deleted_at = ? WHERE id = ? AND status != 'deleted'"
    ),
    listClosed: db.prepare(`
      SELECT t.*, ty.delete_after_days FROM tickets t
      JOIN ticket_types ty ON ty.id = t.type_id WHERE t.status = 'closed'
    `),
    markChannelDeleted: db.prepare(
      "UPDATE tickets SET status = 'deleted', deleted_at = ? WHERE channel_id = ? AND status != 'deleted'"
    ),
    getDraft: db.prepare("SELECT data FROM setup_drafts WHERE user_id = ? AND guild_id = ?"),
    saveDraft: db.prepare(`
      INSERT INTO setup_drafts (user_id, guild_id, data, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, guild_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `),
    deleteDraft: db.prepare("DELETE FROM setup_drafts WHERE user_id = ? AND guild_id = ?"),
  };

  const createPanel = db.transaction((panel) => {
    const now = Date.now();
    const panelId = Number(
      s.insertPanel.run({
        guildId: panel.guildId,
        channelId: panel.channelId,
        title: panel.title,
        description: panel.description ?? "",
        colour: panel.colour,
        image: panel.image ?? null,
        now,
      }).lastInsertRowid
    );
    const typeIds = panel.types.map((type, position) => {
      const typeId = Number(s.insertType.run({ ...type, emoji: type.emoji ?? null, panelId, position }).lastInsertRowid);
      for (const roleId of type.staffRoleIds) s.insertRole.run(typeId, roleId);
      type.messages.forEach((message, i) => s.insertMessage.run(typeId, i, message.kind, message.content));
      return typeId;
    });
    return { panelId, typeIds };
  });

  return {
    createPanel,
    setPanelMessage: (panelId, messageId) => s.setPanelMessage.run(messageId, panelId),
    deletePanel: (panelId) => s.deletePanel.run(panelId),
    getPanel(panelId) {
      const panel = s.getPanel.get(panelId);
      return panel && { ...panel, types: s.typesOfPanel.all(panelId) };
    },
    getType(typeId) {
      const type = s.getType.get(typeId);
      if (!type) return undefined;
      return {
        ...type,
        staffRoleIds: s.rolesOfType.all(typeId).map((row) => row.role_id),
        messages: s.messagesOfType.all(typeId),
      };
    },
    nextTicketNumber: (typeId) => s.nextNumber.get(typeId).counter,
    createTicket: (ticket) => Number(s.insertTicket.run({ ...ticket, now: Date.now() }).lastInsertRowid),
    getTicket: (ticketId) => s.getTicket.get(ticketId),
    getTicketByChannel: (channelId) => s.getTicketByChannel.get(channelId),
    activeTickets: (typeId, openerId) => s.activeTickets.all(typeId, openerId),
    closeTicket: (ticketId, by) => s.close.run(by, Date.now(), ticketId).changes > 0,
    reopenTicket: (ticketId) => s.reopen.run(ticketId).changes > 0,
    deleteTicket: (ticketId, by) => s.delete.run(by, Date.now(), ticketId).changes > 0,
    listClosedTickets: () => s.listClosed.all(),
    markChannelDeleted: (channelId) => s.markChannelDeleted.run(Date.now(), channelId).changes > 0,
    getDraft(userId, guildId) {
      const row = s.getDraft.get(userId, guildId);
      return row ? JSON.parse(row.data) : null;
    },
    saveDraft: (userId, guildId, draft) => s.saveDraft.run(userId, guildId, JSON.stringify(draft), Date.now()),
    deleteDraft: (userId, guildId) => s.deleteDraft.run(userId, guildId),
  };
}

module.exports = { TICKET_SCHEMA, createTicketStore };
