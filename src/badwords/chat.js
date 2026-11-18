// Watches chat for the /badword trigger words picked in /settings.
//   handleBadWordMessage  adds 1 to the sender's count when their message has a trigger word, and reacts with the picked emoji

const { getStore } = require("../store");
const { hasTriggerWord } = require("./words");
const { reactionFor } = require("./reaction");

async function handleBadWordMessage(message) {
  if (!message.inGuild() || message.author.bot || message.webhookId) return;
  const settings = getStore().getServerSettings();
  if (!hasTriggerWord(message.content, settings.BAD_WORDS ?? [])) return;
  getStore().addBadWord(message.guildId, message.author.id);
  await message.react(reactionFor(settings)).catch(() => {});
}

module.exports = { handleBadWordMessage };
