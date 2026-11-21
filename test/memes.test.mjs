import { describe, it, expect } from 'vitest';
import { mediaOf, hasEmoji, selectMemes, approverCheck, snowflakeDate, roleIdsByName, reactionScore, arrangeMemes } from '../lib/memes.mjs';
import { lastWeek } from '../lib/time.mjs';

describe('roleIdsByName', () => {
  const roles = [{ id: '1', name: 'Store Owners' }, { id: '2', name: 'Administrator' }, { id: '3', name: 'Dup' }, { id: '4', name: 'dup' }];
  it('finds roles by name, ignoring case and spaces', () => {
    expect(roleIdsByName(roles, ['store owners ', 'Administrator'])).toEqual(['1', '2']);
  });
  it('refuses a missing or ambiguous name', () => {
    expect(() => roleIdsByName(roles, ['Staff'])).toThrow(/no role named "Staff"/);
    expect(() => roleIdsByName(roles, ['DUP'])).toThrow(/more than one/);
  });
});

// Snowflake for a given time (worker/sequence bits zero).
const flake = (iso, n = 0) => String(((BigInt(Date.parse(iso)) - 1420070400000n) << 22n) + BigInt(n));
const now = new Date('2026-11-19T12:00:00Z');

const msg = (id, { images = 1, react = '✅', text = false } = {}) => ({
  id,
  attachments: [
    ...Array.from({ length: images }, (_, i) => ({ id: `a${i}`, url: `https://cdn/x${i}.png`, filename: `x${i}.png`, content_type: 'image/png' })),
    ...(text ? [{ id: 't', url: 'https://cdn/notes.txt', filename: 'notes.txt', content_type: 'text/plain' }] : []),
  ],
  reactions: react ? [{ emoji: { id: null, name: react }, count: 1 }] : [],
});

describe('helpers', () => {
  it('reads time from a snowflake', () => {
    expect(snowflakeDate(flake('2026-11-01T00:00:00Z', 5)).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('takes image and video attachments, not other files', () => {
    const m = msg('1', { images: 2, text: true });
    m.attachments.push({ id: 'v', url: 'https://cdn/clip.mov', filename: 'clip.mov', content_type: 'video/quicktime', size: 5 });
    m.attachments.push({ id: 'w', url: 'https://cdn/clip2', filename: 'clip2.mp4' });
    expect(mediaOf(m).map((i) => [i.key, i.type])).toEqual([['1-a0', 'image'], ['1-a1', 'image'], ['1-v', 'video'], ['1-w', 'video']]);
  });
  it('matches unicode and custom emoji', () => {
    expect(hasEmoji(msg('1'), '✅')).toBe(true);
    expect(hasEmoji({ reactions: [{ emoji: { id: '9', name: 'ok' } }] }, 'ok:9')).toBe(true);
    expect(hasEmoji(msg('1', { react: '👍' }), '✅')).toBe(false);
  });
});

describe('selectMemes', () => {
  const opts = (reactorsById) => ({
    emoji: '✅', maxAgeDays: 60, maxCount: 3, now,
    reactors: async (id) => reactorsById[id] ?? [],
    isApprover: async (u) => u === 'brent',
  });

  it('needs an approver, not just anyone, to react', async () => {
    const a = flake('2026-11-18T00:00:00Z'), b = flake('2026-11-17T00:00:00Z');
    const got = await selectMemes([msg(a), msg(b)], opts({ [a]: ['rando'], [b]: ['rando', 'brent'] }));
    expect(got.map((g) => g.messageId)).toEqual([b]);
  });

  it('skips old posts, posts without the emoji, and stops at maxCount', async () => {
    const ids = ['2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15'].map((d) => flake(`${d}T00:00:00Z`));
    const old = flake('2026-08-01T00:00:00Z');
    const messages = [msg(ids[0], { images: 2 }), msg(ids[1], { react: null }), msg(ids[2]), msg(ids[3]), msg(old)];
    const all = Object.fromEntries([...ids, old].map((i) => [i, ['brent']]));
    const got = await selectMemes(messages, opts(all));
    expect(got.map((g) => g.key)).toEqual([`${ids[0]}-a0`, `${ids[0]}-a1`, `${ids[2]}-a0`]);
  });
});

describe('approverCheck', () => {
  it('accepts listed users and members with a listed role, and caches lookups', async () => {
    let lookups = 0;
    const check = approverCheck({
      userIds: ['brent'], roleIds: ['staff'],
      memberRoles: async (u) => { lookups++; return u === 'jared' ? ['staff'] : []; },
    });
    expect(await check('brent')).toBe(true);
    expect(await check('jared')).toBe(true);
    expect(await check('jared')).toBe(true);
    expect(await check('rando')).toBe(false);
    expect(lookups).toBe(2);
  });
});

describe('Meme of the Week', () => {
  const week = { from: new Date('2026-11-09T05:00:00Z'), to: new Date('2026-11-16T05:00:00Z') };
  const voted = (id, votes) => ({ ...msg(id), reactions: [{ emoji: { id: null, name: '✅' }, count: 2 }, { emoji: { id: null, name: '😂' }, count: votes }] });

  it('counts every reaction except the approve emoji', () => {
    expect(reactionScore({ reactions: [{ emoji: { name: '✅' }, count: 3 }, { emoji: { name: '😂' }, count: 4 }, { emoji: { id: '9', name: 'lol' }, count: 2 }] }, '✅')).toBe(6);
  });

  it('last week is Monday to Sunday in store time', () => {
    const w = lastWeek(new Date('2026-11-21T17:00:00Z'), 'America/New_York');   // Saturday
    expect([w.firstDay, w.lastDay, w.from.toISOString(), w.to.toISOString()]).toEqual(['2026-11-09', '2026-11-15', '2026-11-09T05:00:00.000Z', '2026-11-16T05:00:00.000Z']);
    expect(lastWeek(new Date('2026-11-16T15:00:00Z'), 'America/New_York').firstDay).toBe('2026-11-09');   // Monday
  });

  it("still finds last week's posts when the newest ones already fill the loop", async () => {
    const fresh = ['2026-11-20', '2026-11-19'].map((d) => flake(`${d}T15:00:00Z`));
    const old = flake('2026-11-12T15:00:00Z');
    const messages = [msg(fresh[0]), msg(fresh[1]), voted(old, 5)];
    const got = await selectMemes(messages, {
      emoji: '✅', maxAgeDays: 60, maxCount: 2, now, contest: week,
      reactors: async () => ['brent'], isApprover: async (u) => u === 'brent',
    });
    expect(got.map((g) => [g.messageId, g.score])).toEqual([[fresh[0], 0], [fresh[1], 0], [old, 5]]);
  });

  it('places the top 3 of the week by votes, counting up to the winner, then the newest', () => {
    const p = (id, day, score) => ({ key: `${id}-a0`, messageId: id, postedAt: `2026-11-${day}T15:00:00.000Z`, score });
    const picked = [p('new', 20, 50), p('a', 14, 3), p('b', 13, 9), p('c', 12, 9), p('d', 11, 1), p('zero', 10, 0)];
    const got = arrangeMemes(picked, { contest: week, places: ['Meme of the Week', 'First Loser', 'Another Loser'], maxCount: 5 });
    expect(got.map((g) => [g.messageId, g.place ?? null, g.label ?? null])).toEqual([
      ['a', 3, 'Another Loser'], ['b', 2, 'First Loser'], ['c', 1, 'Meme of the Week'],   // tie on 9: the earlier post wins
      ['new', null, null], ['d', null, null],
    ]);
  });

  it('no votes last week means no places', () => {
    const got = arrangeMemes([{ key: 'x', messageId: 'x', postedAt: '2026-11-12T15:00:00.000Z', score: 0 }], { contest: week, places: ['W'], maxCount: 5 });
    expect(got[0].place).toBeUndefined();
  });
});
