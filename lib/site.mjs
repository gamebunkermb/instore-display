// What the web page plays (slides.json), in screen order.

import { playOrder } from './sync.mjs';
import { displayName } from './events.mjs';

/** Events as the page draws them: title without the points, which get their own badge. */
export function eventsForPage(events) {
  return events.map((e) => ({
    name: displayName(e.name),
    start: e.start.toISOString(),
    end: e.end ? e.end.toISOString() : null,
    points: e.points ?? null,
  }));
}

/**
 * items:  [{ name, kind: 'events'|'meme', type: 'image'|'video', file, seconds }]
 * events: eventsForPage(...) — the events slide is drawn by the page from these.
 */
export function slidesFor(items, every, events = []) {
  const byName = new Map(items.map((i) => [i.name, i]));
  return playOrder(items, every).map((name) => {
    const it = byName.get(name);
    if (it.kind === 'events') return { type: 'events', seconds: it.seconds, events };
    return { type: it.type, src: it.file.replace(/\\/g, '/'), seconds: it.seconds };
  });
}
