// The /whois command: looks an AION 2 character up and posts their details in the channel for everyone.
//   execute  looks the name up and posts the reply

const { SlashCommandBuilder } = require("discord.js");
const { lookupCharacter } = require("../lookup/lookup");
const { getLookupConfig } = require("../lookup/config");
const { whoisReply } = require("../whois");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whois")
    .setDescription("Look up an AION 2 character")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The character's name")
        .setRequired(true)
        .setMaxLength(64)
    ),
  async execute(interaction) {
    const name = interaction.options.getString("name").trim();
    await interaction.deferReply();
    const result = await lookupCharacter(name);
    const { serverName, maxNameLength } = getLookupConfig();
    if (result.status === "unavailable") console.warn(`/whois ${name}: every site failed (${result.reason})`);
    return interaction.editReply({
      ...whoisReply(result, { name, serverName, maxNameLength }),
      allowedMentions: { parse: [] },
    });
  },
};
