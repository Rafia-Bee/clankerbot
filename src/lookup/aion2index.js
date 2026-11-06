// Looks characters up through the aion2index.com API.
//   profileUrl      the character's page on aion2index
//   apiUrl          the API address for a character
//   parseCharacter  turns an API response into the bot's character fields
//   errorCode       reads the error code from a failed API response
//   fetchCharacter  asks the API for a character; older saved data comes back as "stale"

const { getLookupConfig } = require("./config");
const { createLimiter } = require("./limiter");

const FACTIONS = { asmodian: "Asmodians", elyos: "Elyos" };
const REQUIRED_FIELDS = ["characterId", "name", "faction", "server", "level"];

const limiter = createLimiter(() => getLookupConfig().aion2index.minRequestGapMs);

function profileUrl(name) {
  const { baseUrl, regionPath } = getLookupConfig().aion2index;
  return `${new URL(baseUrl).origin}/c/${regionPath}/${encodeURIComponent(name)}`;
}

function apiUrl(name) {
  const { baseUrl, regionPath } = getLookupConfig().aion2index;
  return `${baseUrl}/${regionPath}/${encodeURIComponent(name)}`;
}

function parseCharacter(data) {
  if (!data || typeof data !== "object") throw new Error("response is not a JSON object");
  const missing = REQUIRED_FIELDS.filter((key) => data[key] == null);
  if (missing.length) throw new Error(`response is missing ${missing.join(", ")}`);

  return {
    characterId: data.characterId,
    name: data.name,
    level: data.level,
    className: data.class ?? null,
    faction: FACTIONS[String(data.faction).toLowerCase()] ?? data.faction,
    server: data.server,
    legion: data.legion || null,
    combatPower: data.combatPower ?? null,
    gearScore: data.itemLevel ?? null,
    profileUpdatedAt: Date.parse(data.updatedAt) || null,
    url: data.profileUrl || profileUrl(data.name),
    source: "aion2index",
  };
}

async function errorCode(res) {
  try {
    return (await res.json())?.error?.code ?? null;
  } catch {
    return null;
  }
}

async function fetchCharacter(name) {
  if (limiter.isPaused()) {
    return { status: "unavailable", reason: "rate_limited" };
  }

  const config = getLookupConfig();
  let res;
  try {
    res = await fetch(apiUrl(name), {
      headers: {
        Authorization: `Bearer ${config.aion2index.apiKey}`,
        Accept: "application/json",
        "User-Agent": config.userAgent,
      },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    return { status: "unavailable", reason: `network: ${error.message}` };
  }

  if (res.status === 404) return { status: "not_found" };

  if (res.status === 401 || res.status === 403) {
    const code = (await errorCode(res)) ?? `http ${res.status}`;
    return { status: "unavailable", reason: `API key rejected (${code})` };
  }

  if (res.status === 429) {
    const code = (await errorCode(res)) ?? "rate_limited";
    const retryAfterSeconds = Number(res.headers.get("retry-after")) || 60;
    limiter.pause(retryAfterSeconds * 1000);
    return { status: "unavailable", reason: code };
  }

  if (res.status !== 200) {
    return { status: "unavailable", reason: `http ${res.status}` };
  }

  let data;
  let character;
  try {
    data = await res.json();
    character = parseCharacter(data);
  } catch (error) {
    return { status: "unavailable", reason: `parse: ${error.message}` };
  }

  if (data.fresh !== true) {
    const from = character.profileUpdatedAt
      ? new Date(character.profileUpdatedAt).toISOString()
      : "an unknown time";
    return { status: "stale", character, reason: `saved data from ${from} (game not answering)` };
  }
  return { status: "found", character };
}

module.exports = {
  name: "aion2index",
  label: "aion2index",
  lookup: (name) => limiter.run(() => fetchCharacter(name)),
  reset: () => limiter.reset(),
  profileUrl,
  parseCharacter,
};
