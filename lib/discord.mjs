// Minimal Discord REST client (API v10) for a bot token. Reads messages, reactions,
// members and scheduled events. Writes: scheduled events (cli/league.mjs, cli/events.mjs) and
// the weekly Meme of the Week reminder message (cli/remind.mjs).

const BASE = 'https://discord.com/api/v10';
const GET_TRIES = 4;          // a read is tried this many times through 5xx and network errors
const TIMEOUT_MS = 30000;     // one request; a timeout counts as a network error

export function discordClient(token, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  // 429 (rate limited: Discord did nothing) is retried for every method, up to 5 tries.
  // A 5xx or a network error is retried for GET only, up to GET_TRIES with 1 s, 2 s, 4 s waits.
  // A write is never re-sent here, because it may have landed; the error it throws carries
  // `transient = true` so the caller can check first (lib/remind.mjs does).
  async function call(method, path, body) {
    let limited = 0, failed = 0;
    for (;;) {
      const retryGet = async () => {
        if (method !== 'GET' || failed + 1 >= GET_TRIES) return false;
        await sleep(1000 * 2 ** failed++);
        return true;
      };
      let res;
      try {
        res = await fetchImpl(BASE + path, {
          method,
          headers: {
            Authorization: `Bot ${token}`,
            'User-Agent': 'DiscordBot (instore-display, 0.1)',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        if (await retryGet()) continue;
        const err = new Error(`Discord ${method} ${path}: network error (${e.cause?.code ?? e.name})`);
        err.transient = true;
        throw err;
      }
      if (res.status === 429) {
        if (++limited >= 5) throw new Error(`Discord ${method} ${path}: still rate limited after 5 tries`);
        const info = await res.json().catch(() => ({}));
        await sleep(Math.ceil((info.retry_after ?? 1) * 1000));
        continue;
      }
      if (res.status >= 500 && await retryGet()) continue;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Discord ${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
        err.status = res.status;
        err.transient = res.status >= 500;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    }
  }

  return {
    /** Newest-first messages, up to `limit` (pages of 100). */
    async messages(channelId, limit) {
      const out = [];
      let before;
      while (out.length < limit) {
        const page = Math.min(100, limit - out.length);
        const q = `?limit=${page}${before ? `&before=${before}` : ''}`;
        const batch = await call('GET', `/channels/${channelId}/messages${q}`);
        out.push(...batch);
        if (batch.length < page) break;
        before = batch[batch.length - 1].id;
      }
      return out;
    },
    /** Post a message. Mentions are switched off, so it never pings anyone. */
    async sendMessage(channelId, content) {
      return call('POST', `/channels/${channelId}/messages`, { content, allowed_mentions: { parse: [] } });
    },
    /** User ids who reacted with `emoji` (unicode, or name:id for a custom emoji). */
    async reactors(channelId, messageId, emoji) {
      const users = await call('GET',
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}?limit=100`);
      return users.map((u) => u.id);
    },
    async memberRoles(guildId, userId) {
      try {
        const m = await call('GET', `/guilds/${guildId}/members/${userId}`);
        return m.roles ?? [];
      } catch (e) {
        if (String(e.message).includes('-> 404')) return []; // left the server
        throw e;
      }
    },
    /** The server's roles: [{ id, name, ... }]. */
    roles(guildId) {
      return call('GET', `/guilds/${guildId}/roles`);
    },
    scheduledEvents(guildId) {
      return call('GET', `/guilds/${guildId}/scheduled-events`);
    },
    createScheduledEvent(guildId, event) {
      return call('POST', `/guilds/${guildId}/scheduled-events`, event);
    },
    editScheduledEvent(guildId, eventId, changes) {
      return call('PATCH', `/guilds/${guildId}/scheduled-events/${eventId}`, changes);
    },
    /** Cancelling keeps the event (and tells people who marked "interested"); it is not a delete. */
    cancelScheduledEvent(guildId, eventId) {
      return call('PATCH', `/guilds/${guildId}/scheduled-events/${eventId}`, { status: 4 });
    },
  };
}
