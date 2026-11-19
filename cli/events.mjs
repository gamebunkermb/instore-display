#!/usr/bin/env node
// The store's Discord events: list, create, edit, cancel. The screen's events slide reads
// these at its next run. A league's weekly series is `npm run league` instead.
//
// Anything that changes Discord is a public post, so it is a dry run unless a person adds
// --execute --confirm <n>, where <n> is the count the dry run printed.
//
//   npm run events -- list [--all]
//   npm run events -- create --name "Warhammer 40,000 RTT" --date 2026-12-05 --time 10:00 \
//       [--points 2000] [--minutes 480] [--location "In store"] [--notes "Bring a printed list"]
//   npm run events -- edit --id <event id> [--name ..] [--date ..] [--time ..] [--minutes ..]
//       [--points 1500 | --points 0 to remove] [--location ..] [--notes ..]
//   npm run events -- cancel --id <event id>
//   npm run events -- cancel --match "Escalation League"     every scheduled event whose name contains it
//   (any of those) --execute --confirm <n>

import { parseArgs } from 'node:util';
import { loadConfig, loadEnv, need, secret } from '../lib/config.mjs';
import { discordClient } from '../lib/discord.mjs';
import { eventPayload, editPayload, pickForCancel, describe } from '../lib/manage.mjs';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' }, match: { type: 'string' }, all: { type: 'boolean', default: false },
    name: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' },
    minutes: { type: 'string' }, points: { type: 'string' }, location: { type: 'string' },
    notes: { type: 'string' },
    execute: { type: 'boolean', default: false }, confirm: { type: 'string' },
  },
});
const verb = positionals[0];
if (!['list', 'create', 'edit', 'cancel'].includes(verb)) {
  console.error('Use: list | create | edit | cancel. See the top of cli/events.mjs.');
  process.exit(1);
}

const config = loadConfig();
loadEnv();
const tz = config.store.timezone;
const guildId = need(config, 'discord.guild_id');
const discord = discordClient(secret('DISCORD_BOT_TOKEN'));
const num = (v) => (v === undefined ? undefined : Number(v));
const events = await discord.scheduledEvents(guildId);
const byId = new Map(events.map((e) => [e.id, e]));

/** Print the count, then stop unless --execute --confirm matches it. */
function gate(count) {
  console.log(`\n${count} to change.`);
  if (!a.execute) {
    console.log(count ? `Dry run. To apply: add --execute --confirm ${count}` : 'Nothing to do.');
    process.exit(0);
  }
  if (Number(a.confirm) !== count) {
    console.error(`--confirm must be ${count}, the count above. Nothing changed.`);
    process.exit(1);
  }
}

if (verb === 'list') {
  const shown = events
    .filter((e) => a.all || e.status === 1 || e.status === 2)
    .sort((x, y) => new Date(x.scheduled_start_time) - new Date(y.scheduled_start_time));
  for (const e of shown) console.log(describe(e, tz));
  console.log(`\n${shown.length} event(s)${a.all ? '' : ' scheduled or happening now (--all for every one)'}.`);
}

if (verb === 'create') {
  const payload = eventPayload({
    name: a.name, date: a.date, time: a.time, points: num(a.points) ?? null,
    durationMinutes: num(a.minutes) ?? config.league.duration_minutes,
    timeZone: tz, location: a.location ?? config.league.location, notes: a.notes,
  });
  const clash = events.find((e) => e.name === payload.name && new Date(e.scheduled_start_time).toISOString() === payload.scheduled_start_time);
  if (clash) { console.log(`Already on the server: ${describe(clash, tz)}`); process.exit(0); }
  console.log(`create  ${a.date} ${a.time}  ${payload.name}`);
  if (payload.description) console.log(`        ${payload.description.replace(/\n/g, '\n        ')}`);
  console.log(`        ${payload.entity_metadata.location}, until ${new Date(payload.scheduled_end_time).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })}`);
  gate(1);
  const e = await discord.createScheduledEvent(guildId, payload);
  console.log(`created ${describe(e, tz)}`);
}

if (verb === 'edit') {
  if (!a.id) { console.error('--id is required (see `list`)'); process.exit(1); }
  const event = byId.get(a.id);
  if (!event) { console.error(`no event with id ${a.id}`); process.exit(1); }
  const body = editPayload(event, {
    name: a.name, date: a.date, time: a.time, minutes: num(a.minutes),
    points: num(a.points), location: a.location, notes: a.notes,
  }, { timeZone: tz });
  console.log(`edit    ${describe(event, tz)}`);
  for (const [k, v] of Object.entries(body)) {
    const before = k === 'entity_metadata' ? event.entity_metadata?.location : event[k];
    const after = k === 'entity_metadata' ? v.location : v;
    console.log(`  ${k}:\n    was ${JSON.stringify(before ?? '')}\n    now ${JSON.stringify(after)}`);
  }
  gate(1);
  const e = await discord.editScheduledEvent(guildId, event.id, body);
  console.log(`edited  ${describe(e, tz)}`);
}

if (verb === 'cancel') {
  const picked = pickForCancel(events, { id: a.id, match: a.match });
  for (const e of picked) console.log(`cancel  ${describe(e, tz)}`);
  gate(picked.length);
  for (const e of picked) {
    await discord.cancelScheduledEvent(guildId, e.id);
    console.log(`cancelled ${e.name}`);
  }
}
