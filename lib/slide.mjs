// Draws the events slide as SVG, and turns SVGs and memes into screen-sized PNGs.

import sharp from 'sharp';
import { formatDay, formatTime } from './time.mjs';
import { displayName } from './events.mjs';

const FONT = "'Segoe UI', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

export function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function eventsSvg(events, { storeName, timeZone, slide }) {
  const { width: W, height: H, background, accent, text, muted } = slide;
  const top = 250;
  const rowH = Math.min(100, Math.floor((H - top - 120) / Math.max(events.length, 1)));
  const rows = events.map((e, i) => {
    const y = top + i * rowH;
    const mid = y + rowH / 2;
    const badge = e.points
      ? `<rect x="${W - 440}" y="${mid - 34}" width="340" height="68" rx="34" fill="${accent}"/>
         <text x="${W - 270}" y="${mid + 14}" text-anchor="middle" font-size="40" font-weight="700" fill="${background}">${escapeXml(e.points.toLocaleString('en-US'))} pts</text>`
      : '';
    return `
      ${i % 2 === 0 ? `<rect x="80" y="${y}" width="${W - 160}" height="${rowH}" rx="14" fill="#ffffff" fill-opacity="0.04"/>` : ''}
      <text x="120" y="${mid - 4}" font-size="38" font-weight="700" fill="${accent}">${escapeXml(formatDay(e.start, timeZone))}</text>
      <text x="120" y="${mid + 34}" font-size="28" fill="${muted}">${escapeXml(formatTime(e.start, timeZone))}</text>
      <text x="480" y="${mid + 15}" font-size="46" font-weight="600" fill="${text}">${escapeXml(clip(displayName(e.name), e.points ? 40 : 52))}</text>
      ${badge}`;
  }).join('');
  const empty = events.length === 0
    ? `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="56" fill="${muted}">New events coming soon – ask at the counter!</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="${background}"/>
  <rect x="0" y="0" width="${W}" height="12" fill="${accent}"/>
  <text x="120" y="150" font-size="96" font-weight="800" fill="${text}">Upcoming Events</text>
  <text x="${W - 120}" y="150" text-anchor="end" font-size="40" fill="${muted}">${escapeXml(storeName)}</text>
  <rect x="120" y="185" width="220" height="8" rx="4" fill="${accent}"/>
  ${rows}${empty}
  <text x="${W / 2}" y="${H - 50}" text-anchor="middle" font-size="32" fill="${muted}">Sign up in store or on our Discord</text>
</svg>`;
}

export function svgToPng(svg) {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Fit a meme onto a full-screen canvas (letterboxed), as PNG. Animated images keep frame 1. For Yodeck uploads. */
export function fitMeme(input, { width, height, background }) {
  return sharp(input, { animated: false })
    .rotate()
    .resize(width, height, { fit: 'contain', background })
    .flatten({ background })
    .png()
    .toBuffer();
}

/** A meme for the web page: shrunk to fit the page's frame (never enlarged), as JPEG. */
export function memeForPage(input, { maxWidth = 1840, maxHeight = 886, background = '#000000' } = {}) {
  return sharp(input, { animated: false })
    .rotate()
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
