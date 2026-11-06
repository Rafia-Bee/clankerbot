// Tests for the /ticket-setup draft: filling it in from the pop-ups and listing what's still missing.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  emptyDraft,
  applyPanelText,
  applyTypeBasics,
  applyTypeWhere,
  applyTypeMessages,
  removeType,
  moveType,
  draftProblems,
} = require("../src/tickets/draft");
const { checkPanelConfig } = require("../src/tickets/panel");

const CHANNEL = "100000000000000001";
const OPEN = "100000000000000002";
const CLOSED = "100000000000000003";
const ROLE = "100000000000000004";

const basics = (extra = {}) => ({
  label: "Apply",
  emoji: "",
  style: "success",
  nameSchema: "{type}-{number}",
  deleteAfterDays: "7",
  ...extra,
});
const where = (extra = {}) => ({
  openCategoryId: OPEN,
  closedCategoryId: CLOSED,
  staffRoleIds: [ROLE],
  openLimit: "1",
  ...extra,
});

function readyDraft() {
  let draft = applyPanelText(emptyDraft(CHANNEL), {
    title: "Tickets",
    description: "Pick one",
    colour: "",
    image: "",
    channelId: CHANNEL,
  });
  ({ draft } = applyTypeBasics(draft, null, basics()));
  return applyTypeWhere(draft, 0, where());
}

test("a new draft posts in the channel it was started in", () => {
  assert.deepEqual(emptyDraft(CHANNEL), {
    channelId: CHANNEL,
    title: "",
    description: "",
    colour: null,
    image: null,
    types: [],
  });
});

test("panel text replaces the panel's text, with empty optional fields left out", () => {
  const draft = applyPanelText(emptyDraft(CHANNEL), {
    title: " Tickets ",
    description: "Pick one",
    colour: " #3b82f6 ",
    image: "",
    channelId: "100000000000000009",
  });
  assert.equal(draft.title, "Tickets");
  assert.equal(draft.colour, "#3b82f6");
  assert.equal(draft.image, null);
  assert.equal(draft.channelId, "100000000000000009");
});

test("adding a type fills in defaults and reads the numbers", () => {
  const { draft, index } = applyTypeBasics(emptyDraft(CHANNEL), null, basics({ emoji: "📝", deleteAfterDays: "3" }));
  assert.equal(index, 0);
  assert.deepEqual(draft.types[0], {
    label: "Apply",
    emoji: "📝",
    style: "success",
    nameSchema: "{type}-{number}",
    openCategoryId: null,
    closedCategoryId: null,
    staffRoleIds: [],
    openLimit: 1,
    deleteAfterDays: 3,
    messages: [],
  });
});

test("a new type copies the previous type's categories and staff roles", () => {
  const { draft, index } = applyTypeBasics(readyDraft(), null, basics({ label: "Report" }));
  assert.equal(index, 1);
  assert.equal(draft.types[1].openCategoryId, OPEN);
  assert.equal(draft.types[1].closedCategoryId, CLOSED);
  assert.deepEqual(draft.types[1].staffRoleIds, [ROLE]);
});

test("editing a type's basics keeps its other settings", () => {
  const { draft, index } = applyTypeBasics(readyDraft(), 0, basics({ label: "Join", style: "danger" }));
  assert.equal(index, 0);
  assert.equal(draft.types.length, 1);
  assert.equal(draft.types[0].label, "Join");
  assert.equal(draft.types[0].style, "danger");
  assert.equal(draft.types[0].openCategoryId, OPEN);
});

test("numbers that can't be read are kept as typed, so they show up as a problem", () => {
  const { draft } = applyTypeBasics(emptyDraft(CHANNEL), null, basics({ deleteAfterDays: "a week" }));
  assert.equal(draft.types[0].deleteAfterDays, "a week");
  const withWhere = applyTypeWhere(draft, 0, where({ openLimit: "two" }));
  assert.equal(withWhere.types[0].openLimit, "two");
});

test("opening messages skip empty boxes and remember which are embeds", () => {
  const draft = applyTypeMessages(readyDraft(), 0, {
    texts: ["Hello {member}", "  ", "Questions", ""],
    embeds: ["2"],
  });
  assert.deepEqual(draft.types[0].messages, [
    { kind: "text", content: "Hello {member}" },
    { kind: "embed", content: "Questions" },
  ]);
});

test("types can be removed and moved", () => {
  let { draft } = applyTypeBasics(readyDraft(), null, basics({ label: "Second" }));
  ({ draft } = applyTypeBasics(draft, null, basics({ label: "Third" })));

  let moved = moveType(draft, 2, -1);
  assert.deepEqual(moved.draft.types.map((t) => t.label), ["Apply", "Third", "Second"]);
  assert.equal(moved.index, 1);
  moved = moveType(draft, 0, -1);
  assert.deepEqual(moved.draft.types.map((t) => t.label), ["Apply", "Second", "Third"]);
  assert.equal(moved.index, 0);

  assert.deepEqual(removeType(draft, 1).types.map((t) => t.label), ["Apply", "Third"]);
});

test("the draft doesn't change the one it was made from", () => {
  const before = readyDraft();
  const copy = JSON.parse(JSON.stringify(before));
  applyTypeBasics(before, 0, basics({ label: "Changed" }));
  applyTypeWhere(before, 0, where({ staffRoleIds: [] }));
  removeType(before, 0);
  assert.deepEqual(before, copy);
});

test("lists what's still missing in plain words", () => {
  let draft = applyPanelText(emptyDraft(null), { title: "", description: "", colour: "blue", image: "ftp://x", channelId: null });
  assert.deepEqual(draftProblems(draft), [
    "Pick the channel to post the panel in (Panel text).",
    "Give the panel a title (Panel text).",
    'The colour "blue" isn\'t valid. Use something like #3b82f6 (Panel text).',
    "The image must be a link starting with https:// (Panel text).",
    "Add at least one ticket type.",
  ]);

  ({ draft } = applyTypeBasics(readyDraft(), null, basics({ label: "Report", deleteAfterDays: "soon" })));
  draft = applyTypeWhere(draft, 1, { openCategoryId: null, closedCategoryId: null, staffRoleIds: [], openLimit: "0" });
  assert.deepEqual(draftProblems(draft), [
    "Report: pick the category for open tickets (Where and who).",
    "Report: pick the category for closed tickets (Where and who).",
    "Report: pick at least one staff role (Where and who).",
    'Report: "open tickets per member" must be a whole number of 1 or more (Where and who).',
    'Report: "delete closed tickets after" must be a whole number of days, 0 or more (Basics).',
  ]);
});

test("a draft with nothing missing passes the panel checks", () => {
  const draft = readyDraft();
  assert.deepEqual(draftProblems(draft), []);
  assert.deepEqual(checkPanelConfig(draft).errors, []);
});
