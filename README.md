# instore-display

Runs the store's Yodeck screen. Every morning at 6 AM (store time) a GitHub Action:

1. Reads the Discord server's **scheduled events** for the next 14 days and draws an
   **Upcoming Events** slide (date, time, name and army points, e.g. *Escalation League –
   Week 3 · 1,250 pts*).
2. Collects **memes from the memes channel that a staff member approved with ✅**, images
   and videos (videos re-encoded to silent 720p MP4).
3. Builds a slideshow web page (events slide, then memes, with the events slide again every
   4 memes) and publishes it to GitHub Pages: https://gamebunkermb.github.io/instore-display/

The Yodeck screen shows that page as a "Web Page" item (Yodeck's free plan has no API), so
new content reaches the screen without anyone touching Yodeck.

You can also run it any time from Actions → *Weekly in-store display* → Run workflow.

**Status and what's left to do: [docs/setup.md](docs/setup.md).**

## Tournaments from Best Coast Pairings

BCP has no public API, so tournaments live in [config/events.yaml](config/events.yaml):
name, game, date and times, points (or format), entry fee, seats, sign-ups and the BCP link.
Ones marked `spotlight: true` get their own big slide with a QR code to the BCP sign-up
page, from 45 days out; within 14 days they also join the events list. Edit the file on
GitHub (update `signed_up` and `signed_up_on` now and then; a count older than a week is
hidden), then run the workflow.

## Managing events

The screen shows the Discord server's events, so events are managed on Discord. You can do
that by hand in Discord, or with these commands. Every change is a dry run first; add
`--execute --confirm <n>` (the number it printed) to apply.

```powershell
npm run events -- list
npm run events -- create --name "Warhammer 40,000 RTT" --date 2026-12-05 --time 10:00 --points 2000 --minutes 480
npm run events -- edit --id <id from list> --points 1500
npm run events -- edit --id <id> --date 2026-12-12 --time 11:00
npm run events -- cancel --id <id>
npm run events -- cancel --match "Escalation League"
```

- `create` options: `--points`, `--minutes` (default 240), `--location` (default "In store"),
  `--notes`. Points go in both the title, "(2,000 pts)", and the description, "Points: 2000".
- `edit` changes only what you give: `--name`, `--date`, `--time`, `--minutes`, `--points`
  (`--points 0` removes them), `--location` or `--notes`. Moving the date keeps the time and
  length, and changing points updates the title and the description together.
- `cancel` marks the event cancelled on Discord, and people who clicked "Interested" are
  told. It is not deleted. `--match` cancels every scheduled event whose name contains the
  text, e.g. a whole league.
- Changes show on the screen at the next run (6 AM daily, or run the workflow by hand).

## Adding a league

Events come from Discord, so a new league is a set of Discord events. Make them all at once:

```powershell
npm run league -- --name "Escalation League" --start 2027-01-06 --weeks 6 --time 18:00 --points 500,750,1000,1250,1500,2000
```

That's a dry run: it lists the weeks. Add `--execute --confirm 6` (the number it printed) to
create them. Rerunning skips weeks that already exist. Options: `--every 14` for fortnightly,
`--notes "Bring a printed list"`, `--minutes 180`, `--location "..."`. One points value
(`--points 1000`) repeats for every week.

Single events can be made by hand in Discord as usual. To show points on the slide, put them
in the title or description: `Points: 2000` or `2000 pts`.

## Guardrails

- Memes need a ✅ from an approver (config `approver_role_ids` / `approver_user_ids`); a
  customer's ✅ does nothing.
- Creating, editing or cancelling Discord events is a dry run until a person adds
  `--execute --confirm <n>`.
- Nothing here changes Yodeck. The screen shows the published page; which playlist a
  screen plays is set by a person in Yodeck.
- The published page is public but unlisted (no-index) and only holds approved memes and
  the events list.

## Layout

| Path | What |
|---|---|
| `config/display.yaml` | Ids, timings, colours. No secrets |
| `lib/` | `discord`, `yodeck` (API clients), `memes` (approval), `events` (points, slide list), `manage` (create/edit/cancel bodies), `league`, `slide`, `site` (slide order), `video`, `sync` (plan), `time` |
| `web/index.html` | The slideshow page the screen shows |
| `cli/` | `build` (Discord → `out/site/`), `serve` (preview it), `events` (list/create/edit/cancel), `league`, `sync` (Yodeck API, Premium only; unused) |
| `.github/workflows/weekly-display.yml` | The Monday run: build, then publish to GitHub Pages |

Node ≥ 22, ESM, vitest (`npm test`). Secrets: `.env` locally, repository secrets in GitHub.
Why this is its own repo and not in store-ops: store-ops `docs/decisions/2026-11-19-instore-display-repo.md`.
