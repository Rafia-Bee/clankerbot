// The /badword-leaderboard command: shows the members with the highest /badword counts in the server. Anyone can use it.
//   execute  gets the top counts and posts them as a ranked list, under the name picked in /settings

const { SlashCommandBuilder } = require("discord.js");
const { getStore } = require("../store");
const { badWordLeaderboardReply, leaderboardTitleFor } = require("../badwords/messages");

const LEADERBOARD_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("badword-leaderboard")
    .setDescription("See who has the highest counts"),
  async execute(interaction) {
    const store = getStore();
    const rows = store.getBadWordLeaderboard(interaction.guildId, LEADERBOARD_SIZE);
    const title = leaderboardTitleFor(store.getServerSettings());
    return interaction.reply({ content: badWordLeaderboardReply(rows, title), allowedMentions: { parse: [] } });
  },
};
