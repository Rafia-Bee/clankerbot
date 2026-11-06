// Starts Clanker: loads the slash commands, logs in to Discord and runs commands when they're used.
//   loadCommands       reads every command file in src/commands
//   replyWithError     tells the person a command failed, whether or not it already replied

const { Client, GatewayIntentBits, Collection, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: process.env.ENV_FILE, quiet: true });
const { missingSettings } = require("./config");

const missing = missingSettings(process.env, ["BOT_TOKEN"]);
if (missing.length > 0) {
  console.error(`Missing settings in .env: ${missing.join(", ")}`);
  process.exit(1);
}

function loadCommands() {
  const commands = new Collection();
  const commandsPath = path.join(__dirname, "commands");
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(commandsPath, file));
    if ("data" in command && "execute" in command) {
      commands.set(command.data.name, command);
    } else {
      console.warn(`The command in ${file} is missing "data" or "execute" and was skipped.`);
    }
  }
  return commands;
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
client.commands = loadCommands();

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("Client error:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    await replyWithError(interaction);
  }
});

client.login(process.env.BOT_TOKEN);
