// Tests for the /count counters: the database, moving the old bad word counts over, the replies, trigger words and reactions.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openStore } = require("../src/store");

let store;
test.beforeEach(() => {
  store = openStore(":memory:");
});

test("a new counter has a name and no words, emoji or leaderboard name", () => {
  const counter = store.createCounter("1", "Raid deaths");
  assert.deepEqual(store.getCounter("1", counter.id), {
    id: counter.id,
    name: "Raid deaths",
    words: [],
    reaction: null,
    leaderboardTitle: null,
  });
  assert.deepEqual(store.listCounters("1").map((c) => c.name), ["Raid deaths"]);
  assert.deepEqual(store.listCounters("2"), []);
});

test("counter names are unique per server, capitals don't matter", () => {
  assert.ok(store.createCounter("1", "Deaths"));
  assert.equal(store.createCounter("1", "DEATHS"), null);
  assert.ok(store.createCounter("2", "Deaths"));
  assert.equal(store.findCounter("1", "deaths").name, "Deaths");
  assert.equal(store.findCounter("1", "nope"), null);
});

test("a counter's name, words, emoji and leaderboard name can be changed", () => {
  const counter = store.createCounter("1", "Deaths");
  store.createCounter("1", "Bad words");
  assert.equal(store.updateCounter("1", counter.id, { words: ["oops"], reaction: "\u{1F480}", leaderboardTitle: "Graveyard" }), true);
  assert.equal(store.updateCounter("1", counter.id, { name: "Raid deaths" }), true);
  assert.deepEqual(store.getCounter("1", counter.id), {
    id: counter.id,
    name: "Raid deaths",
    words: ["oops"],
    reaction: "\u{1F480}",
    leaderboardTitle: "Graveyard",
  });
  assert.equal(store.updateCounter("1", counter.id, { name: "bad WORDS" }), false);
  assert.equal(store.updateCounter("1", counter.id, { reaction: null }), true);
  assert.equal(store.getCounter("1", counter.id).reaction, null);
  assert.equal(store.getCounter("2", counter.id), null);
});

test("deleting a counter removes its counts too", () => {
  const counter = store.createCounter("1", "Deaths");
  store.addToCount(counter.id, "100");
  assert.equal(store.deleteCounter("2", counter.id), false);
  assert.equal(store.deleteCounter("1", counter.id), true);
  assert.equal(store.getCounter("1", counter.id), null);
  const again = store.createCounter("1", "Deaths");
  assert.equal(store.getCount(again.id, "100"), 0);
});

test("everyone starts at 0, and adding goes up by 1 and returns the new count", () => {
  const counter = store.createCounter("1", "Deaths");
  assert.equal(store.getCount(counter.id, "100"), 0);
  assert.equal(store.addToCount(counter.id, "100"), 1);
  assert.equal(store.addToCount(counter.id, "100"), 2);
  assert.equal(store.getCount(counter.id, "100"), 2);
});

test("adding can add more than 1 at once", () => {
  const counter = store.createCounter("1", "Bad words");
  assert.equal(store.addToCount(counter.id, "100", 3), 3);
  assert.equal(store.addToCount(counter.id, "100", 2), 5);
  assert.equal(store.addToCount(counter.id, "100"), 6);
});

test("counts are kept apart per counter and per member", () => {
  const deaths = store.createCounter("1", "Deaths");
  const words = store.createCounter("1", "Bad words");
  store.addToCount(deaths.id, "100");
  store.addToCount(deaths.id, "100");
  store.addToCount(words.id, "100");
  store.addToCount(deaths.id, "200");
  assert.equal(store.getCount(deaths.id, "100"), 2);
  assert.equal(store.getCount(words.id, "100"), 1);
  assert.equal(store.getCount(deaths.id, "200"), 1);
  assert.equal(store.getCount(words.id, "200"), 0);
});

test("taking 1 off stops at 0, and reset goes back to 0", () => {
  const counter = store.createCounter("1", "Deaths");
  store.addToCount(counter.id, "100");
  store.addToCount(counter.id, "100");
  assert.equal(store.takeFromCount(counter.id, "100"), 1);
  assert.equal(store.takeFromCount(counter.id, "100"), 0);
  assert.equal(store.takeFromCount(counter.id, "100"), 0);
  assert.equal(store.takeFromCount(counter.id, "300"), 0);
  store.addToCount(counter.id, "200");
  store.resetCount(counter.id, "200");
  assert.equal(store.getCount(counter.id, "200"), 0);
  assert.deepEqual(store.getLeaderboard(counter.id, 10), []);
});

test("the leaderboard lists one counter's members from highest down, up to the limit", () => {
  const deaths = store.createCounter("1", "Deaths");
  const other = store.createCounter("1", "Other");
  store.addToCount(deaths.id, "100");
  for (let i = 0; i < 3; i++) store.addToCount(deaths.id, "200");
  for (let i = 0; i < 2; i++) store.addToCount(deaths.id, "300");
  store.addToCount(other.id, "400");
  assert.deepEqual(store.getLeaderboard(deaths.id, 10), [
    { userId: "200", count: 3 },
    { userId: "300", count: 2 },
    { userId: "100", count: 1 },
  ]);
  assert.deepEqual(store.getLeaderboard(deaths.id, 2).map((r) => r.userId), ["200", "300"]);
});

test("the old bad word counts and settings move into a 'Bad words' counter once", () => {
  const Database = require("better-sqlite3");
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clanker-")), "old.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE bad_word_counts (guild_id TEXT, user_id TEXT, count INTEGER, updated_at INTEGER, PRIMARY KEY (guild_id, user_id));
    CREATE TABLE server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at INTEGER NOT NULL);
    INSERT INTO bad_word_counts VALUES ('1', '100', 4, 10), ('1', '200', 2, 20);
    INSERT INTO server_settings VALUES ('BAD_WORDS', '["darn","heck"]', NULL, 0),
      ('BAD_WORD_REACTION', '"\u{1F602}"', NULL, 0), ('BAD_WORD_LEADERBOARD_TITLE', '"Naughty List"', NULL, 0);
  `);
  db.close();
  const old = openStore(dbPath);
  const [counter] = old.listCounters("1");
  assert.deepEqual(
    { ...counter, id: undefined },
    { id: undefined, name: "Bad words", words: ["darn", "heck"], reaction: "\u{1F602}", leaderboardTitle: "Naughty List" }
  );
  assert.equal(old.getCount(counter.id, "100"), 4);
  assert.equal(old.getCount(counter.id, "200"), 2);
  old.deleteCounter("1", counter.id);
  assert.deepEqual(old.listCounters("1"), []);
  old.close();
  const reopened = openStore(dbPath);
  assert.deepEqual(reopened.listCounters("1"), []);
  reopened.close();
});

test("with no old bad words, nothing is moved and no counter appears", () => {
  assert.deepEqual(store.listCounters("1"), []);
});

const { parseCounterName, MAX_COUNTERS, choicesFor, countersHit, reactionsFor } = require("../src/counters/rules");

test("a typed counter name is trimmed and checked", () => {
  assert.equal(parseCounterName("  Raid   deaths "), "Raid deaths");
  assert.throws(() => parseCounterName("   "), /name/);
  assert.equal(parseCounterName("x".repeat(50)).length, 50);
  assert.throws(() => parseCounterName("x".repeat(51)), /50/);
  assert.equal(MAX_COUNTERS, 10);
});

test("the counter option suggests names that contain what was typed", () => {
  const counters = [{ name: "Bad words" }, { name: "Raid deaths" }, { name: "Skill issue" }];
  assert.deepEqual(choicesFor(counters, ""), [
    { name: "Bad words", value: "Bad words" },
    { name: "Raid deaths", value: "Raid deaths" },
    { name: "Skill issue", value: "Skill issue" },
  ]);
  assert.deepEqual(choicesFor(counters, "DEA").map((c) => c.value), ["Raid deaths"]);
  assert.deepEqual(choicesFor(counters, "zzz"), []);
});

test("a message hits every counter whose words it has", () => {
  const counters = [
    { id: 1, words: ["darn"] },
    { id: 2, words: ["skill issue", "darn"] },
    { id: 3, words: [] },
  ];
  assert.deepEqual(countersHit("darn, skill issue", counters).map((c) => c.id), [1, 2]);
  assert.deepEqual(countersHit("total skill issue", counters).map((c) => c.id), [2]);
  assert.deepEqual(countersHit("hello", counters), []);
});

test("the bot reacts once per emoji, using the check mark for counters without one", () => {
  assert.deepEqual(reactionsFor([{ reaction: "\u{1F602}" }, { reaction: null }, { reaction: "\u{1F602}" }, { reaction: null }]), [
    "\u{1F602}",
    "✅",
  ]);
  assert.deepEqual(reactionsFor([]), []);
});

const {
  addedReply,
  countReply,
  removedReply,
  resetReply,
  leaderboardReply,
  leaderboardTitleFor,
  rankRows,
  parseLeaderboardTitle,
  noCounterReply,
} = require("../src/counters/messages");

test("replies name the member, the counter and the count", () => {
  const deaths = { name: "Raid deaths" };
  assert.equal(addedReply(deaths, "100", 1), "Added 1 to <@100>'s **Raid deaths** count. It's now 1.");
  assert.equal(addedReply(deaths, "100", 8, 3), "Added 3 to <@100>'s **Raid deaths** count. It's now 8.");
  assert.equal(countReply(deaths, "100", 7), "<@100>'s **Raid deaths** count is 7.");
  assert.equal(removedReply(deaths, "100", 2, 1), "Took 1 off <@100>'s **Raid deaths** count. It's now 1.");
  assert.equal(removedReply(deaths, "100", 0, 0), "<@100>'s **Raid deaths** count is already 0.");
  assert.equal(resetReply(deaths, "100"), "Reset <@100>'s **Raid deaths** count to 0.");
});

test("a counter that doesn't exist gets a helpful reply", () => {
  assert.equal(noCounterReply("Nope", 0), "There are no counters yet. Admins can make one in /settings.");
  assert.equal(noCounterReply("Nope", 2), "There's no counter called **Nope**. Pick one from the list as you type.");
});

test("members with the same count share a rank", () => {
  const rows = [
    { userId: "a", count: 5 },
    { userId: "b", count: 5 },
    { userId: "c", count: 2 },
    { userId: "d", count: 1 },
    { userId: "e", count: 1 },
  ];
  assert.deepEqual(rankRows(rows).map((r) => r.rank), [1, 1, 3, 4, 4]);
});

test("the leaderboard uses the counter's leaderboard name, or '<name> leaderboard'", () => {
  assert.equal(leaderboardTitleFor({ name: "Raid deaths", leaderboardTitle: null }), "Raid deaths leaderboard");
  assert.equal(leaderboardTitleFor({ name: "Bad words", leaderboardTitle: "Naughty List" }), "Naughty List");
  const counter = { name: "Raid deaths", leaderboardTitle: null };
  assert.equal(
    leaderboardReply(counter, [
      { userId: "200", count: 3 },
      { userId: "300", count: 3 },
      { userId: "100", count: 1 },
    ]),
    "**Raid deaths leaderboard**\n**#1** <@200>: 3\n**#1** <@300>: 3\n**#3** <@100>: 1"
  );
  assert.equal(leaderboardReply(counter, []), "Nobody has a **Raid deaths** count yet.");
});

test("a typed leaderboard name is trimmed, empty means the default, and long names are turned down", () => {
  assert.equal(parseLeaderboardTitle("  Naughty   List "), "Naughty List");
  assert.equal(parseLeaderboardTitle("   "), null);
  assert.equal(parseLeaderboardTitle("x".repeat(100)).length, 100);
  assert.throws(() => parseLeaderboardTitle("x".repeat(101)), /100/);
});

const { addWord, addWords, removeWord, hasTriggerWord, MAX_WORDS } = require("../src/counters/words");

test("trigger words: adding trims, skips repeats and checks the length", () => {
  let list = addWord([], "  Hello ");
  list = addWord(list, "good  game");
  list = addWord(list, "HELLO");
  assert.deepEqual(list, ["hello", "good game"]);
  assert.deepEqual(removeWord(list, "Hello"), ["good game"]);
  assert.throws(() => addWord([], "   "), /word/);
  assert.throws(() => addWord([], "x".repeat(51)), /word/);
});

test("a message counts when it has a trigger word, whole words only, capitals don't matter", () => {
  const words = ["cat", "good game"];
  assert.equal(hasTriggerWord("I love my CAT!", words), true);
  assert.equal(hasTriggerWord("cat", words), true);
  assert.equal(hasTriggerWord("(cat)", words), true);
  assert.equal(hasTriggerWord("that was a Good Game", words), true);
  assert.equal(hasTriggerWord("that was a good   game", words), true);
  assert.equal(hasTriggerWord("category", words), false);
  assert.equal(hasTriggerWord("cats", words), false);
  assert.equal(hasTriggerWord("bobcat", words), false);
  assert.equal(hasTriggerWord("nothing here", words), false);
  assert.equal(hasTriggerWord("cat", []), false);
  assert.equal(hasTriggerWord("", words), false);
});

test("words with letters outside English and symbols still match safely", () => {
  assert.equal(hasTriggerWord("ça va café", ["café"]), true);
  assert.equal(hasTriggerWord("caféine", ["café"]), false);
  assert.equal(hasTriggerWord("what a.b moment", ["a.b"]), true);
  assert.equal(hasTriggerWord("what axb moment", ["a.b"]), false);
});

test("several words can be added at once with ; between them", () => {
  assert.deepEqual(addWords([], "cat; Good Game ;; dog;cat;"), ["cat", "good game", "dog"]);
  assert.deepEqual(addWords(["cat"], "dog"), ["cat", "dog"]);
  assert.throws(() => addWords([], " ; ; "), /word/);
  assert.throws(() => addWords([], "ok; " + "x".repeat(51)), /50/);
});

test("adding stops at the word limit and says how many are left", () => {
  const full = Array.from({ length: MAX_WORDS - 1 }, (_, i) => `w${i}`);
  assert.equal(addWords(full, "last").length, MAX_WORDS);
  assert.throws(() => addWords(full, "one; two"), /up to 25.*1 more/);
  assert.equal(addWords(full, "w0; last").length, MAX_WORDS);
});

test("lookalike letters from other alphabets still count", () => {
  const words = ["darn", "cat"];
  assert.equal(hasTriggerWord("dаrn", words), true);
  assert.equal(hasTriggerWord("seems like i can say dаrn all i want", words), true);
  assert.equal(hasTriggerWord("сαt", words), true);
  assert.equal(hasTriggerWord("CАT", words), true);
});

test("accents, fancy fonts and hidden characters still count", () => {
  const words = ["cat"];
  assert.equal(hasTriggerWord("cát", words), true);
  assert.equal(hasTriggerWord("ｃａｔ", words), true);
  assert.equal(hasTriggerWord("\u{1D41C}\u{1D41A}\u{1D42D}", words), true);
  assert.equal(hasTriggerWord("c​a‍t", words), true);
  assert.equal(hasTriggerWord("c­at", words), true);
});

test("lookalike letters don't make longer words count", () => {
  assert.equal(hasTriggerWord("cаts", ["cat"]), false);
  assert.equal(hasTriggerWord("category", ["cаt"]), false);
});

const { parseReactionEmoji, reactionFor, canUseEmoji, DEFAULT_REACTION } = require("../src/counters/reaction");

test("the reaction can be a normal emoji or a custom one", () => {
  assert.equal(parseReactionEmoji(" \u{1F602} "), "\u{1F602}");
  assert.equal(parseReactionEmoji("\u{1F44D}\u{1F3FD}"), "\u{1F44D}\u{1F3FD}");
  assert.equal(parseReactionEmoji("❤️"), "❤️");
  assert.equal(parseReactionEmoji("\u{1F1EB}\u{1F1F7}"), "\u{1F1EB}\u{1F1F7}");
  assert.equal(parseReactionEmoji("<:pepe:123456789>"), "<:pepe:123456789>");
  assert.equal(parseReactionEmoji("<a:dance:987>"), "<a:dance:987>");
  assert.equal(parseReactionEmoji(""), null);
});

test("text that isn't one emoji is turned down", () => {
  for (const bad of ["hello", ":joy:", "1", "\u{1F602}\u{1F602}", "\u{1F602} hi", "<:pepe:>", "pepe:123"]) {
    assert.throws(() => parseReactionEmoji(bad), /emoji/, bad);
  }
});

test("a counter reacts with its own emoji, or a check mark when none is picked", () => {
  assert.equal(reactionFor({ reaction: "\u{1F602}" }), "\u{1F602}");
  assert.equal(reactionFor({ reaction: null }), DEFAULT_REACTION);
  assert.equal(DEFAULT_REACTION, "✅");
});

test("a server emoji added after the bot started is found by asking Discord", async () => {
  const known = () => false;
  const lookUp = async (id) => id === "1572711040440078356";
  assert.equal(await canUseEmoji("<:happi:1572711040440078356>", { known, lookUp }), true);
  assert.equal(await canUseEmoji("<:gone:999>", { known, lookUp }), false);
});

test("emojis the bot already knows, and normal emojis, don't need asking", async () => {
  const lookUp = async () => {
    throw new Error("shouldn't ask");
  };
  assert.equal(await canUseEmoji("<a:dance:5>", { known: (id) => id === "5", lookUp }), true);
  assert.equal(await canUseEmoji("\u{1F602}", { known: () => false, lookUp }), true);
});

test("a failed lookup counts as not usable", async () => {
  const lookUp = async () => {
    throw new Error("Unknown Emoji");
  };
  assert.equal(await canUseEmoji("<:x:7>", { known: () => false, lookUp }), false);
});
