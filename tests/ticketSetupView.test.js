// Tests for the /ticket-setup screens and pop-ups: what they show and which buttons work when.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mainView, typeView, panelTextModal, typeBasicsModal, typeWhereModal, typeMessagesModal } = require(
  "../src/tickets/setupView"
);

const CHANNEL = "100000000000000001";
const OPEN = "100000000000000002";
const CLOSED = "100000000000000003";
const ROLE = "100000000000000004";

const type = (extra = {}) => ({
  label: "Apply",
  emoji: "📝",
  style: "success",
  nameSchema: "{type}-{number}",
  openCategoryId: OPEN,
  closedCategoryId: CLOSED,
  staffRoleIds: [ROLE],
  openLimit: 1,
  deleteAfterDays: 7,
  messages: [
    { kind: "text", content: "Hello {member}" },
    { kind: "embed", content: "Questions" },
  ],
  ...extra,
});
const draft = (extra = {}) => ({
  channelId: CHANNEL,
  title: "Tickets",
  description: "Pick one",
  colour: "#3b82f6",
  image: null,
  types: [type()],
  ...extra,
});

const buttons = (view) =>
  view.components.flatMap((row) => row.toJSON().components).filter((c) => c.type === 2);
const button = (view, id) => buttons(view).find((b) => b.custom_id === id);
const fields = (modal) => Object.fromEntries(modal.toJSON().components.map((label) => [label.component.custom_id, label]));

test("the main screen previews the panel and lists the types", () => {
  const view = mainView(draft());
  const [preview, summary] = view.embeds.map((e) => e.toJSON());
  assert.equal(preview.title, "Tickets");
  assert.equal(preview.description, "Pick one");
  assert.equal(preview.color, 0x3b82f6);
  assert.match(summary.description, new RegExp(`Posts in <#${CHANNEL}>`));
  assert.match(summary.description, /Ready to publish/);
  assert.equal(summary.fields[0].name, "1. 📝 Apply (green button)");
  assert.match(summary.fields[0].value, new RegExp(`Open tickets in <#${OPEN}>, closed in <#${CLOSED}>`));
  assert.match(summary.fields[0].value, new RegExp(`Staff: <@&${ROLE}>`));
  assert.match(summary.fields[0].value, /deleted after 7 days/);
  assert.match(summary.fields[0].value, /2 opening messages/);
});

test("publish only works once nothing is missing", () => {
  assert.equal(button(mainView(draft()), "tsetup:publish").disabled, false);
  const unfinished = mainView(draft({ title: "" }));
  assert.equal(button(unfinished, "tsetup:publish").disabled, true);
  assert.match(unfinished.embeds[1].toJSON().description, /Still needed:\n- Give the panel a title/);
});

test("the main screen has an edit dropdown once there are types, and stops adding at 25", () => {
  const empty = mainView(draft({ types: [] }));
  assert.equal(empty.components.length, 1);
  const full = mainView(draft({ types: Array.from({ length: 25 }, () => type()) }));
  assert.equal(button(full, "tsetup:add").disabled, true);
  const select = full.components[1].toJSON().components[0];
  assert.equal(select.custom_id, "tsetup:edit");
  assert.equal(select.options.length, 25);
  assert.equal(select.options[3].value, "3");
});

test("a note is shown above the screen", () => {
  assert.equal(mainView(draft(), { note: "Removed Apply." }).content, "**Ticket panel setup**\nRemoved Apply.");
});

test("the type screen has its pop-ups and can only move where there's room", () => {
  const view = typeView(draft({ types: [type(), type({ label: "Second" })] }), 0);
  assert.equal(button(view, "tsetup:basics:0").label, "Basics");
  assert.equal(button(view, "tsetup:where:0").label, "Where and who");
  assert.equal(button(view, "tsetup:messages:0").label, "Opening messages");
  assert.equal(button(view, "tsetup:up:0").disabled, true);
  assert.equal(button(view, "tsetup:down:0").disabled, false);
  assert.equal(button(typeView(draft({ types: [type(), type()] }), 1), "tsetup:down:1").disabled, true);
  const details = view.embeds[0].toJSON();
  assert.match(details.description, /Hello \{member\}/);
  assert.match(details.description, /\(box\)/);
});

test("the panel text pop-up is filled in with the draft", () => {
  const modal = panelTextModal(draft());
  assert.equal(modal.toJSON().custom_id, "tsetup:panel-save");
  const f = fields(modal);
  assert.equal(f.title.component.value, "Tickets");
  assert.equal(f.description.component.value, "Pick one");
  assert.equal(f.colour.component.value, "#3b82f6");
  assert.equal(f.image.component.value, undefined);
  assert.deepEqual(f.channel.component.default_values, [{ id: CHANNEL, type: "channel" }]);
});

test("the basics pop-up adds a new type or edits an existing one", () => {
  assert.equal(typeBasicsModal(draft(), null).toJSON().custom_id, "tsetup:basics-save:new");
  const modal = typeBasicsModal(draft(), 0);
  assert.equal(modal.toJSON().custom_id, "tsetup:basics-save:0");
  const f = fields(modal);
  assert.equal(f.label.component.value, "Apply");
  assert.equal(f.emoji.component.value, "📝");
  assert.equal(f.naming.component.value, "{type}-{number}");
  assert.equal(f.delete_days.component.value, "7");
  assert.deepEqual(
    f.style.component.options.filter((o) => o.default).map((o) => o.value),
    ["success"]
  );
});

test("the where and who pop-up picks categories and roles from dropdowns", () => {
  const f = fields(typeWhereModal(draft(), 0));
  assert.deepEqual(f.open_category.component.channel_types, [4]);
  assert.deepEqual(f.open_category.component.default_values, [{ id: OPEN, type: "channel" }]);
  assert.deepEqual(f.closed_category.component.default_values, [{ id: CLOSED, type: "channel" }]);
  assert.deepEqual(f.staff.component.default_values, [{ id: ROLE, type: "role" }]);
  assert.equal(f.staff.component.min_values, 1);
  assert.equal(f.open_limit.component.value, "1");
});

test("the messages pop-up has 4 boxes and remembers which are embeds", () => {
  const f = fields(typeMessagesModal(draft(), 0));
  assert.equal(f.message_0.component.value, "Hello {member}");
  assert.equal(f.message_1.component.value, "Questions");
  assert.equal(f.message_2.component.value, undefined);
  assert.equal(f.message_3.component.value, undefined);
  assert.deepEqual(
    f.embeds.component.options.filter((o) => o.default).map((o) => o.value),
    ["1"]
  );
});
