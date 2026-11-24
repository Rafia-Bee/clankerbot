// The rules for /count counters, kept apart from Discord so they can be tested.
//   MAX_COUNTERS      how many counters a server can have
//   parseCounterName  tidies a typed counter name and checks it; throws when it's empty or too long
//   choicesFor        the counter names to suggest while someone types the counter option
//   countersHit       the counters whose trigger words are in a message
//   reactionsFor      the emojis to react with for those counters, each one once
//   counterChanges    turns the options typed in /counter into changes for a counter; empty ones are skipped, bad ones throw

const { hasTriggerWord, addWords, removeWord } = require("./words");
const { reactionFor, parseReactionEmoji } = require("./reaction");
const { parseLeaderboardTitle } = require("./messages");

const MAX_COUNTERS = 10;
const MAX_NAME_LENGTH = 50;
const MAX_CHOICES = 25;

function parseCounterName(raw) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("The counter needs a name.");
  if (name.length > MAX_NAME_LENGTH) throw new Error(`The name can be up to ${MAX_NAME_LENGTH} letters long.`);
  return name;
}

function choicesFor(counters, typed) {
  const search = typed.trim().toLowerCase();
  return counters
    .filter((counter) => counter.name.toLowerCase().includes(search))
    .slice(0, MAX_CHOICES)
    .map((counter) => ({ name: counter.name, value: counter.name }));
}

function countersHit(content, counters) {
  return counters.filter((counter) => hasTriggerWord(content, counter.words));
}

function reactionsFor(counters) {
  return [...new Set(counters.map(reactionFor))];
}

function counterChanges(counter, { name, addWords: wordsToAdd, removeWords: wordsToRemove, emoji, leaderboard }) {
  const changes = {};
  if (name != null) changes.name = parseCounterName(name);
  let words = counter.words;
  if (wordsToRemove) words = wordsToRemove.split(";").reduce(removeWord, words);
  if (wordsToAdd != null) words = addWords(words, wordsToAdd);
  if (words !== counter.words) changes.words = words;
  const reaction = emoji == null ? null : parseReactionEmoji(emoji);
  if (reaction) changes.reaction = reaction;
  const leaderboardTitle = leaderboard == null ? null : parseLeaderboardTitle(leaderboard);
  if (leaderboardTitle) changes.leaderboardTitle = leaderboardTitle;
  return changes;
}

module.exports = { MAX_COUNTERS, parseCounterName, choicesFor, countersHit, reactionsFor, counterChanges };
