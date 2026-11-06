// Registers Clanker's slash commands with Discord for the server in GUILD_ID. Run it after adding or changing a command.
//   loadCommandData  reads the command definitions from src/commands

const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });
const { missingSettings } = require("./src/config");

function loadCommandData() {
  const commandsPath = path.join(__dirname, "src", "commands");
  return fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"))
    .map((file) => require(path.join(commandsPath, file)))
    .filter((command) => "data" in command && "execute" in command)
    .map((command) => command.data.toJSON());
}

const missing = missingSettings(process.env, ["BOT_TOKEN", "CLIENT_ID", "GUILD_ID"]);
if (missing.length > 0) {
  console.error(`Missing settings in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const commands = loadCommandData();
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

rest
  .put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body: commands,
  })
  .then(() => console.log(`Registered ${commands.length} commands: ${commands.map((c) => "/" + c.name).join(", ")}`))
  .catch((error) => {
    console.error("Couldn't register the commands:", error);
    process.exit(1);
  });
