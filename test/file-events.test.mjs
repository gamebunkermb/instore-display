import { describe, it, expect } from 'vitest';
import { fromFile, combineEvents, loadFileEvents } from '../lib/file-events.mjs';
import { slidesFor, qrSvg } from '../lib/site.mjs';

const tz = 'America/New_York';
const now = new Date('2026-11-19T17:00:00Z'); // Thu Nov 19, noon in NY
const rtt = {
  name: 'The Grimdark Before Christmas', game: 'Warhammer 40,000', kind: 'RTT', date: '2026-12-05',
  start: '09:30', end: '20:00', points: 2000, entry: '$25', seats: 16, signed_up: 13, signed_up_on: '2026-11-19',
  link: 'https://www.bestcoastpairings.com/event/o8OnbwHqOl9q', spotlight: true,
};

describe('fromFile', () => {
  it('reads an events.yaml entry in store time', () => {
    const e = fromFile(rtt, { timeZone: tz, now });
    expect(e.start.toISOString()).toBe('2026-12-05T14:30:00.000Z');
    expect(e.end.toISOString()).toBe('2026-12-06T01:00:00.000Z');
    expect(e).toMatchObject({ points: 2000, entry: '$25', seats: 16, signedUp: 13, spotlight: true });
  });
  it('hides a sign-up count older than a week', () => {
    expect(fromFile({ ...rtt, signed_up_on: '2026-11-01' }, { timeZone: tz, now }).signedUp).toBeNull();
    expect(fromFile({ ...rtt, signed_up_on: '2026-11-12' }, { timeZone: tz, now }).signedUp).toBe(13);
  });
  it('accepts YAML dates and rejects bad entries', () => {
    expect(fromFile({ ...rtt, date: new Date('2026-12-05') }, { timeZone: tz, now }).start.toISOString()).toBe('2026-12-05T14:30:00.000Z');
    expect(() => fromFile({ ...rtt, date: '12/5' }, { timeZone: tz, now })).toThrow(/YYYY-MM-DD/);
    expect(() => fromFile({ ...rtt, start: '9am' }, { timeZone: tz, now })).toThrow(/HH:MM/);
    expect(() => fromFile({ ...rtt, link: 'http://x' }, { timeZone: tz, now })).toThrow(/https/);
    expect(() => fromFile({ ...rtt, name: '' }, { timeZone: tz, now })).toThrow(/no name/);
  });
});

describe('combineEvents', () => {
  const opts = { timeZone: tz, now, lookaheadDays: 14, spotlightDays: 45, maxRows: 8 };
  const discord = [
    { id: 'd1', name: 'Infinity Thursday', start: new Date('2026-11-19T22:00:00Z'), end: new Date('2026-11-20T02:00:00Z'), points: null },
    { id: 'd2', name: 'Old one', start: new Date('2026-11-18T22:00:00Z'), end: new Date('2026-11-19T02:00:00Z'), points: null },
  ];
  it('lists the next 14 days and spotlights tournaments up to 45 days out', () => {
    const { list, spotlights } = combineEvents(discord, [fromFile(rtt, { timeZone: tz, now })], opts);
    expect(list.map((e) => e.name)).toEqual(['Infinity Thursday']);
    expect(spotlights.map((e) => e.name)).toEqual(['The Grimdark Before Christmas']);
  });
  it('puts a tournament in the list once it is within 14 days', () => {
    const later = new Date('2026-11-25T17:00:00Z');
    const { list } = combineEvents([], [fromFile(rtt, { timeZone: tz, now: later })], { ...opts, now: later });
    expect(list.map((e) => e.name)).toEqual(['The Grimdark Before Christmas']);
  });
  it('merges a file event into the same Discord event instead of listing it twice', () => {
    const d = { id: 'd3', name: 'The Grimdark Before Christmas (2,000 pts)', start: new Date('2026-12-05T14:30:00Z'), end: null, points: 2000 };
    const { spotlights } = combineEvents([d], [fromFile(rtt, { timeZone: tz, now })], opts);
    expect(spotlights).toHaveLength(1);
    expect(spotlights[0]).toMatchObject({ id: 'd3', entry: '$25', link: rtt.link });
  });
});

describe('spotlights on the page', () => {
  it('come once, straight after the first events slide', () => {
    const items = [
      { name: 'ev', kind: 'events', type: 'image', file: 'events.png', seconds: 20 },
      { name: 'm1', kind: 'meme', type: 'image', file: 'memes/m1.jpg', seconds: 12 },
      { name: 'm2', kind: 'meme', type: 'image', file: 'memes/m2.jpg', seconds: 12 },
    ];
    const types = slidesFor(items, 1, [], [{ event: {}, qr: 'qr/event-1.svg', seconds: 15 }]).map((s) => s.type);
    expect(types).toEqual(['events', 'spotlight', 'image', 'events', 'image']);
  });
  it('makes an SVG QR code', async () => {
    expect(await qrSvg('https://www.bestcoastpairings.com/event/o8OnbwHqOl9q')).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
  it('the shipped events.yaml loads and every entry is valid', () => {
    const entries = loadFileEvents(new URL('../config/events.yaml', import.meta.url));
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(() => fromFile(e, { timeZone: tz, now })).not.toThrow();
  });
});
