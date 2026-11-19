// Picks the memes that go on the screen: images in the memes channel that an approver
// reacted to with the approve emoji. Nothing goes up without a person approving it.

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/** Image attachments (and embedded images) of one message. */
export function imagesOf(message) {
  const fromAttachments = (message.attachments ?? [])
    .filter((a) => (a.content_type ?? '').startsWith('image/') || IMAGE_EXT.test(a.filename ?? ''))
    .map((a) => ({ key: `${message.id}-${a.id}`, url: a.url, filename: a.filename }));
  const fromEmbeds = (message.embeds ?? [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === 'image' && (e.image?.url || e.thumbnail?.url || e.url))
    .map(({ e, i }) => ({ key: `${message.id}-e${i}`, url: e.image?.url ?? e.thumbnail?.url ?? e.url, filename: `embed-${i}` }));
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

/**
 * @param messages newest-first channel messages
 * @param isApprover async (userId) => boolean
 * @param reactors async (messageId) => userIds who reacted with the approve emoji
 */
export async function selectMemes(messages, { emoji, maxAgeDays, maxCount, now = new Date(), isApprover, reactors }) {
  const cutoff = now.getTime() - maxAgeDays * 86400000;
  const picked = [];
  for (const m of messages) {
    if (picked.length >= maxCount) break;
    if (snowflakeDate(m.id).getTime() < cutoff) continue;
    const images = imagesOf(m);
    if (images.length === 0 || !hasEmoji(m, emoji)) continue;
    let approvedBy = null;
    for (const userId of await reactors(m.id)) {
      if (await isApprover(userId)) { approvedBy = userId; break; }
    }
    if (!approvedBy) continue;
    for (const img of images) {
      if (picked.length >= maxCount) break;
      picked.push({ ...img, messageId: m.id, postedAt: snowflakeDate(m.id).toISOString() });
    }
  }
  return picked;
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
