// Wall-clock times in the store's time zone, without a date library.

function partsInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. -300 for EST). */
export function zoneOffsetMinutes(date, timeZone) {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "2027-01-06" + "18:30" in America/New_York -> the UTC Date of that moment. */
export function zonedToUtc(dateStr, timeStr, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  if ([y, mo, d, h, mi].some(Number.isNaN)) throw new Error(`bad date/time: ${dateStr} ${timeStr}`);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Second pass settles days when the offset changes (DST) between guess and answer.
  utc = guess - zoneOffsetMinutes(new Date(utc), timeZone) * 60000;
  return new Date(utc);
}

/** YYYY-MM-DD of `date` as seen in `timeZone`. */
export function localDate(date, timeZone) {
  const p = partsInZone(date, timeZone);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Hour (0–23) and ISO weekday (1 = Monday … 7 = Sunday) of `date` as seen in `timeZone`. */
export function localClock(date, timeZone) {
  const dow = new Date(`${localDate(date, timeZone)}T12:00:00Z`).getUTCDay();
  return { hour: partsInZone(date, timeZone).h, weekday: dow === 0 ? 7 : dow };
}

/** Add whole days to a YYYY-MM-DD string. */
export function addDays(dateStr, days) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** "Wed Jan 6" and "6:30 PM" for the slide. */
export function formatDay(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
    .format(date).replace(',', '');
}

export function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Last full Monday–Sunday week in the store's time zone, e.g. for Meme of the Week. */
export function lastWeek(now, timeZone) {
  const today = localDate(now, timeZone);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();   // 0 = Sunday
  const monday = addDays(today, -((dow + 6) % 7));
  const first = addDays(monday, -7);
  return { from: zonedToUtc(first, '00:00', timeZone), to: zonedToUtc(monday, '00:00', timeZone), firstDay: first, lastDay: addDays(monday, -1) };
}
