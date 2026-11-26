#!/usr/bin/env node
// Used by the GitHub workflows (rules in lib/gate.mjs). Needs no npm install.
//   node cli/gate.mjs build      should this run build the page?       -> output go=true|false
//   node cli/gate.mjs reminder   should this run post the reminder?    -> output go=true|false
//   node cli/gate.mjs fresh      fails (exit 1) when the live page is over 30 hours old
// Reads only the public page's slides.json. Env: EVENT_NAME, FORCE, PUBLISH (from the workflow).

import { appendFileSync } from 'node:fs';
import { buildGate, reminderGate, freshness } from '../lib/gate.mjs';

const env = process.env;
const timeZone = env.STORE_TZ || 'America/New_York';   // config/display.yaml store.timezone
const now = new Date();
const mode = process.argv[2];

/** builtAt of the page the screen is showing, or null when it can't be read (3 tries). */
async function liveBuiltAt() {
  const repo = (env.GITHUB_REPOSITORY || '').split('/')[1];
  const url = env.LIVE_SLIDES_URL || `https://${env.GITHUB_REPOSITORY_OWNER}.github.io/${repo}/slides.json`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (res.ok) return (await res.json()).builtAt ?? null;
      console.log(`live slides.json: HTTP ${res.status} (try ${attempt})`);
    } catch (e) {
      console.log(`live slides.json: ${e.name} (try ${attempt})`);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 5000));
  }
  return null;
}

function say(line) {
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, line + '\n');
}

function decide(what, { go, reason }) {
  say(`${what}: ${go ? 'yes' : 'skipped'} (${reason}).`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `go=${go}\n`);
}

const event = env.EVENT_NAME || 'workflow_dispatch';
if (mode === 'build') {
  const builtAt = await liveBuiltAt();
  console.log(`Live page built at: ${builtAt ?? 'unknown'}`);
  decide('Build the page', buildGate({ event, force: env.FORCE === 'true', publish: env.PUBLISH !== 'false', now, builtAt, timeZone }));
} else if (mode === 'reminder') {
  decide('Post the reminder', reminderGate({ event, now, timeZone }));
} else if (mode === 'fresh') {
  const f = freshness({ now, builtAt: await liveBuiltAt() });
  say(`${f.fresh ? 'OK' : 'STALE'}: ${f.reason}.`);
  if (!f.fresh) {
    console.log('::error::The page the screen shows is old or could not be read. Run "Weekly in-store display" with "force" ticked (docs/operations.md).');
    process.exit(1);
  }
} else {
  console.error('usage: node cli/gate.mjs build|reminder|fresh');
  process.exit(2);
}
