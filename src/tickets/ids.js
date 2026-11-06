// Button IDs for tickets, so a button still knows its panel, type or ticket after a restart.
//   ticketId       builds an ID like ticket:open:3:12
//   parseTicketId  reads an ID back into its action and numbers

function ticketId(action, ...ids) {
  return ["ticket", action, ...ids].join(":");
}

function parseTicketId(customId) {
  const [, action, ...ids] = customId.split(":");
  return { action, ids: ids.map(Number) };
}

module.exports = { ticketId, parseTicketId };
