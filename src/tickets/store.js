// The ticket tables in the bot's database: panels, ticket types with their staff roles and messages, and tickets.
//   TICKET_SCHEMA      the tables, created on startup if they don't exist yet
//   addMissingColumns  adds columns that older databases don't have yet, keeping their data
//   createTicketStore  the ticket functions below, for an open database
//   createPanel        saves a panel and its types in one go, returning their IDs
//   updatePanel        saves an edited panel: keeps types by ID, adds new ones, retires removed ones
//   setPanelMessage    saves the ID of the posted panel message
//   setPanelLocation   saves the channel and message ID of the posted panel
//   deletePanel        removes a panel and its types for good (used when posting it failed)
//   markPanelDeleted   marks a panel deleted, keeping its types so open tickets still work
//   getPanel           a panel with its current types in order
//   listPanels         a server's panels that aren't deleted, with their current types
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
  created_at       INTEGER NOT NULL,
  deleted_at       INTEGER
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
  counter             INTEGER NOT NULL DEFAULT 0,
  removed             INTEGER NOT NULL DEFAULT 0
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

const ADDED_COLUMNS = [
  ["ticket_panels", "deleted_at", "INTEGER"],
  ["ticket_types", "removed", "INTEGER NOT NULL DEFAULT 0"],
];

function addMissingColumns(db) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createTicketStore(db) {
  addMissingColumns(db);
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
    setPanelLocation: db.prepare("UPDATE ticket_panels SET channel_id = ?, message_id = ? WHERE id = ?"),
    deletePanel: db.prepare("DELETE FROM ticket_panels WHERE id = ?"),
    markPanelDeleted: db.prepare("UPDATE ticket_panels SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL"),
    getPanel: db.prepare("SELECT * FROM ticket_panels WHERE id = ?"),
    listPanels: db.prepare("SELECT * FROM ticket_panels WHERE guild_id = ? AND deleted_at IS NULL ORDER BY id"),
    typesOfPanel: db.prepare("SELECT * FROM ticket_types WHERE panel_id = ? AND removed = 0 ORDER BY position"),
    updatePanelRow: db.prepare(`
      UPDATE ticket_panels SET channel_id = @channelId, title = @title, description = @description,
        colour = @colour, image = @image WHERE id = @panelId
    `),
    updateType: db.prepare(`
      UPDATE ticket_types SET position = @position, label = @label, slug = @slug, emoji = @emoji, style = @style,
        name_schema = @nameSchema, open_category_id = @openCategoryId, closed_category_id = @closedCategoryId,
        open_limit = @openLimit, delete_after_days = @deleteAfterDays, removed = 0
      WHERE id = @id AND panel_id = @panelId
    `),
    retireType: db.prepare("UPDATE ticket_types SET removed = 1 WHERE id = ?"),
    clearRoles: db.prepare("DELETE FROM ticket_type_roles WHERE type_id = ?"),
    clearMessages: db.prepare("DELETE FROM ticket_type_messages WHERE type_id = ?"),
    getType: db.prepare(`
      SELECT t.*, p.colour AS panel_colour, p.deleted_at AS panel_deleted_at FROM ticket_types t
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
    const typeIds = panel.types.map((type, position) => insertType(type, panelId, position));
    return { panelId, typeIds };
  });

  function saveRolesAndMessages(typeId, type) {
    for (const roleId of type.staffRoleIds) s.insertRole.run(typeId, roleId);
    type.messages.forEach((message, i) => s.insertMessage.run(typeId, i, message.kind, message.content));
  }

  function insertType(type, panelId, position) {
    const { id, ...fields } = type;
    const typeId = Number(s.insertType.run({ ...fields, emoji: type.emoji ?? null, panelId, position }).lastInsertRowid);
    saveRolesAndMessages(typeId, type);
    return typeId;
  }

  const updatePanel = db.transaction((panelId, panel) => {
    s.updatePanelRow.run({
      panelId,
      channelId: panel.channelId,
      title: panel.title,
      description: panel.description ?? "",
      colour: panel.colour,
      image: panel.image ?? null,
    });
    const current = new Set(s.typesOfPanel.all(panelId).map((row) => row.id));
    const typeIds = panel.types.map((type, position) => {
      if (!current.has(type.id)) return insertType(type, panelId, position);
      s.updateType.run({ ...type, emoji: type.emoji ?? null, panelId, position });
      s.clearRoles.run(type.id);
      s.clearMessages.run(type.id);
      saveRolesAndMessages(type.id, type);
      return type.id;
    });
    for (const id of current) if (!typeIds.includes(id)) s.retireType.run(id);
    return { typeIds };
  });

  const withTypes = (panel) => panel && { ...panel, types: s.typesOfPanel.all(panel.id) };

  return {
    createPanel,
    updatePanel,
    setPanelMessage: (panelId, messageId) => s.setPanelMessage.run(messageId, panelId),
    setPanelLocation: (panelId, channelId, messageId) => s.setPanelLocation.run(channelId, messageId, panelId),
    deletePanel: (panelId) => s.deletePanel.run(panelId),
    markPanelDeleted: (panelId) => s.markPanelDeleted.run(Date.now(), panelId).changes > 0,
    getPanel: (panelId) => withTypes(s.getPanel.get(panelId)),
    listPanels: (guildId) => s.listPanels.all(guildId).map(withTypes),
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
