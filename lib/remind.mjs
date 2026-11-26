// Posting the weekly reminder at most once, even when runs start late, twice, or the send
// fails half way.

export const REPEAT_GUARD_HOURS = 20;

/** The bot's own post of exactly this text within the guard window, if any. */
export function findPosted(messages, text, now = Date.now()) {
  return messages.find((x) => x.author?.bot && x.content?.trim() === text
    && now - Date.parse(x.timestamp) < REPEAT_GUARD_HOURS * 3600e3) ?? null;
}

/**
 * Post `text` unless it is already there. If the send fails in a way that leaves it unknown
 * whether the message landed (network error or a Discord 5xx), look again first: only when it
 * is confirmed missing is it sent a second, last time.
 * Returns { posted, id, note }.
 */
export async function postOnce({ discord, channelId, text, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), scan = 200 }) {
  const before = findPosted(await discord.messages(channelId, scan), text, now());
  if (before) return { posted: false, id: before.id, note: 'already posted, not posting again' };
  try {
    const m = await discord.sendMessage(channelId, text);
    return { posted: true, id: m.id, note: 'posted' };
  } catch (e) {
    if (!e.transient) throw e;
    await sleep(10000);
    const landed = findPosted(await discord.messages(channelId, scan), text, now());
    if (landed) return { posted: true, id: landed.id, note: 'posted (the send reported an error, but the message is there)' };
    const m = await discord.sendMessage(channelId, text);
    return { posted: true, id: m.id, note: 'posted on the second try (the first was confirmed not to have landed)' };
  }
}
