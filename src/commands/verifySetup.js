// The /verify-setup command and the Verify button it posts: members type their character name to get roles and a nickname.
//   execute             posts the Verify message in the current channel
//   showVerifyForm      opens the pop-up asking for the character name
//   submitVerification  looks the character up, saves it, gives roles and renames the member
//   handleComponent     sends Verify button clicks and pop-up answers to the right function

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { lookupCharacter } = require("../lookup/lookup");
const { getLookupConfig } = require("../lookup/config");
const { getVerifyConfig } = require("../verify/config");
const { decideVerification, roleChanges, verifyMessage } = require("../verify/rules");
const { applyVerification } = require("../verify/member");
const { getStore } = require("../store");

const PREFIX = "verify";
const START_ID = `${PREFIX}:start`;
const SUBMIT_ID = `${PREFIX}:submit`;
const NAME_FIELD = "name";
const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

const inProgress = new Set();

function defaultDescription() {
  const { legion } = getVerifyConfig();
  return `Click **Verify** and type your AION 2 character name.\n\nMembers of ${legion} get the guild roles. Everyone else gets the Guest role.`;
}

async function showVerifyForm(interaction) {
  const input = new TextInputBuilder()
    .setCustomId(NAME_FIELD)
    .setLabel("Character name")
    .setPlaceholder("Your AION 2 character name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(getLookupConfig().maxNameLength);
  const modal = new ModalBuilder()
    .setCustomId(SUBMIT_ID)
    .setTitle("Verify")
    .addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function submitVerification(interaction) {
  const discordId = interaction.user.id;
  if (inProgress.has(discordId)) {
    return interaction.reply({
      content: "I'm still checking your last answer. Give it a moment.",
      flags: MessageFlags.Ephemeral,
    });
  }
  inProgress.add(discordId);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const typedName = interaction.fields.getTextInputValue(NAME_FIELD).trim();
    const config = getVerifyConfig();
    const { serverName, maxNameLength } = getLookupConfig();
    const store = getStore();

    const result = await lookupCharacter(typedName);
    const claimOwnerId =
      result.status === "found"
        ? store.findClaimOwner({ characterId: result.character.characterId, name: result.character.name })
        : null;
    let decision = decideVerification({ typedName, result, claimOwnerId, discordId, legion: config.legion });
    if (result.status === "unavailable") console.warn(`Verify ${typedName}: every site failed (${result.reason})`);

    let problems = [];
    const changes = roleChanges(decision.outcome, config, decision.character?.className);
    if (changes) {
      const saved = store.saveVerification({
        discordId,
        charName: decision.character?.name ?? decision.nickname,
        characterId: decision.character?.characterId ?? null,
        legion: decision.character?.legion ?? null,
        confirmed: decision.outcome !== "guest_unconfirmed",
      });
      if (saved) {
        problems = await applyVerification(interaction.member, changes, decision.nickname);
      } else {
        decision = { outcome: "taken", character: decision.character };
      }
    }

    let content = verifyMessage(decision, { legion: config.legion, serverName, maxNameLength });
    if (problems.length > 0) {
      console.warn(`Verify ${interaction.user.tag} as ${typedName}: ${problems.join("; ")}`);
      content += "\n\nI couldn't update everything on your profile (roles or nickname). Please tell a mod.";
    }
    return interaction.editReply({ content, allowedMentions: { parse: [] } });
  } finally {
    inProgress.delete(discordId);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify-setup")
    .setDescription("Post the Verify message in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Text above the Verify button (Discord formatting works). Leave empty for the default.")
        .setMaxLength(2000)
    ),
  customIdPrefix: PREFIX,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "You need the Manage Server permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!interaction.appPermissions?.has(POST_PERMISSIONS)) {
      return interaction.reply({
        content: "I need View Channel, Send Messages and Embed Links in this channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("Verify")
      .setDescription(interaction.options.getString("message")?.replaceAll("\\n", "\n") || defaultDescription())
      .setColor(0x8e5cf7);
    const button = new ButtonBuilder().setCustomId(START_ID).setLabel("Verify").setStyle(ButtonStyle.Success);
    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(button)],
    });
    return interaction.reply({ content: "Posted the Verify message.", flags: MessageFlags.Ephemeral });
  },
  async handleComponent(interaction) {
    if (interaction.isButton() && interaction.customId === START_ID) return showVerifyForm(interaction);
    if (interaction.isModalSubmit() && interaction.customId === SUBMIT_ID) return submitVerification(interaction);
  },
};
