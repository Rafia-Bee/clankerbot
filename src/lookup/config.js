// Reads the character lookup settings from .env. Everything has a default except the aion2index API key.
//   parseLookupSources  reads LOOKUP_SOURCES into a list of site names
//   loadLookupConfig    builds the lookup settings from a set of .env values
//   getLookupConfig     loads the settings from .env once and reuses them

const SITE_NAMES = ["aion2index", "shugo"];
const DEFAULT_SOURCES = ["aion2index", "shugo"];

let loaded = null;

function text(env, key, fallback) {
  return env[key]?.trim() || fallback;
}

function wholeNumber(env, key, fallback) {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be a whole number of 0 or more, not "${raw}"`);
  return Number(raw);
}

function trimEndSlashes(value) {
  return value.replace(/\/+$/, "");
}

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function parseLookupSources(raw) {
  const sources = (raw ?? "")
    .split(",")
    .map((source) => source.trim().toLowerCase())
    .filter(Boolean);
  if (sources.length === 0) return [...DEFAULT_SOURCES];
  for (const source of sources) {
    if (!SITE_NAMES.includes(source)) {
      throw new Error(`LOOKUP_SOURCES: unknown site "${source}" (use ${SITE_NAMES.join(", ")})`);
    }
  }
  if (new Set(sources).size !== sources.length) throw new Error("LOOKUP_SOURCES lists a site twice");
  return sources;
}

function loadLookupConfig(env) {
  const config = {
    sources: parseLookupSources(env.LOOKUP_SOURCES),
    serverName: text(env, "LOOKUP_SERVER_NAME", "Israphel"),
    maxNameLength: wholeNumber(env, "MAX_CHARACTER_NAME_LENGTH", 32),
    failoverMinutes: wholeNumber(env, "LOOKUP_FAILOVER_MINUTES", 5),
    userAgent: text(env, "LOOKUP_USER_AGENT", "Clanker/1.0 (Discord character lookup)"),
    requestTimeoutMs: wholeNumber(env, "LOOKUP_REQUEST_TIMEOUT_MS", 15000),
    cacheTtlMs: wholeNumber(env, "LOOKUP_CACHE_TTL_MS", 60000),
    aion2index: {
      apiKey: text(env, "AION2INDEX_API_KEY", null),
      baseUrl: trimEndSlashes(text(env, "AION2INDEX_BASE_URL", "https://aion2index.com/api/v1/characters")),
      regionPath: trimSlashes(text(env, "AION2INDEX_REGION_PATH", "eu/israphel")),
      minRequestGapMs: wholeNumber(env, "AION2INDEX_MIN_REQUEST_GAP_MS", 4000),
    },
    shugo: {
      baseUrl: trimEndSlashes(text(env, "SHUGO_BASE_URL", "https://shugo.gg/character")),
      regionPath: trimSlashes(text(env, "SHUGO_REGION_PATH", "global/eu-israphel")),
      minRequestGapMs: wholeNumber(env, "SHUGO_MIN_REQUEST_GAP_MS", 3000),
    },
  };
  if (config.sources.includes("aion2index") && !config.aion2index.apiKey) {
    throw new Error(
      "AION2INDEX_API_KEY is empty. Fill it in, or set LOOKUP_SOURCES=shugo to use shugo.gg only."
    );
  }
  return config;
}

function getLookupConfig() {
  loaded ??= loadLookupConfig(process.env);
  return loaded;
}

module.exports = { parseLookupSources, loadLookupConfig, getLookupConfig };
