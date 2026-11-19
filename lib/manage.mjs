// Creating, editing and cancelling the store's Discord scheduled events. Pure: builds the
// request bodies and picks events; cli/events.mjs shows them and sends them on --execute.
//
// Points live in two places so both people and the slide can read them:
//   name         "Warhammer 40,000 RTT (2,000 pts)"
//   description  a line "Points: 2000"

import { zonedToUtc, localDate, formatTime } from './time.mjs';
import { parsePoints, displayName } from './events.mjs';

const NAME_MAX = 100;
const DESC_MAX = 1000;
const POINTS_LINE = /^\s*points?\s*[:=]\s*[\d,]+\s*$/im;

export const STATUS = { 1: 'scheduled', 2: 'active', 3: 'completed', 4: 'cancelled' };

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('--date must be YYYY-MM-DD');
}
function checkTime(time) {
  if (!/^\d{1,2}:\d{2}$/.test(time ?? '')) throw new Error('--time must be HH:MM (24-hour, store time)');
}
function checkPoints(points) {
  if (points != null && (!Number.isInteger(points) || points <= 0)) throw new Error('--points must be a whole number');
}

export function nameWithPoints(name, points) {
  const base = displayName(name);
  return (points ? `${base} (${points.toLocaleString('en-US')} pts)` : base).slice(0, NAME_MAX);
}

/** Replace (or add, or remove when points is null) the "Points: N" line. */
export function descriptionWithPoints(description, points) {
  const lines = String(description ?? '').split('\n').filter((l) => !POINTS_LINE.test(l));
  if (points) lines.push(`Points: ${points}`);
  return lines.join('\n').trim().slice(0, DESC_MAX);
}

/** Body for POST /guilds/{id}/scheduled-events: an in-store (external) event. */
export function eventPayload({ name, date, time, points = null, durationMinutes, timeZone, location, notes }) {
  checkDate(date); checkTime(time); checkPoints(points);
  if (!name?.trim()) throw new Error('--name is required');
  if (!location?.trim()) throw new Error('a location is required (config league.location or --location)');
  const start = zonedToUtc(date, time, timeZone);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return {
    name: nameWithPoints(name.trim(), points),
    description: descriptionWithPoints(notes, points),
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
    privacy_level: 2,     // guild only (the only value Discord allows)
    entity_type: 3,       // external: happens in the store, not in a voice channel
    entity_metadata: { location: location.trim() },
  };
}

/**
 * Body for PATCH /guilds/{id}/scheduled-events/{eventId}: only the fields that change.
 * changes: { name, date, time, minutes, points (number, or 0 to remove), location, notes }
 */
export function editPayload(event, changes, { timeZone }) {
  if (event.status !== 1) throw new Error(`"${event.name}" is ${STATUS[event.status]}; only scheduled events can be edited`);
  const body = {};
  const oldStart = new Date(event.scheduled_start_time);
  const oldEnd = event.scheduled_end_time ? new Date(event.scheduled_end_time) : null;
  const oldPoints = parsePoints(event.name, event.description);
  const points = changes.points === undefined ? oldPoints : (changes.points || null);
  checkPoints(points);

  if (changes.name !== undefined || changes.points !== undefined) {
    body.name = nameWithPoints(changes.name ?? event.name, points);
  }
  if (changes.notes !== undefined || changes.points !== undefined) {
    const base = changes.notes !== undefined ? changes.notes : event.description;
    body.description = descriptionWithPoints(base, points);
  }
  if (changes.date !== undefined || changes.time !== undefined || changes.minutes !== undefined) {
    const date = changes.date ?? localDate(oldStart, timeZone);
    const time = changes.time ?? formatTime24(oldStart, timeZone);
    checkDate(date); checkTime(time);
    const start = zonedToUtc(date, time, timeZone);
    const minutes = changes.minutes ?? (oldEnd ? Math.round((oldEnd - oldStart) / 60000) : 240);
    if (!Number.isInteger(minutes) || minutes <= 0) throw new Error('--minutes must be a whole number');
    body.scheduled_start_time = start.toISOString();
    body.scheduled_end_time = new Date(start.getTime() + minutes * 60000).toISOString();
  }
  if (changes.location !== undefined) {
    if (!changes.location.trim()) throw new Error('--location cannot be empty');
    body.entity_metadata = { location: changes.location.trim() };
  }
  for (const k of ['name', 'description']) if (body[k] === event[k]) delete body[k];
  if (Object.keys(body).length === 0) throw new Error('nothing to change: give at least one of --name --date --time --minutes --points --location --notes');
  return body;
}

function formatTime24(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** Events to cancel: one by --id, or every scheduled event whose name contains --match. */
export function pickForCancel(events, { id, match }) {
  if (!id && !match) throw new Error('give --id <event id> or --match "<part of the name>"');
  if (id) {
    const e = events.find((x) => x.id === id);
    if (!e) throw new Error(`no event with id ${id}`);
    if (e.status !== 1) throw new Error(`"${e.name}" is ${STATUS[e.status]}; only scheduled events can be cancelled`);
    return [e];
  }
  const needle = match.toLowerCase();
  return events
    .filter((e) => e.status === 1 && e.name.toLowerCase().includes(needle))
    .sort((a, b) => new Date(a.scheduled_start_time) - new Date(b.scheduled_start_time));
}

/** One line per event for listings and dry runs. */
export function describe(e, timeZone) {
  const start = new Date(e.scheduled_start_time);
  return `${e.id}  ${localDate(start, timeZone)} ${formatTime(start, timeZone).padStart(8)}  ${STATUS[e.status].padEnd(9)}  ${e.name}`;
}
