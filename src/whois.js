// Builds the /whois reply from a character lookup result, kept apart from Discord so it can be tested.
//   numberOrUnknown  formats a number with thousands commas, or "Unknown" when it's missing
//   characterEmbed   the embed with a found character's details
//   whoisReply       the full reply for any lookup result

const { EmbedBuilder, escapeMarkdown } = require("discord.js");

const FACTION_COLOURS = { Asmodians: 0x8e5cf7, Elyos: 0xf2c14e };
const OTHER_COLOUR = 0x99aab5;
const SOURCE_LABELS = { aion2index: "aion2index", shugo: "shugo.gg" };

function numberOrUnknown(value) {
  return value == null ? "Unknown" : value.toLocaleString("en-US");
}

function characterEmbed(character, stale) {
  const embed = new EmbedBuilder()
    .setTitle(character.name)
    .setURL(character.url)
    .setColor(FACTION_COLOURS[character.faction] ?? OTHER_COLOUR)
    .addFields(
      { name: "Class", value: character.className || "Unknown", inline: true },
      { name: "Level", value: numberOrUnknown(character.level), inline: true },
      { name: "Gear score", value: numberOrUnknown(character.gearScore), inline: true },
      { name: "Combat power", value: numberOrUnknown(character.combatPower), inline: true },
      { name: "Legion", value: character.legion || "None", inline: true },
      { name: "Faction", value: character.faction || "Unknown", inline: true },
      { name: "Server", value: character.server || "Unknown", inline: true }
    )
    .setFooter({ text: `From ${SOURCE_LABELS[character.source] ?? character.source}` });

  if (stale) {
    const from = character.profileUpdatedAt
      ? `<t:${Math.floor(character.profileUpdatedAt / 1000)}:R>`
      : "an unknown time";
    embed.setDescription(`The game isn't answering right now, so this is saved data from ${from}.`);
  }
  return embed;
}

function whoisReply(result, { name, serverName, maxNameLength }) {
  switch (result.status) {
    case "found":
      return { embeds: [characterEmbed(result.character, result.stale)] };
    case "not_found":
      return {
        content: `No character called **${escapeMarkdown(name)}** on ${serverName}. Check the spelling and try again.`,
      };
    case "invalid_name":
      return {
        content: `That doesn't look like a character name. Names are up to ${maxNameLength} characters, with no spaces or symbols like / ? # %.`,
      };
    default:
      return { content: "I couldn't reach aion2index or shugo.gg right now. Try again in a few minutes." };
  }
}

module.exports = { whoisReply };
