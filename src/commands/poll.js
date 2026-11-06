// The /poll command: posts a Discord poll in the current channel.
//   execute  checks the answers and duration, then posts the poll (or explains privately what's wrong)

const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { parseAnswers, parseDuration, buildPoll } = require("../poll");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Post a poll in this channel")
    .addStringOption((option) =>
      option.setName("question").setDescription("What to ask").setRequired(true).setMaxLength(300)
    )
    .addStringOption((option) =>
      option
        .setName("answers")
        .setDescription("2 to 10 answers, separated by ; (like: Yes; No; Maybe)")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("How long it stays open, like 12h, 3d or 1d 12h (default 24h, up to 32d)")
        .setMaxLength(20)
    )
    .addBooleanOption((option) =>
      option.setName("multiple").setDescription("Let people pick more than one answer (default: no)")
    ),
  async execute(interaction) {
    const answers = parseAnswers(interaction.options.getString("answers"));
    const duration = parseDuration(interaction.options.getString("duration"));
    const error = answers.error ?? duration.error;
    if (error) {
      return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({
      poll: buildPoll({
        question: interaction.options.getString("question"),
        answers: answers.answers,
        hours: duration.hours,
        multiple: interaction.options.getBoolean("multiple") ?? false,
      }),
      allowedMentions: { parse: [] },
    });
  },
};
