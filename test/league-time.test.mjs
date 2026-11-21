import { describe, it, expect } from 'vitest';
import { planLeague, parsePointsList, withoutExisting } from '../lib/league.mjs';
import { zonedToUtc, localDate, addDays, formatDay, formatTime } from '../lib/time.mjs';

const NY = 'America/New_York';

describe('time', () => {
  it('converts store wall time to UTC on both sides of DST', () => {
    expect(zonedToUtc('2027-01-06', '18:00', NY).toISOString()).toBe('2027-01-06T23:00:00.000Z');
    expect(zonedToUtc('2027-07-06', '18:00', NY).toISOString()).toBe('2027-07-06T22:00:00.000Z');
    expect(zonedToUtc('2027-03-14', '18:00', NY).toISOString()).toBe('2027-03-14T22:00:00.000Z'); // DST starts that morning
  });
  it('reads the local date and formats for the slide', () => {
    const d = new Date('2027-01-07T02:00:00Z'); // Jan 6, 9pm in NY
    expect(localDate(d, NY)).toBe('2027-01-06');
    expect(formatDay(d, NY)).toBe('Wed Jan 6');
    expect(formatTime(d, NY)).toMatch(/^9:00\sPM$/);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('league', () => {
  const base = { name: 'Escalation League', start: '2027-01-06', weeks: 3, time: '18:00', durationMinutes: 240, timeZone: NY, location: 'In store' };

  it('plans one event a week with that week\'s points', () => {
    const plan = planLeague({ ...base, points: parsePointsList('500,1000,1500', 3) });
    expect(plan.map((p) => p.day)).toEqual(['2027-01-06', '2027-01-13', '2027-01-20']);
    expect(plan[1].payload.name).toBe('Escalation League – Week 2 (1,000 pts)');
    expect(plan[1].payload.description).toContain('Points: 1000');
    expect(plan[0].payload.scheduled_start_time).toBe('2027-01-06T23:00:00.000Z');
    expect(plan[0].payload.scheduled_end_time).toBe('2027-01-07T03:00:00.000Z');
    expect(plan[0].payload).toMatchObject({ entity_type: 3, privacy_level: 2, entity_metadata: { location: 'In store' } });
  });

  it('repeats a single points value and rejects a wrong-length list', () => {
    expect(parsePointsList('1000', 3)).toEqual([1000, 1000, 1000]);
    expect(() => parsePointsList('500,1000', 3)).toThrow(/2 values/);
    expect(() => parsePointsList('500,abc', 2)).toThrow();
  });

  it('skips weeks already on the server', () => {
    const plan = planLeague({ ...base, points: [500, 1000, 1500] });
    const existing = [{ name: plan[0].payload.name, scheduled_start_time: '2027-01-06T23:00:00+00:00' }];
    expect(withoutExisting(plan, existing)).toHaveLength(2);
  });

  it('numbers from a later week when the league is already under way', () => {
    const plan = planLeague({ ...base, points: [1000, 1250, 1500], firstWeek: 3, totalWeeks: 8 });
    expect(plan[0].payload.name).toBe('Escalation League – Week 3 (1,000 pts)');
    expect(plan[2].payload.description).toContain('Week 5 of 8.');
    expect(() => planLeague({ ...base, points: [1, 1, 1], firstWeek: 7, totalWeeks: 8 })).toThrow(/first-week/);
  });

  it('rejects bad input', () => {
    expect(() => planLeague({ ...base, start: '1/6/2027', points: [1, 1, 1] })).toThrow(/YYYY-MM-DD/);
    expect(() => planLeague({ ...base, time: '6pm', points: [1, 1, 1] })).toThrow(/HH:MM/);
  });
});
