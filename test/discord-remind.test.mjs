import { describe, it, expect } from 'vitest';
import { discordClient } from '../lib/discord.mjs';
import { findPosted, postOnce } from '../lib/remind.mjs';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const bad = (status, body = {}) => ({ ok: false, status, json: async () => body, text: async () => 'oops' });

/** A client whose fetch plays `script` in order: a response, or a function (to throw). */
function client(script) {
  const calls = [], sleeps = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    const step = script.shift();
    if (!step) throw new Error(`unexpected call ${init.method} ${url}`);
    return typeof step === 'function' ? step() : step;
  };
  return { d: discordClient('t', { fetchImpl, sleep: async (ms) => { sleeps.push(ms); } }), calls, sleeps };
}
const netDown = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); };

describe('discord client retries', () => {
  it('GET: retries 5xx and network errors with 1 s, 2 s, 4 s waits, then succeeds', async () => {
    const { d, calls, sleeps } = client([bad(502), netDown, bad(503), ok([{ id: '1', name: 'Store Owners' }])]);
    expect(await d.roles('g')).toEqual([{ id: '1', name: 'Store Owners' }]);
    expect(calls.length).toBe(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });
  it('GET: gives up after 4 tries and says why', async () => {
    const a = client([bad(500), bad(500), bad(500), bad(500)]);
    await expect(a.d.roles('g')).rejects.toMatchObject({ status: 500, transient: true });
    expect(a.calls.length).toBe(4);
    const b = client([netDown, netDown, netDown, netDown]);
    await expect(b.d.roles('g')).rejects.toThrow(/network error \(ECONNRESET\)/);
    expect(b.calls.length).toBe(4);
  });
  it('GET: a 4xx is not retried, and a missing member still reads as "no roles"', async () => {
    const a = client([bad(403)]);
    await expect(a.d.roles('g')).rejects.toMatchObject({ status: 403, transient: false });
    expect(a.calls.length).toBe(1);
    const b = client([bad(404)]);
    expect(await b.d.memberRoles('g', 'u')).toEqual([]);
  });
  it('POST and PATCH are never re-sent after a 5xx or a network error', async () => {
    const a = client([bad(502)]);
    await expect(a.d.sendMessage('c', 'hi')).rejects.toMatchObject({ transient: true });
    const b = client([netDown]);
    await expect(b.d.sendMessage('c', 'hi')).rejects.toMatchObject({ transient: true });
    const c = client([bad(500)]);
    await expect(c.d.editScheduledEvent('g', 'e', {})).rejects.toThrow(/-> 500/);
    expect([a.calls.length, b.calls.length, c.calls.length]).toEqual([1, 1, 1]);
  });
  it('429 is still retried for every method, 5 tries at most', async () => {
    const a = client([bad(429, { retry_after: 0.5 }), ok({ id: 'm1' })]);
    expect(await a.d.sendMessage('c', 'hi')).toEqual({ id: 'm1' });
    expect(a.sleeps).toEqual([500]);
    const b = client([1, 2, 3, 4, 5].map(() => bad(429)));
    await expect(b.d.roles('g')).rejects.toThrow(/still rate limited after 5 tries/);
    expect(b.calls.length).toBe(5);
  });
});

describe('reminder posts once', () => {
  const text = 'Vote for Meme of the Week!';
  const now = Date.parse('2026-11-27T17:00:00Z');
  const msg = (id, hoursAgo, extra = {}) => ({ id, content: text, author: { bot: true }, timestamp: new Date(now - hoursAgo * 3600e3).toISOString(), ...extra });
  const transient = () => Object.assign(new Error('Discord POST -> 502'), { transient: true });
  /** A fake channel: `sends` says what each sendMessage does ('ok', 'lost', 'landed-but-errored', 'denied'). */
  function channel(existing, sends) {
    const posted = [...existing];
    const log = [];
    return {
      log, posted,
      messages: async () => { log.push('read'); return [...posted]; },
      sendMessage: async () => {
        const what = sends.shift();
        log.push(`send:${what}`);
        if (what === 'lost') throw transient();
        if (what === 'denied') throw Object.assign(new Error('Discord POST -> 403'), { transient: false });
        const m = msg(`new${posted.length}`, 0);
        posted.unshift(m);
        if (what === 'landed-but-errored') throw transient();
        return m;
      },
    };
  }
  const run = (discord) => postOnce({ discord, channelId: 'c', text, now: () => now, sleep: async () => {} });

  it('findPosted: the bot\'s own identical post within 20 hours, nothing else', () => {
    expect(findPosted([msg('a', 19)], text, now)?.id).toBe('a');
    expect(findPosted([msg('a', 21)], text, now)).toBeNull();                                // last week's
    expect(findPosted([msg('a', 1, { author: { bot: false } })], text, now)).toBeNull();     // a person quoting it
    expect(findPosted([msg('a', 1, { content: 'something else' })], text, now)).toBeNull();
  });
  it('posts when it is not there', async () => {
    const ch = channel([msg('old', 168)], ['ok']);
    expect(await run(ch)).toMatchObject({ posted: true });
    expect(ch.log).toEqual(['read', 'send:ok']);
  });
  it('store timer posted at noon, GitHub\'s late run finds it and does not post', async () => {
    const ch = channel([msg('noon', 9)], []);
    expect(await run(ch)).toMatchObject({ posted: false, id: 'noon' });
    expect(ch.log).toEqual(['read']);
  });
  it('send errored but the message landed: no second post', async () => {
    const ch = channel([], ['landed-but-errored']);
    expect(await run(ch)).toMatchObject({ posted: true, id: 'new0' });
    expect(ch.log).toEqual(['read', 'send:landed-but-errored', 'read']);
    expect(ch.posted.length).toBe(1);
  });
  it('send errored and it is confirmed missing: one more try, no more', async () => {
    const ch = channel([], ['lost', 'ok']);
    expect(await run(ch)).toMatchObject({ posted: true });
    expect(ch.log).toEqual(['read', 'send:lost', 'read', 'send:ok']);
    expect(ch.posted.length).toBe(1);
    const dead = channel([], ['lost', 'lost']);
    await expect(run(dead)).rejects.toThrow(/502/);
    expect(dead.log.filter((x) => x.startsWith('send')).length).toBe(2);
  });
  it('a refused send (4xx) fails at once, without a retry', async () => {
    const ch = channel([], ['denied']);
    await expect(run(ch)).rejects.toThrow(/403/);
    expect(ch.log).toEqual(['read', 'send:denied']);
  });
});
