// The /ticket-panels command: lists the server's ticket panels, and edits (in the /ticket-setup wizard) or deletes them.
//   categoryCounter  counts the channels in a category, or null when the category is gone
//   startEditing     turns a panel into a draft and opens it in the setup screen
//   deletePanel      marks the panel deleted and removes its message; open tickets keep working
//   execute          shows the list of panels
//   handleComponent  does what a /ticket-panels button or dropdown asked for

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { getStore } = require("../store");
const { panelToDraft } = require("../tickets/draft");
const { listView, panelView, deleteView } = require("../tickets/panelsView");
const { mainView } = require("../tickets/setupView");

const PREFIX = "tpanels";
const NEED_PERMISSION = "You need the Manage Server permission to do this.";

function categoryCounter(guild) {
  return (categoryId) => {
    const category = guild.channels.cache.get(categoryId);
    return category?.type === ChannelType.GuildCategory ? category.children.cache.size : null;
  };
}

function findPanel(guildId, panelId) {
  const panel = getStore().getPanel(panelId);
  return panel && panel.guild_id === guildId && !panel.deleted_at ? panel : null;
}

function startEditing(interaction, panel) {
  const store = getStore();
  const existing = store.getDraft(interaction.user.id, interaction.guildId);
  if (existing && existing.editingPanelId !== panel.id) {
    return interaction.update(
      panelView(panel, categoryCounter(interaction.guild), {
        note: "You have an unfinished /ticket-setup. Finish or cancel it there first, then come back to edit this panel.",
      })
    );
  }
  const draft = existing ?? panelToDraft(panel, panel.types.map((type) => store.getType(type.id)));
  store.saveDraft(interaction.user.id, interaction.guildId, draft);
  const note = existing
    ? "Picking up your unsaved changes. Press Cancel to throw them away."
    : "Change what you like, then press Save changes. The posted panel is updated in place.";
  return interaction.update(mainView(draft, { note }));
}

async function deletePanel(interaction, panel) {
  const store = getStore();
  store.markPanelDeleted(panel.id);
  const channel = interaction.guild.channels.cache.get(panel.channel_id);
  let note = `Deleted **${panel.title}**. Tickets that were already open keep working.`;
  if (panel.message_id) {
    const removed = await channel?.messages
      .delete(panel.message_id)
      .then(() => true)
      .catch(() => false);
    if (!removed) note += " I couldn't remove the panel message, so please delete it by hand. Its buttons won't open tickets any more.";
  }
  return interaction.update(listView(store.listPanels(interaction.guildId), categoryCounter(interaction.guild), { note }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panels")
    .setDescription("List, edit or delete the ticket panels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  customIdPrefix: PREFIX,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: NEED_PERMISSION, flags: MessageFlags.Ephemeral });
    }
    const panels = getStore().listPanels(interaction.guildId);
    return interaction.reply({
      ...listView(panels, categoryCounter(interaction.guild)),
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleComponent(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: NEED_PERMISSION, flags: MessageFlags.Ephemeral });
    }
    const [, action, arg] = interaction.customId.split(":");
    const countOf = categoryCounter(interaction.guild);
    const backToList = (note) => interaction.update(listView(getStore().listPanels(interaction.guildId), countOf, { note }));
    if (action === "back") return backToList();

    const panelId = action === "pick" ? Number(interaction.values[0]) : Number(arg);
    const panel = findPanel(interaction.guildId, panelId);
    if (!panel) return backToList("That panel is gone.");

    switch (action) {
      case "pick":
      case "pick-again":
        return interaction.update(panelView(panel, countOf));
      case "edit":
        return startEditing(interaction, panel);
      case "delete":
        return interaction.update(deleteView(panel));
      case "delete-yes":
        return deletePanel(interaction, panel);
    }
  },
};
