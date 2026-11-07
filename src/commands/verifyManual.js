// The /verify-manual command: a mod verifies a member by hand with a character name, optionally picking the roles.
//   execute  looks the character up, saves it for the member, gives roles, renames them and tells the mod what happened

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { lookupCharacter } = require("../lookup/lookup");
const { getLookupConfig } = require("../lookup/config");
const { getVerifyConfig } = require("../verify/config");
const { roleChanges } = require("../verify/rules");
const { decideManual, manualMessage } = require("../verify/manual");
const { applyVerification } = require("../verify/member");
const { getStore } = require("../store");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify-manual")
    .setDescription("Verify a member by hand with their character name")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) => option.setName("user").setDescription("The member").setRequired(true))
    .addStringOption((option) =>
      option.setName("name").setDescription("Their character name").setRequired(true).setMaxLength(64)
    )
    .addStringOption((option) =>
      option
        .setName("roles")
        .setDescription("Which roles to give (default: from their legion)")
        .addChoices(
          { name: "Auto (from their legion)", value: "auto" },
          { name: "Guild and Trusted", value: "guild" },
          { name: "Guest", value: "guest" }
        )
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "You need the Manage Roles permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("user");
    const typedName = interaction.options.getString("name").trim();
    const roles = interaction.options.getString("roles") ?? "auto";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.editReply(`${user} isn't in the server.`);

    const config = getVerifyConfig();
    const { serverName, maxNameLength } = getLookupConfig();
    const store = getStore();
    const result = await lookupCharacter(typedName);
    const ownerOf = (character) =>
      store.findClaimOwner({ characterId: character.characterId, name: character.name });
    const claimOwnerId = result.status === "found" ? ownerOf(result.character) : null;
    let decision = decideManual({
      typedName,
      result,
      roles,
      claimOwnerId,
      discordId: member.id,
      legion: config.legion,
    });

    let problems = [];
    const changes = roleChanges(decision.outcome, config, decision.character?.className);
    if (changes) {
      const saved = store.saveVerification({
        discordId: member.id,
        charName: decision.character?.name ?? decision.nickname,
        characterId: decision.character?.characterId ?? null,
        legion: decision.character?.legion ?? null,
        confirmed: decision.confirmed,
      });
      if (saved) {
        problems = await applyVerification(member, changes, decision.nickname);
      } else {
        decision = { outcome: "taken", character: decision.character, ownerId: ownerOf(decision.character) };
      }
    }

    let content = manualMessage(decision, { member: `${member}`, legion: config.legion, serverName, maxNameLength });
    if (problems.length > 0) content += `\n\nI couldn't update everything: ${problems.join("; ")}`;
    return interaction.editReply({ content, allowedMentions: { parse: [] } });
  },
};
