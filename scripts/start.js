// Starts the bot on Fly.io, waiting for the .env file to be uploaded first if it isn't there yet.
//   start  loads the bot

const fs = require("fs");

const envFile = process.env.ENV_FILE;
const CHECK_INTERVAL_MS = 10_000;

function start() {
  require("../src/bot");
}

if (!envFile || fs.existsSync(envFile)) {
  start();
} else {
  console.log(`Waiting for ${envFile}. Upload it with: fly ssh sftp put .env ${envFile} -m 0600`);
  const timer = setInterval(() => {
    if (!fs.existsSync(envFile)) return;
    clearInterval(timer);
    console.log(`Found ${envFile}, starting the bot`);
    start();
  }, CHECK_INTERVAL_MS);
}
