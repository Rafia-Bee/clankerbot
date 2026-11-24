// The trigger words that add to someone's count on a counter when they say one in chat.
//   normalizeWord   lowercases a word and squeezes its spaces
//   addWord         adds a word to the list, skipping repeats; throws when the word is empty or too long
//   addWords        adds several words split by ; and checks the list stays within MAX_WORDS
//   removeWord      removes a word from the list
//   foldLookalikes  turns lookalike letters (other alphabets, accents, fancy fonts) into plain ones and drops hidden characters
//   hasTriggerWord  whether a message has any of the words, as a whole word, ignoring capitals and lookalikes

const MAX_WORD_LENGTH = 50;
const MAX_WORDS = 25;
const WORD_CHAR = "[\\p{L}\\p{N}_]";
const HIDDEN_CHARS = /[\u00AD\u034F\u180E\u200B-\u200F\u2060-\u2064\uFEFF]/g;
const ACCENT_MARKS = /\p{M}/gu;
const LOOKALIKES = {
  "\u0430": "a", "\u0432": "b", "\u0435": "e", "\u0456": "i", "\u0458": "j", "\u043A": "k",
  "\u043C": "m", "\u043D": "h", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0442": "t",
  "\u0443": "y", "\u0445": "x", "\u0455": "s", "\u0501": "d", "\u04BB": "h", "\u04CF": "l",
  "\u051B": "q", "\u051D": "w", "\u0261": "g", "\u0131": "i",
  "\u03B1": "a", "\u03B5": "e", "\u03B9": "i", "\u03BA": "k", "\u03BD": "v", "\u03BF": "o",
  "\u03C1": "p", "\u03C4": "t", "\u03C5": "u", "\u03C7": "x", "\u03C9": "w",
};
const LOOKALIKE_CHARS = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");

function normalizeWord(raw) {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function addWord(list, raw) {
  const word = normalizeWord(raw);
  if (!word || word.length > MAX_WORD_LENGTH) {
    throw new Error(`The word can't be empty or longer than ${MAX_WORD_LENGTH} letters.`);
  }
  return list.includes(word) ? list : [...list, word];
}

function addWords(list, raw) {
  const pieces = raw.split(";").filter((piece) => piece.trim());
  if (pieces.length === 0) throw new Error("Type at least one word.");
  const updated = pieces.reduce(addWord, list);
  if (updated.length > MAX_WORDS) {
    const left = Math.max(MAX_WORDS - list.length, 0);
    throw new Error(`You can have up to ${MAX_WORDS} trigger words, so you can add ${left} more.`);
  }
  return updated;
}

function removeWord(list, raw) {
  const word = normalizeWord(raw);
  return list.filter((existing) => existing !== word);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function foldLookalikes(text) {
  return text
    .normalize("NFKD")
    .replace(ACCENT_MARKS, "")
    .replace(HIDDEN_CHARS, "")
    .toLowerCase()
    .replace(LOOKALIKE_CHARS, (char) => LOOKALIKES[char]);
}

function hasTriggerWord(content, words) {
  if (!content || words.length === 0) return false;
  const text = foldLookalikes(content).replace(/\s+/g, " ");
  return words.some((word) =>
    new RegExp(`(?<!${WORD_CHAR})${escapeRegex(foldLookalikes(word))}(?!${WORD_CHAR})`, "u").test(text)
  );
}

module.exports = { MAX_WORDS, normalizeWord, addWord, addWords, removeWord, foldLookalikes, hasTriggerWord };
