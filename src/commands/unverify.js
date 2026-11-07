// The /unverify command: removes a member's saved character and their Guild, Trusted, Guest and class roles.
//   execute  unlinks the character, takes the roles away and says what was done

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, escapeMarkdown } = require("discord.js");
const { getVerifyConfig } = require("../verify/config");
const { applyRoles } = require("../verify/member");
const { getStore } = require("../store");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unverify")
    .setDescription("Remove a member's character and their Guild, Trusted, Guest and class roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) => option.setName("user").setDescription("The member").setRequired(true)),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "You need the Manage Roles permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser("user");
    const store = getStore();
    const saved = store.getVerification(user.id);
    if (!saved) {
      return interaction.reply({ content: `${user} hasn't verified.`, flags: MessageFlags.Ephemeral });
    }

    store.removeVerification(user.id);
    const { guildRoleId, trustedRoleId, guestRoleId, classRoles } = getVerifyConfig();
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    let rolesNote = "";
    if (!member) {
      rolesNote = " They're not in the server any more, so there were no roles to remove.";
    } else {
      try {
        const remove = [guildRoleId, trustedRoleId, guestRoleId, ...Object.values(classRoles)];
        await applyRoles(member, { add: [], remove }, "Unverified");
        rolesNote = " Took away their Guild, Trusted, Guest and class roles. Their nickname wasn't changed.";
      } catch (error) {
        console.warn(`Unverify ${user.tag}: ${error.message}`);
        rolesNote =
          " I couldn't remove their roles, so please do that by hand. Check my role is above Guild, Trusted, Guest and the class roles.";
      }
    }
    return interaction.reply({
      content: `Removed **${escapeMarkdown(saved.char_name)}** from ${user}, so that character can be verified again.${rolesNote}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
