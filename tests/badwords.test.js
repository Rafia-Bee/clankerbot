// Tests for the /badword counts saved in the database and the replies shown for them.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openStore } = require("../src/store");
const { badWordAddedReply, badWordCountReply } = require("../src/badwords/messages");

let store;
test.beforeEach(() => {
  store = openStore(":memory:");
});

test("everyone starts at 0", () => {
  assert.equal(store.getBadWordCount("1", "100"), 0);
});

test("adding goes up by 1 each time and returns the new count", () => {
  assert.equal(store.addBadWord("1", "100"), 1);
  assert.equal(store.addBadWord("1", "100"), 2);
  assert.equal(store.addBadWord("1", "100"), 3);
  assert.equal(store.getBadWordCount("1", "100"), 3);
});

test("counts are kept apart per member and per server", () => {
  store.addBadWord("1", "100");
  store.addBadWord("1", "100");
  store.addBadWord("1", "200");
  store.addBadWord("2", "100");
  assert.equal(store.getBadWordCount("1", "100"), 2);
  assert.equal(store.getBadWordCount("1", "200"), 1);
  assert.equal(store.getBadWordCount("2", "100"), 1);
  assert.equal(store.getBadWordCount("2", "200"), 0);
});

test("replies mention the member and the count", () => {
  assert.equal(badWordAddedReply("100", 1), "Added 1 to <@100>. Their count is now 1.");
  assert.equal(badWordCountReply("100", 0), "<@100>'s count is 0.");
  assert.equal(badWordCountReply("100", 7), "<@100>'s count is 7.");
});

const { addWord, removeWord, hasTriggerWord } = require("../src/badwords/words");

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
  assert.equal(hasTriggerWord("\u00E7a va caf\u00E9", ["caf\u00E9"]), true);
  assert.equal(hasTriggerWord("caf\u00E9ine", ["caf\u00E9"]), false);
  assert.equal(hasTriggerWord("what a.b moment", ["a.b"]), true);
  assert.equal(hasTriggerWord("what axb moment", ["a.b"]), false);
});

const { addWords, MAX_WORDS } = require("../src/badwords/words");
const { parseReactionEmoji, reactionFor, DEFAULT_REACTION } = require("../src/badwords/reaction");

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

test("the reaction can be a normal emoji or a custom one", () => {
  assert.equal(parseReactionEmoji(" \u{1F602} "), "\u{1F602}");
  assert.equal(parseReactionEmoji("\u{1F44D}\u{1F3FD}"), "\u{1F44D}\u{1F3FD}");
  assert.equal(parseReactionEmoji("\u2764\uFE0F"), "\u2764\uFE0F");
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

test("the bot uses the picked reaction, or a check mark when none is picked", () => {
  assert.equal(reactionFor({ BAD_WORD_REACTION: "\u{1F602}" }), "\u{1F602}");
  assert.equal(reactionFor({}), DEFAULT_REACTION);
  assert.equal(DEFAULT_REACTION, "\u2705");
});

const { canUseEmoji } = require("../src/badwords/reaction");

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

test("lookalike letters from other alphabets still count", () => {
  const words = ["darn", "cat"];
  assert.equal(hasTriggerWord("d\u0430rn", words), true);
  assert.equal(hasTriggerWord("seems like i can say d\u0430rn all i want", words), true);
  assert.equal(hasTriggerWord("\u0441\u03B1t", words), true);
  assert.equal(hasTriggerWord("C\u0410T", words), true);
});

test("accents, fancy fonts and hidden characters still count", () => {
  const words = ["cat"];
  assert.equal(hasTriggerWord("c\u00E1t", words), true);
  assert.equal(hasTriggerWord("\uFF43\uFF41\uFF54", words), true);
  assert.equal(hasTriggerWord("\u{1D41C}\u{1D41A}\u{1D42D}", words), true);
  assert.equal(hasTriggerWord("c\u200Ba\u200Dt", words), true);
  assert.equal(hasTriggerWord("c\u00ADat", words), true);
});

test("lookalike letters don't make longer words count", () => {
  assert.equal(hasTriggerWord("c\u0430ts", ["cat"]), false);
  assert.equal(hasTriggerWord("category", ["c\u0430t"]), false);
});

const { rankBadWords, badWordLeaderboardReply } = require("../src/badwords/messages");

test("the leaderboard lists a server's members from highest count down, up to the limit", () => {
  store.addBadWord("1", "100");
  for (let i = 0; i < 3; i++) store.addBadWord("1", "200");
  for (let i = 0; i < 2; i++) store.addBadWord("1", "300");
  store.addBadWord("2", "400");
  assert.deepEqual(store.getBadWordLeaderboard("1", 10), [
    { userId: "200", count: 3 },
    { userId: "300", count: 2 },
    { userId: "100", count: 1 },
  ]);
  assert.deepEqual(store.getBadWordLeaderboard("1", 2).map((r) => r.userId), ["200", "300"]);
  assert.deepEqual(store.getBadWordLeaderboard("3", 10), []);
});

test("members with the same count share a rank", () => {
  const rows = [
    { userId: "a", count: 5 },
    { userId: "b", count: 5 },
    { userId: "c", count: 2 },
    { userId: "d", count: 1 },
    { userId: "e", count: 1 },
  ];
  assert.deepEqual(rankBadWords(rows).map((r) => r.rank), [1, 1, 3, 4, 4]);
});

test("the leaderboard reply shows rank, member and count", () => {
  const reply = badWordLeaderboardReply([
    { userId: "200", count: 3 },
    { userId: "300", count: 3 },
    { userId: "100", count: 1 },
  ]);
  assert.equal(
    reply,
    "**Bad word leaderboard**\n**#1** <@200>: 3\n**#1** <@300>: 3\n**#3** <@100>: 1"
  );
  assert.equal(badWordLeaderboardReply([]), "Nobody has a count yet.");
});

const { parseLeaderboardTitle, leaderboardTitleFor, DEFAULT_LEADERBOARD_TITLE } = require("../src/badwords/messages");

test("the leaderboard uses the picked name, or the default when none is picked", () => {
  assert.equal(DEFAULT_LEADERBOARD_TITLE, "Bad word leaderboard");
  assert.equal(leaderboardTitleFor({}), "Bad word leaderboard");
  assert.equal(leaderboardTitleFor({ BAD_WORD_LEADERBOARD_TITLE: "Naughty List" }), "Naughty List");
  assert.equal(
    badWordLeaderboardReply([{ userId: "100", count: 2 }], "Naughty List"),
    "**Naughty List**\n**#1** <@100>: 2"
  );
});

test("a typed leaderboard name is trimmed, empty means the default, and long names are turned down", () => {
  assert.equal(parseLeaderboardTitle("  Naughty   List "), "Naughty List");
  assert.equal(parseLeaderboardTitle("   "), null);
  assert.equal(parseLeaderboardTitle("x".repeat(100)).length, 100);
  assert.throws(() => parseLeaderboardTitle("x".repeat(101)), /100/);
});
