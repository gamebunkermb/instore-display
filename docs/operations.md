# Operations

What runs, what starts it, what an alert means and what to do about it.

## What runs when

| When (store time) | Workflow | Does |
|---|---|---|
| Daily, 6 AM | *Weekly in-store display* (`weekly-display.yml`) | Reads Discord, rebuilds the page, publishes it to GitHub Pages |
| Fridays, noon | *Meme of the Week reminder* (`meme-reminder.yml`) | Bot posts the vote reminder in #meme-bunker |

Two clocks start each of them:

1. **The store's timer** (a small Linux VM, systemd timers in America/New_York). It is on
   time. It sends GitHub a "Run workflow" request (`workflow_dispatch`).
2. **GitHub's own schedule**, kept as a fallback. GitHub starts this repo's scheduled runs
   7–12 hours late, so on its own the page would be built around midday or later.

Whichever comes first does the job; the other one skips:

- **Display.** A run started by the store's timer (or by hand) builds unless the live page
  was already built today (New York date of `builtAt` in the live `slides.json`). A run
  started by GitHub's schedule builds only at 6 AM or later, and only if the live page has
  not been built today. Runs queue one behind the other, so two can't build at once.
- **Reminder.** A run started by the store's timer posts. A run started by GitHub's schedule
  posts only between Friday noon and Saturday 3 AM. Either way the script first looks in the
  channel and does not post if the bot already posted the same reminder in the last 20 hours.

Every display run, built or skipped, also:

- switches both scheduled workflows back on (GitHub turns schedules off after 60 days
  without a commit), and
- checks the live page: **the run fails (red) if the page is more than 30 hours old** or
  can't be read.

Each run's summary page says in one line what it decided and why ("Build the page: skipped
(the live page was already built today…)").

## How the VM starts a run

It needs a GitHub token that can do one thing: start workflows in this repo (see "Dispatch
token" below). Keep it in a root-only file on the VM, e.g. `/etc/instore-display/token`
(mode 600), and in Keeper. Never in this repo.

With the GitHub CLI:

```sh
export GH_TOKEN="$(cat /etc/instore-display/token)"
# daily, 06:00
gh workflow run weekly-display.yml -R gamebunkermb/instore-display --ref main -f force=false
# Fridays, 12:00 (without post=true it is only a dry run)
gh workflow run meme-reminder.yml -R gamebunkermb/instore-display --ref main -f post=true
```

Or without the CLI (GitHub answers `204` with no body when it accepts the request):

```sh
curl -fsS -X POST \
  -H "Authorization: Bearer $(cat /etc/instore-display/token)" \
  -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/gamebunkermb/instore-display/actions/workflows/weekly-display.yml/dispatches \
  -d '{"ref":"main","inputs":{"force":"false"}}'
# reminder: .../workflows/meme-reminder.yml/dispatches  -d '{"ref":"main","inputs":{"post":"true"}}'
```

systemd timer lines: `OnCalendar=*-*-* 06:00:00 America/New_York` (display) and
`OnCalendar=Fri *-*-* 12:00:00 America/New_York` (reminder). `Persistent=true` is safe: a
run that fires late or twice is skipped by the rules above.

To rebuild from the VM at other times of day (e.g. a 2 PM refresh to pick up memes approved
that morning), send `-f force=true`, or `"inputs":{"force":"true"}`. The 6 AM timer must send `force=false` (`-f force=false`): the form default is true so that a run started by hand always rebuilds.

### Dispatch token

GitHub → your profile picture → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token:

- Resource owner: **gamebunkermb**
- Repository access: **Only select repositories** → `instore-display`
- Repository permissions: **Actions: Read and write** (Metadata: Read-only is added by
  itself). Nothing else.
- Expiration: the longest offered. Put the date in the calendar: when it expires the VM's
  requests fail with `401`, and GitHub's late schedule is all that is left until it is
  replaced.

## What an alert means

When any job in either workflow fails, the run posts one message to the staff alert webhook
(repository secret `STAFF_ALERT_WEBHOOK_URL`, a Discord channel webhook; without the secret
no message is sent and the run is just red). The message is fixed wording, the job results
and a link to the run. It never contains anything from Discord.

| The message says | Meaning | Do |
|---|---|---|
| `live page fresh: failure`, the rest `success`/`skipped` | Nothing has built for over 30 hours: the screen shows old slides (past events hide themselves, new ones and new memes are missing) | Force a rebuild (below). If that works, find out why the earlier runs skipped: open their summaries |
| `build: failure` | The build broke: Discord was down or refused the bot token, or a test failed. The screen keeps showing the last good page | Open the run, read the red step. Discord trouble: run it again later. `401`: the bot token was reset, save the new one as the `DISCORD_BOT_TOKEN` secret |
| `publish: failure` | Built, but GitHub Pages did not take it | Run it again with **force** |
| `keep schedules on: failure` | Could not re-enable the schedules. The page itself is fine | Run it again; if it keeps failing, check Actions is enabled for the repo |
| "the Friday vote reminder may not have been posted" | The reminder run failed | Look in #meme-bunker. If the reminder is not there, run *Meme of the Week reminder* by hand with **post** ticked; it will not post twice |

No alert and no run at all (VM off *and* GitHub's schedule off) is the one case nothing here
can report: nothing runs, so nothing fails. A glance at the Actions tab now and then covers
it, as does GitHub's own email when it disables a schedule.

## Force a rebuild

Actions → *Weekly in-store display* → **Run workflow** → tick **Rebuild even if the page was
already built today** → Run workflow. About a minute later the page is live; the screen
picks it up at the end of its current loop.

Without the tick, a run by hand on a day that already has a build is skipped (its summary
says so). This is what stops the store's timer and GitHub's schedule from building twice.

From a terminal: `gh workflow run weekly-display.yml -R gamebunkermb/instore-display -f force=true`

## Where the rules live

- `lib/gate.mjs` (tests: `test/gate.test.mjs`): when a run builds or posts, and the 30-hour limit.
- `lib/remind.mjs`: post at most once in 20 hours; a failed send is only repeated after
  checking the message is not there.
- `lib/discord.mjs`: reads are retried through Discord 5xx and network errors (4 tries);
  writes are not re-sent.
