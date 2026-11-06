// Posts a ticket panel from a settings file, as an alternative to /ticket-setup. Usage: node scripts/create-panel.js <file.json>
//   fail  prints a message and stops
//   main  reads the file, then checks, saves and posts the panel in its channel

const fs = require("fs");
const { REST, Routes } = require("discord.js");
require("dotenv").config({ path: process.env.ENV_FILE, quiet: true });
const { missingSettings } = require("../src/config");
const { publishPanel } = require("../src/tickets/publish");
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

  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  const post = async (message, channelId) => {
    const posted = await rest.post(Routes.channelMessages(channelId), {
      body: {
        embeds: message.embeds.map((embed) => embed.toJSON()),
        components: message.components.map((row) => row.toJSON()),
      },
    });
    return posted.id;
  };

  try {
    const result = await publishPanel({ store: getStore(), config, guildId: process.env.GUILD_ID, post });
    if (result.errors.length > 0) fail(`Fix these in ${file}:\n- ${result.errors.join("\n- ")}`);
    console.log(`Posted ticket panel #${result.panelId} with ${result.panel.types.length} button(s).`);
  } catch (error) {
    fail(`Couldn't post the panel: ${error.message}`);
  }
}

main();
