// What happens when someone presses a ticket button: opening a ticket, and Close, Reopen and Delete inside one.
//   isStaff              whether a member has one of the type's staff roles, or is an Administrator
//   controls             the button row for a ticket's status
//   toOverwrite          turns an allow/deny list into what Discord's permission editor expects
//   moveTo               moves a ticket channel to a category, or explains why it stayed put
//   openTicket           creates the ticket channel and posts the opening messages
//   confirm              asks "Are you sure?" with a button only the clicker sees
//   close                moves the ticket to the closed category and makes it read-only for the member
//   reopen               moves it back to the open category and lets the member type again
//   remove               deletes the ticket channel
//   handleTicketComponent  sends each ticket button to the right function

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
} = require("discord.js");
const { getStore } = require("../store");
const { ticketId, parseTicketId } = require("./ids");
const { channelName } = require("./naming");
const { buildOpeningMessages } = require("./messages");
const { canOpen, canUse, transitionError, memberAccess, isCategoryFull } = require("./rules");

const STAFF_ALLOW = ["ViewChannel", "ReadMessageHistory", "SendMessages", "AddReactions", "AttachFiles", "EmbedLinks"];
const BOT_ALLOW = ["ViewChannel", "ReadMessageHistory", "SendMessages", "EmbedLinks", "ManageChannels"];

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

function isStaff(member, type) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    type.staffRoleIds.some((id) => member.roles.cache.has(id))
  );
}

function controls(status, id) {
  const button = (action, label, style) =>
    new ButtonBuilder().setCustomId(ticketId(action, id)).setLabel(label).setStyle(style);
  const first =
    status === "closed" ? button("reopen", "Reopen", ButtonStyle.Success) : button("close", "Close", ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(first, button("delete", "Delete", ButtonStyle.Danger));
}

function toOverwrite({ allow, deny }) {
  return Object.fromEntries([...allow.map((flag) => [flag, true]), ...deny.map((flag) => [flag, false])]);
}

async function moveTo(channel, categoryId, which) {
  if (channel.parentId === categoryId) return "";
  const category = channel.guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return ` The ${which} category is missing, so the channel stayed where it is.`;
  }
  if (isCategoryFull(category.children.cache.size)) {
    return ` The ${which} category is full (50 channels), so the channel stayed where it is.`;
  }
  try {
    await channel.setParent(categoryId, { lockPermissions: false });
    return "";
  } catch (error) {
    console.warn(`Couldn't move ticket ${channel.id}: ${error.message}`);
    return ` I couldn't move the channel to the ${which} category.`;
  }
}

async function openTicket(interaction, panelId, typeId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const store = getStore();
  const { guild, user, member } = interaction;
  const type = store.getType(typeId);
  if (!canOpen(type) || type.panel_id !== panelId) {
    return interaction.editReply("This ticket button doesn't work any more. Please tell a staff member.");
  }

  const active = store.activeTickets(typeId, user.id);
  if (active.length >= type.open_limit) {
    const channels = active.map((ticket) => `<#${ticket.channel_id}>`).join(", ");
    return interaction.editReply(`You already have an open **${type.label}** ticket: ${channels}`);
  }

  const category = guild.channels.cache.get(type.open_category_id);
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.warn(`Ticket type ${typeId}: open category ${type.open_category_id} is missing`);
    return interaction.editReply("The ticket category is missing. Please tell a staff member.");
  }
  if (isCategoryFull(category.children.cache.size)) {
    return interaction.editReply("Tickets are full right now, please message a staff member.");
  }

  const staffRoleIds = type.staffRoleIds.filter((id) => guild.roles.cache.has(id));
  const number = store.nextTicketNumber(typeId);
  const channel = await guild.channels.create({
    name: channelName(type.name_schema, {
      type: type.slug,
      number,
      username: user.username,
      displayName: member.displayName,
    }),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: ["ViewChannel"] },
      { id: user.id, type: OverwriteType.Member, allow: memberAccess(true).allow },
      ...staffRoleIds.map((id) => ({ id, type: OverwriteType.Role, allow: STAFF_ALLOW })),
      { id: interaction.client.user.id, type: OverwriteType.Member, allow: BOT_ALLOW },
    ],
    reason: `${type.label} ticket for ${user.tag}`,
  });
  const id = store.createTicket({ guildId: guild.id, channelId: channel.id, typeId, openerId: user.id, number });

  const messages = buildOpeningMessages({
    messages: type.messages,
    memberId: user.id,
    staffRoleIds,
    typeLabel: type.label,
    colour: type.panel_colour,
  });
  messages[messages.length - 1].components = [controls("open", id)];
  for (const message of messages) await channel.send(message);

  return interaction.editReply(`Your ticket is open: ${channel}`);
}

function confirm(interaction, action, id, question) {
  const yes = new ButtonBuilder()
    .setCustomId(ticketId(`${action}-yes`, id))
    .setLabel(question.button)
    .setStyle(action === "delete" ? ButtonStyle.Danger : ButtonStyle.Secondary);
  return interaction.reply({
    content: question.text,
    components: [new ActionRowBuilder().addComponents(yes)],
    flags: MessageFlags.Ephemeral,
  });
}

async function close(interaction, ticket, type) {
  if (!getStore().closeTicket(ticket.id, interaction.user.id)) {
    return interaction.update({ content: "Someone else just changed this ticket.", components: [] });
  }
  await interaction.update({ content: "Closed.", components: [] });
  const channel = interaction.channel;
  const note = await moveTo(channel, type.closed_category_id, "closed");
  let accessNote = "";
  try {
    await channel.permissionOverwrites.edit(ticket.opener_id, toOverwrite(memberAccess(false)), {
      type: OverwriteType.Member,
      reason: "Ticket closed",
    });
  } catch (error) {
    console.warn(`Couldn't make ticket ${channel.id} read-only: ${error.message}`);
    accessNote = " I couldn't make it read-only for the member.";
  }
  const days = type.delete_after_days;
  const deleteNote = days > 0 ? ` This ticket will be deleted in ${days} day${days === 1 ? "" : "s"}.` : "";
  return channel.send({
    content: `Closed by ${interaction.user}.${deleteNote}${note}${accessNote}`,
    components: [controls("closed", ticket.id)],
    allowedMentions: { parse: [] },
  });
}

async function reopen(interaction, ticket, type) {
  if (!getStore().reopenTicket(ticket.id)) {
    return interaction.reply(ephemeral("Someone else just changed this ticket. Try again."));
  }
  const channel = interaction.channel;
  const note = await moveTo(channel, type.open_category_id, "open");
  let accessNote = "";
  try {
    await channel.permissionOverwrites.edit(ticket.opener_id, toOverwrite(memberAccess(true)), {
      type: OverwriteType.Member,
      reason: "Ticket reopened",
    });
  } catch (error) {
    console.warn(`Couldn't let the member type in ticket ${channel.id} again: ${error.message}`);
    accessNote = " I couldn't let the member type again.";
  }
  return interaction.reply({
    content: `Reopened by ${interaction.user}.${note}${accessNote}`,
    components: [controls("open", ticket.id)],
    allowedMentions: { parse: [] },
  });
}

async function remove(interaction, ticket) {
  if (!getStore().deleteTicket(ticket.id, interaction.user.id)) {
    return interaction.update({ content: "This ticket was already deleted.", components: [] });
  }
  await interaction.update({ content: "Deleting this ticket...", components: [] });
  try {
    await interaction.channel.delete(`Ticket deleted by ${interaction.user.tag}`);
  } catch (error) {
    console.warn(`Couldn't delete ticket channel ${ticket.channel_id}: ${error.message}`);
    await interaction.followUp(ephemeral("I couldn't delete the channel. Check I have Manage Channels, or delete it by hand."));
  }
}

const QUESTIONS = {
  close: { text: "Close this ticket? The member will still be able to read it, but not type.", button: "Yes, close it" },
  delete: { text: "Delete this ticket? The channel and everything in it will be gone for good.", button: "Yes, delete it" },
};

const NOT_ALLOWED = {
  close: "Only staff or the member who opened this ticket can close it.",
  default: "Only staff can do that.",
};

async function handleTicketComponent(interaction) {
  if (!interaction.isButton()) return;
  const { action, ids } = parseTicketId(interaction.customId);
  if (action === "open") return openTicket(interaction, ids[0], ids[1]);

  const store = getStore();
  const ticket = store.getTicket(ids[0]);
  const type = ticket && store.getType(ticket.type_id);
  if (!ticket || !type) return interaction.reply(ephemeral("This ticket doesn't exist any more."));

  const step = action.replace(/-yes$/, "");
  const who = { isStaff: isStaff(interaction.member, type), isOpener: interaction.user.id === ticket.opener_id };
  if (!canUse(step, who)) return interaction.reply(ephemeral(NOT_ALLOWED[step] ?? NOT_ALLOWED.default));

  const error = transitionError(step, ticket.status);
  if (error) {
    return action.endsWith("-yes")
      ? interaction.update({ content: error, components: [] })
      : interaction.reply(ephemeral(error));
  }

  switch (action) {
    case "close":
    case "delete":
      return confirm(interaction, action, ticket.id, QUESTIONS[action]);
    case "close-yes":
      return close(interaction, ticket, type);
    case "reopen":
      return reopen(interaction, ticket, type);
    case "delete-yes":
      return remove(interaction, ticket);
  }
}

module.exports = { handleTicketComponent };
