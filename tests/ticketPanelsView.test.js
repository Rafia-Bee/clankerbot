// Tests for the /ticket-panels screens: the list of panels, one panel, and the delete question.
const test = require("node:test");
const assert = require("node:assert/strict");
const { listView, panelView, deleteView } = require("../src/tickets/panelsView");
const { mainView } = require("../src/tickets/setupView");

const panel = (extra = {}) => ({
  id: 3,
  guild_id: "1",
  channel_id: "20",
  message_id: "30",
  title: "Tickets",
  types: [
    { id: 7, label: "Apply", open_category_id: "40", closed_category_id: "41" },
    { id: 8, label: "Report", open_category_id: "40", closed_category_id: "40" },
  ],
  ...extra,
});
const fill = { 40: 12, 41: 3 };
const countOf = (categoryId) => fill[categoryId] ?? null;
const buttons = (view) => view.components.flatMap((row) => row.toJSON().components).filter((c) => c.type === 2);

test("the list shows each panel with a link and how full its categories are", () => {
  const view = listView([panel()], countOf);
  const field = view.embeds[0].toJSON().fields[0];
  assert.equal(field.name, "#3 Tickets");
  assert.match(field.value, /In <#20> \(\[go to panel\]\(https:\/\/discord\.com\/channels\/1\/20\/30\)\)/);
  assert.match(field.value, /Apply: open 12 of 50, closed 3 of 50/);
  assert.match(field.value, /Report: open and closed 12 of 50/);
  const select = view.components[0].toJSON().components[0];
  assert.equal(select.custom_id, "tpanels:pick");
  assert.deepEqual(select.options.map((o) => o.value), ["3"]);
});

test("a missing category says so", () => {
  const view = listView([panel({ types: [{ id: 7, label: "Apply", open_category_id: "99", closed_category_id: "41" }] })], countOf);
  assert.match(view.embeds[0].toJSON().fields[0].value, /Apply: open category missing, closed 3 of 50/);
});

test("an empty list says how to make a panel", () => {
  const view = listView([], countOf);
  assert.equal(view.components.length, 0);
  assert.match(view.embeds[0].toJSON().description, /\/ticket-setup/);
});

test("one panel's screen has edit, delete and back", () => {
  const view = panelView(panel(), countOf);
  assert.deepEqual(buttons(view).map((b) => b.custom_id), ["tpanels:edit:3", "tpanels:delete:3", "tpanels:back"]);
});

test("deleting asks first and explains what happens to open tickets", () => {
  const view = deleteView(panel());
  assert.match(view.content, /Tickets that are already open keep working/);
  assert.deepEqual(buttons(view).map((b) => b.custom_id), ["tpanels:delete-yes:3", "tpanels:pick-again:3"]);
});

test("the setup screen says Save changes when editing a panel", () => {
  const draft = { editingPanelId: 3, channelId: "20", title: "Tickets", description: "", colour: null, image: null, types: [] };
  const view = mainView(draft);
  const labels = buttons(view).map((b) => b.label);
  assert.ok(labels.includes("Save changes"));
  assert.ok(!labels.includes("Publish"));
  assert.match(view.content, /Editing ticket panel #3/);
});
