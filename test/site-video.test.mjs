import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { slidesFor } from '../lib/site.mjs';
import { ffmpegArgs, passThroughExt } from '../lib/video.mjs';

describe('slidesFor', () => {
  it('plays the events slide first and every N memes, with types and web paths', () => {
    const items = [
      { name: 'events-x', kind: 'events', type: 'image', file: 'events.png', seconds: 20 },
      { name: 'm1', kind: 'meme', type: 'image', file: 'memes\\m1.png', seconds: 12 },
      { name: 'm2', kind: 'meme', type: 'video', file: 'memes/m2.mp4', seconds: 60 },
      { name: 'm3', kind: 'meme', type: 'image', file: 'memes/m3.png', seconds: 12 },
    ];
    expect(slidesFor(items, 2)).toEqual([
      { type: 'image', src: 'events.png', seconds: 20 },
      { type: 'image', src: 'memes/m1.png', seconds: 12 },
      { type: 'video', src: 'memes/m2.mp4', seconds: 60 },
      { type: 'image', src: 'events.png', seconds: 20 },
      { type: 'image', src: 'memes/m3.png', seconds: 12 },
    ]);
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
});
