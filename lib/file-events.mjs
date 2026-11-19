// Events kept in config/events.yaml (tournaments on Best Coast Pairings and the like),
// merged with the Discord events for the screen.

import { readFileSync, existsSync } from 'node:fs';
import YAML from 'yaml';
import { zonedToUtc, localDate, addDays } from './time.mjs';
import { displayName } from './events.mjs';

const STALE_COUNT_DAYS = 7;

export function loadFileEvents(path) {
  if (!existsSync(path)) return [];
  return YAML.parse(readFileSync(path, 'utf8'))?.events ?? [];
}

/** One events.yaml entry -> the event shape the screen uses. Throws on a bad entry. */
export function fromFile(e, { timeZone, now = new Date() }) {
  const where = `config/events.yaml "${e?.name ?? '?'}"`;
  if (!e?.name) throw new Error('config/events.yaml: an event has no name');
  const date = e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${where}: date must be YYYY-MM-DD`);
  for (const k of ['start', 'end']) {
    if (e[k] != null && !/^\d{1,2}:\d{2}$/.test(String(e[k]))) throw new Error(`${where}: ${k} must be HH:MM`);
  }
  if (e.points != null && (!Number.isInteger(e.points) || e.points <= 0)) throw new Error(`${where}: points must be a whole number`);
  if (e.link != null && !/^https:\/\//.test(e.link)) throw new Error(`${where}: link must start with https://`);

  const start = zonedToUtc(date, String(e.start ?? '10:00'), timeZone);
  const end = e.end ? zonedToUtc(date, String(e.end), timeZone) : null;
  // A sign-up count is only shown while it's fresh.
  let signedUp = null;
  if (Number.isInteger(e.signed_up) && e.signed_up_on) {
    const counted = e.signed_up_on instanceof Date ? e.signed_up_on.toISOString().slice(0, 10) : String(e.signed_up_on);
    if (counted >= addDays(localDate(now, timeZone), -STALE_COUNT_DAYS)) signedUp = e.signed_up;
  }
  return {
    id: `file:${date}:${e.name}`,
    name: String(e.name).trim(),
    start, end,
    points: e.points ?? null,
    game: e.game ?? null,
    kind: e.kind ?? null,
    format: e.format ?? null,
    entry: e.entry != null ? String(e.entry) : null,
    seats: Number.isInteger(e.seats) ? e.seats : null,
    signedUp,
    link: e.link ?? null,
    spotlight: e.spotlight === true,
  };
}

const sameEvent = (a, b, timeZone) =>
  displayName(a.name).toLowerCase() === displayName(b.name).toLowerCase()
  && localDate(a.start, timeZone) === localDate(b.start, timeZone);

/**
 * Discord events plus file events (a file event that is also on Discord adds its details to
 * the Discord one), then split into the list (next `lookaheadDays`) and the spotlights.
 */
export function combineEvents(discordEvents, fileEvents, { timeZone, now = new Date(), lookaheadDays, spotlightDays, maxRows }) {
  const all = discordEvents.map((d) => ({ ...d }));
  for (const f of fileEvents) {
    const twin = all.find((d) => sameEvent(d, f, timeZone));
    if (twin) Object.assign(twin, Object.fromEntries(Object.entries(f).filter(([k, v]) => v != null && k !== 'id' && k !== 'name' && k !== 'start')));
    else all.push(f);
  }
  const today = localDate(now, timeZone);
  const notOver = (e) => (e.end ?? e.start) > now;
  const within = (e, days) => localDate(e.start, timeZone) <= addDays(today, days);
  const sorted = all.filter(notOver).sort((a, b) => a.start - b.start);
  return {
    list: sorted.filter((e) => within(e, lookaheadDays)).slice(0, maxRows),
    spotlights: sorted.filter((e) => e.spotlight && within(e, spotlightDays)),
  };
}
