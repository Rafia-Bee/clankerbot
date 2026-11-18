// The emoji the bot reacts with when a message has a /badword trigger word, picked in /settings.
//   DEFAULT_REACTION    the check mark used when no emoji is picked
//   parseReactionEmoji  checks typed text is one emoji (normal or custom) and returns it; null when empty
//   reactionFor         the emoji to react with, from the saved settings
//   canUseEmoji         whether the bot can react with it: normal emojis always, server emojis if the bot
//                       already knows them or Discord finds them (for emojis added after the bot started)

const DEFAULT_REACTION = "\u2705";
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d+>$/;
const EMOJI_PART = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

function isSingleEmoji(text) {
  const parts = [...new Intl.Segmenter().segment(text)];
  return parts.length === 1 && EMOJI_PART.test(text);
}

function parseReactionEmoji(raw) {
  const text = raw.trim();
  if (!text) return null;
  if (CUSTOM_EMOJI.test(text) || isSingleEmoji(text)) return text;
  throw new Error(
    "That isn't one emoji. Paste a single emoji (press Windows key + . to pick one), or a server emoji in the form <:name:id>."
  );
}

function reactionFor(settings) {
  return settings.BAD_WORD_REACTION || DEFAULT_REACTION;
}

async function canUseEmoji(emoji, { known, lookUp }) {
  const customId = emoji.match(/:(\d+)>$/)?.[1];
  if (!customId || known(customId)) return true;
  return lookUp(customId).catch(() => false);
}

module.exports = { DEFAULT_REACTION, parseReactionEmoji, reactionFor, canUseEmoji };
