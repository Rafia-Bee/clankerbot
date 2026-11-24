// The /count command: add to, see and rank members' counts on the counters made in /settings.
// Anyone can add, show and see the leaderboard. Taking 1 off and resetting need Manage Server.
//   counterOption  the counter option every subcommand has, which suggests names as you type
//   execute        finds the picked counter and runs the subcommand
//   autocomplete   suggests the server's counter names that match what's typed

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { getStore } = require("../store");
const { choicesFor } = require("../counters/rules");
const {
  addedReply,
  countReply,
  removedReply,
  resetReply,
  noCounterReply,
  leaderboardReply,
} = require("../counters/messages");

const LEADERBOARD_SIZE = 10;
const MAX_AMOUNT = 100;
const ADMIN_ONLY = new Set(["remove", "reset"]);
const NOT_ADMIN = "Only server admins can take from or reset counts.";

function counterOption(option) {
  return option.setName("counter").setDescription("Which counter").setRequired(true).setAutocomplete(true);
}

function userOption(description) {
  return (option) => option.setName("user").setDescription(description).setRequired(true);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("count")
    .setDescription("Add to, see and rank members' counts")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add to a member's count")
        .addStringOption(counterOption)
        .addUserOption(userOption("Who to add to"))
        .addIntegerOption((option) =>
          option.setName("amount").setDescription("How many to add (1 if left empty)").setMinValue(1).setMaxValue(MAX_AMOUNT)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("show").setDescription("See a member's count").addStringOption(counterOption).addUserOption(userOption("Whose count to see"))
    )
    .addSubcommand((sub) =>
      sub.setName("leaderboard").setDescription("See who has the highest counts").addStringOption(counterOption)
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Take 1 off a member's count (admins only)")
        .addStringOption(counterOption)
        .addUserOption(userOption("Who to take 1 off"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Put a member's count back to 0 (admins only)")
        .addStringOption(counterOption)
        .addUserOption(userOption("Whose count to reset"))
    ),
  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    if (ADMIN_ONLY.has(action) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: NOT_ADMIN, flags: MessageFlags.Ephemeral });
    }
    const store = getStore();
    const typed = interaction.options.getString("counter");
    const counter = store.findCounter(interaction.guildId, typed);
    if (!counter) {
      const total = store.listCounters(interaction.guildId).length;
      return interaction.reply({ content: noCounterReply(typed, total), flags: MessageFlags.Ephemeral });
    }

    const reply = (content) => interaction.reply({ content, allowedMentions: { parse: [] } });
    if (action === "leaderboard") return reply(leaderboardReply(counter, store.getLeaderboard(counter.id, LEADERBOARD_SIZE)));

    const userId = interaction.options.getUser("user").id;
    if (action === "add") {
      const amount = interaction.options.getInteger("amount") ?? 1;
      return reply(addedReply(counter, userId, store.addToCount(counter.id, userId, amount), amount));
    }
    if (action === "show") return reply(countReply(counter, userId, store.getCount(counter.id, userId)));
    if (action === "remove") {
      const before = store.getCount(counter.id, userId);
      return reply(removedReply(counter, userId, before, store.takeFromCount(counter.id, userId)));
    }
    store.resetCount(counter.id, userId);
    return reply(resetReply(counter, userId));
  },
  async autocomplete(interaction) {
    const counters = getStore().listCounters(interaction.guildId);
    return interaction.respond(choicesFor(counters, interaction.options.getFocused()));
  },
};
