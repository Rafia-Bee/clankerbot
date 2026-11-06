// Turns a ticket type's naming schema into a channel name, cleaned up the way Discord would.
//   cleanName    lowercases, turns spaces into dashes and drops symbols and emoji
//   slugify      the short name of a ticket type, used for {type}
//   channelName  fills in {type}, {number}, {user} and {name}, then cleans the result

const MAX_CHANNEL_NAME_LENGTH = 100;

function cleanName(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(label) {
  return cleanName(label);
}

function channelName(schema, { type, number, username, displayName }) {
  const padded = String(number).padStart(4, "0");
  const values = { type, number: padded, user: username, name: displayName };
  const filled = schema.replace(/\{(type|number|user|name)\}/g, (_, key) => values[key]);
  const name = cleanName(filled).slice(0, MAX_CHANNEL_NAME_LENGTH).replace(/-+$/, "");
  return name || `ticket-${padded}`;
}

module.exports = { slugify, channelName };
