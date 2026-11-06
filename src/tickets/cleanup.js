// Deletes closed tickets once their type's delete-after days have passed. Runs on startup and then once an hour.
//   deleteDueTickets    deletes every closed ticket that's due, and marks it deleted in the database
//   startTicketCleanup  runs deleteDueTickets now and every hour

const { getStore } = require("../store");
const { isDueForDeletion } = require("./rules");

const HOUR_MS = 60 * 60 * 1000;

async function deleteDueTickets(client, now = Date.now()) {
  const store = getStore();
  const due = store.listClosedTickets().filter((ticket) => isDueForDeletion(ticket, now));
  for (const ticket of due) {
    store.deleteTicket(ticket.id, null);
    const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
    if (!channel) continue;
    try {
      await channel.delete("Closed ticket past its delete-after days");
    } catch (error) {
      console.warn(`Couldn't auto-delete ticket channel ${ticket.channel_id}: ${error.message}`);
    }
  }
  if (due.length > 0) console.log(`Deleted ${due.length} closed ticket${due.length === 1 ? "" : "s"}.`);
}

function startTicketCleanup(client) {
  const run = () => deleteDueTickets(client).catch((error) => console.error("Ticket cleanup failed:", error));
  run();
  setInterval(run, HOUR_MS);
}

module.exports = { deleteDueTickets, startTicketCleanup };
