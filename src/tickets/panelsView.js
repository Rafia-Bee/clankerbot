// The /ticket-panels screens: the list of panels, one panel, and the "are you sure" before deleting.
//   panelLink    a link to the posted panel message, or a note that it's missing
//   fillLines    how full each ticket type's categories are, like "Apply: open 12 of 50, closed 3 of 50"
//   listView     every panel with its link and category counts, and a dropdown to pick one
//   panelView    one panel with Edit, Delete and Back
//   deleteView   asks before deleting a panel

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");

const PREFIX = "tpanels";
const CATEGORY_LIMIT = 50;
const MAX_LISTED = 25;

const id = (...parts) => [PREFIX, ...parts].join(":");
const short = (value, max) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

function panelLink(panel) {
  if (!panel.message_id) return `In <#${panel.channel_id}> (the panel message is missing)`;
  const url = `https://discord.com/channels/${panel.guild_id}/${panel.channel_id}/${panel.message_id}`;
  return `In <#${panel.channel_id}> ([go to panel](${url}))`;
}

function fillLines(panel, countOf) {
  const part = (which, categoryId) => {
    const count = countOf(categoryId);
    return count == null ? `${which} category missing` : `${which} ${count} of ${CATEGORY_LIMIT}`;
  };
  return panel.types
    .map((type) =>
      type.open_category_id === type.closed_category_id
        ? `${type.label}: ${part("open and closed", type.open_category_id)}`
        : `${type.label}: ${part("open", type.open_category_id)}, ${part("closed", type.closed_category_id)}`
    )
    .join("\n");
}

function details(panel, countOf) {
  return short(`${panelLink(panel)}\n${fillLines(panel, countOf)}`, 1024);
}

function header(note) {
  return note ? `**Ticket panels**\n${note}` : "**Ticket panels**";
}

function listView(panels, countOf, { note } = {}) {
  const embed = new EmbedBuilder().setTitle("Ticket panels");
  if (panels.length === 0) {
    embed.setDescription("No ticket panels yet. Make one with /ticket-setup.");
    return { content: header(note), embeds: [embed], components: [] };
  }
  const listed = panels.slice(0, MAX_LISTED);
  embed.setDescription("Pick a panel below to edit or delete it.");
  for (const panel of listed) {
    embed.addFields({ name: short(`#${panel.id} ${panel.title}`, 256), value: details(panel, countOf) });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(id("pick"))
    .setPlaceholder("Pick a panel")
    .addOptions(listed.map((panel) => ({ label: short(`#${panel.id} ${panel.title}`, 100), value: String(panel.id) })));
  return { content: header(note), embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function panelView(panel, countOf, { note } = {}) {
  const embed = new EmbedBuilder().setTitle(short(`#${panel.id} ${panel.title}`, 256)).setDescription(details(panel, countOf));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id("edit", panel.id)).setLabel("Edit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id("delete", panel.id)).setLabel("Delete").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id("back")).setLabel("Back").setStyle(ButtonStyle.Secondary)
  );
  return { content: header(note), embeds: [embed], components: [buttons] };
}

function deleteView(panel) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id("delete-yes", panel.id)).setLabel("Yes, delete it").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id("pick-again", panel.id)).setLabel("Back").setStyle(ButtonStyle.Secondary)
  );
  return {
    content: `Delete **${panel.title}**? The panel message is removed and nobody can open new tickets from it. Tickets that are already open keep working.`,
    embeds: [],
    components: [buttons],
  };
}

module.exports = { listView, panelView, deleteView };
