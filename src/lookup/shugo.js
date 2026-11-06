// Looks characters up on shugo.gg by reading the data block in the character's page.
//   profileUrl      the character's page on shugo.gg
//   parseProfile    turns the page's data block into the bot's character fields
//   fetchCharacter  downloads and reads a character's page

const { getLookupConfig } = require("./config");
const { createLimiter } = require("./limiter");

const PROFILE_JSON_RE =
  /<script type="application\/json" id="shugo-profile">([\s\S]*?)<\/script>/;

const limiter = createLimiter(() => getLookupConfig().shugo.minRequestGapMs);

function profileUrl(name) {
  const { baseUrl, regionPath } = getLookupConfig().shugo;
  return `${baseUrl}/${regionPath}/${encodeURIComponent(name)}`;
}

function parseProfile(html) {
  const match = html.match(PROFILE_JSON_RE);
  if (!match) throw new Error("shugo-profile JSON block not found");

  const data = JSON.parse(match[1]);
  const profile = data.info?.profile;
  if (!profile) throw new Error("shugo-profile JSON is missing the profile");

  const statList = data.info.stat?.statList ?? [];
  const itemLevel = statList.find((stat) => stat.type === "ItemLevel");

  return {
    characterId: null,
    name: profile.characterName,
    level: profile.characterLevel,
    className: profile.className,
    faction: profile.raceName,
    server: profile.serverName,
    legion: profile.regionName || null,
    combatPower: profile.combatPower,
    gearScore: itemLevel ? itemLevel.value : null,
    profileUpdatedAt: data.info.__updatedAt ?? null,
  };
}

async function fetchCharacter(name) {
  if (limiter.isPaused()) {
    return { status: "unavailable", reason: "rate_limited" };
  }

  const config = getLookupConfig();
  const url = profileUrl(name);
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": config.userAgent },
      redirect: "manual",
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    return { status: "unavailable", reason: `network: ${error.message}` };
  }

  if (res.status === 404) return { status: "not_found" };

  if (res.status === 429) {
    const resetSeconds = Number(res.headers.get("ratelimit-reset")) || 600;
    limiter.pause(resetSeconds * 1000);
    return { status: "unavailable", reason: "rate_limited" };
  }

  if (res.status !== 200) {
    return { status: "unavailable", reason: `http ${res.status}` };
  }

  try {
    const character = parseProfile(await res.text());
    return { status: "found", character: { ...character, url, source: "shugo" } };
  } catch (error) {
    return { status: "unavailable", reason: `parse: ${error.message}` };
  }
}

module.exports = {
  name: "shugo",
  label: "shugo.gg",
  lookup: (name) => limiter.run(() => fetchCharacter(name)),
  reset: () => limiter.reset(),
  profileUrl,
  parseProfile,
};
