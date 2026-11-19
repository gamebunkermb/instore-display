# Setup and status

## How it works

Yodeck is on the **free Basic plan**, which has no API. So the screen shows a **web page**
instead: every Monday the GitHub workflow reads Discord, builds a slideshow page (events
slide + approved memes, videos included) and publishes it to GitHub Pages at

**https://gamebunkermb.github.io/instore-display/**

In Yodeck that address is one "Web Page" item. The page re-reads its slide list at the end
of every loop, so new content reaches the screen without anyone touching Yodeck.

The `sync` command (upload to Yodeck through its API) is kept for a Premium plan but is not
used.

## Done (2026-11-19)

- Discord bot **Store-Display** created, private, Message Content Intent on, invited to
  Game Bunker Myrtle Beach.
- `config/display.yaml`: server, #🤡-meme-bunker, approvers = Store Owners role + Jared.
- Yodeck (nothing on the screen changed; nothing pushed):
  - Web Page item **In-store display (memes + events)** → the address above, default
    duration 3600 s, page refresh off (the page refreshes itself).
  - Playlist **In-store display (memes + events) (1)** holding just that item. Not assigned
    to any screen. The screen **Game Bunker Register** still shows **Register**.

## Left for Brent (in order)

1. **Turn on GitHub Pages.** Repo → Settings → Pages → Source: **GitHub Actions**.
   (Claude was not allowed to change this setting.) If GitHub says Pages on a private repo
   needs a paid plan, either take GitHub Pro (about $4/month) or make this repo public:
   it holds code and Discord ids, no secrets.
2. **Add the Discord bot token.** developer portal → Store-Display → Bot → **Reset Token**,
   save it in Keeper, then repo → Settings → Secrets and variables → Actions → New secret
   `DISCORD_BOT_TOKEN`.
3. **Run it once.** Actions → *Weekly in-store display* → Run workflow (publish ticked).
   Open the address above: the events slide, then memes.
4. **Approve some memes:** react ✅ in #🤡-meme-bunker (Store Owners or Jared), then run the
   workflow again or wait for Monday.
5. **Put it on the screen when you're happy.** Either:
   - set the screen's content to the playlist **In-store display (memes + events) (1)**, or
   - add the Web Page item to the **Register** playlist next to what's there now (give it a
     few minutes, e.g. 300 s; it starts at the events slide each time it comes round).
   Then **Push to Screens**.
6. Optional: the bot's username is spelled "Store-Dsiplay" (Bot page → Username).

## Good to know

- The page is public but unlisted and marked no-index. It only ever holds approved memes
  and the events list.
- Videos are re-encoded to silent 720p MP4, cut at 60 s (`screen.video_max_seconds`).
- Preview locally: `npm run build -- --sample` then `npm run serve` and open
  http://localhost:8080. `npm run build` does the real thing with the token in `.env`.
- Discord bot permissions it needs: View Channels, Read Message History, Create Events,
  Manage Events. Message Content Intent must stay on or no memes are found.
