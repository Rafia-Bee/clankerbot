// The /badword command: adds 1 to a member's count. Anyone can use it.
//   execute  adds 1 for the picked member and posts their new count

const { SlashCommandBuilder } = require("discord.js");
const { getStore } = require("../store");
const { badWordAddedReply } = require("../badwords/messages");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("badword")
    .setDescription("Add 1 to a member's count")
    .addUserOption((option) =>
      option.setName("user").setDescription("Who to add 1 to").setRequired(true)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser("user");
    const count = getStore().addBadWord(interaction.guildId, user.id);
    return interaction.reply({ content: badWordAddedReply(user.id, count), allowedMentions: { parse: [] } });
  },
};
