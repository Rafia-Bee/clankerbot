// Tests for the /whois reply built from a lookup result.
const test = require("node:test");
const assert = require("node:assert/strict");
const { whoisReply } = require("../src/whois");

const character = (extra = {}) => ({
  name: "KFC",
  level: 45,
  className: "Cleric",
  faction: "Asmodians",
  server: "Israphel",
  legion: "Aegis",
  combatPower: 81337,
  gearScore: 1686,
  profileUpdatedAt: Date.parse("2026-10-30T21:55:45.108Z"),
  url: "https://aion2index.com/c/eu/israphel/KFC",
  source: "aion2index",
  ...extra,
});

const ask = { name: "KFC", serverName: "Israphel", maxNameLength: 32 };
const found = (extra = {}, stale = false) => ({ status: "found", stale, character: character(extra) });
const embedOf = (reply) => reply.embeds[0].toJSON();
const fieldValue = (embed, name) => embed.fields.find((field) => field.name === name)?.value;

test("a found character shows its details with a link to its page", () => {
  const embed = embedOf(whoisReply(found(), ask));
  assert.equal(embed.title, "KFC");
  assert.equal(embed.url, "https://aion2index.com/c/eu/israphel/KFC");
  assert.equal(fieldValue(embed, "Class"), "Cleric");
  assert.equal(fieldValue(embed, "Level"), "45");
  assert.equal(fieldValue(embed, "Gear score"), "1,686");
  assert.equal(fieldValue(embed, "Combat power"), "81,337");
  assert.equal(fieldValue(embed, "Legion"), "Aegis");
  assert.equal(fieldValue(embed, "Faction"), "Asmodians");
  assert.equal(fieldValue(embed, "Server"), "Israphel");
  assert.equal(embed.footer.text, "From aion2index");
  assert.equal(embed.description, undefined);
});

test("missing details say so instead of showing nothing", () => {
  const embed = embedOf(
    whoisReply(found({ legion: null, gearScore: null, combatPower: null, className: null }), ask)
  );
  assert.equal(fieldValue(embed, "Legion"), "None");
  assert.equal(fieldValue(embed, "Gear score"), "Unknown");
  assert.equal(fieldValue(embed, "Combat power"), "Unknown");
  assert.equal(fieldValue(embed, "Class"), "Unknown");
});

test("a character from shugo.gg says where it came from", () => {
  const embed = embedOf(whoisReply(found({ source: "shugo" }), ask));
  assert.equal(embed.footer.text, "From shugo.gg");
});

test("older saved data says how old it is", () => {
  const embed = embedOf(whoisReply(found({}, true), ask));
  const seconds = Math.floor(Date.parse("2026-10-30T21:55:45.108Z") / 1000);
  assert.equal(
    embed.description,
    `The game isn't answering right now, so this is saved data from <t:${seconds}:R>.`
  );
});

test("factions get their own colour", () => {
  const asmodian = embedOf(whoisReply(found(), ask)).color;
  const elyos = embedOf(whoisReply(found({ faction: "Elyos" }), ask)).color;
  assert.notEqual(asmodian, elyos);
});

test("not found names the server and the name as typed", () => {
  assert.deepEqual(whoisReply({ status: "not_found" }, { ...ask, name: "K_F*C" }), {
    content: "No character called **K\\_F\\*C** on Israphel. Check the spelling and try again.",
  });
});

test("an invalid name explains what a name looks like", () => {
  assert.deepEqual(whoisReply({ status: "invalid_name" }, { ...ask, name: "two words" }), {
    content: "That doesn't look like a character name. Names are up to 32 characters, with no spaces or symbols like / ? # %.",
  });
});

test("every site down asks to try again later", () => {
  assert.deepEqual(whoisReply({ status: "unavailable", reason: "http 500" }, ask), {
    content: "I couldn't reach aion2index or shugo.gg right now. Try again in a few minutes.",
  });
});
