// Looks a character up on the sites in LOOKUP_SOURCES, in order, moving on to the next site when one fails.
//   configuredSources   the lookup sites in the order from LOOKUP_SOURCES
//   isValidName         checks a name could be a character name before asking any site
//   isDown              whether a site failed recently and should be asked last
//   lookupFrom          asks one site and keeps track of whether it's down or back up
//   lookupFromSources   asks the sites in order and picks the best answer
//   lookupCharacter     checks the name, reuses a recent answer if there is one, otherwise asks the sites
//   resetLookupState    forgets recent answers and site failures (for tests)

const EventEmitter = require("events");
const { getLookupConfig } = require("./config");

const SOURCES = {
  aion2index: require("./aion2index"),
  shugo: require("./shugo"),
};

const lookupEvents = new EventEmitter();
const cache = new Map();
const downUntil = new Map();

function configuredSources() {
  return getLookupConfig().sources.map((name) => SOURCES[name]);
}

function isValidName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= getLookupConfig().maxNameLength &&
    !/[\s/\\?#%]/.test(name)
  );
}

function isDown(source) {
  return (downUntil.get(source.name) ?? 0) > Date.now();
}

async function lookupFrom(source, name) {
  const result = await source.lookup(name);
  if (result.status === "unavailable" || result.status === "stale") {
    const wasDown = downUntil.has(source.name);
    downUntil.set(source.name, Date.now() + getLookupConfig().failoverMinutes * 60_000);
    if (!wasDown) lookupEvents.emit("down", { source: source.label, reason: result.reason });
  } else if (downUntil.has(source.name)) {
    downUntil.delete(source.name);
    lookupEvents.emit("up", { source: source.label });
  }
  return result;
}

async function lookupFromSources(name) {
  const sources = configuredSources();
  const up = sources.filter((source) => !isDown(source));
  const down = sources.filter((source) => isDown(source));
  const failures = [];
  let saved = null;
  let notFound = false;

  for (const source of up) {
    const result = await lookupFrom(source, name);
    if (result.status === "found") return { status: "found", stale: false, character: result.character };
    if (result.status === "stale") saved ??= result;
    if (result.status === "not_found") notFound = true;
    else failures.push(`${source.label}: ${result.reason}`);
  }
  if (saved) return { status: "found", stale: true, character: saved.character };
  if (notFound) return { status: "not_found" };

  for (const source of down) {
    const result = await lookupFrom(source, name);
    if (result.status === "found") return { status: "found", stale: false, character: result.character };
    if (result.status === "stale") return { status: "found", stale: true, character: result.character };
    if (result.status === "not_found") return result;
    failures.push(`${source.label}: ${result.reason}`);
  }
  return { status: "unavailable", reason: failures.join("; ") };
}

async function lookupCharacter(rawName, { fresh = false } = {}) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!isValidName(name)) return { status: "invalid_name" };

  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.result;

  const result = await lookupFromSources(name);
  if (result.status !== "unavailable") {
    if (cache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
    }
    cache.set(key, { result, expiresAt: Date.now() + getLookupConfig().cacheTtlMs });
  }
  return result;
}

function resetLookupState() {
  cache.clear();
  downUntil.clear();
  for (const source of Object.values(SOURCES)) source.reset();
}

module.exports = { lookupCharacter, lookupEvents, isValidName, resetLookupState };
