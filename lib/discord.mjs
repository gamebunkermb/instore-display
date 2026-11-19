// Minimal Discord REST client (API v10) for a bot token. Reads messages, reactions,
// members and scheduled events; the only write is creating scheduled events (cli/league.mjs).

const BASE = 'https://discord.com/api/v10';

export function discordClient(token, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  async function call(method, path, body) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetchImpl(BASE + path, {
        method,
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': 'DiscordBot (instore-display, 0.1)',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        const info = await res.json().catch(() => ({}));
        await sleep(Math.ceil((info.retry_after ?? 1) * 1000));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Discord ${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
      }
      return res.status === 204 ? null : res.json();
    }
    throw new Error(`Discord ${method} ${path}: still rate limited after 5 tries`);
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
    scheduledEvents(guildId) {
      return call('GET', `/guilds/${guildId}/scheduled-events`);
    },
    createScheduledEvent(guildId, event) {
      return call('POST', `/guilds/${guildId}/scheduled-events`, event);
    },
  };
}
