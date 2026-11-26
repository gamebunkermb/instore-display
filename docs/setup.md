# Setup and status

## How it works

Yodeck is on the **free Basic plan**, which has no API. So the screen shows a **web page**
instead: every morning at 6 AM the GitHub workflow reads Discord, builds a slideshow page (events
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

## Done (by 2026-11-21)

- GitHub Pages is on (Source: GitHub Actions) and the page is live at the address above.
- The bot token is saved as the repository secret `DISCORD_BOT_TOKEN`.
- Manual runs of *Weekly in-store display* are green: events slide, then memes.

## Left for Brent (in order)

1. **Staff alerts.** In the Discord channel staff should see alerts in: Edit Channel →
   Integrations → Webhooks → New Webhook → Copy Webhook URL. Then repo → Settings → Secrets
   and variables → Actions → New repository secret, name `STAFF_ALERT_WEBHOOK_URL`, value
   the URL. Until then a failed run is only red in the Actions tab.
2. **Token for the store timer.** Create the fine-grained token described in
   [operations.md](operations.md#dispatch-token) and put it on the VM. Until the VM runs,
   GitHub's own schedule builds the page, usually 7–12 hours late.
3. **Approve some memes:** react ✅ in #🤡-meme-bunker (Store Owners or Jared), then run the
   workflow by hand or wait for the next 6 AM run.
4. **Put it on the screen when you're happy.** Either:
   - set the screen's content to the playlist **In-store display (memes + events) (1)**, or
   - add the Web Page item to the **Register** playlist next to what's there now (give it a
     few minutes, e.g. 300 s; it starts at the events slide each time it comes round).
   Then **Push to Screens**.
5. Optional: the bot's username is spelled "Store-Dsiplay" (Bot page → Username).

Day to day (what runs when, alerts, forcing a rebuild): [operations.md](operations.md).

## Good to know

- The page is public but unlisted and marked no-index. It only ever holds approved memes
  and the events list.
- Videos are re-encoded to silent 720p MP4, cut at 60 s (`screen.video_max_seconds`).
- Preview locally: `npm run build -- --sample` then `npm run serve` and open
  http://localhost:8080. `npm run build` does the real thing with the token in `.env`.
- Discord bot permissions it needs: View Channels, Read Message History, Create Events,
  Manage Events. Message Content Intent must stay on or no memes are found.
