// Yodeck REST API v2 client (https://app.yodeck.com/api-docs/, spec marked Beta).
// Auth header: "Token <label>:<value>". The token needs a Premium or Enterprise plan.

const BASE = 'https://app.yodeck.com/api/v2';

export function yodeckClient(token, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  async function call(method, path, body) {
    const url = path.startsWith('http') ? path : BASE + path;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetchImpl(url, {
        method,
        headers: { Authorization: `Token ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429) {
        await sleep((Number(res.headers.get('retry-after')) || 2) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Yodeck ${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
      }
      return res.status === 204 ? null : res.json();
    }
    throw new Error(`Yodeck ${method} ${url}: still rate limited`);
  }

  async function listAll(path) {
    const out = [];
    let next = path;
    while (next) {
      const page = await call('GET', next);
      out.push(...page.results);
      next = page.next;
    }
    return out;
  }

  return {
    listMedia: (tag) => listAll(`/media?tags=${encodeURIComponent(tag)}&limit=100`),
    deleteMedia: (id) => call('DELETE', `/media/${id}`),

    /** Create media, PUT the bytes to the presigned URL, confirm, then wait until processed. */
    async uploadMedia({ name, bytes, type = 'image', file = '', tag, seconds }) {
      const contentType = type === 'video' ? (file.endsWith('.webm') ? 'video/webm' : 'video/mp4') : 'image/png';
      const media = await call('POST', '/media', {
        name, tags: [tag], default_duration: seconds,
        media_origin: { type, source: 'local' },
      });
      const { upload_url } = await call('GET', `/media/${media.id}/upload`);
      const put = await fetchImpl(upload_url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes });
      if (!put.ok) throw new Error(`Yodeck upload of ${name} -> ${put.status}`);
      await call('PUT', `/media/${media.id}/upload/complete`, { upload_url });
      for (let i = 0; i < 60; i++) {
        const { status } = await call('GET', `/media/${media.id}/status`);
        if (status === 'finished') return media.id;
        if (status === 'failed') throw new Error(`Yodeck could not process ${name}`);
        await sleep(2000);
      }
      throw new Error(`Yodeck still processing ${name} after 2 minutes`);
    },

    async findPlaylist(name) {
      const all = await listAll(`/playlists?q=${encodeURIComponent(name)}&limit=100`);
      return all.find((p) => p.name === name) ?? null;
    },
    getPlaylist: (id) => call('GET', `/playlists/${id}`),
    createPlaylist: (name, items) => call('POST', '/playlists', { name, description: 'Managed by the instore-display repo. Edits here are overwritten each week.', items }),
    /** Sends the complete ordered list; the docs read as PUT replacing the items. */
    setPlaylistItems: (id, name, items) => call('PUT', `/playlists/${id}`, { name, items }),
    pushScreen: (id) => call('POST', `/screens/${id}/push`, { use_download_timeslots: false }),
  };
}
