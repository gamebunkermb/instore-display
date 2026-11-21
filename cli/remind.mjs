#!/usr/bin/env node
// Posts the weekly "vote for Meme of the Week" reminder (config/meme-reminder.md) in the memes
// channel as the bot. A dry run prints it; --execute posts it. The Friday GitHub Action runs
// it with --execute (Brent approved the text and the weekly post, 2026-11-21).
//   npm run remind               dry run
//   npm run remind -- --execute  post it

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadConfig, loadEnv, need, secret } from '../lib/config.mjs';
import { discordClient } from '../lib/discord.mjs';

const config = loadConfig();
loadEnv();
const channelId = need(config, 'discord.memes.channel_id');
const text = readFileSync(join(ROOT, 'config', 'meme-reminder.md'), 'utf8').trim();
if (!text || text.length > 2000) throw new Error('config/meme-reminder.md must be 1 to 2000 characters (Discord limit)');

console.log(`Channel ${channelId}:\n---\n${text}\n---`);
if (!process.argv.includes('--execute')) {
  console.log('Dry run. Add --execute to post it.');
  process.exit(0);
}
const m = await discordClient(secret('DISCORD_BOT_TOKEN')).sendMessage(channelId, text);
console.log(`Posted message ${m.id}`);
