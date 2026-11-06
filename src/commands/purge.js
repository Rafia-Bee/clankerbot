// The /purge command: deletes up to 100 recent messages in the current channel.
//   execute  checks permissions, deletes what Discord allows and replies privately with the result

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { splitByAge, purgeSummary } = require("../purge");

const BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("How many messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: "You need the Manage Messages permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!interaction.appPermissions?.has(BOT_PERMISSIONS)) {
      return interaction.reply({
        content: "I need View Channel, Read Message History and Manage Messages in this channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const amount = interaction.options.getInteger("amount");
    const fetched = await interaction.channel.messages.fetch({ limit: amount });
    const { deletable, tooOld } = splitByAge([...fetched.values()], Date.now());
    if (deletable.length > 0) await interaction.channel.bulkDelete(deletable);
    return interaction.editReply(
      purgeSummary({ deleted: deletable.length, tooOld: tooOld.length })
    );
  },
};
