// Upcoming events for the slide, read from the Discord server's scheduled events.
// Points come from the event title or description: "Points: 1000", "1,000 pts", "1000 points".

import { localDate, addDays } from './time.mjs';

const POINTS = [
  /points?\s*[:=]\s*([\d,]{2,6})/i,     // Points: 1000
  /\b([\d,]{2,6})\s*(?:pts?|points?)\b/i, // 1000 pts / 1,000 points
];

export function parsePoints(...texts) {
  for (const text of texts) {
    if (!text) continue;
    for (const re of POINTS) {
      const m = String(text).match(re);
      if (m) {
        const n = Number(m[1].replace(/,/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  }
  return null;
}

/** Discord status 1 = scheduled, 2 = active; 3 completed and 4 cancelled are left out. */
export function upcomingEvents(discordEvents, { now = new Date(), timeZone, lookaheadDays, maxRows }) {
  const today = localDate(now, timeZone);
  const lastDay = addDays(today, lookaheadDays);
  return discordEvents
    .filter((e) => e.status === 1 || e.status === 2)
    .map((e) => ({
      id: e.id,
      name: e.name.trim(),
      start: new Date(e.scheduled_start_time),
      end: e.scheduled_end_time ? new Date(e.scheduled_end_time) : null,
      points: parsePoints(e.name, e.description),
    }))
    .filter((e) => {
      const day = localDate(e.start, timeZone);
      return day >= today && day <= lastDay;
    })
    .sort((a, b) => a.start - b.start)
    .slice(0, maxRows);
}

/** Drop the points text from the title so it isn't shown twice. */
export function displayName(name) {
  return name
    .replace(/\s*[-–—|(]?\s*(?:points?\s*[:=]\s*)?[\d,]{2,6}\s*(?:pts?|points?)\)?\s*$/i, '')
    .replace(/\s*[-–—|]\s*points?\s*[:=]\s*[\d,]{2,6}\s*$/i, '')
    .trim();
}
