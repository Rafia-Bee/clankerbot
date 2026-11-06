// Checks a ticket panel's settings and builds the panel message with one button per ticket type.
//   idError           what's wrong with a Discord ID setting (explains missing quotes), or null if it's fine
//   parseColour       reads a colour like #3b82f6 into a number
//   checkType         checks one ticket type, adding its problems to the list and filling in defaults
//   checkPanelConfig  checks a whole panel and returns its problems and the panel with defaults filled in
//   buildPanelMessage the embed and button rows for a saved panel

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { slugify } = require("./naming");
const { ticketId } = require("./ids");

const DEFAULT_COLOUR = 0x5865f2;
const STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};
const MESSAGE_LIMITS = { text: 2000, embed: 4000 };
const BUTTONS_PER_ROW = 5;

const isDiscordId = (value) => typeof value === "string" && /^\d{17,20}$/.test(value);
const QUOTES_NOTE = "Discord IDs are too long to write without them.";

function idError(value, where) {
  if (typeof value === "number") return `${where} must be in quotes, like "123456789012345678". ${QUOTES_NOTE}`;
  return isDiscordId(value) ? null : `${where} must be a Discord ID`;
}
const isText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const isWholeNumber = (value, min) => Number.isInteger(value) && value >= min;

function parseColour(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value ?? "").trim());
  return match ? parseInt(match[1], 16) : null;
}

function checkType(type, index, errors) {
  const at = `types[${index}]`;
  const t = type ?? {};
  if (!isText(t.label, 80)) errors.push(`${at}.label is required (up to 80 characters)`);
  const style = t.style ?? "primary";
  if (!STYLES[style]) errors.push(`${at}.style must be primary, secondary, success or danger`);
  const nameSchema = t.nameSchema ?? "{type}-{number}";
  if (!isText(nameSchema, 100)) errors.push(`${at}.nameSchema must be text up to 100 characters`);
  for (const key of ["openCategoryId", "closedCategoryId"]) {
    const error = idError(t[key], `${at}.${key}`);
    if (error) errors.push(error);
  }
  const staffRoleIds = Array.isArray(t.staffRoleIds) ? t.staffRoleIds : [];
  if (staffRoleIds.some((id) => typeof id === "number")) {
    errors.push(`${at}.staffRoleIds must be in quotes, like ["123456789012345678"]. ${QUOTES_NOTE}`);
  } else if (staffRoleIds.length === 0 || !staffRoleIds.every(isDiscordId)) {
    errors.push(`${at}.staffRoleIds needs at least one role ID`);
  }
  const openLimit = t.openLimit ?? 1;
  if (!isWholeNumber(openLimit, 1)) errors.push(`${at}.openLimit must be a whole number of 1 or more`);
  const deleteAfterDays = t.deleteAfterDays ?? 7;
  if (!isWholeNumber(deleteAfterDays, 0)) errors.push(`${at}.deleteAfterDays must be a whole number of 0 or more`);

  const messages = Array.isArray(t.messages) ? t.messages : [];
  if (messages.length > 5) {
    errors.push(`${at}.messages can have at most 5 messages`);
  } else {
    messages.forEach((message, i) => {
      const where = `${at}.messages[${i}]`;
      if (!MESSAGE_LIMITS[message?.kind]) errors.push(`${where}.kind must be text or embed`);
      if (!isText(message?.content, MESSAGE_LIMITS[message?.kind] ?? MESSAGE_LIMITS.text)) {
        errors.push(`${where}.content is required (up to 2000 characters for text, 4000 for embed)`);
      }
    });
  }

  return {
    ...(Number.isInteger(t.id) ? { id: t.id } : {}),
    label: typeof t.label === "string" ? t.label.trim() : t.label,
    slug: slugify(String(t.label ?? "")) || "ticket",
    emoji: t.emoji || null,
    style,
    nameSchema,
    openCategoryId: t.openCategoryId,
    closedCategoryId: t.closedCategoryId,
    staffRoleIds,
    openLimit,
    deleteAfterDays,
    messages: messages.map(({ kind, content }) => ({ kind, content })),
  };
}

function checkPanelConfig(config) {
  const errors = [];
  const c = config ?? {};
  const channelError = idError(c.channelId, "channelId");
  if (channelError) errors.push(channelError);
  if (!isText(c.title, 256)) errors.push("title is required (up to 256 characters)");
  const description = c.description ?? "";
  if (typeof description !== "string" || description.length > 4000) {
    errors.push("description can be at most 4000 characters");
  }
  const colour = c.colour == null ? DEFAULT_COLOUR : parseColour(c.colour);
  if (colour == null) errors.push("colour must look like #3b82f6");
  const image = c.image || null;
  if (image && !/^https?:\/\/\S+$/.test(image)) errors.push("image must be a link starting with https://");

  const types = Array.isArray(c.types) ? c.types : [];
  if (types.length === 0 || types.length > 25) errors.push("types needs 1 to 25 ticket types");
  const checkedTypes = types.map((type, index) => checkType(type, index, errors));

  return {
    errors,
    panel: { channelId: c.channelId, title: c.title, description, colour, image, types: checkedTypes },
  };
}

function buildPanelMessage(panel) {
  const embed = new EmbedBuilder().setTitle(panel.title).setColor(panel.colour);
  if (panel.description) embed.setDescription(panel.description);
  if (panel.image) embed.setImage(panel.image);

  const buttons = panel.types.map((type) => {
    const button = new ButtonBuilder()
      .setCustomId(ticketId("open", panel.id, type.id))
      .setLabel(type.label)
      .setStyle(STYLES[type.style] ?? ButtonStyle.Primary);
    if (type.emoji) button.setEmoji(type.emoji);
    return button;
  });
  const components = [];
  for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + BUTTONS_PER_ROW)));
  }
  return { embeds: [embed], components };
}

module.exports = { parseColour, checkPanelConfig, buildPanelMessage };
