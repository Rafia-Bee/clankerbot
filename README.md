# Clanker

A Discord bot for my guild server. Members verify with their AION 2 character to get their roles and nickname. It has a ticket system, "Create a VC" voice hubs, role buttons and a role for members who are live on Twitch, and can also look characters up, post polls and delete recent messages.

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
   - Manage Messages, Send Polls, Add Reactions
   - Manage Roles, Manage Nicknames, Manage Channels
   - Connect, Speak, Move Members (for [voice hubs](#voice-hubs))
4. Open the link it gives you at the bottom, pick your server, and click **Authorize**.

Already invited the bot without some of these? Add them to the bot's role in **Server Settings → Roles** instead.

On the **Bot** tab, under "Privileged Gateway Intents", turn on all three switches and click **Save Changes**:

- **Message Content Intent** lets the bot read chat for the [trigger words](#counting-bad-words).
- **Presence Intent** lets the bot see when someone is live on Twitch, for the [streaming role](#streaming-role).
- **Server Members Intent** lets the bot look through the member list when it starts, to fix the streaming role for anyone who started or stopped streaming while it was off.

If any of these are off, the bot won't start.

### 3. Fill in the settings

Copy `.env.example` to a new file called `.env` and fill in the blanks. Every line has a comment explaining what it's for.

To copy an ID, turn on **Developer Mode** in Discord (**User Settings → Advanced**), then right-click the server and pick **Copy ID**. You don't need role IDs: you pick the roles in Discord with `/settings` once the bot is running (step 6).

| Setting | What it is |
| --- | --- |
| `BOT_TOKEN` | Developer Portal → **Bot** → **Reset Token**. Keep it secret. |
| `CLIENT_ID` | Developer Portal → **General Information** → **Application ID** |
| `GUILD_ID` | Your server's ID |
| `AION2INDEX_API_KEY` | The key for character lookups, from the [aion2index community panel](https://aion2index.com/communities/docs). You can use the same key as orcabot. See [Character lookups](#character-lookups). |
| `VERIFY_LEGION` | Your legion's name as the game spells it. Starts as `Entropy`. |

Everything else in `.env.example` already has a sensible value. Copy those lines over as they are.

### 4. Set up your server

In **Server Settings → Roles**, drag the bot's role **above** the Guild, Trusted and Guest roles, and the class roles and streaming role if you use them. Discord only lets a bot give out roles that are below its own, and only rename members whose top role is below its own.

### 5. Register the commands and start the bot

```bash
node deploy-commands.js
npm start
```

The first line tells Discord which slash commands the bot has. Run it again whenever a command is added or changed. When the bot is running you'll see `Logged in as Clanker#1234`.

### 6. Pick the verification roles

Run `/settings` in Discord. Only server admins (people with **Manage Server**) can use it, and only you see the reply.

1. The overview shows each role, what's still **Missing**, and any **Problems**.
2. Pick a setting from the **Change a setting** list, then pick the role from Discord's own list. It's saved straight away, no restart needed.
3. For **Class roles**, press **Add or change**, type the class name as the game spells it and pick its role. Use the **Remove** list to take one off.

| Setting | What it is |
| --- | --- |
| Guild role | Given, with the Trusted role, to members of your legion |
| Trusted role | Given together with the Guild role |
| Guest role | Given to everyone else who verifies |
| Class roles | *(optional)* A role for each class. See [Class roles](#class-roles). |
| Streaming role | *(optional)* Given to members while they're live on Twitch. See [Streaming role](#streaming-role). |

Until the Guild, Trusted and Guest roles are picked, verification is off: the Verify button, `/verify-setup` and `/verify-manual` say so. The rest of the bot works as normal.

Under **Problems**, the bot warns you when a role you picked was deleted, or sits above its own role (see step 4). Every change is written to the bot's log, with who changed it.

The roles are saved in the bot's database (`data/clanker.db`, or `/data/clanker.db` on Fly.io), not in `.env`. `npm run db:reset` wipes them too.

**Coming from an older version?** If your `.env` still has `GUILD_ROLE_ID`, `TRUSTED_ROLE_ID`, `GUEST_ROLE_ID` or `CLASS_ROLES`, the bot copies them into the database the first time it starts with `/settings`, and says so in its log. After that it ignores those lines, so you can delete them.

### 7. Post the Verify button

Run `/verify-setup` in the channel where new members should verify. See [Verification](#verification).

### 8. Make a voice hub (optional)

Run `/hub-setup` in a text channel inside the category where the voice channels should go. See [Voice hubs](#voice-hubs).

## Hosting on Fly.io

Fly.io keeps the bot running around the clock for a couple of dollars a month (the smallest machine plus 1 GB of storage). The bot's settings (`.env`) and its database (who verified as which character) live on that storage, so they survive restarts and updates.

### First-time setup

1. **Sign up** at [fly.io](https://fly.io) and add a payment card. If you already host another bot there, use the same account.
2. **Install the Fly tool** and log in:
   - Windows (PowerShell): `iwr https://fly.io/install.ps1 -useb | iex`
   - Mac/Linux: `curl -L https://fly.io/install.sh | sh`
   - Then: `fly auth login`
3. **Create the app** from the project folder:
   ```bash
   fly apps create clankerbot
   ```
   If the name `clankerbot` is taken, pick another one and change `app = "clankerbot"` at the top of `fly.toml` to match.
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
- **Restart it:** `fly apps restart clankerbot`
- **Change a verification role:** use `/settings` in Discord.
- **Change any other setting:** download the live settings, edit them, and put them back:
  ```bash
  fly ssh sftp get /data/.env server.env
  # edit server.env
  fly ssh console -C "rm /data/.env"
  fly ssh sftp put server.env /data/.env -m 0600
  fly apps restart clankerbot
  ```
  Delete `server.env` from your PC afterwards, since it contains the bot token.
- **New or changed commands:** run `node deploy-commands.js` from your PC.

## Commands

| Command | What it does | Who can use it |
| --- | --- | --- |
| `/ticket-setup` | Make a ticket panel step by step. See [Tickets](#tickets). | Manage Server |
| `/ticket-panels` | List the ticket panels and how full their categories are, and edit or delete them | Manage Server |
| `/hub-setup channel` | Make a "Create a VC" voice channel. Anyone who joins it gets their own voice channel. Pick a `channel` to use an existing voice channel instead. See [Voice hubs](#voice-hubs). | Manage Server |
| `/role-picker-setup role message button` | Post a button that gives members `role`, and takes it away when they click again. See [Role buttons](#role-buttons). | Manage Roles |
| `/settings` | Pick the Guild, Trusted, Guest and class roles that verification gives out, the [streaming role](#streaming-role), the `/badword` trigger words and reaction, and the leaderboard name. See [step 6](#6-pick-the-verification-roles). | Manage Server |
| `/verify-setup message` | Post the Verify message and button in the channel. `message` is optional text above the button (type `\n` for a new line). | Manage Server |
| `/verify-manual user name roles` | Verify a member by hand with their character name. See [Verifying someone by hand](#verifying-someone-by-hand). | Manage Roles |
| `/recheck user` | Look verified members up again: fix their nicknames, and move them between the Guild and Trusted roles and Guest if they joined or left the legion. Pick a `user` for one member, or leave it empty for everyone. See [Rechecking members](#rechecking-members). | Manage Roles |
| `/unverify user` | Remove a member's character and their Guild, Trusted, Guest and class roles, so the character can be verified by someone else | Manage Roles |
| `/whois name` | Look up an AION 2 character on Israphel and post their class, level, gear score, combat power, legion and faction in the channel, with a link to their page | Anyone |
| `/poll question answers duration multiple` | Post a Discord poll in the channel. See [Polls](#polls). | Anyone |
| `/badword user` | Add 1 to `user`'s count. Everyone starts at 0. See [Counting with /badword](#counting-bad-words). | Anyone |
| `/badword-count user` | Show how many `user` has. | Anyone |
| `/badword-leaderboard` | Show the 10 members with the highest counts, ranked. | Anyone |
| `/purge amount` | Delete the last 1 to 100 messages in the channel. Only you see the reply. | Manage Messages |

Discord doesn't let bots bulk delete messages older than 14 days, so `/purge` skips those and tells you how many it skipped.

## Verification

Members click **Verify** under the message from `/verify-setup` and type their character name. The bot looks it up on Israphel and:

- **In your legion (`VERIFY_LEGION`):** gives them the Guild and Trusted roles and renames them to their in-game name.
- **In another legion, or none:** gives them the Guest role and renames them.
- **Not found on Israphel** (another server, or a typo): gives them the Guest role and renames them to what they typed. They're told to check the spelling if they're in your legion.
- **Already linked to someone else:** changes nothing and tells them to contact a mod. Each character can only belong to one Discord account. Use `/unverify` on the other account to free it.
- **The lookup sites aren't answering:** changes nothing and asks them to try again in a few minutes.

Verifying again with another character replaces the old one, and the roles and nickname follow the new character. The bot saves each member's character, so `/recheck` can update them later.

### Rechecking members

`/recheck` looks each verified member's character up again and:

- **Fixes their nickname** if it doesn't match the in-game name any more (they renamed their character with a different spelling, or changed their nickname by hand).
- **Left the legion:** takes the Guild and Trusted roles away and gives them Guest.
- **Joined the legion:** takes Guest away and gives them Guild and Trusted.
- **Updates their class role**, the same way Verify does.

If a mod picked their roles with `/verify-manual` (for example Guild and Trusted for someone outside the legion), `/recheck` leaves their roles alone and only fixes the nickname. The reply says so. If the member verifies again themselves, their roles follow their legion again.

Pick a `user` to recheck one member: only you see the reply. Without a `user`, it goes through every verified member, about 2 seconds each, and posts a summary in the channel when it's done.

Members who verified with a name that wasn't found on Israphel are skipped. If a character isn't found any more (renamed or deleted in game), nothing is changed for them and the reply or summary says so: they need to verify again with their new name. If the lookup sites don't answer, nothing is changed either. Run it again later.

The bot can't rename the server owner (Discord doesn't allow it), or anyone whose top role is above the bot's role.

### Class roles

If class roles are set in `/settings`, members also get the role for their character's class when they verify, whatever their legion. It works the same with `/verify-manual`.

- The class names are Gladiator, Templar, Assassin, Ranger, Sorcerer, Spiritmaster, Cleric and Chanter. Capitals don't matter.
- If they verify again with a character of another class, the old class role is taken away.
- If the name isn't found on Israphel, the bot can't tell the class, so class roles aren't changed.
- `/unverify` takes the class role away too.

### Verifying someone by hand

`/verify-manual user name` does the same as the Verify button, for another member. Only you see the reply. The optional `roles` picks which roles they get:

- **Auto** (the default): from their character's legion, like the Verify button. If the name isn't found on Israphel, or the lookup sites don't answer, the bot asks you to pick the roles instead.
- **Guild and Trusted** or **Guest:** they get those roles whatever their legion is. Useful when their character is hidden on the lookup sites, or when the sites are down. If the name couldn't be checked, it's saved as typed, and `/recheck` skips them. If the roles you pick aren't what their legion would give, `/recheck` keeps your choice.

Getting Guild and Trusted takes the Guest role away, and getting Guest takes Guild and Trusted away, even if someone gave those roles by hand.

A character that's already linked to someone else is refused. The reply says who has it, so you can `/unverify` them first. If the game isn't answering and only older saved data is available, the bot uses it and says so.

## Tickets

Members open a private ticket channel by clicking a button on a ticket panel. A panel can have up to 25 buttons, each a different kind of ticket (like "Apply" or "Report a problem"), with its own staff roles, categories and opening messages.

### Setting up the categories

Each ticket type uses two categories: one for **open** tickets and one for **closed** tickets. Types can share them. Make the categories visible to staff only. The bot gives each ticket channel its own permissions anyway, so members only ever see their own tickets.

A category holds at most 50 channels (Discord's limit). If the open category is full, members are told tickets are full and to message a staff member.

### Making a panel with /ticket-setup

Run `/ticket-setup` (Manage Server). A setup screen opens that only you can see. It shows a preview of the panel, the ticket types so far, and what's still needed.

1. **Panel text:** the title, description (Discord formatting works), colour, an optional picture, and the channel to post in.
2. **Add ticket type:** one per button. Each ticket type has three pop-ups:
   - **Basics:** the button text, emoji and colour, how ticket channels are named, and after how many days closed tickets are deleted (`0` for never).
   - **Where and who:** the categories for open and closed tickets, the staff roles, and how many open tickets a member can have at once. A new type starts with the previous type's categories and staff roles.
   - **Opening messages:** up to 4 messages posted when a ticket opens. `{member}` pings the member, `{staff}` pings the staff roles, `{type}` is the button text. Tick **Show as a box** to show a message in a coloured box (pings don't work in boxes). Put any questions for the member here.
3. Pick a ticket type from the **Edit a ticket type** dropdown to change it, move it up or down, or remove it.
4. **Publish** lights up once nothing is missing. It posts the panel, and members can open tickets straight away.

Your setup is saved as you go. If you close it or the bot restarts, run `/ticket-setup` again to pick up where you left off. **Cancel** throws the setup away.

### Changing or deleting a panel with /ticket-panels

Run `/ticket-panels` (Manage Server). It lists every panel with a link to it, and how full each ticket type's categories are (like "Apply: open 12 of 50, closed 3 of 50"), so you can spot a category filling up. Pick a panel from the dropdown, then:

- **Edit:** opens the panel in the `/ticket-setup` screen. Change what you like and press **Save changes**. The posted panel is updated in place. If you picked a different channel, or the panel message was deleted, the bot posts a new one (and removes the old one).
  - Removing a ticket type takes its button off the panel. Tickets of that type that are already open keep working.
  - You can only have one setup going at a time. If you have an unfinished `/ticket-setup`, finish or cancel it first.
- **Delete:** after an "Are you sure?", removes the panel message, and nobody can open new tickets from it. Tickets that are already open keep working, and closed ones are still deleted after their days.

### Making a panel from a settings file

You can also make a panel from a settings file, which is handy for copying a panel or for more than 4 opening messages:

1. Copy `scripts/panel.example.json` to `data/panel.json`. The `data` folder isn't uploaded to GitHub.
2. Fill in the IDs: the channel for the panel, the two categories for each ticket type, and the staff roles. Change the text and buttons to what you want.
3. Run `node scripts/create-panel.js data/panel.json` (or `cpanel data/panel.json`). If something's wrong in the file, it lists every problem. Otherwise the panel appears in the channel.

The settings in the file. Put every ID in quotes, like `"1567942746155786370"`. Without quotes, the numbers are too long and get rounded.

| Setting | What it is |
| --- | --- |
| `channelId` | The channel the panel is posted in |
| `title`, `description` | The panel's text. The description can use Discord formatting (`**bold**`, `*italic*`, `> quote`, lists, links). Type `\n` for a new line. |
| `colour` | *(optional)* The colour of the panel's side bar, like `#3b82f6` |
| `image` | *(optional)* A link to a picture shown in the panel |
| `types` | The buttons, 1 to 25. Each one has the settings below. |
| `label` | The button text |
| `emoji` | *(optional)* An emoji on the button |
| `style` | *(optional)* The button colour: `primary` (blue, the default), `secondary` (grey), `success` (green) or `danger` (red) |
| `nameSchema` | *(optional)* How ticket channels are named. `{type}` is the button text in lowercase, `{number}` counts up per type (`0001`), `{user}` is the member's username, `{name}` is their name in the server. Default: `{type}-{number}`. |
| `openCategoryId`, `closedCategoryId` | The two categories |
| `staffRoleIds` | The roles that handle this type of ticket, at least one, like `["111", "222"]` |
| `openLimit` | *(optional)* How many tickets of this type a member can have open at once. Default 1. |
| `deleteAfterDays` | *(optional)* Closed tickets are deleted after this many days. `0` means never. Default 7. |
| `messages` | *(optional)* Up to 5 messages posted when the ticket opens, in order. Each is `{ "kind": "text", "content": "..." }` or `"kind": "embed"` (a box with the panel's colour). `{member}` pings the member, `{staff}` pings the staff roles, `{type}` is the button text. Pings only work in `text` messages. Put any questions you want the member to answer here. |

On Fly.io, upload the file and run the script there:

```bash
fly ssh sftp put data/panel.json /data/panel.json
fly ssh console -C "node scripts/create-panel.js /data/panel.json"
```

### How tickets work

1. A member clicks a button. The bot creates a channel in that type's open category, that only the member, the type's staff roles and the bot can see. Administrators can see every channel anyway.
2. The bot posts the opening messages. The last one has the ticket buttons.
3. Staff and the member talk it through in the channel.

| Button | Who can use it | What it does |
| --- | --- | --- |
| **Close** | Staff, or the member who opened it | After an "Are you sure?", moves the ticket to the closed category. The member can still read it but can't type. The countdown to auto-delete starts. |
| **Reopen** | Staff | Moves a closed ticket back to the open category and lets the member type again |
| **Delete** | Staff | After an "Are you sure?", deletes the channel straight away. There's no copy of the chat afterwards. |

Staff means the ticket type's staff roles, plus anyone with Administrator.

Once an hour, the bot deletes closed tickets older than their type's `deleteAfterDays`. It only ever deletes ticket channels it made itself.

## Voice hubs

A hub is a voice channel, usually called "Create a VC". When someone joins it, the bot makes them their own voice channel named after their server nickname (like "KFC's VC") and moves them into it.

### Making a hub

Run `/hub-setup` (Manage Server) in a text channel. The bot makes a "Create a VC" voice channel in the same category. To use a voice channel you already have, pick it in the `channel` option instead. You can have more than one hub, and you can rename or move the hub channel like any other.

To turn a hub off, delete its channel.

### How it works

- The new channel goes in the same category as the hub and gets the same permissions. So if only members can see the hub, only members can see their channels too.
- The person it's made for (the owner) can change their channel's settings: rename it, set a user limit, lock it to some people (in its **Permissions**), or disconnect people from it. They can't change anything else in the server.
- If the owner already has a channel and joins the hub again, the bot just moves them back to it.
- Once nobody has been in a channel for 10 seconds, the bot deletes it. If someone joins within those 10 seconds, it stays. When the owner leaves but others are still in it, it stays until everyone has left.
- If the bot was off for a while, it catches up when it starts: empty channels are deleted and anyone waiting in a hub gets their channel.
- The bot only ever deletes voice channels it made from a hub.

## Role buttons

`/role-picker-setup` (Manage Roles) posts a message with one button in the channel you run it in. A member who clicks it gets the role. Clicking it again takes the role away. Only they see the reply.

- **role:** the role the button gives.
- **message** *(optional)*: the text above the button. Discord formatting works, and `\n` makes a new line. Leave it empty for "Click the button to get the role. Click it again to remove it."
- **button** *(optional)*: the button text. Leave it empty to use the role's name.

Want buttons for a few roles? Run the command once for each role. The box next to the message takes the role's colour.

Some roles can't go on a button, and the bot tells you why:

- @everyone, and roles that belong to a bot or integration.
- Roles above or level with the bot's role. Drag the bot's role above them in **Server Settings → Roles**.
- Roles above or level with your own top role, so nobody can hand out a role higher than theirs. The server owner can pick any role.

The buttons keep working after the bot restarts. To remove one, delete its message. If the role is deleted, the button tells members to contact a mod.

## Streaming role

Members who are live on Twitch get a role, so they show at the top of the member list while they stream. It's taken away when they stop.

To set it up:

1. In **Server Settings → Roles**, click **Create Role** and name it, say, "Currently Streaming". Give it a colour.
2. In the role's settings, turn on **Display role members separately from online members**. This is what puts streamers in their own group in the member list.
3. Drag the role to the **top** of the list, above every other role that's shown separately. Then drag the bot's role above it, since the bot can only give out roles below its own.
4. Run `/settings`, pick **Streaming role** and pick the role you made.

How it works:

- The bot watches members' Discord status. When it says "Streaming" with a Twitch link, they get the role. Other kinds of streams (like YouTube) don't count.
- Discord only shows that status if the member has linked Twitch in **User Settings → Connections** and has **Display on profile** turned on there. It can take a minute after going live for Discord to notice.
- When the bot starts, it checks everyone and fixes the role for anyone who started or stopped streaming while it was off. That also means it takes the role away from anyone who was given it by hand but isn't streaming.
- Leave the setting empty to turn this off.

## Polls

`/poll` posts a normal Discord poll, so voting and results work like any poll in Discord.

- **question:** what to ask, up to 300 characters.
- **answers:** 2 to 10 answers separated by `;`, like `Pizza; Sushi; Tacos`. Each answer can be up to 55 characters.
- **duration** *(optional)*: how long it stays open, in hours and days: `12h`, `3d`, `1d 12h`, or just a number of hours. From 1 hour up to 32 days. Leave it empty for 24 hours.
- **multiple** *(optional)*: `True` lets people pick more than one answer.

If something's wrong (one answer, a typo in the duration), only you see the message saying what to fix.

As with any Discord poll, anyone can see who voted for what.

## Counting bad words

Everyone has a count that starts at 0. There are two ways to add to it:

- **By hand:** `/badword user` adds 1 to that member's count.
- **From chat:** when someone says a trigger word in a message, the bot adds 1 to their own count and reacts to the message (with a check mark, unless you pick another emoji). A message adds 1 at most, however many trigger words it has.

`/badword-count user` shows a member's count.

`/badword-leaderboard` shows the 10 members with the highest counts, highest first. Members with the same count share a place (so you might see #1, #1, #3). Names show without pinging anyone.

To rename the leaderboard (say, to "Naughty List"), choose **Leaderboard name** in `/settings` and click **Change name**. **Use the default** goes back to "Bad word leaderboard".

To pick the trigger words, run `/settings`, choose **Trigger words** from the list, and click **Add words**. Put `;` between words to add several at once, like `cat; dog; good game`. As that shows, a trigger word can also be a few words. To remove one, pick it from the **Remove a word** list. You can have up to 25.

To change the emoji, choose **Trigger word reaction** in `/settings` and click **Change emoji**. Paste one emoji (on Windows, press the Windows key and `.` to open the emoji picker). For a server's own emoji, type `\:name:` in any Discord chat and send it: Discord shows something like `<:name:123456789>`, which you copy into the box. The bot can only use server emojis from servers it's in. **Use the default** goes back to the check mark.

Trigger words only count as whole words, and capitals don't matter. So if the word is `cat`, then "CAT" and "my cat!" count, but "cats" and "category" don't. Messages from bots don't count.

Swapping in lookalike letters doesn't get around it. Letters from other alphabets that look the same (like the Russian `а`), accents (`cát`), fancy fonts (`𝐜𝐚𝐭`) and hidden characters typed inside a word are all read as the plain word.

## Character lookups

`/whois` looks characters up on the official AION 2 site ([aion2.plaync.com](https://aion2.plaync.com)) first. When that doesn't answer, it asks [aion2index.com](https://aion2index.com), and then [shugo.gg](https://shugo.gg). `LOOKUP_SOURCES` in `.env` changes the order, or picks fewer sites (`plaync`, `aion2index`, `shugo`).

The official site needs no key. It's the same data NCSOFT's own character page shows, but it isn't a documented service, so NCSOFT can change or block it without warning. That's why the other two stay as backups. Its settings (`PLAYNC_REGION`, `PLAYNC_SERVER_ID` and so on) all have defaults for Europe, Israphel.

- When a site fails, the bot uses the next one first for 5 minutes (`LOOKUP_FAILOVER_MINUTES`), then tries it again. The bot's log says when a site stops or starts working.
- When the game itself isn't answering, aion2index only has older saved data. The bot asks shugo.gg next, and only shows the older data if shugo.gg fails too. The reply then says how old it is.
- The same name looked up twice within a minute gets the same answer, without asking the sites again.

**Sharing the key with orcabot:** one aion2index key allows 60 lookups a minute across every bot using it. Clanker waits 4 seconds between lookups (`AION2INDEX_MIN_REQUEST_GAP_MS=4000`, 15 a minute) and orcabot waits 1.5 seconds (40 a minute), so together they stay under the limit. If the limit is hit anyway, Clanker uses shugo.gg until aion2index lets it back in.

## Testing

- `npm run dev`: starts the bot and restarts it whenever you save a file.
- `npm run db:reset`: wipes the saved characters (stop the bot first). Discord itself isn't touched: test accounts keep their roles and nicknames, so use `/unverify` on them first.
- `npm test`: runs the automated checks.

## Something's not working?

- **Commands don't show up:** run `node deploy-commands.js`, check `GUILD_ID` is your server, then press Ctrl+R in Discord.
- **"The application did not respond":** the bot isn't running. Start it with `npm start`, or check `fly logs` if it's on Fly.io.
- **"I need View Channel, Read Message History and Manage Messages in this channel":** give the bot's role those permissions, in Server Settings or in that channel's settings.
- **The bot won't start and says settings are missing:** fill those in `.env`.
- **Verify says "I couldn't update everything on your profile":** drag the bot's role above the Guild, Trusted and Guest roles (setup step 4), and check it has Manage Roles and Manage Nicknames. The bot's log says which part failed. The server owner can never be renamed by a bot.
- **"Verification isn't set up yet":** a server admin needs to pick the Guild, Trusted and Guest roles with `/settings`.
- **A role isn't given out, or `/settings` shows a problem:** open `/settings` and read the **Problems** list. Usually the role was deleted (pick the new one) or the bot's role needs moving higher (step 4).
- **Clicking a ticket button says something went wrong:** check the bot has **Manage Channels** and **Manage Roles**, and that it can see the ticket categories. The bot's log has the details.
- **"The ticket category is missing":** a category in the panel's settings was deleted, or the ID is wrong. Fix the file and post the panel again.
- **A ticket didn't move when closed or reopened:** the reply says why (the category is missing or full). The ticket still works where it is.
- **`/hub-setup` says "I need View Channels, Connect, ...":** add those permissions to the bot's role in **Server Settings → Roles**.
- **Joining the hub does nothing:** the bot's log says why. Usually the bot can't see or connect to the hub's category, or the category is full (50 channels at most). If the hub's own permissions allow something the bot's role doesn't have, Discord won't let the bot copy them: give the bot's role that permission too, or remove it from the hub.
- **Joining the hub makes a channel, but doesn't move me into it:** give the bot's role **Move Members** and **Connect**.
- **A role button says "I can't give out that role right now":** the role was moved above the bot's role, or the bot lost **Manage Roles**. Drag the bot's role back above it. The bot's log says which.
- **`/poll` says something went wrong:** give the bot's role the **Send Polls** permission, in Server Settings or in that channel's settings.
- **"Problem with the lookup settings in .env":** the message says which setting. Usually `AION2INDEX_API_KEY` is empty.
- **`/whois` always says "I couldn't reach any of the lookup sites":** check the bot's log for the reason. "API key rejected" means the aion2index key is wrong or was revoked in the aion2index panel. If the official site keeps failing, NCSOFT may have changed it: set `LOOKUP_SOURCES=aion2index,shugo` until it's fixed.
- **`/whois` says a character doesn't exist, but it does:** check the spelling. A name that one site can't find is still asked on the others.
- **The bot won't start and the log says "Used disallowed intents":** turn on **Message Content Intent**, **Presence Intent** and **Server Members Intent** on the **Bot** tab in the Developer Portal (setup step 2), then start the bot again.
- **Someone is live but didn't get the streaming role:** check their Discord profile says "Streaming" with a Twitch link. If not, they need to link Twitch in **User Settings → Connections**. If it does, open `/settings` and read the **Problems** list: usually the bot's role needs to be above the streaming role.
- **Trigger words don't add to the count:** check the word is in `/settings` under **Trigger words**, and that it's said as a whole word. If the count goes up but there's no reaction, give the bot's role **Add Reactions** and **Read Message History** in that channel.
- **Invalid token:** reset it in the Developer Portal and update `BOT_TOKEN`.

## License

MIT
