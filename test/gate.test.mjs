import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { buildGate, reminderGate, freshness } from '../lib/gate.mjs';
import { localClock } from '../lib/time.mjs';
import { ROOT } from '../lib/config.mjs';

const NY = 'America/New_York';
const at = (iso) => new Date(iso);
// 2026-11-26 is a Thursday; New York is UTC-5 that week.

describe('localClock', () => {
  it('gives the store hour and weekday, across the UTC date line and DST', () => {
    expect(localClock(at('2026-11-28T04:30:00Z'), NY)).toEqual({ hour: 23, weekday: 5 });   // Fri 11:30 PM
    expect(localClock(at('2026-11-29T05:00:00Z'), NY)).toEqual({ hour: 0, weekday: 7 });    // Sun midnight
    expect(localClock(at('2026-07-03T16:00:00Z'), NY)).toEqual({ hour: 12, weekday: 5 });   // summer: UTC-4
  });
});

describe('buildGate', () => {
  const builtYesterday = '2026-11-26T00:17:43Z';   // Nov 25, 7:17 PM in New York
  const builtToday = '2026-11-26T11:00:30Z';       // Nov 26, 6:00 AM
  const sixAm = at('2026-11-26T11:00:00Z');
  const base = { timeZone: NY, now: sixAm, builtAt: builtYesterday };

  it('store timer (dispatch) builds when the page has not been built today, whatever the hour', () => {
    expect(buildGate({ ...base, event: 'workflow_dispatch' }).go).toBe(true);
    expect(buildGate({ ...base, event: 'workflow_dispatch', now: at('2026-11-26T08:00:00Z') }).go).toBe(true);   // 3 AM
  });
  it('dispatch skips when the page was already built today, unless forced', () => {
    const later = { ...base, now: at('2026-11-26T19:00:00Z'), builtAt: builtToday, event: 'workflow_dispatch' };
    expect(buildGate(later).go).toBe(false);
    expect(buildGate({ ...later, force: true }).go).toBe(true);
  });
  it('a build-only dispatch (publish off) always builds: it cannot touch the live page', () => {
    expect(buildGate({ ...base, event: 'workflow_dispatch', builtAt: builtToday, publish: false }).go).toBe(true);
  });
  it('schedule fallback waits for 6 AM store time', () => {
    expect(buildGate({ ...base, event: 'schedule', now: at('2026-11-26T10:59:00Z') }).go).toBe(false);
    expect(buildGate({ ...base, event: 'schedule' }).go).toBe(true);
  });
  it('schedule fallback builds on a late start, and only once a day', () => {
    const late = at('2026-11-26T22:30:00Z');   // the 10:00 UTC run, started 12.5 hours late
    expect(buildGate({ ...base, event: 'schedule', now: late }).go).toBe(true);
    expect(buildGate({ ...base, event: 'schedule', now: late, builtAt: builtToday }).go).toBe(false);
  });
  it('schedule after the store timer already built: skips', () => {
    expect(buildGate({ ...base, event: 'schedule', now: at('2026-11-26T18:00:00Z'), builtAt: builtToday }).go).toBe(false);
  });
  it('builds when the live page cannot be read', () => {
    for (const builtAt of [null, 'not a date']) {
      expect(buildGate({ ...base, event: 'schedule', builtAt }).go).toBe(true);
      expect(buildGate({ ...base, event: 'workflow_dispatch', builtAt }).go).toBe(true);
    }
  });
  it('"today" is the New York day, not the UTC day', () => {
    // Built Nov 25 at 11:30 PM New York (already Nov 26 in UTC); now Nov 26, 6 AM.
    expect(buildGate({ ...base, event: 'schedule', builtAt: '2026-11-26T04:30:00Z' }).go).toBe(true);
  });
});

describe('reminderGate', () => {
  const sched = (iso) => reminderGate({ event: 'schedule', now: at(iso), timeZone: NY }).go;
  it('dispatch always goes (the 20-hour check in lib/remind.mjs is its only guard)', () => {
    expect(reminderGate({ event: 'workflow_dispatch', now: at('2026-11-25T08:00:00Z'), timeZone: NY }).go).toBe(true);
  });
  it('schedule: Friday noon until Saturday 3 AM store time', () => {
    expect(sched('2026-11-27T16:59:00Z')).toBe(false);   // Fri 11:59 AM
    expect(sched('2026-11-27T17:00:00Z')).toBe(true);    // Fri noon
    expect(sched('2026-11-28T04:59:00Z')).toBe(true);    // Fri 11:59 PM
    expect(sched('2026-11-28T05:30:00Z')).toBe(true);    // Sat 12:30 AM: a run that started late
    expect(sched('2026-11-28T07:59:00Z')).toBe(true);    // Sat 2:59 AM
    expect(sched('2026-11-28T08:00:00Z')).toBe(false);   // Sat 3:00 AM
    expect(sched('2026-11-28T17:00:00Z')).toBe(false);   // Sat noon
    expect(sched('2026-11-26T17:00:00Z')).toBe(false);   // Thu noon
  });
  it('the schedule window is shorter than the 20-hour repeat guard', async () => {
    const { REPEAT_GUARD_HOURS } = await import('../lib/remind.mjs');
    expect(15).toBeLessThan(REPEAT_GUARD_HOURS);
  });
});

describe('freshness', () => {
  const now = at('2026-11-26T14:00:00Z');
  it('fresh up to 30 hours, stale after', () => {
    expect(freshness({ now, builtAt: '2026-11-26T00:17:43Z' })).toMatchObject({ fresh: true, ageHours: 13.7 });
    expect(freshness({ now, builtAt: '2026-11-25T08:00:00Z' }).fresh).toBe(true);    // exactly 30 h
    expect(freshness({ now, builtAt: '2026-11-25T07:00:00Z' }).fresh).toBe(false);   // 31 h
    expect(freshness({ now, builtAt: '2026-11-21T21:49:00Z' }).fresh).toBe(false);   // the Nov 22–25 outage
  });
  it('a page that cannot be read is not fresh', () => {
    expect(freshness({ now, builtAt: null }).fresh).toBe(false);
    expect(freshness({ now, builtAt: 'nope' }).fresh).toBe(false);
  });
});

describe('workflow files', () => {
  const wf = (name) => YAML.parse(readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8'));
  it('display: keep-alive and the freshness check run on every run; failures alert', () => {
    const { jobs, on, concurrency } = wf('weekly-display.yml');
    expect(jobs['keep-alive'].needs).toBeUndefined();
    expect(jobs['keep-alive'].if).toBeUndefined();
    expect(jobs.fresh.if).toContain('always()');
    expect(jobs.build.if).toContain("needs.when.outputs.go == 'true'");
    expect(jobs.alert.needs).toEqual(['when', 'keep-alive', 'build', 'publish', 'fresh']);
    expect(jobs.alert.if).toContain('failure');
    expect(on.workflow_dispatch.inputs.force.default).toBe(true);
    expect(on.schedule.length).toBeGreaterThan(0);
    expect(concurrency['cancel-in-progress']).toBe(false);
  });
  it('reminder: one run at a time, schedule kept as fallback, failures alert', () => {
    const { jobs, on, concurrency } = wf('meme-reminder.yml');
    expect(concurrency).toEqual({ group: 'meme-reminder', 'cancel-in-progress': false });
    expect(on.schedule.length).toBeGreaterThan(0);
    expect(on.workflow_dispatch.inputs.post.default).toBe(false);
    expect(jobs.alert.needs).toBe('remind');
  });
  it('the alert text carries nothing but fixed wording and GitHub run facts', () => {
    for (const name of ['weekly-display.yml', 'meme-reminder.yml']) {
      const { env } = wf(name).jobs.alert.steps[0];
      const used = [...env.MSG.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
      expect(used.every((x) => /^(github\.(workflow|server_url|repository|run_id)|needs\.[\w-]+\.result)$/.test(x))).toBe(true);
      expect(env.WEBHOOK).toBe('${{ secrets.STAFF_ALERT_WEBHOOK_URL }}');
    }
  });
});
