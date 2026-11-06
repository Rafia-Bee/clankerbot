// Tests for reading the character lookup settings from .env.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLookupConfig, parseLookupSources } = require("../src/lookup/config");

test("defaults look up Israphel on aion2index first, then shugo.gg", () => {
  const config = loadLookupConfig({ AION2INDEX_API_KEY: "key" });
  assert.deepEqual(config.sources, ["aion2index", "shugo"]);
  assert.equal(config.serverName, "Israphel");
  assert.equal(config.maxNameLength, 32);
  assert.equal(config.failoverMinutes, 5);
  assert.equal(config.aion2index.apiKey, "key");
  assert.equal(config.aion2index.baseUrl, "https://aion2index.com/api/v1/characters");
  assert.equal(config.aion2index.regionPath, "eu/israphel");
  assert.equal(config.aion2index.minRequestGapMs, 4000);
  assert.equal(config.shugo.baseUrl, "https://shugo.gg/character");
  assert.equal(config.shugo.regionPath, "global/eu-israphel");
  assert.equal(config.shugo.minRequestGapMs, 3000);
});

test("settings from .env replace the defaults, with extra slashes trimmed", () => {
  const config = loadLookupConfig({
    LOOKUP_SOURCES: "shugo",
    SHUGO_BASE_URL: "https://shugo.test/character/",
    SHUGO_REGION_PATH: "/global/eu-other/",
    SHUGO_MIN_REQUEST_GAP_MS: "0",
    LOOKUP_SERVER_NAME: "Other",
  });
  assert.deepEqual(config.sources, ["shugo"]);
  assert.equal(config.shugo.baseUrl, "https://shugo.test/character");
  assert.equal(config.shugo.regionPath, "global/eu-other");
  assert.equal(config.shugo.minRequestGapMs, 0);
  assert.equal(config.serverName, "Other");
});

test("aion2index without an API key is an error", () => {
  assert.throws(() => loadLookupConfig({}), /AION2INDEX_API_KEY/);
});

test("numbers that aren't whole numbers of 0 or more are an error", () => {
  assert.throws(
    () => loadLookupConfig({ AION2INDEX_API_KEY: "key", LOOKUP_FAILOVER_MINUTES: "soon" }),
    /LOOKUP_FAILOVER_MINUTES/
  );
  assert.throws(
    () => loadLookupConfig({ AION2INDEX_API_KEY: "key", LOOKUP_CACHE_TTL_MS: "-1" }),
    /LOOKUP_CACHE_TTL_MS/
  );
});

test("parses LOOKUP_SOURCES", () => {
  assert.deepEqual(parseLookupSources("aion2index, Shugo"), ["aion2index", "shugo"]);
  assert.deepEqual(parseLookupSources(undefined), ["aion2index", "shugo"]);
  assert.deepEqual(parseLookupSources("  "), ["aion2index", "shugo"]);
  assert.throws(() => parseLookupSources("shugo,other"), /unknown site "other"/);
  assert.throws(() => parseLookupSources("shugo,shugo"), /twice/);
});
