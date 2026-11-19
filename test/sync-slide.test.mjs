import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { planSync, playOrder, playlistItems, contentName } from '../lib/sync.mjs';
import { eventsSvg, svgToPng, fitMeme, escapeXml } from '../lib/slide.mjs';
import { yodeckClient } from '../lib/yodeck.mjs';

const ev = { name: 'events-abc', kind: 'events', seconds: 20 };
const meme = (n) => ({ name: `meme-${n}`, kind: 'meme', seconds: 12 });

describe('playOrder', () => {
  it('puts the events slide first and after every N memes, never last', () => {
    expect(playOrder([ev, meme(1), meme(2), meme(3), meme(4)], 2))
      .toEqual(['events-abc', 'meme-1', 'meme-2', 'events-abc', 'meme-3', 'meme-4']);
    expect(playOrder([ev], 4)).toEqual(['events-abc']);
  });
});

describe('planSync', () => {
  it('uploads new, keeps existing, deletes only our unused media', () => {
    const existing = [
      { id: 1, name: 'meme-1', tags: ['ours'] },
      { id: 2, name: 'events-old', tags: ['ours'] },
      { id: 3, name: 'someone-elses', tags: ['other'] },
    ];
    const plan = planSync([ev, meme(1), meme(2)], existing, { tag: 'ours', every: 4 });
    expect(plan.uploads.map((u) => u.name)).toEqual(['events-abc', 'meme-2']);
    expect(plan.keep).toEqual([{ ...meme(1), id: 1 }]);
    expect(plan.deletes.map((d) => d.id)).toEqual([2]);
  });

  it('builds playlist items and refuses a missing id', () => {
    const ids = new Map([['events-abc', 10], ['meme-1', 11]]);
    const secs = new Map([['events-abc', 20], ['meme-1', 12]]);
    expect(playlistItems(['events-abc', 'meme-1'], ids, secs)).toEqual([
      { id: 10, type: 'media', priority: 1, duration: 20 },
      { id: 11, type: 'media', priority: 2, duration: 12 },
    ]);
    expect(() => playlistItems(['meme-9'], ids, secs)).toThrow(/meme-9/);
  });

  it('names by content so an unchanged slide is not re-uploaded', () => {
    expect(contentName('events', Buffer.from('a'))).toBe(contentName('events', Buffer.from('a')));
    expect(contentName('events', Buffer.from('a'))).not.toBe(contentName('events', Buffer.from('b')));
  });
});

describe('slide', () => {
  const slide = { width: 1920, height: 1080, background: '#111418', accent: '#e8b923', text: '#fff', muted: '#999' };
  it('escapes event names and renders a 1920x1080 PNG', async () => {
    const svg = eventsSvg([{ name: 'Tom & Jerry <League>', start: new Date('2027-01-06T23:00:00Z'), points: 1000 }],
      { storeName: 'Store', timeZone: 'America/New_York', slide });
    expect(svg).toContain('Tom &amp; Jerry &lt;League&gt;');
    expect(svg).toContain('1,000 pts');
    const meta = await sharp(await svgToPng(svg)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1920, 1080, 'png']);
    expect(escapeXml(`"'`)).toBe('&quot;&apos;');
  });
  it('shows a friendly line when there are no events', () => {
    expect(eventsSvg([], { storeName: 'S', timeZone: 'America/New_York', slide })).toContain('coming soon');
  });
  it('letterboxes a meme to full screen', async () => {
    const tall = await sharp({ create: { width: 300, height: 900, channels: 3, background: '#f00' } }).webp().toBuffer();
    const meta = await sharp(await fitMeme(tall, slide)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1920, 1080, 'png']);
  });
});

describe('yodeck client upload', () => {
  it('creates, uploads to S3 without our token, completes, and waits for finished', async () => {
    const calls = [];
    const statuses = ['encoding', 'finished'];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method, auth: init.headers?.Authorization });
      const json = (b) => ({ ok: true, status: 200, json: async () => b, headers: new Headers() });
      if (url.endsWith('/media') && init.method === 'POST') return json({ id: 7 });
      if (url.endsWith('/media/7/upload')) return json({ upload_url: 'https://s3.example/put?sig' });
      if (url.startsWith('https://s3.example')) return { ok: true, status: 200 };
      if (url.endsWith('/upload/complete')) return json({ details: 'Upload completed' });
      if (url.endsWith('/media/7/status')) return json({ status: statuses.shift() });
      throw new Error(`unexpected ${url}`);
    };
    const y = yodeckClient('label:secret', { fetchImpl, sleep: async () => {} });
    expect(await y.uploadMedia({ name: 'meme-1', bytes: Buffer.from('x'), tag: 't', seconds: 12 })).toBe(7);
    const s3 = calls.find((c) => c.url.startsWith('https://s3.example'));
    expect(s3.auth).toBeUndefined();
    expect(calls[0].auth).toBe('Token label:secret');
  });
});
