// Plans a league's weekly Discord scheduled events (e.g. an Escalation League where the
// army points go up each week). cli/league.mjs prints the plan and creates it on --execute.

import { zonedToUtc, addDays } from './time.mjs';

export function parsePointsList(text, weeks) {
  const list = String(text).split(',').map((s) => Number(s.trim()));
  if (list.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error(`--points: whole numbers, comma separated (got "${text}")`);
  if (list.length === 1) return Array(weeks).fill(list[0]);
  if (list.length !== weeks) throw new Error(`--points has ${list.length} values but --weeks is ${weeks}`);
  return list;
}

export function planLeague({ name, start, weeks, points, time, every = 7, durationMinutes, timeZone, location, notes }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('--start must be YYYY-MM-DD');
  if (!/^\d{1,2}:\d{2}$/.test(time)) throw new Error('--time must be HH:MM (24-hour, store time)');
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new Error('--weeks must be 1 to 52');
  return Array.from({ length: weeks }, (_, i) => {
    const day = addDays(start, i * every);
    const startAt = zonedToUtc(day, time, timeZone);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60000);
    const pts = points[i];
    const title = `${name} – Week ${i + 1} (${pts.toLocaleString('en-US')} pts)`.slice(0, 100);
    const description = [`Week ${i + 1} of ${weeks}.`, `Points: ${pts}`, notes].filter(Boolean).join('\n').slice(0, 1000);
    return {
      day,
      payload: {
        name: title,
        description,
        scheduled_start_time: startAt.toISOString(),
        scheduled_end_time: endAt.toISOString(),
        privacy_level: 2,            // guild only (the only value Discord allows)
        entity_type: 3,              // external: happens in the store, not in a voice channel
        entity_metadata: { location },
      },
    };
  });
}

/** Leave out weeks that already exist on the server (same name and start), so a rerun is safe. */
export function withoutExisting(plan, existing) {
  const seen = new Set(existing.map((e) => `${e.name}|${new Date(e.scheduled_start_time).toISOString()}`));
  return plan.filter((p) => !seen.has(`${p.payload.name}|${p.payload.scheduled_start_time}`));
}
