// The slide list the web page plays (slides.json), in screen order.

import { playOrder } from './sync.mjs';

/** items: [{ name, kind: 'events'|'meme', type: 'image'|'video', file, seconds }] */
export function slidesFor(items, every) {
  const byName = new Map(items.map((i) => [i.name, i]));
  return playOrder(items, every).map((name) => {
    const it = byName.get(name);
    return { type: it.type, src: it.file.replace(/\\/g, '/'), seconds: it.seconds };
  });
}
