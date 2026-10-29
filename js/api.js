/* Klien API: POST text/plain (tanpa preflight CORS), batch baca, dedupe, cache pendek, foto lazy. */
const API = (() => {
  const S = { token: localStorage.getItem('hj_t') || '', user: null };
  try { S.user = JSON.parse(localStorage.getItem('hj_u') || 'null'); } catch (e) { S.user = null; }
  const cache = new Map(), inflight = new Map(); let queue = [], timer = null, kicked = false;

  class ApiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  function setSession(token, user) {
    S.token = token || ''; S.user = user || null;
    if (token) { localStorage.setItem('hj_t', token); localStorage.setItem('hj_u', JSON.stringify(user)); } else { localStorage.removeItem('hj_t'); localStorage.removeItem('hj_u'); }
    cache.clear();
  }
  function setUser(u) { S.user = u; localStorage.setItem('hj_u', JSON.stringify(u)); }
  async function post(body, ms) {
    if (!HJ_CONFIG.API_URL) throw new ApiError('NO_URL', 'Alamat backend belum diisi di js/config.js');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 30000);
    try {
      const r = await fetch(HJ_CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal, redirect: 'follow' });
      const j = await r.json(); return j;
    } catch (e) { throw new ApiError('NETWORK', e.name === 'AbortError' ? 'Server lama merespons. Coba lagi.' : 'Tidak bisa terhubung ke server. Periksa koneksi internet Anda.'); }
    finally { clearTimeout(t); }
  }
  function handle(res) {
    if (res.nq > 0 && !kicked) { kicked = true; post({ action: 'drain' }, 20000).catch(() => { }).finally(() => { kicked = false; }); }
    if (!res.ok) {
      if (res.code === 'SESSION' && S.token) { setSession('', null); if (!/^#\/(login|daftar|lupa|reset|darurat)/.test(location.hash)) { location.hash = '#/login'; } }
      throw new ApiError(res.code, res.err);
    }
    return res.data;
  }
  /** Tulis / aksi tunggal. Menghapus cache baca. */
  async function call(action, data) { const d = handle(await post({ action, data: data || {}, token: S.token })); cache.clear(); return d; }
  /** Baca: digabung dalam 1 permintaan batch bila ada beberapa dalam waktu berdekatan. ttl dalam detik. */
  function read(action, data, ttl) {
    const key = action + '|' + JSON.stringify(data || {}), c = cache.get(key);
    if (c && c.x > Date.now()) return Promise.resolve(c.v);
    if (inflight.has(key)) return inflight.get(key);
    const p = new Promise((res, rej) => { queue.push({ action, data: data || {}, res, rej, key, ttl: ttl == null ? 15 : ttl }); if (!timer) timer = setTimeout(flush, 15); });
    inflight.set(key, p); p.then(() => inflight.delete(key), () => inflight.delete(key)); return p;
  }
  async function flush() {
    const q = queue; queue = []; timer = null; if (!q.length) return;
    try {
      let out;
      if (q.length === 1) out = [await post({ action: q[0].action, data: q[0].data, token: S.token })];
      else { const r = await post({ action: 'batch', token: S.token, items: q.map(x => ({ action: x.action, data: x.data })) }); if (!r.ok) throw new ApiError(r.code, r.err); out = r.data; }
      q.forEach((x, i) => { try { const v = handle(out[i]); if (x.ttl) cache.set(x.key, { v, x: Date.now() + x.ttl * 1000 }); x.res(v); } catch (e) { x.rej(e); } });
    } catch (e) { q.forEach(x => x.rej(e)); }
  }
  const bust = () => cache.clear();

  /* Foto: diminta dalam kelompok, disimpan di memori, lalu dipasang ke <img data-foto> */
  const Photos = (() => {
    const mem = new Map(), want = new Set(); let t = null;
    function hydrate(root) {
      (root || document).querySelectorAll('img[data-foto]').forEach(img => {
        const id = img.dataset.foto; if (!id) return;
        if (mem.has(id)) { if (mem.get(id)) { img.src = mem.get(id); img.hidden = false; } } else want.add(id);
      });
      if (want.size && !t) t = setTimeout(go, 30);
    }
    async function go() {
      t = null; const ids = [...want].filter(i => !mem.has(i)); want.clear(); if (!ids.length) return;
      for (let i = 0; i < ids.length; i += 12) {
        const chunk = ids.slice(i, i + 12);
        try { const r = await read('foto.get', { ids: chunk }, 0); chunk.forEach(id => mem.set(id, r[id] || '')); } catch (e) { chunk.forEach(id => mem.set(id, '')); }
      }
      hydrate();
    }
    return { hydrate, get: id => mem.get(id) || '' };
  })();
  return { S, call, read, bust, setSession, setUser, Photos, ApiError };
})();
