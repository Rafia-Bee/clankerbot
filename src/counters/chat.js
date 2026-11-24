// Watches chat for the trigger words of every /count counter, picked in /settings.
//   handleCounterMessage  adds 1 to the sender's count on each counter whose words the message has, and reacts with those counters' emojis

const { getStore } = require("../store");
const { countersHit, reactionsFor } = require("./rules");

async function handleCounterMessage(message) {
  if (!message.inGuild() || message.author.bot || message.webhookId) return;
  const hit = countersHit(message.content, getStore().listCounters(message.guildId));
  if (hit.length === 0) return;
  for (const counter of hit) getStore().addToCount(counter.id, message.author.id);
  for (const emoji of reactionsFor(hit)) await message.react(emoji).catch(() => {});
}

module.exports = { handleCounterMessage };
