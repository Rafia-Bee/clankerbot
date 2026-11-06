// Starts Clanker: checks the settings, loads the slash commands, logs in to Discord and runs commands, buttons and pop-ups.
// Also starts the hourly ticket cleanup and marks tickets deleted when their channel is deleted by hand.
//   checkSettings      stops the bot with a clear message when a setting is missing or wrong
//   loadCommands       reads every command file in src/commands, and which buttons each one handles
//   replyWithError     tells the person something failed, whether or not it already replied

const { Client, GatewayIntentBits, Collection, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: process.env.ENV_FILE, quiet: true });
const { missingSettings } = require("./config");
const { getLookupConfig } = require("./lookup/config");
const { lookupEvents } = require("./lookup/lookup");
const { getVerifyConfig } = require("./verify/config");
const { getStore } = require("./store");
const { handleTicketComponent } = require("./tickets/interactions");
const { startTicketCleanup } = require("./tickets/cleanup");

function checkSettings() {
  const missing = missingSettings(process.env, ["BOT_TOKEN"]);
  if (missing.length > 0) {
    console.error(`Missing settings in .env: ${missing.join(", ")}`);
    process.exit(1);
  }
  const checks = [
    ["lookup settings", getLookupConfig],
    ["verification settings", getVerifyConfig],
    ["database", getStore],
  ];
  for (const [what, load] of checks) {
    try {
      load();
    } catch (error) {
      console.error(`Problem with the ${what}: ${error.message}`);
      process.exit(1);
    }
  }
}

checkSettings();

lookupEvents.on("down", ({ source, reason }) => {
  console.warn(`${source} isn't working (${reason}). Using the other site first for now.`);
});
lookupEvents.on("up", ({ source }) => {
  console.log(`${source} is working again.`);
});

function loadCommands() {
  const commands = new Collection();
  const componentHandlers = new Collection();
  const commandsPath = path.join(__dirname, "commands");
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(commandsPath, file));
    if ("data" in command && "execute" in command) {
      commands.set(command.data.name, command);
      if (command.customIdPrefix && command.handleComponent) {
        componentHandlers.set(command.customIdPrefix, command.handleComponent);
      }
    } else {
      console.warn(`The command in ${file} is missing "data" or "execute" and was skipped.`);
    }
  }
  return { commands, componentHandlers };
}

async function replyWithError(interaction) {
  const reply = {
    content: "Something went wrong. Please try again in a moment.",
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply(reply.content).catch(() => {});
  } else if (interaction.replied) {
    await interaction.followUp(reply).catch(() => {});
  } else {
    await interaction.reply(reply).catch(() => {});
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const { commands, componentHandlers } = loadCommands();
componentHandlers.set("ticket", handleTicketComponent);

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  startTicketCleanup(client);
});

client.on("channelDelete", (channel) => {
  getStore().markChannelDeleted(channel.id);
});

client.on("error", (error) => {
  console.error("Client error:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    const handler = componentHandlers.get(interaction.customId.split(":")[0]);
    if (!handler) return;
    try {
      await handler(interaction);
    } catch (error) {
      console.error(`Button or pop-up ${interaction.customId} failed:`, error);
      await replyWithError(interaction);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    await replyWithError(interaction);
  }
});

client.login(process.env.BOT_TOKEN);
