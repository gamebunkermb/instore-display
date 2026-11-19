// What the web page plays (slides.json), in screen order.

import QRCode from 'qrcode';
import { playOrder } from './sync.mjs';
import { displayName } from './events.mjs';

/** An event as the page draws it: title without the points, which get their own badge. */
export function eventForPage(e) {
  return {
    name: displayName(e.name),
    start: e.start.toISOString(),
    end: e.end ? e.end.toISOString() : null,
    points: e.points ?? null,
    game: e.game ?? null,
    kind: e.kind ?? null,
    format: e.format ?? null,
    entry: e.entry ?? null,
    seats: e.seats ?? null,
    signedUp: e.signedUp ?? null,
    link: e.link ?? null,
  };
}

export const eventsForPage = (events) => events.map(eventForPage);

/** A QR code (SVG text) for a sign-up link. */
export function qrSvg(link) {
  return QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}

/**
 * items:      [{ name, kind: 'events'|'meme', type: 'image'|'video', file, seconds }]
 * events:     eventsForPage(...) — the events slide is drawn by the page from these
 * spotlights: [{ event: eventForPage(...), qr: 'qr/x.svg' | null, seconds }] — after the first events slide
 */
export function slidesFor(items, every, events = [], spotlights = []) {
  const byName = new Map(items.map((i) => [i.name, i]));
  const out = [];
  let first = true;
  for (const name of playOrder(items, every)) {
    const it = byName.get(name);
    if (it.kind === 'events') {
      out.push({ type: 'events', seconds: it.seconds, events });
      if (first) out.push(...spotlights.map((s) => ({ type: 'spotlight', ...s })));
      first = false;
    } else {
      out.push({ type: it.type, src: it.file.replace(/\\/g, '/'), seconds: it.seconds });
    }
  }
  return out;
}
