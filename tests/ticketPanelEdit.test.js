// Tests for editing and deleting published panels: the database, turning a panel back into a draft, and saving edits.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { openStore } = require("../src/store");
const { panelToDraft } = require("../src/tickets/draft");
const { checkPanelConfig } = require("../src/tickets/panel");
const { savePanelEdits } = require("../src/tickets/publish");
const { canOpen } = require("../src/tickets/rules");

const ID = "123456789012345678";
const OTHER = "223456789012345678";
const type = (extra = {}) => ({
  label: "Apply",
  slug: "apply",
  emoji: null,
  style: "primary",
  nameSchema: "{type}-{number}",
  openCategoryId: ID,
  closedCategoryId: ID,
  staffRoleIds: [ID],
  openLimit: 1,
  deleteAfterDays: 7,
  messages: [{ kind: "text", content: "Hello" }],
  ...extra,
});
const panel = (extra = {}) => ({
  guildId: "1",
  channelId: ID,
  title: "Tickets",
  description: "Pick one",
  colour: 0x3b82f6,
  image: null,
  types: [type(), type({ label: "Report", slug: "report" })],
  ...extra,
});

let store;
test.beforeEach(() => {
  store = openStore(":memory:");
});

test("lists a server's panels, without deleted ones", () => {
  const { panelId: first } = store.createPanel(panel());
  const { panelId: second } = store.createPanel(panel({ title: "Second" }));
  store.createPanel(panel({ guildId: "2" }));
  store.markPanelDeleted(second);
  const panels = store.listPanels("1");
  assert.deepEqual(panels.map((p) => p.id), [first]);
  assert.deepEqual(panels[0].types.map((t) => t.label), ["Apply", "Report"]);
  assert.ok(store.getPanel(second).deleted_at > 0);
});

test("editing keeps existing types, adds new ones and retires removed ones", () => {
  const { panelId, typeIds: [apply, report] } = store.createPanel(panel());
  const { typeIds } = store.updatePanel(panelId, {
    channelId: OTHER,
    title: "New title",
    description: "",
    colour: 0xff0000,
    image: "https://example.com/a.png",
    types: [
      type({ id: report, label: "Report it", slug: "report-it", staffRoleIds: [OTHER], messages: [] }),
      type({ label: "Join", slug: "join" }),
    ],
  });
  assert.equal(typeIds[0], report);
  assert.ok(![apply, report].includes(typeIds[1]));

  const saved = store.getPanel(panelId);
  assert.equal(saved.title, "New title");
  assert.equal(saved.channel_id, OTHER);
  assert.equal(saved.colour, 0xff0000);
  assert.deepEqual(saved.types.map((t) => t.label), ["Report it", "Join"]);

  const edited = store.getType(report);
  assert.deepEqual(edited.staffRoleIds, [OTHER]);
  assert.deepEqual(edited.messages, []);

  const retired = store.getType(apply);
  assert.equal(retired.removed, 1);
  assert.equal(canOpen(retired), false);
  assert.equal(canOpen(edited), true);
});

test("a type ID from another panel isn't taken over", () => {
  const { panelId } = store.createPanel(panel());
  const { typeIds: [foreign] } = store.createPanel(panel({ title: "Other" }));
  const { typeIds } = store.updatePanel(panelId, { ...panel(), types: [type({ id: foreign })] });
  assert.notEqual(typeIds[0], foreign);
  assert.equal(store.getType(foreign).removed, 0);
});

test("tickets of a deleted panel can't be opened, but their type is still there", () => {
  const { panelId, typeIds: [apply] } = store.createPanel(panel());
  store.markPanelDeleted(panelId);
  const typeRow = store.getType(apply);
  assert.ok(typeRow);
  assert.deepEqual(typeRow.staffRoleIds, [ID]);
  assert.equal(canOpen(typeRow), false);
  assert.equal(canOpen(undefined), false);
});

test("saves where the panel message is", () => {
  const { panelId } = store.createPanel(panel());
  store.setPanelLocation(panelId, OTHER, "555");
  const saved = store.getPanel(panelId);
  assert.equal(saved.channel_id, OTHER);
  assert.equal(saved.message_id, "555");
});

test("a panel turns back into a draft that passes the checks and keeps its type IDs", () => {
  const { panelId, typeIds } = store.createPanel(
    panel({ colour: 0x0000ff, types: [type({ emoji: "📝", messages: [{ kind: "embed", content: "Q" }] })] })
  );
  const draft = panelToDraft(store.getPanel(panelId), typeIds.map((id) => store.getType(id)));
  assert.equal(draft.editingPanelId, panelId);
  assert.equal(draft.colour, "#0000ff");
  assert.equal(draft.types[0].id, typeIds[0]);
  assert.equal(draft.types[0].emoji, "📝");
  assert.deepEqual(draft.types[0].staffRoleIds, [ID]);
  assert.deepEqual(draft.types[0].messages, [{ kind: "embed", content: "Q" }]);
  const { errors, panel: checked } = checkPanelConfig(draft);
  assert.deepEqual(errors, []);
  assert.equal(checked.types[0].id, typeIds[0]);
});

test("saving edits updates the panel and the posted message keeps the same buttons", async () => {
  const { panelId, typeIds } = store.createPanel(panel());
  const draft = panelToDraft(store.getPanel(panelId), typeIds.map((id) => store.getType(id)));
  draft.title = "Changed";
  const delivered = [];
  const result = await savePanelEdits({
    store,
    config: draft,
    panelId,
    deliver: async (message, channelId) => {
      delivered.push({ message, channelId });
      return { channelId, messageId: "777" };
    },
  });
  assert.deepEqual(result.errors, []);
  assert.equal(store.getPanel(panelId).title, "Changed");
  assert.equal(store.getPanel(panelId).message_id, "777");
  const buttons = delivered[0].message.components[0].toJSON().components.map((b) => b.custom_id);
  assert.deepEqual(buttons, typeIds.map((id) => `ticket:open:${panelId}:${id}`));
});

test("edits with problems change nothing, and a deleted panel can't be edited", async () => {
  const { panelId, typeIds } = store.createPanel(panel());
  const draft = panelToDraft(store.getPanel(panelId), typeIds.map((id) => store.getType(id)));
  const deliver = async () => assert.fail("nothing should be posted");
  const bad = await savePanelEdits({ store, config: { ...draft, title: "" }, panelId, deliver });
  assert.deepEqual(bad.errors, ["title is required (up to 256 characters)"]);
  assert.equal(store.getPanel(panelId).title, "Tickets");

  store.markPanelDeleted(panelId);
  const gone = await savePanelEdits({ store, config: draft, panelId, deliver });
  assert.deepEqual(gone.errors, ["This panel was deleted, so it can't be edited."]);
});

test("old databases get the new columns without losing anything", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clanker-")), "old.db");
  const old = new Database(file);
  old.exec(`
    CREATE TABLE ticket_panels (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      message_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL, colour INTEGER NOT NULL, image TEXT,
      created_at INTEGER NOT NULL);
    CREATE TABLE ticket_types (id INTEGER PRIMARY KEY AUTOINCREMENT, panel_id INTEGER NOT NULL, position INTEGER NOT NULL,
      label TEXT NOT NULL, slug TEXT NOT NULL, emoji TEXT, style TEXT NOT NULL, name_schema TEXT NOT NULL,
      open_category_id TEXT NOT NULL, closed_category_id TEXT NOT NULL, open_limit INTEGER NOT NULL,
      delete_after_days INTEGER NOT NULL, counter INTEGER NOT NULL DEFAULT 0);
    INSERT INTO ticket_panels VALUES (1, '1', '2', '3', 'Old', '', 0, NULL, 0);
    INSERT INTO ticket_types VALUES (1, 1, 0, 'Apply', 'apply', NULL, 'primary', '{type}', '4', '5', 1, 7, 3);
  `);
  old.close();

  const upgraded = openStore(file);
  assert.equal(upgraded.getPanel(1).title, "Old");
  assert.equal(upgraded.getPanel(1).deleted_at, null);
  assert.equal(upgraded.getType(1).removed, 0);
  assert.equal(upgraded.nextTicketNumber(1), 4);
});
