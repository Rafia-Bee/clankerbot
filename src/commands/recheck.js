// The /recheck command: looks saved characters up again, fixes nicknames, and moves members between guild and guest roles.
//   recheckMember  looks one member's character up and updates their roles, nickname and saved character
//   recheckOne     rechecks one member and replies straight away
//   recheckAll     rechecks every verified member in the background and posts a summary in the channel
//   execute        checks permissions and setup, and picks one or all

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, escapeMarkdown } = require("discord.js");
const { lookupCharacter } = require("../lookup/lookup");
const { getLookupConfig } = require("../lookup/config");
const { getVerifyConfig, missingRoles } = require("../verify/config");
const { roleChanges } = require("../verify/rules");
const { recheckDecision, rolesMove, recheckMessage, recheckSummary } = require("../verify/recheck");
const { setNickname, applyRoles, fetchFreshMember } = require("../verify/member");
const { getStore } = require("../store");

const REASON = "Recheck: in-game name and legion";

let running = false;

async function recheckMember(member, saved) {
  const config = getVerifyConfig();
  const result = await lookupCharacter(saved.char_name, { fresh: true });
  const decision = recheckDecision(saved, result, { legion: config.legion });
  if (decision.action !== "update") return decision;

  const move = rolesMove(decision.outcome, (id) => member.roles.cache.has(id), config);
  let roleProblem = false;
  try {
    await applyRoles(member, roleChanges(decision.outcome, config, decision.character.className), REASON);
  } catch (error) {
    console.warn(`Recheck ${saved.discord_id} roles: ${error.message}`);
    roleProblem = true;
  }

  let nicknameResult;
  try {
    nicknameResult = await setNickname(member, decision.nickname, REASON);
  } catch (error) {
    console.warn(`Recheck ${saved.discord_id} nickname: ${error.message}`);
    nicknameResult = "cannot";
  }

  getStore().updateCharacter(member.id, { name: decision.character.name, legion: decision.character.legion });
  return { ...decision, move: roleProblem ? null : move, roleProblem, nicknameResult };
}

async function recheckOne(interaction, user) {
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
  const member = await fetchFreshMember(interaction.guild, user.id);
  if (!member) return interaction.editReply(`${user} isn't in the server any more.`);

  const outcome = await recheckMember(member, saved);
  return interaction.editReply(
    recheckMessage(outcome, { user: `${user}`, legion: getVerifyConfig().legion, name: saved.char_name })
  );
}

function secondsPerLookup() {
  const lookup = getLookupConfig();
  return lookup[lookup.sources[0]].minRequestGapMs / 1000;
}

async function recheckAll(interaction) {
  if (running) {
    return interaction.reply({ content: "A recheck is already running.", flags: MessageFlags.Ephemeral });
  }
  const rows = getStore().listConfirmedVerifications();
  if (rows.length === 0) {
    return interaction.reply({ content: "Nobody has verified yet.", flags: MessageFlags.Ephemeral });
  }

  const minutes = Math.max(1, Math.ceil((rows.length * secondsPerLookup()) / 60));
  await interaction.reply({
    content: `Rechecking ${rows.length} members. This takes about ${minutes} minute${minutes === 1 ? "" : "s"}. I'll post the results in this channel when it's done.`,
    flags: MessageFlags.Ephemeral,
  });

  running = true;
  const totals = {
    renamed: [],
    toGuild: [],
    toGuest: [],
    keptByMod: [],
    unchanged: 0,
    notFound: [],
    cannotRename: [],
    roleProblems: [],
    tryLater: [],
    left: 0,
  };
  try {
    for (const saved of rows) {
      const member = await fetchFreshMember(interaction.guild, saved.discord_id);
      if (!member) {
        totals.left += 1;
        continue;
      }
      const mention = `${member}`;
      try {
        const outcome = await recheckMember(member, saved);
        if (outcome.action === "not_found") {
          totals.notFound.push({ member: mention, name: escapeMarkdown(saved.char_name) });
          continue;
        }
        if (outcome.action !== "update") {
          totals.tryLater.push(mention);
          continue;
        }
        if (outcome.nicknameResult === "renamed") totals.renamed.push(mention);
        if (outcome.nicknameResult === "cannot") totals.cannotRename.push(mention);
        if (outcome.move === "guild") totals.toGuild.push(mention);
        if (outcome.move === "guest") totals.toGuest.push(mention);
        if (outcome.roleProblem) totals.roleProblems.push(mention);
        if (outcome.keptByMod) totals.keptByMod.push(mention);
        if (outcome.nicknameResult === "unchanged" && !outcome.move && !outcome.roleProblem) totals.unchanged += 1;
      } catch (error) {
        console.warn(`Recheck ${saved.discord_id}: ${error.message}`);
        totals.tryLater.push(mention);
      }
    }
    await interaction.channel
      .send({ content: recheckSummary(totals, { legion: getVerifyConfig().legion }), allowedMentions: { parse: [] } })
      .catch((error) => console.warn(`Couldn't post the recheck summary: ${error.message}`));
  } finally {
    running = false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recheck")
    .setDescription("Look verified members up again: fix nicknames and move them between guild and guest roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName("user").setDescription("Just this member. Leave empty to recheck everyone.")
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: "You need the Manage Roles permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const missing = missingRoles();
    if (missing.length > 0) {
      return interaction.reply({
        content: `Verification isn't set up yet. Missing: ${missing.join(", ")}. A server admin can pick them with /settings.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const user = interaction.options.getUser("user");
    return user ? recheckOne(interaction, user) : recheckAll(interaction);
  },
};
