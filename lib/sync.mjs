// Works out what to change on Yodeck so the playlist matches what `build` produced.
// Pure: no network. cli/sync.mjs carries the plan out.

import { createHash } from 'node:crypto';

export function contentName(prefix, buffer) {
  return `${prefix}-${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}`;
}

/** Playlist order: events slide first, then again after every `every` memes. */
export function playOrder(items, every) {
  const events = items.find((i) => i.kind === 'events');
  const memes = items.filter((i) => i.kind === 'meme');
  const out = [];
  if (events) out.push(events.name);
  memes.forEach((m, i) => {
    out.push(m.name);
    if (events && every > 0 && (i + 1) % every === 0 && i + 1 < memes.length) out.push(events.name);
  });
  return out;
}

/**
 * @param wanted   manifest items [{ name, kind, file, seconds }]
 * @param existing Yodeck media already carrying our tag [{ id, name, tags }]
 */
export function planSync(wanted, existing, { tag, every }) {
  const ours = existing.filter((m) => (m.tags ?? []).includes(tag));
  const byName = new Map(ours.map((m) => [m.name, m]));
  const wantedNames = new Set(wanted.map((w) => w.name));
  return {
    uploads: wanted.filter((w) => !byName.has(w.name)),
    keep: wanted.filter((w) => byName.has(w.name)).map((w) => ({ ...w, id: byName.get(w.name).id })),
    deletes: ours.filter((m) => !wantedNames.has(m.name)),
    order: playOrder(wanted, every),
  };
}

export function playlistItems(order, ids, seconds) {
  return order.map((name, i) => {
    const id = ids.get(name);
    if (id == null) throw new Error(`no Yodeck media id for ${name}`);
    return { id, type: 'media', priority: i + 1, duration: seconds.get(name) };
  });
}
