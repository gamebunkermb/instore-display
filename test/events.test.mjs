import { describe, it, expect } from 'vitest';
import { parsePoints, upcomingEvents, displayName } from '../lib/events.mjs';

describe('parsePoints', () => {
  it.each([
    ['Points: 1000', 1000],
    ['points=750', 750],
    ['Escalation League – Week 3 (1,250 pts)', 1250],
    ['2000 points', 2000],
    ['Paint night', null],
    ['Week 3 of 6', null],
  ])('%s -> %s', (text, want) => expect(parsePoints(text)).toBe(want));

  it('falls back to the description', () => {
    expect(parsePoints('Escalation League', 'Week 2 of 6.\nPoints: 750')).toBe(750);
  });
});

describe('displayName', () => {
  it('drops the points from the title', () => {
    expect(displayName('Escalation League – Week 3 (1,250 pts)')).toBe('Escalation League – Week 3');
    expect(displayName('RTT - Points: 2000')).toBe('RTT');
    expect(displayName('Paint Night')).toBe('Paint Night');
  });
});

describe('upcomingEvents', () => {
  const now = new Date('2026-11-23T14:00:00Z'); // Mon 9am in New York
  const ev = (id, start, status = 1, name = `E${id}`, description = '') =>
    ({ id, name, description, status, scheduled_start_time: start });

  it('keeps scheduled and active events inside the window, sorted, in store time', () => {
    const list = upcomingEvents([
      ev('late', '2026-12-08T23:00:00Z'),                 // Dec 8 6pm: past 14 days? Nov 23 + 14 = Dec 7 -> out
      ev('b', '2026-11-26T23:00:00Z', 1, 'League (1000 pts)'),
      ev('a', '2026-11-24T00:30:00Z', 2),                 // Nov 23 7:30pm local, today
      ev('cancel', '2026-11-25T23:00:00Z', 4),
      ev('done', '2026-11-25T23:00:00Z', 3),
      ev('edge', '2026-12-08T04:00:00Z'),                 // Dec 7 11pm local: last day, in
    ], { now, timeZone: 'America/New_York', lookaheadDays: 14, maxRows: 8 });
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'edge']);
    expect(list[1].points).toBe(1000);
  });

  it('caps rows', () => {
    const many = Array.from({ length: 12 }, (_, i) => ev(String(i), `2026-11-2${4 + (i % 5)}T20:00:00Z`));
    expect(upcomingEvents(many, { now, timeZone: 'America/New_York', lookaheadDays: 14, maxRows: 8 })).toHaveLength(8);
  });
});
