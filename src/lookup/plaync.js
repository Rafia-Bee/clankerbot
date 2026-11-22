// Looks characters up on the official AION 2 site (plaync.com): a name search on one server, then the profile.
//   pageUrl         the character's own page on the official site
//   findExactMatch  picks the character with exactly this name on this server out of the search results
//   parseProfile    turns a profile reply into the bot's character fields
//   getJson         asks the official site for one reply and sorts out errors and rate limits
//   fetchCharacter  searches for a name and reads the profile of the exact match

const { getLookupConfig } = require("./config");
const { createLimiter } = require("./limiter");

const LANGUAGE = "en-US";

const limiter = createLimiter(() => getLookupConfig().plaync.minRequestGapMs);

function pageUrl(serverId, characterId) {
  const { baseUrl, region } = getLookupConfig().plaync;
  return `${baseUrl}/en-us/characters/${serverId}/${encodeURIComponent(characterId)}?region=${region}`;
}

function findExactMatch(data, name, serverId) {
  const wanted = name.toLowerCase();
  const hit = (data?.list ?? []).find(
    (entry) =>
      entry.serverId === serverId && String(entry.name).replace(/<[^>]*>/g, "").toLowerCase() === wanted
  );
  return hit ? { characterId: decodeURIComponent(hit.characterId), serverId: hit.serverId } : null;
}

function parseProfile(data) {
  const profile = data?.profile;
  if (!profile?.characterId || !profile.characterName) throw new Error("reply is missing the profile");

  const itemLevel = (data.stat?.statList ?? []).find((stat) => stat.type === "ItemLevel");

  return {
    characterId: profile.characterId,
    name: profile.characterName,
    level: profile.characterLevel,
    className: profile.className,
    faction: profile.raceName,
    server: profile.serverName,
    legion: profile.regionName || null,
    combatPower: profile.combatPower ?? null,
    gearScore: itemLevel ? itemLevel.value : null,
    profileUpdatedAt: Date.now(),
    url: pageUrl(profile.serverId, profile.characterId),
    source: "plaync",
  };
}

async function getJson(url) {
  const config = getLookupConfig();
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": config.userAgent },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    return { status: "unavailable", reason: `network: ${error.message}` };
  }

  if (res.status === 404) return { status: "not_found" };

  if (res.status === 429) {
    const retryAfterSeconds = Number(res.headers.get("retry-after")) || 60;
    limiter.pause(retryAfterSeconds * 1000);
    return { status: "unavailable", reason: "rate_limited" };
  }

  if (res.status !== 200) return { status: "unavailable", reason: `http ${res.status}` };

  try {
    return { status: "ok", data: await res.json() };
  } catch (error) {
    return { status: "unavailable", reason: `parse: ${error.message}` };
  }
}

async function fetchCharacter(name) {
  if (limiter.isPaused()) {
    return { status: "unavailable", reason: "rate_limited" };
  }

  const { searchUrl, baseUrl, region, serverId } = getLookupConfig().plaync;
  const search = new URL(searchUrl);
  search.search = new URLSearchParams({ keyword: name, region, localeInfo: LANGUAGE, serverId }).toString();
  const found = await getJson(search.toString());
  if (found.status !== "ok") return found;

  const match = findExactMatch(found.data, name, serverId);
  if (!match) return { status: "not_found" };

  const info = new URL(`${baseUrl}/api/character/info`);
  info.search = new URLSearchParams({ lang: LANGUAGE, characterId: match.characterId, serverId, region }).toString();
  const reply = await getJson(info.toString());
  if (reply.status !== "ok") return reply;

  try {
    return { status: "found", character: parseProfile(reply.data) };
  } catch (error) {
    return { status: "unavailable", reason: `parse: ${error.message}` };
  }
}

module.exports = {
  name: "plaync",
  label: "aion2.plaync.com",
  lookup: (name) => limiter.run(() => fetchCharacter(name)),
  reset: () => limiter.reset(),
  pageUrl,
  findExactMatch,
  parseProfile,
};
