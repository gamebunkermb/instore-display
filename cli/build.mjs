#!/usr/bin/env node
// Reads Discord (read only) and writes out/: the events slide, the approved memes as
// screen-sized PNGs, and out/manifest.json for `sync`. Changes nothing anywhere.
//
//   npm run build                 memes + events
//   npm run build -- --events-only   skip memes (no Discord memes setup needed)
//   npm run build -- --sample        no Discord at all: a sample events slide to check the look

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig, loadEnv, need, secret } from '../lib/config.mjs';
import { discordClient } from '../lib/discord.mjs';
import { selectMemes, approverCheck, roleIdsByName } from '../lib/memes.mjs';
import { upcomingEvents } from '../lib/events.mjs';
import { eventsSvg, svgToPng, fitMeme } from '../lib/slide.mjs';
import { contentName } from '../lib/sync.mjs';
import { addDays, localDate, zonedToUtc } from '../lib/time.mjs';

const args = new Set(process.argv.slice(2));
const config = loadConfig();
loadEnv();
const tz = config.store.timezone;
const out = join(ROOT, 'out');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'memes'), { recursive: true });

const items = [];
let events;

if (args.has('--sample')) {
  const today = localDate(new Date(), tz);
  events = [
    { name: 'Escalation League – Week 2', start: zonedToUtc(addDays(today, 1), '18:00', tz), points: 1000 },
    { name: 'Warhammer 40,000 RTT', start: zonedToUtc(addDays(today, 3), '10:00', tz), points: 2000 },
    { name: 'Paint Night', start: zonedToUtc(addDays(today, 5), '18:30', tz), points: null },
    { name: 'Escalation League – Week 3', start: zonedToUtc(addDays(today, 8), '18:00', tz), points: 1250 },
  ];
} else {
  const discord = discordClient(secret('DISCORD_BOT_TOKEN'));
  const guildId = need(config, 'discord.guild_id');
  events = upcomingEvents(await discord.scheduledEvents(guildId), {
    timeZone: tz, lookaheadDays: config.events.lookahead_days, maxRows: config.events.max_rows,
  });

  if (!args.has('--events-only')) {
    const m = config.discord.memes;
    const channelId = need(config, 'discord.memes.channel_id');
    const roleIds = [...(m.approver_role_ids ?? [])];
    if (m.approver_role_names?.length) {
      roleIds.push(...roleIdsByName(await discord.roles(guildId), m.approver_role_names));
    }
    if (!roleIds.length && !m.approver_user_ids?.length) {
      throw new Error('config/display.yaml: set discord.memes.approver_role_names, approver_role_ids or approver_user_ids');
    }
    const memes = await selectMemes(await discord.messages(channelId, m.scan_messages), {
      emoji: m.approve_emoji, maxAgeDays: m.max_age_days, maxCount: m.max_count,
      reactors: (messageId) => discord.reactors(channelId, messageId, m.approve_emoji),
      isApprover: approverCheck({
        userIds: m.approver_user_ids ?? [], roleIds,
        memberRoles: (userId) => discord.memberRoles(guildId, userId),
      }),
    });
    for (const meme of memes) {
      const res = await fetch(meme.url);
      if (!res.ok) { console.warn(`skip meme ${meme.key}: download ${res.status}`); continue; }
      try {
        const png = await fitMeme(Buffer.from(await res.arrayBuffer()), config.slide);
        const name = `meme-${meme.key}`;
        const file = join('memes', `${name}.png`);
        writeFileSync(join(out, file), png);
        items.push({ name, kind: 'meme', file, seconds: config.yodeck.meme_seconds, postedAt: meme.postedAt });
      } catch (e) {
        console.warn(`skip meme ${meme.key}: ${e.message}`);
      }
    }
  }
}

const png = await svgToPng(eventsSvg(events, { storeName: config.store.name, timeZone: tz, slide: config.slide }));
const eventsName = contentName('events', png);
writeFileSync(join(out, 'events.png'), png);
items.unshift({ name: eventsName, kind: 'events', file: 'events.png', seconds: config.yodeck.events_seconds });

writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  events: events.map((e) => ({ name: e.name, start: e.start.toISOString(), points: e.points })),
  items,
}, null, 2));

console.log(`Events on the slide: ${events.length}`);
for (const e of events) console.log(`  ${localDate(e.start, tz)}  ${e.name}${e.points ? `  (${e.points} pts)` : ''}`);
console.log(`Approved memes: ${items.filter((i) => i.kind === 'meme').length}`);
console.log(`Wrote ${join('out', 'events.png')} and out/manifest.json`);
