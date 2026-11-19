import { describe, it, expect } from 'vitest';
import { imagesOf, hasEmoji, selectMemes, approverCheck, snowflakeDate } from '../lib/memes.mjs';

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
  it('takes image attachments only', () => {
    expect(imagesOf(msg('1', { images: 2, text: true })).map((i) => i.key)).toEqual(['1-a0', '1-a1']);
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
