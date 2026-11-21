import { describe, it, expect } from 'vitest';
import { leaguesFrom, gameOf } from '../lib/leagues.mjs';
import { slidesFor } from '../lib/site.mjs';

const now = new Date('2026-11-21T17:00:00Z');
const wk = (n, iso, pts) => ({
  name: `40K Holiday Escalation League – Week ${n} (${pts.toLocaleString('en-US')} pts)`,
  start: new Date(iso), end: new Date(new Date(iso).getTime() + 4 * 3600e3), points: pts,
  description: `Week ${n} of 8.\nPoints: ${pts}`,
});

describe('leaguesFrom', () => {
  const events = [
    wk(4, '2026-12-02T23:00:00Z', 1250),
    wk(3, '2026-11-25T23:00:00Z', 1000),
    { name: 'Infinity Thursday', start: new Date('2026-11-26T22:00:00Z'), end: null, points: null },
    { name: 'Age of Sigmar League', start: new Date('2026-11-23T22:00:00Z'), end: null, points: 2000 },
  ];
  it('groups "– Week N" events into one league, in date order, with the total from "Week N of M"', () => {
    expect(leaguesFrom(events, { now })).toEqual([{
      name: '40K Holiday Escalation League', game: 'Warhammer 40,000', total: 8,
      weeks: [
        { week: 3, start: '2026-11-25T23:00:00.000Z', end: '2026-11-26T03:00:00.000Z', points: 1000 },
        { week: 4, start: '2026-12-02T23:00:00.000Z', end: '2026-12-03T03:00:00.000Z', points: 1250 },
      ],
    }]);
  });
  it('leaves out weeks already played, and a league with fewer than 2 weeks left', () => {
    const later = new Date('2026-11-27T12:00:00Z');
    expect(leaguesFrom(events, { now: later })).toEqual([]);
    expect(leaguesFrom(events, { now: later, minWeeks: 1 })[0].weeks.map((w) => w.week)).toEqual([4]);
  });
  it('names the game', () => {
    expect(gameOf('40K Holiday Escalation League')).toBe('Warhammer 40,000');
    expect(gameOf('Age of Sigmar League')).toBe('Age of Sigmar');
    expect(gameOf('Paint Night')).toBeNull();
  });
  it('plays the league slide after the first events slide', () => {
    const items = [
      { name: 'ev', kind: 'events', type: 'image', file: 'events.png', seconds: 20 },
      { name: 'm1', kind: 'meme', type: 'image', file: 'memes/m1.jpg', seconds: 12 },
    ];
    const league = leaguesFrom(events, { now })[0];
    const s = slidesFor(items, 4, [], [{ type: 'league', league, seconds: 15 }]);
    expect(s.map((x) => x.type)).toEqual(['events', 'league', 'image']);
    expect(s[1].league.name).toBe('40K Holiday Escalation League');
  });
});
