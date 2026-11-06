// The /ticket-setup screens (main and ticket type) and the pop-ups that fill in the draft.
//   short             cuts text to a length, adding ... when it's cut
//   text              a text box for a pop-up, filled in with the current value
//   label             a pop-up field: a title, a short hint and the input
//   previewEmbed      how the panel will look
//   typeSummary       one ticket type's settings in a few lines
//   mainView          the main screen: preview, ticket types, what's missing, and the buttons
//   typeView          one ticket type's screen with its pop-up buttons
//   panelTextModal    the Panel text pop-up
//   typeBasicsModal   the Basics pop-up (button text, emoji, colour, channel names, delete-after days)
//   typeWhereModal    the Where and who pop-up (categories, staff roles, open limit)
//   typeMessagesModal the Opening messages pop-up (4 messages and which are boxes)

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  CheckboxGroupBuilder,
  CheckboxGroupOptionBuilder,
  EmbedBuilder,
  LabelBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { parseColour } = require("./panel");
const { draftProblems } = require("./draft");

const PREFIX = "tsetup";
const DEFAULT_COLOUR = 0x5865f2;
const MAX_TYPES = 25;
const MESSAGE_BOXES = 4;
const STYLE_NAMES = { primary: "blue", secondary: "grey", success: "green", danger: "red" };
const MAX_PROBLEMS_SHOWN = 10;

const id = (...parts) => [PREFIX, ...parts].join(":");
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

function short(value, max) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function text(customId, { value, style = TextInputStyle.Short, required = false, max }) {
  const input = new TextInputBuilder().setCustomId(customId).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) input.setValue(String(value));
  return input;
}

function label(title, hint) {
  const field = new LabelBuilder().setLabel(title);
  if (hint) field.setDescription(hint);
  return field;
}

function typeName(type, index) {
  return type.label || `Ticket type ${index + 1}`;
}

function previewEmbed(draft) {
  const embed = new EmbedBuilder()
    .setTitle(draft.title || "(no title yet)")
    .setColor(parseColour(draft.colour) ?? DEFAULT_COLOUR);
  if (draft.description) embed.setDescription(short(draft.description, 1000));
  if (draft.image && /^https?:\/\/\S+$/.test(draft.image)) embed.setImage(draft.image);
  return embed;
}

function typeSummary(type) {
  const channel = (value) => (value ? `<#${value}>` : "(not picked)");
  const roles = type.staffRoleIds.map((role) => `<@&${role}>`).join(", ") || "(none picked)";
  const days = type.deleteAfterDays;
  const deleting =
    days === 0 ? "Closed tickets are never deleted." : `Closed tickets deleted after ${days} day${days === 1 ? "" : "s"}.`;
  const messages = type.messages.length
    ? `${plural(type.messages.length, "opening message")}.`
    : "No opening messages (a short default is used).";
  return [
    `Open tickets in ${channel(type.openCategoryId)}, closed in ${channel(type.closedCategoryId)}.`,
    `Staff: ${roles}.`,
    `Up to ${type.openLimit} open per member. ${deleting}`,
    messages,
  ].join("\n");
}

function problemLines(problems) {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).map((problem) => `- ${problem}`);
  if (problems.length > MAX_PROBLEMS_SHOWN) shown.push(`- and ${problems.length - MAX_PROBLEMS_SHOWN} more`);
  return shown.join("\n");
}

function header(note) {
  return note ? `**Ticket panel setup**\n${note}` : "**Ticket panel setup**";
}

function mainView(draft, { note } = {}) {
  const problems = draftProblems(draft);
  const lines = [draft.channelId ? `Posts in <#${draft.channelId}>.` : "Posts in: no channel picked yet."];
  lines.push("", problems.length ? `Still needed:\n${problemLines(problems)}` : "Ready to publish.");
  const summary = new EmbedBuilder().setTitle("Ticket types").setDescription(lines.join("\n"));
  draft.types.forEach((type, i) => {
    const emoji = type.emoji ? `${type.emoji} ` : "";
    summary.addFields({
      name: short(`${i + 1}. ${emoji}${typeName(type, i)} (${STYLE_NAMES[type.style] ?? type.style} button)`, 256),
      value: typeSummary(type),
    });
  });

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id("panel")).setLabel("Panel text").setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(id("add"))
      .setLabel("Add ticket type")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(draft.types.length >= MAX_TYPES),
    new ButtonBuilder()
      .setCustomId(id("publish"))
      .setLabel("Publish")
      .setStyle(ButtonStyle.Success)
      .setDisabled(problems.length > 0),
    new ButtonBuilder().setCustomId(id("cancel")).setLabel("Cancel").setStyle(ButtonStyle.Danger)
  );
  const components = [controls];
  if (draft.types.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(id("edit"))
      .setPlaceholder("Edit a ticket type")
      .addOptions(draft.types.map((type, i) => ({ label: short(`${i + 1}. ${typeName(type, i)}`, 100), value: String(i) })));
    components.push(new ActionRowBuilder().addComponents(select));
  }
  return { content: header(note), embeds: [previewEmbed(draft), summary], components };
}

function typeView(draft, index, { note } = {}) {
  const type = draft.types[index];
  const name = typeName(type, index);
  const emoji = type.emoji ? `${type.emoji} ` : "";
  const messages = type.messages.length
    ? type.messages
        .map((m, i) => `${i + 1}. (${m.kind === "embed" ? "box" : "text"}) ${short(m.content.replace(/\n/g, " "), 200)}`)
        .join("\n")
    : "None yet. A short default is posted instead.";
  const problems = draftProblems(draft).filter((problem) => problem.startsWith(`${name}:`));
  const lines = [
    `**Button:** ${emoji}${type.label || "(no text yet)"} (${STYLE_NAMES[type.style] ?? type.style})`,
    `**Channel names:** \`${type.nameSchema}\``,
    typeSummary(type),
    "",
    `**Opening messages:**\n${messages}`,
  ];
  if (problems.length) lines.push("", `Still needed:\n${problemLines(problems)}`);

  const button = (action, text, style, disabled = false) =>
    new ButtonBuilder().setCustomId(id(action, index)).setLabel(text).setStyle(style).setDisabled(disabled);
  return {
    content: header(note),
    embeds: [new EmbedBuilder().setTitle(short(name, 256)).setDescription(lines.join("\n"))],
    components: [
      new ActionRowBuilder().addComponents(
        button("basics", "Basics", ButtonStyle.Primary),
        button("where", "Where and who", ButtonStyle.Primary),
        button("messages", "Opening messages", ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        button("up", "Move up", ButtonStyle.Secondary, index === 0),
        button("down", "Move down", ButtonStyle.Secondary, index === draft.types.length - 1),
        button("remove", "Remove", ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(id("back")).setLabel("Back").setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function panelTextModal(draft) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true);
  if (draft.channelId) channel.setDefaultChannels(draft.channelId);
  return new ModalBuilder()
    .setCustomId(id("panel-save"))
    .setTitle("Panel text")
    .addLabelComponents(
      label("Title").setTextInputComponent(text("title", { value: draft.title, required: true, max: 256 })),
      label("Description", "Formatting works: **bold**, *italic*, > quote, - list, [link](https://...)").setTextInputComponent(
        text("description", { value: draft.description, style: TextInputStyle.Paragraph, max: 4000 })
      ),
      label("Colour", "Like #3b82f6. Leave empty for Discord blue.").setTextInputComponent(
        text("colour", { value: draft.colour, max: 7 })
      ),
      label("Image link", "Optional. A picture shown in the panel.").setTextInputComponent(
        text("image", { value: draft.image, max: 500 })
      ),
      label("Post the panel in").setChannelSelectMenuComponent(channel)
    );
}

function typeBasicsModal(draft, index) {
  const type = index == null ? null : draft.types[index];
  const style = new StringSelectMenuBuilder()
    .setCustomId("style")
    .setRequired(true)
    .addOptions(
      Object.entries(STYLE_NAMES).map(([value, name]) => ({
        label: name[0].toUpperCase() + name.slice(1),
        value,
        default: (type?.style ?? "primary") === value,
      }))
    );
  return new ModalBuilder()
    .setCustomId(id("basics-save", index ?? "new"))
    .setTitle("Ticket type: basics")
    .addLabelComponents(
      label("Button text").setTextInputComponent(text("label", { value: type?.label, required: true, max: 80 })),
      label("Button emoji", "Optional. One emoji, like 📝").setTextInputComponent(text("emoji", { value: type?.emoji, max: 64 })),
      label("Button colour").setStringSelectMenuComponent(style),
      label("Channel names", "{type} {number} {user} {name}, like {type}-{number}-{user}").setTextInputComponent(
        text("naming", { value: type?.nameSchema ?? "{type}-{number}", required: true, max: 100 })
      ),
      label("Delete closed tickets after (days)", "0 means never").setTextInputComponent(
        text("delete_days", { value: type?.deleteAfterDays ?? 7, required: true, max: 4 })
      )
    );
}

function typeWhereModal(draft, index) {
  const type = draft.types[index];
  const category = (customId, value) => {
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setChannelTypes(ChannelType.GuildCategory)
      .setRequired(true);
    if (value) select.setDefaultChannels(value);
    return select;
  };
  const staff = new RoleSelectMenuBuilder().setCustomId("staff").setMinValues(1).setMaxValues(25).setRequired(true);
  if (type.staffRoleIds.length) staff.setDefaultRoles(...type.staffRoleIds);
  return new ModalBuilder()
    .setCustomId(id("where-save", index))
    .setTitle("Ticket type: where and who")
    .addLabelComponents(
      label("Category for open tickets").setChannelSelectMenuComponent(category("open_category", type.openCategoryId)),
      label("Category for closed tickets", "Can be the same as open").setChannelSelectMenuComponent(
        category("closed_category", type.closedCategoryId)
      ),
      label("Staff roles", "They see these tickets and can close, reopen and delete them").setRoleSelectMenuComponent(staff),
      label("Open tickets per member").setTextInputComponent(
        text("open_limit", { value: type.openLimit, required: true, max: 3 })
      )
    );
}

function typeMessagesModal(draft, index) {
  const type = draft.types[index];
  const boxes = Array.from({ length: MESSAGE_BOXES }, (_, i) =>
    label(
      `Message ${i + 1}`,
      i === 0 ? "{member} pings them, {staff} pings staff, {type} is the button text" : "Optional"
    ).setTextInputComponent(
      text(`message_${i}`, { value: type.messages[i]?.content, style: TextInputStyle.Paragraph, max: 2000 })
    )
  );
  const embeds = new CheckboxGroupBuilder()
    .setCustomId("embeds")
    .setMinValues(0)
    .setMaxValues(MESSAGE_BOXES)
    .setRequired(false)
    .addOptions(
      Array.from({ length: MESSAGE_BOXES }, (_, i) =>
        new CheckboxGroupOptionBuilder()
          .setLabel(`Message ${i + 1}`)
          .setValue(String(i))
          .setDefault(type.messages[i]?.kind === "embed")
      )
    );
  return new ModalBuilder()
    .setCustomId(id("messages-save", index))
    .setTitle("Ticket type: opening messages")
    .addLabelComponents(...boxes, label("Show as a box", "Ticked messages are shown in a coloured box. Pings don't work in boxes.").setCheckboxGroupComponent(embeds));
}

module.exports = { mainView, typeView, panelTextModal, typeBasicsModal, typeWhereModal, typeMessagesModal, MESSAGE_BOXES };
