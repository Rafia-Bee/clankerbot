// The /ticket-setup draft: a panel's settings being filled in from the wizard's pop-ups, in the same shape as a panel file.
// Every function returns a new draft and leaves the one it was given unchanged.
//   emptyDraft         a new draft that posts in the given channel
//   readWholeNumber    reads a typed number, keeping the text as typed when it isn't a whole number
//   newType            a ticket type with defaults, copying the previous type's categories and staff roles
//   applyPanelText     saves the Panel text pop-up
//   applyTypeBasics    saves the Basics pop-up for a type (or adds a new type when the index is null)
//   applyTypeWhere     saves the Where and who pop-up for a type
//   applyTypeMessages  saves the Opening messages pop-up for a type, skipping empty boxes
//   removeType         takes a type out
//   moveType           moves a type up or down, returning its new position
//   draftProblems      what's still missing or wrong, in plain words, with the pop-up to fix it in

const { parseColour } = require("./panel");

const isWholeNumber = (value, min) => Number.isInteger(value) && value >= min;
const copy = (draft) => JSON.parse(JSON.stringify(draft));

function emptyDraft(channelId) {
  return { channelId, title: "", description: "", colour: null, image: null, types: [] };
}

function readWholeNumber(text) {
  const trimmed = String(text ?? "").trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

function newType(previous) {
  return {
    label: "",
    emoji: null,
    style: "primary",
    nameSchema: "{type}-{number}",
    openCategoryId: previous?.openCategoryId ?? null,
    closedCategoryId: previous?.closedCategoryId ?? null,
    staffRoleIds: previous ? [...previous.staffRoleIds] : [],
    openLimit: 1,
    deleteAfterDays: 7,
    messages: [],
  };
}

function applyPanelText(draft, { title, description, colour, image, channelId }) {
  const next = copy(draft);
  next.title = title.trim();
  next.description = description ?? "";
  next.colour = colour?.trim() || null;
  next.image = image?.trim() || null;
  next.channelId = channelId ?? null;
  return next;
}

function applyTypeBasics(draft, index, { label, emoji, style, nameSchema, deleteAfterDays }) {
  const next = copy(draft);
  let at = index;
  if (at == null) {
    next.types.push(newType(next.types[next.types.length - 1]));
    at = next.types.length - 1;
  }
  Object.assign(next.types[at], {
    label: label.trim(),
    emoji: emoji?.trim() || null,
    style,
    nameSchema: nameSchema.trim() || "{type}-{number}",
    deleteAfterDays: readWholeNumber(deleteAfterDays),
  });
  return { draft: next, index: at };
}

function applyTypeWhere(draft, index, { openCategoryId, closedCategoryId, staffRoleIds, openLimit }) {
  const next = copy(draft);
  Object.assign(next.types[index], {
    openCategoryId: openCategoryId ?? null,
    closedCategoryId: closedCategoryId ?? null,
    staffRoleIds: [...staffRoleIds],
    openLimit: readWholeNumber(openLimit),
  });
  return next;
}

function applyTypeMessages(draft, index, { texts, embeds }) {
  const next = copy(draft);
  const embedSet = new Set(embeds.map(Number));
  next.types[index].messages = texts
    .map((text, i) => ({ kind: embedSet.has(i) ? "embed" : "text", content: text.trim() }))
    .filter((message) => message.content.length > 0);
  return next;
}

function removeType(draft, index) {
  const next = copy(draft);
  next.types.splice(index, 1);
  return next;
}

function moveType(draft, index, delta) {
  const next = copy(draft);
  const to = index + delta;
  if (to < 0 || to >= next.types.length) return { draft: next, index };
  const [type] = next.types.splice(index, 1);
  next.types.splice(to, 0, type);
  return { draft: next, index: to };
}

function draftProblems(draft) {
  const problems = [];
  if (!draft.channelId) problems.push("Pick the channel to post the panel in (Panel text).");
  if (!draft.title?.trim()) problems.push("Give the panel a title (Panel text).");
  if (draft.colour && parseColour(draft.colour) == null) {
    problems.push(`The colour "${draft.colour}" isn't valid. Use something like #3b82f6 (Panel text).`);
  }
  if (draft.image && !/^https?:\/\/\S+$/.test(draft.image)) {
    problems.push("The image must be a link starting with https:// (Panel text).");
  }
  if (draft.types.length === 0) problems.push("Add at least one ticket type.");

  draft.types.forEach((type, i) => {
    const name = type.label || `Ticket type ${i + 1}`;
    if (!type.openCategoryId) problems.push(`${name}: pick the category for open tickets (Where and who).`);
    if (!type.closedCategoryId) problems.push(`${name}: pick the category for closed tickets (Where and who).`);
    if (type.staffRoleIds.length === 0) problems.push(`${name}: pick at least one staff role (Where and who).`);
    if (!isWholeNumber(type.openLimit, 1)) {
      problems.push(`${name}: "open tickets per member" must be a whole number of 1 or more (Where and who).`);
    }
    if (!isWholeNumber(type.deleteAfterDays, 0)) {
      problems.push(`${name}: "delete closed tickets after" must be a whole number of days, 0 or more (Basics).`);
    }
  });
  return problems;
}

module.exports = {
  emptyDraft,
  applyPanelText,
  applyTypeBasics,
  applyTypeWhere,
  applyTypeMessages,
  removeType,
  moveType,
  draftProblems,
};
