// The /badword-count command: shows how many a member has been given with /badword. Anyone can use it.
//   execute  looks up the picked member's count and posts it

const { SlashCommandBuilder } = require("discord.js");
const { getStore } = require("../store");
const { badWordCountReply } = require("../badwords/messages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("badword-count")
    .setDescription("See a member's count")
    .addUserOption((option) =>
      option.setName("user").setDescription("Whose count to see").setRequired(true)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const count = getStore().getBadWordCount(interaction.guildId, user.id);
    return interaction.reply({ content: badWordCountReply(user.id, count), allowedMentions: { parse: [] } });
  },
};
