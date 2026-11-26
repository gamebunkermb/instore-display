// Should this workflow run do its work? Two clocks start the workflows: the store's own
// timer (a workflow_dispatch, on time) and GitHub's schedule (a fallback that often starts
// 7–12 hours late). These rules let either one do the job, and never both.

import { localDate, localClock } from './time.mjs';

export const STALE_AFTER_HOURS = 30;

/**
 * The daily build.
 * - Started by the store's timer or by hand (anything but "schedule"): build, unless the live
 *   page was already built today. `force` rebuilds anyway; a build-only run (publish off)
 *   never touches the live page, so it always builds.
 * - Started by GitHub's schedule: build on the first run at 6 AM or later that finds the live
 *   page not yet built today.
 * builtAt: the live slides.json builtAt (ISO string), or null when it could not be read.
 */
export function buildGate({ event, force = false, publish = true, now, builtAt, timeZone }) {
  const built = builtAt ? new Date(builtAt) : null;
  const builtToday = !!built && !Number.isNaN(built.getTime()) && localDate(built, timeZone) === localDate(now, timeZone);
  if (event !== 'schedule') {
    if (force) return { go: true, reason: 'forced rebuild' };
    if (!publish) return { go: true, reason: 'build only, the live page is not touched' };
    if (builtToday) return { go: false, reason: 'the live page was already built today (the store timer does not force a rebuild)' };
    return { go: true, reason: 'the live page has not been built today' };
  }
  if (localClock(now, timeZone).hour < 6) return { go: false, reason: 'before 6 AM store time' };
  if (builtToday) return { go: false, reason: 'the live page was already built today' };
  return { go: true, reason: 'schedule fallback: 6 AM or later and the live page has not been built today' };
}

/**
 * The Friday reminder.
 * - Started by the store's timer or by hand: go (cli/remind.mjs still skips a repeat post).
 * - Started by GitHub's schedule: go from Friday noon until Saturday 3 AM store time, so a
 *   late start still posts for that Friday. That window is 15 hours and cli/remind.mjs skips
 *   a post made in the last 20, so it can never post twice.
 */
export function reminderGate({ event, now, timeZone }) {
  if (event !== 'schedule') return { go: true, reason: 'started by the store timer or by hand' };
  const { hour, weekday } = localClock(now, timeZone);
  if (weekday === 5 && hour >= 12) return { go: true, reason: 'Friday, noon or later' };
  if (weekday === 6 && hour < 3) return { go: true, reason: 'late start: still Friday night (before Saturday 3 AM)' };
  return { go: false, reason: 'outside Friday noon to Saturday 3 AM store time' };
}

/** Is the live page fresh? Not readable counts as not fresh. */
export function freshness({ now, builtAt, maxHours = STALE_AFTER_HOURS }) {
  const built = builtAt ? new Date(builtAt).getTime() : NaN;
  if (Number.isNaN(built)) return { fresh: false, ageHours: null, reason: 'the live slides.json could not be read' };
  const ageHours = Math.round(((now.getTime() - built) / 3600e3) * 10) / 10;
  if (ageHours > maxHours) return { fresh: false, ageHours, reason: `the live page was built ${ageHours} hours ago (limit ${maxHours})` };
  return { fresh: true, ageHours, reason: `the live page was built ${ageHours} hours ago` };
}
