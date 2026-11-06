// Rules for tickets, kept apart from Discord so they can be tested.
//   canUse            whether someone may press a ticket button (staff: all, the opener: Close only)
//   transitionError   why a button can't be used on a ticket's current status, or null if it can
//   isDueForDeletion  whether a closed ticket's delete-after days have passed
//   memberAccess      the opener's permissions: typing allowed when open, read-only when closed
//   isCategoryFull    whether a category has hit Discord's 50 channel limit

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_LIMIT = 50;
const READ = ["ViewChannel", "ReadMessageHistory"];
const WRITE = ["SendMessages", "AddReactions", "AttachFiles", "EmbedLinks"];

function canUse(action, { isStaff, isOpener }) {
  if (action === "close") return isStaff || isOpener;
  return isStaff;
}

function transitionError(action, status) {
  if (status === "deleted") return "This ticket was deleted.";
  if (action === "close" && status === "closed") return "This ticket is already closed.";
  if (action === "reopen" && status !== "closed") return "This ticket isn't closed.";
  return null;
}

function isDueForDeletion(ticket, now) {
  if (ticket.status !== "closed" || !ticket.delete_after_days || !ticket.closed_at) return false;
  return ticket.closed_at + ticket.delete_after_days * DAY_MS <= now;
}

function memberAccess(canType) {
  return canType ? { allow: [...READ, ...WRITE], deny: [] } : { allow: [...READ], deny: [...WRITE] };
}

function isCategoryFull(channelCount) {
  return channelCount >= CATEGORY_LIMIT;
}

module.exports = { canUse, transitionError, isDueForDeletion, memberAccess, isCategoryFull };
