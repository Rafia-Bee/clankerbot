// The /counter command: make, change and delete /count counters by typing, instead of using the /settings menu. Manage Server only.
//   counterOption  the counter option for edit and delete, which suggests names as you type
//   readOptions    the typed name, words, emoji and leaderboard name
//   changesFrom    the changes those options make, or the mistake in them
//   emojiProblem   why the bot can't use the typed emoji, or null when it can
//   create         makes a counter with its name and, if filled in, its words, emoji and leaderboard name
//   edit           changes only the parts of a counter that were filled in
//   remove         asks with a button before deleting a counter (the same one the /settings menu uses)
//   execute        checks the person is an admin and runs the subcommand
//   autocomplete   suggests the server's counter names that match what's typed

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { getStore } = require("../store");
const { MAX_COUNTERS, choicesFor, counterChanges } = require("../counters/rules");
const { describeCounter, noCounterReply } = require("../counters/messages");
const { confirmDeleteView, botCanUseEmoji } = require("../counters/settingsScreens");

const NOT_ADMIN = "Only server admins can change counters.";
const EMOJI_HELP = "One emoji, or a server emoji as <:name:id>";
const WORDS_HELP = "Put ; between words, like: cat; dog; good game";

function counterOption(option) {
  return option.setName("counter").setDescription("Which counter").setRequired(true).setAutocomplete(true);
}

function readOptions(interaction) {
  return {
    name: interaction.options.getString("name"),
    addWords: interaction.options.getString("words") ?? interaction.options.getString("add-words"),
    removeWords: interaction.options.getString("remove-words"),
    emoji: interaction.options.getString("emoji"),
    leaderboard: interaction.options.getString("leaderboard"),
  };
}

function changesFrom(counter, interaction) {
  try {
    return { changes: counterChanges(counter, readOptions(interaction)) };
  } catch (error) {
    return { mistake: error.message };
  }
}

function logChange(interaction, what) {
  console.log(`Counter change by ${interaction.user.tag}: ${what}`);
}

async function emojiProblem(interaction, changes) {
  if (!changes.reaction || (await botCanUseEmoji(interaction, changes.reaction))) return null;
  return "I can only use server emojis from servers I'm in.";
}

async function create(interaction, answer) {
  const store = getStore();
  if (store.listCounters(interaction.guildId).length >= MAX_COUNTERS) {
    return answer(`A server can have up to ${MAX_COUNTERS} counters.`);
  }
  const { changes, mistake } = changesFrom({ words: [] }, interaction);
  if (mistake) return answer(mistake);
  const problem = await emojiProblem(interaction, changes);
  if (problem) return answer(problem);
  const counter = store.createCounter(interaction.guildId, changes.name);
  if (!counter) return answer(`There's already a counter called **${changes.name}**.`);
  store.updateCounter(interaction.guildId, counter.id, changes);
  logChange(interaction, `made "${changes.name}"`);
  const saved = store.getCounter(interaction.guildId, counter.id);
  return answer(`Made **${saved.name}**.\n\n${describeCounter(saved)}`);
}

async function edit(interaction, counter, answer) {
  const store = getStore();
  const { changes, mistake } = changesFrom(counter, interaction);
  if (mistake) return answer(mistake);
  if (Object.keys(changes).length === 0) return answer("Fill in at least one thing to change.");
  if (changes.name) {
    const taken = store.findCounter(interaction.guildId, changes.name);
    if (taken && taken.id !== counter.id) return answer(`There's already a counter called **${taken.name}**.`);
  }
  const problem = await emojiProblem(interaction, changes);
  if (problem) return answer(problem);
  store.updateCounter(interaction.guildId, counter.id, changes);
  logChange(interaction, `${counter.name}: changed ${Object.keys(changes).join(", ")}`);
  const saved = store.getCounter(interaction.guildId, counter.id);
  return answer(`Saved **${saved.name}**.\n\n${describeCounter(saved)}`);
}

function remove(interaction, counter) {
  return interaction.reply({ ...confirmDeleteView(counter), flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("counter")
    .setDescription("Make, change and delete the /count counters")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Make a new counter")
        .addStringOption((o) => o.setName("name").setDescription("Like: Bad words, Raid deaths").setRequired(true).setMaxLength(50))
        .addStringOption((o) => o.setName("words").setDescription(`Trigger words. ${WORDS_HELP}`).setMaxLength(1500))
        .addStringOption((o) => o.setName("emoji").setDescription(EMOJI_HELP).setMaxLength(100))
        .addStringOption((o) => o.setName("leaderboard").setDescription("The leaderboard's name, like: Naughty List").setMaxLength(100))
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Change a counter. Only what you fill in changes")
        .addStringOption(counterOption)
        .addStringOption((o) => o.setName("name").setDescription("A new name").setMaxLength(50))
        .addStringOption((o) => o.setName("add-words").setDescription(`Trigger words to add. ${WORDS_HELP}`).setMaxLength(1500))
        .addStringOption((o) => o.setName("remove-words").setDescription(`Trigger words to remove. ${WORDS_HELP}`).setMaxLength(1500))
        .addStringOption((o) => o.setName("emoji").setDescription(EMOJI_HELP).setMaxLength(100))
        .addStringOption((o) => o.setName("leaderboard").setDescription("The leaderboard's name, like: Naughty List").setMaxLength(100))
    )
    .addSubcommand((sub) =>
      sub.setName("delete").setDescription("Delete a counter and everyone's count on it").addStringOption(counterOption)
    ),
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: NOT_ADMIN, flags: MessageFlags.Ephemeral });
    }
    const answer = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    const action = interaction.options.getSubcommand();
    if (action === "create") return create(interaction, answer);
    const store = getStore();
    const typed = interaction.options.getString("counter");
    const counter = store.findCounter(interaction.guildId, typed);
    if (!counter) return answer(noCounterReply(typed, store.listCounters(interaction.guildId).length));
    if (action === "edit") return edit(interaction, counter, answer);
    return remove(interaction, counter);
  },
  async autocomplete(interaction) {
    const counters = getStore().listCounters(interaction.guildId);
    return interaction.respond(choicesFor(counters, interaction.options.getFocused()));
  },
};
