// Leagues for the screen: Discord events named "<League> – Week N" (as cli/league.mjs makes
// them) are grouped into one league, which gets its own slide with the points ladder.

const WEEK_IN_NAME = /^(.*?)\s*[-–—|:]\s*Week\s*(\d+)\b/i;
const WEEK_OF = /\bWeek\s*(\d+)\s*of\s*(\d+)\b/i;

export function gameOf(name) {
  if (/\b40k\b|40,?000/i.test(name)) return 'Warhammer 40,000';
  if (/sigmar|\baos\b/i.test(name)) return 'Age of Sigmar';
  if (/kill\s*team/i.test(name)) return 'Kill Team';
  return null;
}

/**
 * events: [{ name, start: Date, end: Date|null, points, description? }]
 * Returns leagues with at least `minWeeks` weeks still to play, soonest first:
 *   [{ name, game, total, weeks: [{ week, start, end, points }] }]   (dates as ISO strings)
 */
export function leaguesFrom(events, { now = new Date(), minWeeks = 2 } = {}) {
  const groups = new Map();
  for (const e of events) {
    const m = e.name.match(WEEK_IN_NAME);
    if (!m) continue;
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, total: 0, weeks: [] });
    const g = groups.get(key);
    const of = String(e.description ?? '').match(WEEK_OF);
    g.total = Math.max(g.total, of ? Number(of[2]) : 0);
    if ((e.end ?? e.start) <= now) continue;
    g.weeks.push({
      week: Number(m[2]),
      start: e.start.toISOString(),
      end: e.end ? e.end.toISOString() : null,
      points: e.points ?? null,
    });
  }
  return [...groups.values()]
    .filter((g) => g.weeks.length >= minWeeks)
    .map((g) => {
      const weeks = g.weeks.sort((a, b) => a.start.localeCompare(b.start));
      return { name: g.name, game: gameOf(g.name), total: Math.max(g.total, ...weeks.map((w) => w.week)), weeks };
    })
    .sort((a, b) => a.weeks[0].start.localeCompare(b.weeks[0].start));
}
