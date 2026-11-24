// The /settings screens for /count counters: the list of counters, one counter's screen, and their pop-ups.
//   countersView            every counter with a list to pick one, plus New counter and Back
//   newCounterModal         the pop-up for naming a new counter
//   counterView             one counter: its words, emoji and leaderboard name, with buttons to change them
//   confirmDeleteView       asks before deleting a counter and its counts
//   addWordsModal           the pop-up for adding trigger words, several at once with ; between them
//   emojiModal              the pop-up for typing the reaction emoji
//   renameModal             the pop-up for the counter's name and leaderboard name
//   botCanUseEmoji          whether the bot can react with an emoji, asking Discord about server emojis added after it started
//   handleCounterComponent  handles every button, list and pop-up on these screens

const {
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { getStore } = require("../store");
const { MAX_COUNTERS, parseCounterName } = require("./rules");
const { MAX_WORDS, addWords, removeWord } = require("./words");
const { parseReactionEmoji, canUseEmoji } = require("./reaction");
const { parseLeaderboardTitle, describeCounter } = require("./messages");

const id = (...parts) => ["settings", "counter", ...parts].join(":");
const COLOR = 0x8e5cf7;

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function countersView(guildId, note = "") {
  const counters = getStore().listCounters(guildId);
  const intro = "Each counter keeps its own count for every member. Anyone can add to one with `/count add`.";
  const list = counters.length ? "" : "There are no counters yet. Click **New counter** to make one.";
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("Counters")
    .setDescription([note, intro, list].filter(Boolean).join("\n\n"))
    .addFields(counters.map((counter) => ({ name: counter.name, value: describeCounter(counter).slice(0, 1024) })));

  const rows = [];
  if (counters.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("open"))
          .setPlaceholder("Change a counter")
          .addOptions(counters.map((counter) => ({ label: counter.name, value: String(counter.id) })))
      )
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      button(id("new"), "New counter", ButtonStyle.Primary).setDisabled(counters.length >= MAX_COUNTERS),
      button("settings:back", "Back")
    )
  );
  return { content: "", embeds: [embed], components: rows };
}

function newCounterModal() {
  const name = new TextInputBuilder().setCustomId("name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50);
  return new ModalBuilder()
    .setCustomId(id("create"))
    .setTitle("New counter")
    .addLabelComponents(
      new LabelBuilder().setLabel("Name").setDescription("Like: Bad words, Raid deaths").setTextInputComponent(name)
    );
}

function counterView(counter, note = "") {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(counter.name)
    .setDescription([note, describeCounter(counter)].filter(Boolean).join("\n\n").slice(0, 4096));

  const rows = [];
  if (counter.words.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("removeword", counter.id))
          .setPlaceholder("Remove a word")
          .addOptions(counter.words.slice(0, MAX_WORDS).map((word) => ({ label: word, value: word })))
      )
    );
  }
  const changes = [
    button(id("addwords", counter.id), "Add words", ButtonStyle.Primary).setDisabled(counter.words.length >= MAX_WORDS),
    button(id("emoji", counter.id), "Change emoji"),
  ];
  if (counter.reaction) changes.push(button(id("resetemoji", counter.id), "Use the default emoji"));
  changes.push(button(id("rename", counter.id), "Rename"));
  rows.push(new ActionRowBuilder().addComponents(changes));
  rows.push(
    new ActionRowBuilder().addComponents(
      button(id("delete", counter.id), "Delete counter", ButtonStyle.Danger),
      button(id("list"), "Back")
    )
  );
  return { content: "", embeds: [embed], components: rows };
}

function confirmDeleteView(counter) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`Delete ${counter.name}?`)
    .setDescription("Everyone's count on this counter is deleted too. This can't be undone.");
  return {
    content: "",
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        button(id("confirmdelete", counter.id), "Yes, delete it", ButtonStyle.Danger),
        button(id("open", counter.id), "Cancel")
      ),
    ],
  };
}

function addWordsModal(counter) {
  const words = new TextInputBuilder().setCustomId("words").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500);
  return new ModalBuilder()
    .setCustomId(id("savewords", counter.id))
    .setTitle("Add trigger words")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Words")
        .setDescription("Put ; between words to add several, like: cat; dog; good game")
        .setTextInputComponent(words)
    );
}

function emojiModal(counter) {
  const emoji = new TextInputBuilder().setCustomId("emoji").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  return new ModalBuilder()
    .setCustomId(id("saveemoji", counter.id))
    .setTitle("Pick the reaction emoji")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Emoji")
        .setDescription("Paste one emoji (Windows key + . opens the picker), or a server emoji as <:name:id>")
        .setTextInputComponent(emoji)
    );
}

function renameModal(counter) {
  const name = new TextInputBuilder()
    .setCustomId("name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setValue(counter.name);
  const title = new TextInputBuilder().setCustomId("title").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);
  if (counter.leaderboardTitle) title.setValue(counter.leaderboardTitle);
  return new ModalBuilder()
    .setCustomId(id("savename", counter.id))
    .setTitle("Rename the counter")
    .addLabelComponents(
      new LabelBuilder().setLabel("Name").setTextInputComponent(name),
      new LabelBuilder()
        .setLabel("Leaderboard name")
        .setDescription(`Like: Naughty List. Leave empty for "<name> leaderboard".`)
        .setTextInputComponent(title)
    );
}

function botCanUseEmoji(interaction, emoji) {
  return canUseEmoji(emoji, {
    known: (emojiId) => interaction.client.emojis.cache.has(emojiId),
    lookUp: (emojiId) => interaction.guild.emojis.fetch(emojiId).then(() => true),
  });
}

function logChange(interaction, what) {
  console.log(`Counter change by ${interaction.user.tag}: ${what}`);
}

async function handleCounterComponent(interaction, action, rawId) {
  const store = getStore();
  const guildId = interaction.guildId;
  const fail = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (action === "list") return interaction.update(countersView(guildId));
  if (action === "new") return interaction.showModal(newCounterModal());
  if (action === "create") {
    if (store.listCounters(guildId).length >= MAX_COUNTERS) return fail(`A server can have up to ${MAX_COUNTERS} counters.`);
    let name;
    try {
      name = parseCounterName(interaction.fields.getTextInputValue("name"));
    } catch (error) {
      return fail(error.message);
    }
    const counter = store.createCounter(guildId, name);
    if (!counter) return fail(`There's already a counter called **${name}**.`);
    logChange(interaction, `made "${name}"`);
    return interaction.update(counterView(counter, "Made. Add trigger words if chat should count too."));
  }

  const counterId = Number(rawId ?? interaction.values?.[0]);
  const counter = store.getCounter(guildId, counterId);
  if (!counter) return interaction.update(countersView(guildId, "That counter was deleted."));
  const saveAndShow = (changes, what, note = "Saved.") => {
    store.updateCounter(guildId, counter.id, changes);
    logChange(interaction, `${counter.name}: ${what}`);
    return interaction.update(counterView(store.getCounter(guildId, counter.id), note));
  };

  if (action === "open") return interaction.update(counterView(counter));
  if (action === "addwords") return interaction.showModal(addWordsModal(counter));
  if (action === "emoji") return interaction.showModal(emojiModal(counter));
  if (action === "rename") return interaction.showModal(renameModal(counter));
  if (action === "delete") return interaction.update(confirmDeleteView(counter));
  if (action === "confirmdelete") {
    store.deleteCounter(guildId, counter.id);
    logChange(interaction, `deleted "${counter.name}"`);
    return interaction.update(countersView(guildId, `Deleted **${counter.name}**.`));
  }
  if (action === "removeword") {
    return saveAndShow({ words: removeWord(counter.words, interaction.values[0]) }, `removed word "${interaction.values[0]}"`);
  }
  if (action === "resetemoji") return saveAndShow({ reaction: null }, "emoji back to the default", "Back to the default emoji.");
  if (action === "savewords") {
    let words;
    try {
      words = addWords(counter.words, interaction.fields.getTextInputValue("words"));
    } catch (error) {
      return fail(error.message);
    }
    return saveAndShow({ words }, `words now ${words.join(", ")}`);
  }
  if (action === "saveemoji") {
    let emoji;
    try {
      emoji = parseReactionEmoji(interaction.fields.getTextInputValue("emoji"));
    } catch (error) {
      return fail(error.message);
    }
    if (!(await botCanUseEmoji(interaction, emoji))) return fail("I can only use server emojis from servers I'm in.");
    return saveAndShow({ reaction: emoji }, `emoji now ${emoji}`);
  }
  if (action === "savename") {
    let name;
    let leaderboardTitle;
    try {
      name = parseCounterName(interaction.fields.getTextInputValue("name"));
      leaderboardTitle = parseLeaderboardTitle(interaction.fields.getTextInputValue("title"));
    } catch (error) {
      return fail(error.message);
    }
    const taken = store.findCounter(guildId, name);
    if (taken && taken.id !== counter.id) return fail(`There's already a counter called **${taken.name}**.`);
    return saveAndShow({ name, leaderboardTitle }, `renamed to "${name}", leaderboard "${leaderboardTitle ?? "default"}"`);
  }
}

module.exports = { countersView, confirmDeleteView, botCanUseEmoji, handleCounterComponent };
