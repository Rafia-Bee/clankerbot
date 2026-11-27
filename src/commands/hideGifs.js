// The /hidegifs command: for a while, hides the preview of every GIF posted in a channel a set time after it's posted.
//   checkTimes  reads the timer and "for" options and checks they're within the limits
//   execute     checks permissions, then turns the mode on (or off with for:off) and replies privately

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { parseTime, formatTime } = require("../hideGifs/rules");
const { getGifHider } = require("../hideGifs/hider");

const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
const MIN_FOR_MS = 60 * 1000;
const MAX_FOR_MS = 30 * 24 * 60 * 60 * 1000;

const BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
];

function checkTimes(rawTimer, rawFor) {
  const timer = parseTime(rawTimer);
  if (timer.error) return { error: `Timer: ${timer.error}` };
  if (timer.ms > MAX_TIMER_MS) return { error: "The timer can be at most 1 day." };
  const lasts = parseTime(rawFor);
  if (lasts.error) return { error: `For: ${lasts.error} Or use off to stop.` };
  if (lasts.ms < MIN_FOR_MS || lasts.ms > MAX_FOR_MS) return { error: "For can be 1 minute up to 30 days." };
  return { timerMs: timer.ms, forMs: lasts.ms };
}

module.exports = {
  checkTimes,
  data: new SlashCommandBuilder()
    .setName("hidegifs")
    .setDescription("For a while, hide GIF previews in a channel a set time after they're posted")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to hide GIF previews in")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .addStringOption((option) =>
      option
        .setName("for")
        .setDescription("How long to keep doing this, like 30m, 2h or 1d. Type off to stop.")
        .setRequired(true)
        .setMaxLength(30)
    )
    .addStringOption((option) =>
      option
        .setName("timer")
        .setDescription("How long a GIF shows before its preview is hidden, like 30s or 5m. Leave empty to hide right away.")
        .setMaxLength(30)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: "You need the Manage Messages permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel("channel", true);
    const rawFor = interaction.options.getString("for", true).trim();
    const hider = getGifHider();

    if (rawFor.toLowerCase() === "off") {
      const stopped = hider.stop(channel);
      return interaction.reply({
        content: stopped ? `Stopped hiding GIF previews in ${channel}.` : `GIF previews weren't being hidden in ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const times = checkTimes(interaction.options.getString("timer") ?? "0", rawFor);
    if (times.error) return interaction.reply({ content: times.error, flags: MessageFlags.Ephemeral });

    if (!channel.permissionsFor(interaction.client.user)?.has(BOT_PERMISSIONS)) {
      return interaction.reply({
        content: `I need View Channel, Read Message History and Manage Messages in ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const endsAt = Date.now() + times.forMs;
    const { hidden, scheduled } = await hider.start(channel, {
      timerMs: times.timerMs,
      endsAt,
      userId: interaction.user.id,
    });

    const when = times.timerMs === 0 ? "as soon as they're posted" : `${formatTime(times.timerMs)} after they're posted`;
    const ends = Math.floor(endsAt / 1000);
    const lines = [`Until <t:${ends}:f> (<t:${ends}:R>), GIF previews in ${channel} will be hidden ${when}. The links stay.`];
    if (hidden > 0) lines.push(`Hid ${hidden} recent ${hidden === 1 ? "GIF" : "GIFs"} just now.`);
    if (scheduled > 0) lines.push(`${scheduled} more recent ${scheduled === 1 ? "GIF" : "GIFs"} will be hidden when the timer runs out.`);
    lines.push(`To stop early: /hidegifs channel:#${channel.name} for:off`);
    return interaction.editReply(lines.join("\n"));
  },
};
