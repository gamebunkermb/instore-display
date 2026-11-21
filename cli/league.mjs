#!/usr/bin/env node
// Creates a league's weekly events on the Discord server, which the screen then picks up.
// Creating a Discord event is a public post, so this is a dry run unless a person adds
// --execute --confirm <n>, where <n> is the count the dry run printed.
//
//   npm run league -- --name "Escalation League" --start 2027-01-06 --weeks 6 \
//       --time 18:00 --points 500,750,1000,1250,1500,2000 [--every 7] [--notes "Bring a list"]
//       [--first-week 3 --of 8]   (league already under way: name them Week 3..8 of 8)
//   (same) --execute --confirm 6

import { parseArgs } from 'node:util';
import { loadConfig, loadEnv, need, secret } from '../lib/config.mjs';
import { discordClient } from '../lib/discord.mjs';
import { planLeague, parsePointsList, withoutExisting } from '../lib/league.mjs';

const { values: a } = parseArgs({
  options: {
    name: { type: 'string' }, start: { type: 'string' }, weeks: { type: 'string' },
    time: { type: 'string' }, points: { type: 'string' }, every: { type: 'string', default: '7' },
    notes: { type: 'string' }, location: { type: 'string' }, minutes: { type: 'string' },
    'first-week': { type: 'string', default: '1' }, of: { type: 'string' },
    execute: { type: 'boolean', default: false }, confirm: { type: 'string' },
  },
});
for (const k of ['name', 'start', 'weeks', 'time', 'points']) {
  if (!a[k]) { console.error(`--${k} is required. See the top of cli/league.mjs.`); process.exit(1); }
}

const config = loadConfig();
loadEnv();
const weeks = Number(a.weeks);
const plan = planLeague({
  name: a.name, start: a.start, weeks, time: a.time, every: Number(a.every),
  points: parsePointsList(a.points, weeks),
  durationMinutes: Number(a.minutes ?? config.league.duration_minutes),
  timeZone: config.store.timezone,
  location: a.location ?? config.league.location,
  notes: a.notes,
  firstWeek: Number(a['first-week']),
  totalWeeks: a.of ? Number(a.of) : undefined,
});

const guildId = need(config, 'discord.guild_id');
const discord = discordClient(secret('DISCORD_BOT_TOKEN'));
const todo = withoutExisting(plan, await discord.scheduledEvents(guildId));

for (const p of plan) {
  const exists = !todo.includes(p);
  console.log(`${exists ? 'exists ' : 'create '} ${p.day}  ${p.payload.name}`);
}
console.log(`\n${todo.length} to create (${plan.length - todo.length} already on the server).`);

if (!a.execute) {
  console.log(`Dry run. To create them: add --execute --confirm ${todo.length}`);
  process.exit(0);
}
if (Number(a.confirm) !== todo.length) {
  console.error(`--confirm must be ${todo.length}, the count above. Nothing created.`);
  process.exit(1);
}
for (const p of todo) {
  const e = await discord.createScheduledEvent(guildId, p.payload);
  console.log(`created ${e.id}  ${p.payload.name}`);
}
