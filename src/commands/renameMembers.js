// The /rename-members command: looks saved characters up again and sets nicknames to the current in-game spelling.
//   renameOne   renames one member and replies straight away
//   renameAll   renames every verified member in the background and posts a summary in the channel
//   execute     checks permissions and picks one or all

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, escapeMarkdown } = require("discord.js");
const { lookupCharacter } = require("../lookup/lookup");
const { getLookupConfig } = require("../lookup/config");
const { renameDecision, renameSummary } = require("../verify/rename");
const { setNickname } = require("../verify/member");
const { getStore } = require("../store");

const REASON = "Renamed to in-game name";

let running = false;

async function renameMember(member, saved) {
  const result = await lookupCharacter(saved.char_name, { fresh: true });
  const decision = renameDecision(saved, result);
  if (decision.action !== "rename") return { action: decision.action };
  const outcome = await setNickname(member, decision.nickname, REASON);
  if (decision.nickname !== saved.char_name) getStore().updateCharacterName(member.id, decision.nickname);
  return { action: outcome, nickname: decision.nickname };
}

async function renameOne(interaction, user) {
  const saved = getStore().getVerification(user.id);
  if (!saved) {
    return interaction.reply({ content: `${user} hasn't verified.`, flags: MessageFlags.Ephemeral });
  }
  if (!saved.confirmed) {
    return interaction.reply({
      content: `${user} verified as **${escapeMarkdown(saved.char_name)}**, which wasn't found on ${getLookupConfig().serverName}, so there's nothing to look up.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.editReply(`${user} isn't in the server any more.`);

  const name = `**${escapeMarkdown(saved.char_name)}**`;
  const messages = {
    renamed: (nickname) => `Renamed ${user} to **${escapeMarkdown(nickname)}**.`,
    unchanged: () => `${user} is already called **${escapeMarkdown(member.nickname)}**.`,
    cannot: () => `I can't rename ${user}: they're the server owner, or their role is above mine.`,
    not_found: () => `I couldn't find ${name} in game any more (renamed or deleted?). ${user} needs to verify again.`,
    try_later: () => "The lookup sites didn't answer. Try again in a few minutes.",
  };
  const { action, nickname } = await renameMember(member, saved);
  return interaction.editReply(messages[action](nickname));
}

async function renameAll(interaction) {
  if (running) {
    return interaction.reply({ content: "A rename is already running.", flags: MessageFlags.Ephemeral });
  }
  const rows = getStore().listConfirmedVerifications();
  if (rows.length === 0) {
    return interaction.reply({ content: "Nobody has verified yet.", flags: MessageFlags.Ephemeral });
  }

  const minutes = Math.max(1, Math.ceil((rows.length * getLookupConfig().aion2index.minRequestGapMs) / 60_000));
  await interaction.reply({
    content: `Renaming ${rows.length} members. This takes about ${minutes} minute${minutes === 1 ? "" : "s"}. I'll post the results in this channel when it's done.`,
    flags: MessageFlags.Ephemeral,
  });

  running = true;
  const totals = { renamed: [], unchanged: 0, notFound: [], cannotRename: [], tryLater: [], left: 0 };
  try {
    for (const saved of rows) {
      const member = await interaction.guild.members.fetch(saved.discord_id).catch(() => null);
      if (!member) {
        totals.left += 1;
        continue;
      }
      try {
        const { action } = await renameMember(member, saved);
        if (action === "renamed") totals.renamed.push(`${member}`);
        else if (action === "unchanged") totals.unchanged += 1;
        else if (action === "cannot") totals.cannotRename.push(`${member}`);
        else if (action === "not_found") totals.notFound.push({ member: `${member}`, name: escapeMarkdown(saved.char_name) });
        else totals.tryLater.push(`${member}`);
      } catch (error) {
        console.warn(`Rename ${saved.discord_id}: ${error.message}`);
        totals.tryLater.push(`${member}`);
      }
    }
    await interaction.channel
      .send({ content: renameSummary(totals), allowedMentions: { parse: [] } })
      .catch((error) => console.warn(`Couldn't post the rename summary: ${error.message}`));
  } finally {
    running = false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rename-members")
    .setDescription("Set nicknames to the current in-game names of verified members")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((option) =>
      option.setName("user").setDescription("Just this member. Leave empty to rename everyone.")
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({
        content: "You need the Manage Nicknames permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const user = interaction.options.getUser("user");
    return user ? renameOne(interaction, user) : renameAll(interaction);
  },
};
