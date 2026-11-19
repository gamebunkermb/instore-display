# instore-display

Runs the store's Yodeck screen. Every Monday a GitHub Action:

1. Reads the Discord server's **scheduled events** for the next 14 days and draws an
   **Upcoming Events** slide (date, time, name and army points, e.g. *Escalation League –
   Week 3 · 1,250 pts*).
2. Collects **memes from the memes channel that a staff member approved with ✅**.
3. Uploads anything new to Yodeck, rebuilds the playlist *In-store display (auto)* (events
   slide, then memes, with the events slide again every 4 memes), pushes the screen, and
   deletes media it no longer uses.

You can also run it any time from Actions → *Weekly in-store display* → Run workflow.

First time? See [docs/setup.md](docs/setup.md).

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
- Creating Discord events is a dry run until a person adds `--execute --confirm <n>`.
- On Yodeck it touches only its own playlist and media tagged `instore-display-auto`. It
  never changes which playlist a screen shows.

## Layout

| Path | What |
|---|---|
| `config/display.yaml` | Ids, timings, colours. No secrets |
| `lib/` | `discord`, `yodeck` (API clients), `memes` (approval), `events` (points), `league`, `slide`, `sync` (plan), `time` |
| `cli/` | `build` (Discord → `out/`), `sync` (`out/` → Yodeck), `league` |
| `.github/workflows/weekly-display.yml` | The Monday run |

Node ≥ 22, ESM, vitest (`npm test`). Secrets: `.env` locally, repository secrets in GitHub.
Why this is its own repo and not in store-ops: store-ops `docs/decisions/2026-11-19-instore-display-repo.md`.
