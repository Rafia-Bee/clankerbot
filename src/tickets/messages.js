// Builds the messages posted when a ticket opens, filling in {member}, {staff} and {type}.
//   fillPlaceholders      fills in the placeholders and notes who they ping
//   buildOpeningMessages  the ticket type's messages in order (or a short default), ready to send

const { EmbedBuilder } = require("discord.js");

function fillPlaceholders(text, { memberId, staffRoleIds, typeLabel }) {
  const users = new Set();
  const roles = new Set();
  const filled = text.replace(/\{(member|staff|type)\}/g, (_, key) => {
    if (key === "member") {
      users.add(memberId);
      return `<@${memberId}>`;
    }
    if (key === "staff") {
      for (const id of staffRoleIds) roles.add(id);
      return staffRoleIds.map((id) => `<@&${id}>`).join(" ");
    }
    return typeLabel;
  });
  return { text: filled, users: [...users], roles: [...roles] };
}

function buildOpeningMessages({ messages, memberId, staffRoleIds, typeLabel, colour }) {
  const context = { memberId, staffRoleIds, typeLabel };
  const list = messages.length > 0
    ? messages
    : [{ kind: "text", content: "{member} opened a **{type}** ticket. Staff will be with you soon." }];

  return list.map(({ kind, content }) => {
    const { text, users, roles } = fillPlaceholders(content, context);
    const allowedMentions = { parse: [], users, roles };
    if (kind === "embed") {
      return { embeds: [new EmbedBuilder().setDescription(text).setColor(colour)], allowedMentions };
    }
    return { content: text, allowedMentions };
  });
}

module.exports = { fillPlaceholders, buildOpeningMessages };
