// Posts a ticket panel from a settings file, until the /ticket-setup wizard exists. Usage: node scripts/create-panel.js <file.json>
//   fail  prints a message and stops
//   main  checks the file, saves the panel, posts it in its channel and saves the message ID

const fs = require("fs");
const { REST, Routes } = require("discord.js");
require("dotenv").config({ path: process.env.ENV_FILE, quiet: true });
const { missingSettings } = require("../src/config");
const { checkPanelConfig, buildPanelMessage } = require("../src/tickets/panel");
const { getStore } = require("../src/store");

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const file = process.argv[2];
  if (!file) fail("Give the panel settings file: node scripts/create-panel.js data/panel.json");
  const missing = missingSettings(process.env, ["BOT_TOKEN", "GUILD_ID"]);
  if (missing.length > 0) fail(`Missing settings in .env: ${missing.join(", ")}`);

  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Couldn't read ${file}: ${error.message}`);
  }
  const { errors, panel } = checkPanelConfig(config);
  if (errors.length > 0) fail(`Fix these in ${file}:\n- ${errors.join("\n- ")}`);

  const store = getStore();
  const { panelId } = store.createPanel({ ...panel, guildId: process.env.GUILD_ID });
  const message = buildPanelMessage({ ...panel, id: panelId, types: store.getPanel(panelId).types });

  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    const posted = await rest.post(Routes.channelMessages(panel.channelId), {
      body: {
        embeds: message.embeds.map((embed) => embed.toJSON()),
        components: message.components.map((row) => row.toJSON()),
      },
    });
    store.setPanelMessage(panelId, posted.id);
    console.log(`Posted ticket panel #${panelId} with ${panel.types.length} button(s).`);
  } catch (error) {
    store.deletePanel(panelId);
    fail(`Couldn't post the panel: ${error.message}`);
  }
}

main();
