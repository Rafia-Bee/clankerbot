// Tests for looking characters up on the official AION 2 site (plaync.com), with fake sites instead of the real ones.
const test = require("node:test");
const assert = require("node:assert/strict");

Object.assign(process.env, {
  LOOKUP_SOURCES: "plaync,shugo",
  LOOKUP_FAILOVER_MINUTES: "5",
  LOOKUP_USER_AGENT: "Clanker test",
  LOOKUP_REQUEST_TIMEOUT_MS: "1000",
  LOOKUP_CACHE_TTL_MS: "60000",
  PLAYNC_SEARCH_URL: "https://search.test/aion2global/search/v2/character",
  PLAYNC_BASE_URL: "https://nc.test",
  PLAYNC_REGION: "eu",
  PLAYNC_SERVER_ID: "2301",
  PLAYNC_MIN_REQUEST_GAP_MS: "0",
  SHUGO_BASE_URL: "https://shugo.test/character",
  SHUGO_REGION_PATH: "global/eu-israphel",
  SHUGO_MIN_REQUEST_GAP_MS: "0",
});

const { parseLookupSources } = require("../src/lookup/config");
const { lookupCharacter, lookupEvents, resetLookupState } = require("../src/lookup/lookup");
const { findExactMatch, parseProfile } = require("../src/lookup/plaync");

const searchHit = (extra = {}) => ({
  characterId: "abc123%3D",
  name: "<strong>KFC</strong>",
  race: 2,
  pcId: 32,
  level: 45,
  serverId: 2301,
  serverName: "Israphel",
  region: "eu",
  ...extra,
});

const searchReply = (list) => ({ list, pagination: { page: 1, size: 20, total: list.length, endPage: 1 } });

const infoReply = (profile = {}) => ({
  profile: {
    characterId: "abc123=",
    characterName: "KFC",
    characterLevel: 45,
    className: "Cleric",
    combatPower: 81337,
    raceId: 2,
    raceName: "Asmodians",
    regionName: "Aegis",
    serverId: 2301,
    serverName: "Israphel",
    ...profile,
  },
  stat: {
    statList: [
      { type: "STR", name: "Might", value: 57 },
      { type: "ItemLevel", name: "아이템레벨", value: 1686 },
    ],
  },
});

const shugoPage = () => {
  const data = {
    info: {
      __updatedAt: 1,
      profile: {
        characterName: "KFC",
        characterLevel: 45,
        className: "Cleric",
        raceName: "Asmodians",
        serverName: "Israphel",
        regionName: "Aegis",
        combatPower: 72819,
      },
      stat: { statList: [{ type: "ItemLevel", value: 1642 }] },
    },
  };
  return `<script type="application/json" id="shugo-profile">${JSON.stringify(data)}</script>`;
};

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function siteFor(url) {
  if (url.startsWith("https://search.test")) return "search";
  if (url.startsWith("https://nc.test/api/character/info")) return "info";
  return "shugo";
}

let calls;
let replies;

function fakeFetch(url, options) {
  const site = siteFor(url);
  calls.push({ site, url, options });
  const reply = replies[site];
  if (reply instanceof Error) return Promise.reject(reply);
  return Promise.resolve(typeof reply === "function" ? reply() : reply);
}

const ok = {
  search: () => json(200, searchReply([searchHit()])),
  info: () => json(200, infoReply()),
  shugo: () => new Response(shugoPage(), { status: 200 }),
};
const serverError = () => new Response("", { status: 500 });

test.beforeEach(() => {
  resetLookupState();
  lookupEvents.removeAllListeners();
  calls = [];
  replies = { ...ok };
  globalThis.fetch = fakeFetch;
});

const sitesCalled = () => calls.map((call) => call.site);

test("LOOKUP_SOURCES accepts plaync", () => {
  assert.deepEqual(parseLookupSources("plaync, aion2index, shugo"), ["plaync", "aion2index", "shugo"]);
});

test("picks the exact name on the right server out of the search results", () => {
  const list = [
    searchHit({ name: "<strong>KFC</strong>s", characterId: "partial%3D" }),
    searchHit({ serverId: 2305, serverName: "Marchutan", characterId: "otherserver%3D" }),
    searchHit({ name: "<strong>kfc</strong>", characterId: "exact%3D" }),
  ];
  assert.equal(findExactMatch(searchReply(list), "KFC", 2301).characterId, "exact=");
  assert.equal(findExactMatch(searchReply(list.slice(0, 2)), "KFC", 2301), null);
  assert.equal(findExactMatch(searchReply([]), "KFC", 2301), null);
  assert.equal(findExactMatch({}, "KFC", 2301), null);
});

test("maps a profile to the bot's character fields", () => {
  const c = parseProfile(infoReply());
  assert.equal(c.characterId, "abc123=");
  assert.equal(c.name, "KFC");
  assert.equal(c.level, 45);
  assert.equal(c.className, "Cleric");
  assert.equal(c.faction, "Asmodians");
  assert.equal(c.server, "Israphel");
  assert.equal(c.legion, "Aegis");
  assert.equal(c.combatPower, 81337);
  assert.equal(c.gearScore, 1686);
  assert.equal(c.source, "plaync");
  assert.equal(c.url, "https://nc.test/en-us/characters/2301/abc123%3D?region=eu");
  assert.equal(parseProfile(infoReply({ regionName: "" })).legion, null);
  assert.equal(parseProfile({ ...infoReply(), stat: undefined }).gearScore, null);
  assert.throws(() => parseProfile({}), /missing the profile/);
});

test("searches on the configured server, then reads the profile with the ID encoded once", async () => {
  const result = await lookupCharacter("KFC");
  assert.equal(result.status, "found");
  assert.equal(result.character.source, "plaync");
  assert.equal(result.character.gearScore, 1686);
  assert.deepEqual(sitesCalled(), ["search", "info"]);

  const search = new URL(calls[0].url);
  assert.equal(search.searchParams.get("keyword"), "KFC");
  assert.equal(search.searchParams.get("region"), "eu");
  assert.equal(search.searchParams.get("serverId"), "2301");

  const info = new URL(calls[1].url);
  assert.equal(info.searchParams.get("characterId"), "abc123=");
  assert.equal(info.searchParams.get("serverId"), "2301");
  assert.equal(info.searchParams.get("region"), "eu");
  assert.equal(info.searchParams.get("lang"), "en-US");
  assert.equal(calls[1].options.headers["User-Agent"], "Clanker test");
});

test("only partial matches count as not found, and shugo.gg is asked before giving up", async () => {
  replies.search = () => json(200, searchReply([searchHit({ name: "<strong>KFC</strong>s" })]));
  const hidden = await lookupCharacter("KFC");
  assert.equal(hidden.character.source, "shugo");

  replies.shugo = () => new Response("", { status: 404 });
  const missing = await lookupCharacter("Nobody");
  assert.equal(missing.status, "not_found");
});

test("a profile that's gone counts as not found", async () => {
  replies.info = () => json(404, { code: "resource.not_found" });
  replies.shugo = () => new Response("", { status: 404 });
  const result = await lookupCharacter("KFC");
  assert.equal(result.status, "not_found");
});

test("falls back to shugo.gg when the official site fails", async () => {
  const events = [];
  lookupEvents.on("down", (event) => events.push(event.reason));
  replies.search = serverError;

  const result = await lookupCharacter("KFC");
  assert.equal(result.character.source, "shugo");
  assert.deepEqual(events, ["http 500"]);
});

test("a broken profile reply falls back to shugo.gg", async () => {
  replies.info = () => new Response("<html>", { status: 200 });
  const result = await lookupCharacter("KFC");
  assert.equal(result.character.source, "shugo");
});

test("a rate limit pauses the official site until retry-after", async () => {
  replies.search = () => json(429, {}, { "retry-after": "30" });
  replies.shugo = serverError;
  await lookupCharacter("KFC");
  calls = [];

  const result = await lookupCharacter("Other");
  assert.equal(result.status, "unavailable");
  assert.match(result.reason, /aion2\.plaync\.com: rate_limited/);
  assert.deepEqual(sitesCalled(), ["shugo"]);
});
