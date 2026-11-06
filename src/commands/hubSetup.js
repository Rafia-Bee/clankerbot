// The /hub-setup command: makes a "Create a VC" hub, or turns a picked voice channel into one.
// Joining a hub gives the member their own voice channel (see voice/hub.js).
//   hubCategoryId  the category of the channel the command was used in
//   execute        makes or picks the hub channel and saves it as a hub

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { getStore } = require("../store");
const { EMPTY_DELETE_SECONDS } = require("../voice/rules");

const HUB_NAME = "Create a VC";
const NEEDED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.MoveMembers,
];

function hubCategoryId(channel) {
  if (!channel) return null;
  return channel.isThread() ? channel.parent?.parentId ?? null : channel.parentId;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hub-setup")
    .setDescription("Make a voice channel that gives everyone who joins it their own voice channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription(`A voice channel to use as the hub. Leave empty to make a new "${HUB_NAME}" channel here.`)
        .addChannelTypes(ChannelType.GuildVoice)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "You need the Manage Server permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!interaction.guild.members.me.permissions.has(NEEDED_PERMISSIONS)) {
      return interaction.reply({
        content:
          "I need View Channels, Connect, Speak, Manage Channels, Manage Roles and Move Members. Add them to my role in Server Settings, Roles.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const store = getStore();
    const picked = interaction.options.getChannel("channel");
    if (picked && store.isTempChannel(picked.id)) {
      return interaction.reply({
        content: "That's someone's own voice channel, which gets deleted when it's empty. Pick another one.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (picked && store.isHub(picked.id)) {
      return interaction.reply({ content: `<#${picked.id}> is already a hub.`, flags: MessageFlags.Ephemeral });
    }

    const hub =
      picked ??
      (await interaction.guild.channels.create({
        name: HUB_NAME,
        type: ChannelType.GuildVoice,
        parent: hubCategoryId(interaction.channel),
        reason: `/hub-setup by ${interaction.user.tag}`,
      }));
    store.addHub(interaction.guildId, hub.id);
    return interaction.reply({
      content:
        `Done. <#${hub.id}> is now a hub. When someone joins it, I make them their own voice channel ` +
        `and delete it once it's been empty for ${EMPTY_DELETE_SECONDS} seconds. To turn the hub off, delete its channel.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
