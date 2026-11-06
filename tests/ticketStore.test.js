// Tests for the ticket panels, types and tickets saved in the database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openStore } = require("../src/store");

const DAY_MS = 24 * 60 * 60 * 1000;
const panel = { guildId: "1", channelId: "2", title: "Tickets", description: "Pick one", colour: 0x3b82f6, image: null };
const type = (extra = {}) => ({
  label: "Apply",
  slug: "apply",
  emoji: null,
  style: "primary",
  nameSchema: "{type}-{number}",
  openCategoryId: "10",
  closedCategoryId: "11",
  staffRoleIds: ["20", "21"],
  openLimit: 1,
  deleteAfterDays: 7,
  messages: [
    { kind: "text", content: "Hello {member}" },
    { kind: "embed", content: "Questions" },
  ],
  ...extra,
});

let store;
let panelId;
let typeId;
test.beforeEach(() => {
  store = openStore(":memory:");
  ({ panelId, typeIds: [typeId] } = store.createPanel({ ...panel, types: [type()] }));
});

const openTicket = (extra = {}) =>
  store.createTicket({ guildId: "1", channelId: "100", typeId, openerId: "5", number: 1, ...extra });

test("saves a panel with its types, staff roles and messages", () => {
  const saved = store.getPanel(panelId);
  assert.equal(saved.title, "Tickets");
  assert.equal(saved.colour, 0x3b82f6);
  assert.equal(saved.types.length, 1);

  const savedType = store.getType(typeId);
  assert.equal(savedType.label, "Apply");
  assert.equal(savedType.panel_id, panelId);
  assert.equal(savedType.panel_colour, 0x3b82f6);
  assert.deepEqual(savedType.staffRoleIds, ["20", "21"]);
  assert.deepEqual(savedType.messages, [
    { kind: "text", content: "Hello {member}" },
    { kind: "embed", content: "Questions" },
  ]);
});

test("keeps the types in their order", () => {
  const { panelId: id } = store.createPanel({
    ...panel,
    types: [type({ label: "First" }), type({ label: "Second" })],
  });
  assert.deepEqual(store.getPanel(id).types.map((t) => t.label), ["First", "Second"]);
});

test("saves the panel's message ID once it's posted", () => {
  store.setPanelMessage(panelId, "999");
  assert.equal(store.getPanel(panelId).message_id, "999");
});

test("removes a panel that couldn't be posted", () => {
  store.deletePanel(panelId);
  assert.equal(store.getPanel(panelId), undefined);
  assert.equal(store.getType(typeId), undefined);
});

test("ticket numbers count up per type", () => {
  const { typeIds } = store.createPanel({ ...panel, types: [type({ label: "Other" })] });
  assert.equal(store.nextTicketNumber(typeId), 1);
  assert.equal(store.nextTicketNumber(typeId), 2);
  assert.equal(store.nextTicketNumber(typeIds[0]), 1);
});

test("creates a ticket and finds it by channel", () => {
  const id = openTicket();
  const ticket = store.getTicketByChannel("100");
  assert.equal(ticket.id, id);
  assert.equal(ticket.status, "open");
  assert.equal(ticket.opener_id, "5");
  assert.equal(store.getTicket(id).channel_id, "100");
});

test("counts a member's open tickets of a type", () => {
  openTicket();
  const second = openTicket({ channelId: "101", number: 2 });
  openTicket({ channelId: "102", number: 3, openerId: "6" });
  assert.deepEqual(store.activeTickets(typeId, "5").map((t) => t.channel_id), ["100", "101"]);
  store.closeTicket(second, "5");
  assert.deepEqual(store.activeTickets(typeId, "5").map((t) => t.channel_id), ["100"]);
});

test("status changes only happen from the right status", () => {
  const id = openTicket();
  assert.equal(store.closeTicket(id, "5"), true);
  assert.equal(store.closeTicket(id, "5"), false);
  const closed = store.getTicket(id);
  assert.equal(closed.status, "closed");
  assert.equal(closed.closed_by, "5");
  assert.ok(closed.closed_at > 0);

  assert.equal(store.reopenTicket(id), true);
  assert.equal(store.reopenTicket(id), false);
  const reopened = store.getTicket(id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.closed_at, null);
  assert.equal(reopened.closed_by, null);

  assert.equal(store.deleteTicket(id, "20"), true);
  assert.equal(store.deleteTicket(id, "20"), false);
  assert.equal(store.getTicket(id).status, "deleted");
  assert.equal(store.getTicket(id).deleted_by, "20");
});

test("lists closed tickets with their type's delete-after days", () => {
  const id = openTicket();
  openTicket({ channelId: "101", number: 2 });
  store.closeTicket(id, "5");
  const closed = store.listClosedTickets();
  assert.equal(closed.length, 1);
  assert.equal(closed[0].id, id);
  assert.equal(closed[0].delete_after_days, 7);
  assert.ok(closed[0].closed_at <= Date.now() && closed[0].closed_at > Date.now() - DAY_MS);
});

test("saves, replaces and removes a setup draft per member and server", () => {
  assert.equal(store.getDraft("5", "1"), null);
  store.saveDraft("5", "1", { title: "First" });
  store.saveDraft("5", "1", { title: "Second" });
  store.saveDraft("6", "1", { title: "Other member" });
  assert.deepEqual(store.getDraft("5", "1"), { title: "Second" });
  assert.deepEqual(store.getDraft("6", "1"), { title: "Other member" });
  assert.equal(store.getDraft("5", "2"), null);
  store.deleteDraft("5", "1");
  assert.equal(store.getDraft("5", "1"), null);
  assert.deepEqual(store.getDraft("6", "1"), { title: "Other member" });
});

test("a channel deleted by hand marks its ticket deleted", () => {
  const id = openTicket();
  assert.equal(store.markChannelDeleted("100"), true);
  assert.equal(store.getTicket(id).status, "deleted");
  assert.equal(store.markChannelDeleted("100"), false);
  assert.equal(store.markChannelDeleted("555"), false);
});
