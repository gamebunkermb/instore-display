#!/usr/bin/env node
// Reads Discord (read only) and builds the screen into out/site/: the slideshow page
// (index.html + slides.json), the events slide, and the approved memes, images as
// screen-sized PNGs and videos as small MP4s. Changes nothing anywhere.
// The weekly workflow publishes out/site/ to GitHub Pages; Yodeck shows that page.
//
//   npm run build                    memes + events
//   npm run build -- --events-only   skip memes
//   npm run build -- --sample        no Discord at all: sample events, to check the look
//
// Then open out/site/index.html through a local server to watch it, e.g.
//   npx http-server out/site    (the page reads slides.json, which file:// blocks)

import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, loadConfig, loadEnv, need, secret } from '../lib/config.mjs';
import { discordClient } from '../lib/discord.mjs';
import { selectMemes, approverCheck, roleIdsByName } from '../lib/memes.mjs';
import { upcomingEvents } from '../lib/events.mjs';
import { eventsSvg, svgToPng, memeForPage } from '../lib/slide.mjs';
import { contentName } from '../lib/sync.mjs';
import { slidesFor, eventsForPage, eventForPage, qrSvg } from '../lib/site.mjs';
import { loadFileEvents, fromFile, combineEvents } from '../lib/file-events.mjs';
import { hasFfmpeg, transcode, passThroughExt } from '../lib/video.mjs';
import { addDays, localDate, zonedToUtc } from '../lib/time.mjs';

const args = new Set(process.argv.slice(2));
const config = loadConfig();
loadEnv();
const tz = config.store.timezone;
const screen = config.screen;
const site = join(ROOT, 'out', 'site');
rmSync(join(ROOT, 'out'), { recursive: true, force: true });
mkdirSync(join(site, 'memes'), { recursive: true });

const items = [];
let events;

if (args.has('--sample')) {
  const today = localDate(new Date(), tz);
  const ev = (name, day, time, points) => {
    const start = zonedToUtc(addDays(today, day), time, tz);
    return { name, start, end: new Date(start.getTime() + 4 * 3600e3), points };
  };
  events = [
    ev('Infinity Thursday', 0, '23:00', null),
    ev('Escalation League – Week 2', 1, '18:00', 1000),
    ev('Warhammer 40,000 RTT', 3, '10:00', 2000),
    ev('Paint Night', 5, '18:30', null),
    ev('Escalation League – Week 3', 8, '18:00', 1250),
  ];
  for (const [n, color, w, h] of [[1, '#2b6cb0', 900, 900], [2, '#9b2c2c', 1280, 720]]) {   // two stand-in memes
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/><text x="${w / 2}" y="${h / 2 + 30}" font-size="90" text-anchor="middle" fill="#fff" font-family="sans-serif">Sample meme ${n}</text></svg>`;
    const file = `memes/meme-sample-${n}.jpg`;
    writeFileSync(join(site, file), await memeForPage(Buffer.from(svg)));
    items.push({ name: `meme-sample-${n}`, kind: 'meme', type: 'image', file, seconds: screen.meme_seconds });
  }
} else {
  const discord = discordClient(secret('DISCORD_BOT_TOKEN'));
  const guildId = need(config, 'discord.guild_id');
  events = upcomingEvents(await discord.scheduledEvents(guildId), {
    timeZone: tz, lookaheadDays: config.events.spotlight_days, maxRows: 100,   // trimmed to the list window below
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

    const ffmpeg = hasFfmpeg();
    const tmp = join(tmpdir(), `instore-display-${process.pid}`);
    mkdirSync(tmp, { recursive: true });
    for (const meme of memes) {
      const name = `meme-${meme.key}`;
      try {
        if (meme.type === 'video' && meme.size && meme.size > screen.video_max_mb * 1024 * 1024) {
          console.warn(`skip video ${meme.key}: over ${screen.video_max_mb} MB`);
          continue;
        }
        if (meme.type === 'video' && !ffmpeg && !passThroughExt(meme.filename)) {
          console.warn(`skip video ${meme.key}: ${meme.filename} needs ffmpeg to convert`);
          continue;
        }
        const res = await fetch(meme.url);
        if (!res.ok) { console.warn(`skip meme ${meme.key}: download ${res.status}`); continue; }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (meme.type === 'video') {
          let file;
          if (ffmpeg) {
            const src = join(tmp, `${name}.src`);
            writeFileSync(src, bytes);
            file = `memes/${name}.mp4`;
            transcode(src, join(site, file), { maxSeconds: screen.video_max_seconds });
          } else {
            file = `memes/${name}.${passThroughExt(meme.filename)}`;
            writeFileSync(join(site, file), bytes);
          }
          items.push({ name, kind: 'meme', type: 'video', file, seconds: screen.video_max_seconds, postedAt: meme.postedAt });
        } else {
          const file = `memes/${name}.jpg`;
          writeFileSync(join(site, file), await memeForPage(bytes));
          items.push({ name, kind: 'meme', type: 'image', file, seconds: screen.meme_seconds, postedAt: meme.postedAt });
        }
      } catch (e) {
        console.warn(`skip meme ${meme.key}: ${e.message}`);
      }
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Add the events kept in config/events.yaml (BCP tournaments), then split into the list
// and the tournaments that get their own spotlight slide.
const fileEvents = loadFileEvents(join(ROOT, 'config', 'events.yaml')).map((e) => fromFile(e, { timeZone: tz }));
const combined = combineEvents(events, fileEvents, {
  timeZone: tz, lookaheadDays: config.events.lookahead_days, spotlightDays: config.events.spotlight_days, maxRows: config.events.max_rows,
});
events = combined.list;
mkdirSync(join(site, 'qr'), { recursive: true });
const spotlights = [];
for (const [n, e] of combined.spotlights.entries()) {
  let qr = null;
  if (e.link) { qr = `qr/event-${n + 1}.svg`; writeFileSync(join(site, qr), await qrSvg(e.link)); }
  spotlights.push({ event: eventForPage(e), qr, seconds: screen.spotlight_seconds });
}

const png = await svgToPng(eventsSvg(events, { storeName: config.store.name, timeZone: tz, slide: config.slide }));
writeFileSync(join(site, 'events.png'), png);
items.unshift({ name: contentName('events', png), kind: 'events', type: 'image', file: 'events.png', seconds: screen.events_seconds });

const builtAt = new Date().toISOString();
const slides = slidesFor(items, screen.events_every, eventsForPage(events), spotlights);
cpSync(join(ROOT, 'web'), site, { recursive: true });          // index.html, brand/, fonts/
// Stamp the page with a version, so screens still running an older page reload into the new one.
const pageHtml = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8');
const pageVersion = contentName('page', Buffer.from(pageHtml)).slice(5);
writeFileSync(join(site, 'index.html'), pageHtml.replace('__PAGE_VERSION__', pageVersion));
writeFileSync(join(site, 'slides.json'), JSON.stringify({ builtAt, pageVersion, storeName: config.store.name, website: config.store.website ?? '', timeZone: tz, slides }, null, 2));
// For `sync` (Yodeck API, Premium plans only). Paths are relative to out/site.
writeFileSync(join(ROOT, 'out', 'manifest.json'), JSON.stringify({
  builtAt,
  events: events.map((e) => ({ name: e.name, start: e.start.toISOString(), points: e.points })),
  items,
}, null, 2));

console.log(`Tournament spotlights: ${spotlights.length}${spotlights.map((s) => `\n  ${s.event.start.slice(0, 10)}  ${s.event.name}`).join('')}`);
console.log(`Events on the slide: ${events.length}`);
for (const e of events) console.log(`  ${localDate(e.start, tz)}  ${e.name}${e.points ? `  (${e.points} pts)` : ''}`);
const memeItems = items.filter((i) => i.kind === 'meme');
console.log(`Approved memes: ${memeItems.length} (${memeItems.filter((i) => i.type === 'video').length} video)`);
console.log(`Slides in one loop: ${slides.length}`);
console.log('Wrote out/site/ (index.html, slides.json, events.png, memes/)');
