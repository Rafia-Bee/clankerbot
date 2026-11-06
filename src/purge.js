// Rules for /purge, kept apart from Discord so they can be tested.
//   splitByAge    splits messages into ones Discord can bulk delete and ones that are too old
//   purgeSummary  builds the reply shown after a purge

const MAX_BULK_DELETE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SAFETY_MARGIN_MS = 60 * 1000;

function splitByAge(messages, now) {
  const cutoff = now - MAX_BULK_DELETE_AGE_MS + SAFETY_MARGIN_MS;
  const deletable = [];
  const tooOld = [];
  for (const message of messages) {
    (message.createdTimestamp > cutoff ? deletable : tooOld).push(message);
  }
  return { deletable, tooOld };
}

function countMessages(count) {
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

function purgeSummary({ deleted, tooOld }) {
  if (deleted === 0 && tooOld === 0) return "There are no messages to delete here.";
  const summary = `Deleted ${countMessages(deleted)}.`;
  if (tooOld === 0) return summary;
  return `${summary} Skipped ${countMessages(tooOld)} older than 14 days, because Discord doesn't let bots bulk delete those.`;
}

module.exports = { splitByAge, purgeSummary };
