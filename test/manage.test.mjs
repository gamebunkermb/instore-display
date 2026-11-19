import { describe as group, it, expect } from 'vitest';
import { eventPayload, editPayload, pickForCancel, nameWithPoints, descriptionWithPoints, describe } from '../lib/manage.mjs';
import { parsePoints } from '../lib/events.mjs';

const tz = 'America/New_York';
const base = { durationMinutes: 240, timeZone: tz, location: 'In store' };

const existing = (over = {}) => ({
  id: '111', status: 1, name: 'Warhammer 40,000 RTT (2,000 pts)',
  description: 'Bring a printed list\nPoints: 2000',
  scheduled_start_time: '2026-12-05T15:00:00+00:00',  // 10:00 local
  scheduled_end_time: '2026-12-05T23:00:00+00:00',    // 8 hours
  entity_metadata: { location: 'In store' },
  ...over,
});

group('points in name and description', () => {
  it('puts points in both and the slide can read them back', () => {
    const p = eventPayload({ ...base, name: 'Warhammer 40,000 RTT', date: '2026-12-05', time: '10:00', points: 2000, notes: 'Bring a printed list' });
    expect(p.name).toBe('Warhammer 40,000 RTT (2,000 pts)');
    expect(p.description).toBe('Bring a printed list\nPoints: 2000');
    expect(parsePoints(p.name, p.description)).toBe(2000);
    expect(p.scheduled_start_time).toBe('2026-12-05T15:00:00.000Z');
    expect(p.scheduled_end_time).toBe('2026-12-05T19:00:00.000Z');
  });
  it('leaves points out when there are none', () => {
    const p = eventPayload({ ...base, name: 'Paint Night', date: '2026-12-10', time: '18:30' });
    expect(p.name).toBe('Paint Night');
    expect(p.description).toBe('');
  });
  it('replaces rather than stacks points', () => {
    expect(nameWithPoints('RTT (2,000 pts)', 1500)).toBe('RTT (1,500 pts)');
    expect(nameWithPoints('RTT (2,000 pts)', null)).toBe('RTT');
    expect(descriptionWithPoints('Notes\nPoints: 2000', 1500)).toBe('Notes\nPoints: 1500');
    expect(descriptionWithPoints('Notes\nPoints: 2000', null)).toBe('Notes');
  });
  it('rejects bad input', () => {
    expect(() => eventPayload({ ...base, name: 'X', date: '12/5', time: '10:00' })).toThrow(/YYYY-MM-DD/);
    expect(() => eventPayload({ ...base, name: 'X', date: '2026-12-05', time: '10am' })).toThrow(/HH:MM/);
    expect(() => eventPayload({ ...base, name: ' ', date: '2026-12-05', time: '10:00' })).toThrow(/name/);
    expect(() => eventPayload({ ...base, name: 'X', date: '2026-12-05', time: '10:00', points: 1.5 })).toThrow(/points/);
  });
});

group('editPayload', () => {
  it('changes points in both places and nothing else', () => {
    expect(editPayload(existing(), { points: 1500 }, { timeZone: tz })).toEqual({
      name: 'Warhammer 40,000 RTT (1,500 pts)',
      description: 'Bring a printed list\nPoints: 1500',
    });
  });
  it('removes points with 0', () => {
    expect(editPayload(existing(), { points: 0 }, { timeZone: tz })).toEqual({
      name: 'Warhammer 40,000 RTT', description: 'Bring a printed list',
    });
  });
  it('renames and keeps the points', () => {
    expect(editPayload(existing(), { name: 'Winter RTT' }, { timeZone: tz })).toEqual({ name: 'Winter RTT (2,000 pts)' });
  });
  it('moves the date and keeps the time and length', () => {
    expect(editPayload(existing(), { date: '2026-12-12' }, { timeZone: tz })).toEqual({
      scheduled_start_time: '2026-12-12T15:00:00.000Z',
      scheduled_end_time: '2026-12-12T23:00:00.000Z',
    });
  });
  it('moves the time and keeps the date', () => {
    const b = editPayload(existing(), { time: '11:30', minutes: 300 }, { timeZone: tz });
    expect(b.scheduled_start_time).toBe('2026-12-05T16:30:00.000Z');
    expect(b.scheduled_end_time).toBe('2026-12-05T21:30:00.000Z');
  });
  it('replaces notes but keeps the points line', () => {
    expect(editPayload(existing(), { notes: 'Doors 9:30' }, { timeZone: tz })).toEqual({ description: 'Doors 9:30\nPoints: 2000' });
  });
  it('refuses nothing to change, and events that are not scheduled', () => {
    expect(() => editPayload(existing(), {}, { timeZone: tz })).toThrow(/nothing to change/);
    expect(() => editPayload(existing(), { points: 2000 }, { timeZone: tz })).toThrow(/nothing to change/);
    expect(() => editPayload(existing({ status: 4 }), { points: 1 }, { timeZone: tz })).toThrow(/cancelled/);
  });
});

group('pickForCancel', () => {
  const list = [
    existing({ id: 'a', name: 'Escalation League – Week 2 (750 pts)', scheduled_start_time: '2027-01-13T23:00:00Z' }),
    existing({ id: 'b', name: 'Escalation League – Week 1 (500 pts)', scheduled_start_time: '2027-01-06T23:00:00Z' }),
    existing({ id: 'c', name: 'Escalation League – Week 0', status: 3 }),
    existing({ id: 'd', name: 'Paint Night' }),
  ];
  it('matches scheduled events by name, soonest first', () => {
    expect(pickForCancel(list, { match: 'escalation' }).map((e) => e.id)).toEqual(['b', 'a']);
  });
  it('picks one by id and refuses a finished one', () => {
    expect(pickForCancel(list, { id: 'd' }).map((e) => e.id)).toEqual(['d']);
    expect(() => pickForCancel(list, { id: 'c' })).toThrow(/completed/);
    expect(() => pickForCancel(list, { id: 'zzz' })).toThrow(/no event/);
    expect(() => pickForCancel(list, {})).toThrow(/--id/);
  });
  it('describes an event on one line in store time', () => {
    expect(describe(existing(), tz)).toMatch(/^111  2026-12-05 +10:00\sAM  scheduled  Warhammer/);
  });
});
