# Clanker

A Discord bot for my guild server. Right now it can delete recent messages. Tickets, polls and AION 2 character lookups are on the way.

## What you need

- [Node.js](https://nodejs.org) 22 or newer
- A Discord bot (make one at the [Discord Developer Portal](https://discord.com/developers/applications))
- Somewhere for it to run 24/7. The bot only works while it's running. We use Fly.io, see [Hosting on Fly.io](#hosting-on-flyio).

## Setup

### 1. Download and install

```bash
git clone https://github.com/Rafia-Bee/clankerbot.git
cd clankerbot
npm install
```

### 2. Make the bot on Discord

1. In the [Developer Portal](https://discord.com/developers/applications), click **New Application**, name it `Clanker` and create it.
2. **Bot** tab: click **Reset Token** and copy the token. You'll need it in step 3. Keep it secret: anyone with it can control the bot.
3. **OAuth2 → URL Generator**: tick `bot` and `applications.commands`, then tick these permissions:
   - View Channels, Send Messages, Embed Links, Read Message History
   - Manage Messages
4. Open the link it gives you at the bottom, pick your server, and click **Authorize**.

The bot doesn't need any of the "Privileged Gateway Intents" switches on the **Bot** tab. Leave them off.

### 3. Fill in the settings

Copy `.env.example` to a new file called `.env` and fill in the blanks. Every line has a comment explaining what it's for.

To copy IDs, turn on **Developer Mode** in Discord (**User Settings → Advanced**), then right-click a server, channel, role or user and pick **Copy ID**.

| Setting | What it is |
| --- | --- |
| `BOT_TOKEN` | Developer Portal → **Bot** → **Reset Token**. Keep it secret. |
| `CLIENT_ID` | Developer Portal → **General Information** → **Application ID** |
| `GUILD_ID` | Your server's ID |

### 4. Register the commands and start the bot

```bash
node deploy-commands.js
npm start
```

The first line tells Discord which slash commands the bot has. Run it again whenever a command is added or changed. When the bot is running you'll see `Logged in as Clanker#1234`.

## Hosting on Fly.io

Fly.io keeps the bot running around the clock for a couple of dollars a month (the smallest machine plus 1 GB of storage). The bot's settings (`.env`) live on that storage, so they survive restarts and updates.

### First-time setup

1. **Sign up** at [fly.io](https://fly.io) and add a payment card. If you already host another bot there, use the same account.
2. **Install the Fly tool** and log in:
   - Windows (PowerShell): `iwr https://fly.io/install.ps1 -useb | iex`
   - Mac/Linux: `curl -L https://fly.io/install.sh | sh`
   - Then: `fly auth login`
3. **Create the app** from the project folder:
   ```bash
   fly apps create clanker
   ```
   If the name `clanker` is taken, pick another one (like `clanker-bot`) and change `app = "clanker"` at the top of `fly.toml` to match.
4. **Create the storage** (say yes if it warns about having only one volume):
   ```bash
   fly volumes create clanker_data --region fra --size 1
   ```
5. **Deploy:**
   ```bash
   fly deploy
   ```
   The bot starts and waits for its settings.
6. **Upload your settings:**
   ```bash
   fly ssh sftp put .env /data/.env -m 0600
   ```
   Within 10 seconds the bot starts. Check with `fly logs`. You should see `Logged in as ...`.
7. **Stop the bot on your PC.** If two copies run at once, commands get answered twice.

### Deploying from GitHub

GitHub can test and deploy the bot for you. If the tests fail, nothing is deployed. For now it only runs when you start it by hand.

1. Run `fly tokens create deploy` and copy the token.
2. On GitHub, open the repo → **Settings → Secrets and variables → Actions → New repository secret**. Name it `FLY_API_TOKEN` and paste the token.
3. To deploy: open the repo's **Actions** tab → **Deploy to Fly.io** → **Run workflow**.

To deploy on every push to `master` instead, add these lines under `on:` in `.github/workflows/deploy.yml`:

```yaml
  push:
    branches: [master]
```

### Day to day

- **Update the bot after a change:** run `fly deploy`, or start the deploy from GitHub's **Actions** tab
- **See what the bot is doing:** `fly logs`
- **Restart it:** `fly apps restart clanker`
- **Change a setting:** download the live settings, edit them, and put them back:
  ```bash
  fly ssh sftp get /data/.env server.env
  # edit server.env
  fly ssh console -C "rm /data/.env"
  fly ssh sftp put server.env /data/.env -m 0600
  fly apps restart clanker
  ```
  Delete `server.env` from your PC afterwards, since it contains the bot token.
- **New or changed commands:** run `node deploy-commands.js` from your PC.

## Commands

| Command | What it does | Who can use it |
| --- | --- | --- |
| `/purge amount` | Delete the last 1 to 100 messages in the channel. Only you see the reply. | Manage Messages |

Discord doesn't let bots bulk delete messages older than 14 days, so `/purge` skips those and tells you how many it skipped.

## Testing

- `npm run dev`: starts the bot and restarts it whenever you save a file.
- `npm test`: runs the automated checks.

## Something's not working?

- **Commands don't show up:** run `node deploy-commands.js`, check `GUILD_ID` is your server, then press Ctrl+R in Discord.
- **"The application did not respond":** the bot isn't running. Start it with `npm start`, or check `fly logs` if it's on Fly.io.
- **"I need View Channel, Read Message History and Manage Messages in this channel":** give the bot's role those permissions, in Server Settings or in that channel's settings.
- **The bot won't start and says settings are missing:** fill those in `.env`.
- **Invalid token:** reset it in the Developer Portal and update `BOT_TOKEN`.

## License

MIT
