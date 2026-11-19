#!/usr/bin/env node
// Makes a Yodeck playlist match out/manifest.json (run `build` first). Needs Yodeck's API,
// which only Premium and Enterprise plans have; the store's screen uses the web page instead.
// Dry run by default: prints what it would upload, delete and push.
//
//   npm run sync                       dry run
//   npm run sync -- --execute          upload, update the playlist, push the screens,
//                                      then delete our media that is no longer used
//
// It only touches the playlist named in config (yodeck.playlist_name) and media carrying
// the config tag (yodeck.media_tag). It never reassigns a screen: point the screen at the
// playlist once in Yodeck (docs/setup.md).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig, loadEnv, secret } from '../lib/config.mjs';
import { yodeckClient } from '../lib/yodeck.mjs';
import { planSync, playlistItems } from '../lib/sync.mjs';

const execute = process.argv.includes('--execute');
const config = loadConfig();
loadEnv();
const y = config.yodeck;
const manifest = JSON.parse(readFileSync(join(ROOT, 'out', 'manifest.json'), 'utf8'));
const yodeck = yodeckClient(secret('YODECK_API_TOKEN'));

const existing = await yodeck.listMedia(y.media_tag);
const plan = planSync(manifest.items, existing, { tag: y.media_tag, every: config.screen.events_every });
const playlist = await yodeck.findPlaylist(y.playlist_name);

console.log(`Playlist "${y.playlist_name}": ${playlist ? `id ${playlist.id}` : 'not found, will be created'}`);
console.log(`Upload ${plan.uploads.length}: ${plan.uploads.map((u) => u.name).join(', ') || '-'}`);
console.log(`Keep ${plan.keep.length}`);
console.log(`Delete ${plan.deletes.length} unused: ${plan.deletes.map((d) => d.name).join(', ') || '-'}`);
console.log(`Playlist order (${plan.order.length} slots): ${plan.order.join(', ')}`);
console.log(`Push screens: ${y.screen_ids.length ? y.screen_ids.join(', ') : 'none set (yodeck.screen_ids)'}`);

if (!execute) {
  console.log('\nDry run. Nothing changed. Add --execute to apply.');
  process.exit(0);
}

const ids = new Map(plan.keep.map((k) => [k.name, k.id]));
for (const u of plan.uploads) {
  const bytes = readFileSync(join(ROOT, 'out', 'site', u.file));
  ids.set(u.name, await yodeck.uploadMedia({ name: u.name, bytes, type: u.type, file: u.file, tag: y.media_tag, seconds: u.seconds }));
  console.log(`uploaded ${u.name} -> ${ids.get(u.name)}`);
}

const seconds = new Map(manifest.items.map((i) => [i.name, i.seconds]));
const items = playlistItems(plan.order, ids, seconds);
const saved = playlist
  ? await yodeck.setPlaylistItems(playlist.id, y.playlist_name, items)
  : await yodeck.createPlaylist(y.playlist_name, items);
const check = await yodeck.getPlaylist(playlist?.id ?? saved.id);
if ((check.items ?? []).length !== items.length) {
  throw new Error(`playlist has ${(check.items ?? []).length} items after update, expected ${items.length}; not deleting anything`);
}
console.log(`playlist ${check.id} now has ${items.length} items`);

for (const screenId of y.screen_ids) {
  const r = await yodeck.pushScreen(screenId);
  console.log(`push screen ${screenId}: ${r.status}`);
}

for (const d of plan.deletes) {
  await yodeck.deleteMedia(d.id);
  console.log(`deleted ${d.name}`);
}
console.log('Done.');
