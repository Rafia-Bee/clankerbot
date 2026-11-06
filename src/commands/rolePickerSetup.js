// The /role-picker-setup command and the buttons it posts: clicking one gives the member a role, clicking again removes it.
//   execute          checks the role can be given out and posts the message with its button
//   toggleRole       gives or removes the button's role for the member who clicked
//   handleComponent  sends role button clicks to toggleRole

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  PREFIX,
  roleProblem,
  roleButtonId,
  roleFromButtonId,
  toggleReply,
  defaultPickerMessage,
} = require("../rolePicker");

const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];
const DEFAULT_COLOUR = 0x8e5cf7;
const MAX_LABEL = 80;

async function toggleRole(interaction) {
  const roleId = roleFromButtonId(interaction.customId);
  if (!roleId) return;
  const { guild, member } = interaction;
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({
      content: "This role doesn't exist any more. Please tell a mod.",
      flags: MessageFlags.Ephemeral,
    });
  }
  const problem = roleProblem({
    role,
    guildId: guild.id,
    botTopPosition: guild.members.me.roles.highest.position,
    isOwner: true,
  });
  if (problem || !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`Role button for ${role.name}: ${problem ?? "missing Manage Roles"}`);
    return interaction.reply({
      content: "I can't give out that role right now. Please tell a mod.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const added = !member.roles.cache.has(roleId);
  const reason = "Role button";
  if (added) await member.roles.add(roleId, reason);
  else await member.roles.remove(roleId, reason);
  return interaction.reply({
    content: toggleReply(roleId, added),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("role-picker-setup")
    .setDescription("Post a button that gives members a role, and takes it away when they click again")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((option) =>
      option.setName("role").setDescription("The role the button gives").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Text above the button (Discord formatting works). Leave empty for the default.")
        .setMaxLength(2000)
    )
    .addStringOption((option) =>
      option
        .setName("button")
        .setDescription("The button text. Leave empty to use the role's name.")
        .setMaxLength(MAX_LABEL)
    ),
  customIdPrefix: PREFIX,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "You need the Manage Roles permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!interaction.appPermissions?.has(POST_PERMISSIONS)) {
      return interaction.reply({
        content: "I need View Channel, Send Messages and Embed Links in this channel.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const { guild } = interaction;
    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "I need the Manage Roles permission. Add it to my role in Server Settings, Roles.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const role = interaction.options.getRole("role");
    const problem = roleProblem({
      role,
      guildId: guild.id,
      botTopPosition: guild.members.me.roles.highest.position,
      memberTopPosition: interaction.member.roles.highest.position,
      isOwner: guild.ownerId === interaction.user.id,
    });
    if (problem) return interaction.reply({ content: problem, flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setDescription(interaction.options.getString("message")?.replaceAll("\\n", "\n") || defaultPickerMessage(role.id))
      .setColor(role.color || DEFAULT_COLOUR);
    const button = new ButtonBuilder()
      .setCustomId(roleButtonId(role.id))
      .setLabel(interaction.options.getString("button") || role.name.slice(0, MAX_LABEL))
      .setStyle(ButtonStyle.Primary);
    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(button)],
    });
    return interaction.reply({
      content: `Posted the button for <@&${role.id}>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
  async handleComponent(interaction) {
    if (interaction.isButton()) return toggleRole(interaction);
  },
};
