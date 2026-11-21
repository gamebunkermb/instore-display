// Picks the memes that go on the screen: images in the memes channel that an approver
// reacted to with the approve emoji. Nothing goes up without a person approving it.

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

function typeOf(a) {
  const ct = a.content_type ?? '';
  if (ct.startsWith('image/') || IMAGE_EXT.test(a.filename ?? '')) return 'image';
  if (ct.startsWith('video/') || VIDEO_EXT.test(a.filename ?? '')) return 'video';
  return null;
}

/** Image and video attachments (and embedded images) of one message. */
export function mediaOf(message) {
  const fromAttachments = (message.attachments ?? [])
    .map((a) => ({ a, type: typeOf(a) }))
    .filter(({ type }) => type)
    .map(({ a, type }) => ({ key: `${message.id}-${a.id}`, url: a.url, filename: a.filename, type, size: a.size ?? null }));
  const fromEmbeds = (message.embeds ?? [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === 'image' && (e.image?.url || e.thumbnail?.url || e.url))
    .map(({ e, i }) => ({ key: `${message.id}-e${i}`, url: e.image?.url ?? e.thumbnail?.url ?? e.url, filename: `embed-${i}`, type: 'image', size: null }));
  return [...fromAttachments, ...fromEmbeds];
}

/** Does the message carry the approve emoji at all? (Cheap check before asking who reacted.) */
export function hasEmoji(message, emoji) {
  return (message.reactions ?? []).some((r) => {
    const e = r.emoji ?? {};
    const name = e.id ? `${e.name}:${e.id}` : e.name;
    return name === emoji || e.name === emoji;
  });
}

/** Snowflake id -> Date. */
export function snowflakeDate(id) {
  return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
}

/** Votes for Meme of the Week: every reaction on the post except the approve emoji. */
export function reactionScore(message, approveEmoji) {
  return (message.reactions ?? [])
    .filter((r) => !hasEmoji({ reactions: [r] }, approveEmoji))
    .reduce((n, r) => n + (r.count ?? 0), 0);
}

/**
 * Approved memes, newest first: up to maxCount, plus (when `contest` is given) every approved
 * post from the contest week even past maxCount, so the week's winner is never missed.
 * @param messages newest-first channel messages
 * @param isApprover async (userId) => boolean
 * @param reactors async (messageId) => userIds who reacted with the approve emoji
 * @param contest { from: Date, to: Date } or null
 */
export async function selectMemes(messages, { emoji, maxAgeDays, maxCount, now = new Date(), isApprover, reactors, contest = null }) {
  const cutoff = now.getTime() - maxAgeDays * 86400000;
  const inWeek = (t) => contest && t >= contest.from.getTime() && t < contest.to.getTime();
  const picked = [];
  for (const m of messages) {
    const t = snowflakeDate(m.id).getTime();
    const full = picked.length >= maxCount;
    if (full && !inWeek(t)) {
      if (!contest || t < contest.from.getTime()) break;   // older than the contest week: done
      continue;                                             // newer than it: keep looking
    }
    if (t < cutoff) continue;
    const media = mediaOf(m);
    if (media.length === 0 || !hasEmoji(m, emoji)) continue;
    let approvedBy = null;
    for (const userId of await reactors(m.id)) {
      if (await isApprover(userId)) { approvedBy = userId; break; }
    }
    if (!approvedBy) continue;
    const extra = { messageId: m.id, postedAt: new Date(t).toISOString(), score: reactionScore(m, emoji) };
    for (const item of full ? media.slice(0, 1) : media) {
      if (!full && picked.length >= maxCount) break;
      picked.push({ ...item, ...extra });
    }
  }
  return picked;
}

/**
 * The screen's meme order. With a contest week: the top posts of that week by votes get the
 * place labels and play first, counting up to the winner (3rd, 2nd, 1st); then the newest
 * approved memes, maxCount in all. A post needs at least one vote to place.
 */
export function arrangeMemes(picked, { contest = null, places = [], maxCount }) {
  let placed = [];
  if (contest && places.length) {
    const from = contest.from.toISOString(), to = contest.to.toISOString();
    const seen = new Set();
    placed = picked
      .filter((p) => p.postedAt >= from && p.postedAt < to && p.score > 0 && !seen.has(p.messageId) && seen.add(p.messageId))
      .sort((x, y) => y.score - x.score || x.postedAt.localeCompare(y.postedAt))
      .slice(0, places.length)
      .map((p, i) => ({ ...p, place: i + 1, label: places[i] }));
  }
  const placedIds = new Set(placed.map((p) => p.messageId));
  const rest = picked.filter((p) => !placedIds.has(p.messageId)).slice(0, Math.max(0, maxCount - placed.length));
  return [...placed.reverse(), ...rest];
}

/** Role names from config -> role ids, failing loudly on a name the server doesn't have. */
export function roleIdsByName(serverRoles, names) {
  return names.map((name) => {
    const hit = serverRoles.filter((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (hit.length === 0) throw new Error(`no role named "${name}" on the server (config discord.memes.approver_role_names)`);
    if (hit.length > 1) throw new Error(`more than one role named "${name}"; use approver_role_ids instead`);
    return hit[0].id;
  });
}

/** Approver check from config, caching role lookups. */
export function approverCheck({ userIds = [], roleIds = [], memberRoles }) {
  const users = new Set(userIds.map(String));
  const roles = new Set(roleIds.map(String));
  const cache = new Map();
  return async (userId) => {
    if (users.has(userId)) return true;
    if (roles.size === 0) return false;
    if (!cache.has(userId)) cache.set(userId, await memberRoles(userId));
    return cache.get(userId).some((r) => roles.has(r));
  };
}
