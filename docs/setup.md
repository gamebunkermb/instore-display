# One-time setup

About 20 minutes. Do these in order. Nothing runs against Yodeck until step 4 is done.

## 1. Discord bot (reads memes and events; creates league events)

1. Go to <https://discord.com/developers/applications> → **New Application**, name it e.g.
   "In-store display".
2. **Bot** tab → **Reset Token** → copy the token into Keeper. That is `DISCORD_BOT_TOKEN`.
3. Same tab, **Privileged Gateway Intents** → turn on **Message Content Intent**. Without it
   Discord hides attachments from the bot and no memes are found.
4. **OAuth2 → URL Generator**: scope `bot`; permissions **View Channels**, **Read Message
   History**, **Create Events** and **Manage Events**. Open the URL and add the bot to the server.
5. Make sure the bot's role can see the memes channel (channel settings → Permissions).

## 2. Fill in `config/display.yaml`

Turn on Developer Mode in Discord (User Settings → Advanced), then right-click → **Copy ID**:

- `discord.guild_id`: the server.
- `discord.memes.channel_id`: the memes channel.
- `discord.memes.approver_role_ids`: e.g. the Staff role, and/or
  `approver_user_ids`: Brent, Scott and Jared.

**How memes get approved:** an approver reacts ✅ to a meme in the channel. Only those go on
the screen; anyone else's ✅ does not count. To take one down, remove your ✅ (it disappears
at the next run).

## 3. Yodeck API token

Needs a Premium or Enterprise plan. Yodeck → Account Settings → Advanced Settings → **API
Tokens** → Generate Token. Give it a name (that's the label) and a role that can edit media,
playlists and screens. The secret is shown once. `YODECK_API_TOKEN` is `label:value`, e.g.
`instore-display:abc123`.

## 4. GitHub secrets, then a dry run

Repo → Settings → Secrets and variables → Actions → **New repository secret**:
`DISCORD_BOT_TOKEN` and `YODECK_API_TOKEN`.

Then Actions → **Weekly in-store display** → Run workflow with **apply unticked**. Check the
log (what it would upload) and the `display-N` download (the slide and memes). Run it again
with apply ticked. The first applied run creates the playlist **In-store display (auto)**.

## 5. Point the screen at the playlist (once, in Yodeck)

Screens → your screen → set its content to the playlist **In-store display (auto)** → Save
and push. Then put the screen's number (from its URL) in `yodeck.screen_ids` so each weekly
update pushes to it automatically. The script never changes which playlist a screen shows.

## Running locally (optional)

```powershell
npm install
copy .env.example .env    # then fill in the two values
npm run build
npm run sync              # dry run
npm run sync -- --execute
```

`npm run build -- --sample` draws the events slide with made-up events, no Discord needed.
