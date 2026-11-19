import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { slidesFor, eventsForPage } from '../lib/site.mjs';
import { memeForPage } from '../lib/slide.mjs';
import { ffmpegArgs, passThroughExt } from '../lib/video.mjs';

describe('slidesFor', () => {
  it('plays the events slide first and every N memes, with types and web paths', () => {
    const items = [
      { name: 'events-x', kind: 'events', type: 'image', file: 'events.png', seconds: 20 },
      { name: 'm1', kind: 'meme', type: 'image', file: 'memes\\m1.jpg', seconds: 12 },
      { name: 'm2', kind: 'meme', type: 'video', file: 'memes/m2.mp4', seconds: 60 },
      { name: 'm3', kind: 'meme', type: 'image', file: 'memes/m3.jpg', seconds: 12 },
    ];
    const events = [{ name: 'RTT', start: '2026-12-05T15:00:00.000Z', end: null, points: 2000 }];
    expect(slidesFor(items, 2, events)).toEqual([
      { type: 'events', seconds: 20, events },
      { type: 'image', src: 'memes/m1.jpg', seconds: 12 },
      { type: 'video', src: 'memes/m2.mp4', seconds: 60 },
      { type: 'events', seconds: 20, events },
      { type: 'image', src: 'memes/m3.jpg', seconds: 12 },
    ]);
  });

  it('gives the page events without the points in the title', () => {
    const start = new Date('2026-12-05T15:00:00Z');
    const [e] = eventsForPage([{ name: 'Escalation League – Week 3 (1,250 pts)', start, end: null, points: 1250 }]);
    expect(e).toMatchObject({ name: 'Escalation League – Week 3', start: '2026-12-05T15:00:00.000Z', end: null, points: 1250, link: null });
  });
});

describe('memeForPage', () => {
  it('shrinks big memes to fit the frame as JPEG and never enlarges small ones', async () => {
    const big = await sharp({ create: { width: 4000, height: 1000, channels: 4, background: '#f00f' } }).png().toBuffer();
    const m1 = await sharp(await memeForPage(big)).metadata();
    expect([m1.format, m1.width, m1.height]).toEqual(['jpeg', 1840, 460]);
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#0f0' } }).png().toBuffer();
    const m2 = await sharp(await memeForPage(small)).metadata();
    expect([m2.width, m2.height]).toEqual([300, 200]);
  });
});

describe('video', () => {
  it('re-encodes to silent, capped, browser-safe MP4', () => {
    const a = ffmpegArgs('in.mov', 'out.mp4', { maxSeconds: 60 });
    expect(a).toEqual(expect.arrayContaining(['-an', '-t', '60', 'libx264', 'yuv420p', '+faststart']));
    expect(a.at(-1)).toBe('out.mp4');
  });
  it('without ffmpeg keeps only formats browsers play', () => {
    expect(passThroughExt('Clip.MP4')).toBe('mp4');
    expect(passThroughExt('a.webm')).toBe('webm');
    expect(passThroughExt('a.mov')).toBeNull();
  });
});

describe('web page', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  it('reads slides.json, plays muted video, and keeps itself out of search engines', () => {
    expect(html).toContain("fetch('slides.json");
    expect(html).toContain('v.muted = true');
    expect(html).toContain('noindex');
  });
  it('escapes event names before putting them on the page', () => {
    expect(html).toContain('${esc(e.name)}');
  });
  it('only uses brand files that exist', async () => {
    const { existsSync } = await import('node:fs');
    for (const f of html.match(/(?:brand|fonts)\/[\w.-]+/g)) {
      expect(existsSync(new URL(`../web/${f}`, import.meta.url)), f).toBe(true);
    }
  });
});
