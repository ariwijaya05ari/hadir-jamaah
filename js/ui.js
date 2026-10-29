/* Helper tampilan: template aman, format tanggal WIB, toast, sheet, avatar, aksi delegasi. */
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
const E1 = x => x instanceof Raw ? x.s : x == null || x === false ? '' : Array.isArray(x) ? x.map(E1).join('') : String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function html(s, ...v) { let o = s[0]; v.forEach((x, i) => { o += E1(x) + s[i + 1]; }); return new Raw(o); }
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
function put(el, r) { el.innerHTML = r instanceof Raw ? r.s : String(r); API.Photos.hydrate(el); return el; }

const TZ = 'Asia/Jakarta', DAY = 86400000;
const fJam = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fTgl = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const fTglL = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fHari = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long' });
const fHariS = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'short' });
const fBulan = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, month: 'long', year: 'numeric' });
const fKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const jam = ms => fJam.format(ms).replace('.', ':'), tgl = ms => fTgl.format(ms), tglL = ms => fTglL.format(ms), bulan = ms => fBulan.format(ms);
const dkey = ms => fKey.format(ms), mkey = ms => dkey(ms).slice(0, 7);
function relDay(ms, now) { const k = dkey(ms), n = dkey(now || Date.now()); if (k === n) return 'Hari Ini'; if (k === dkey((now || Date.now()) + DAY)) return 'Besok'; if (k === dkey((now || Date.now()) - DAY)) return 'Kemarin'; return fHari.format(ms); }
function rentang(a) { return jam(a.mulai) + ' - ' + jam(a.selesai) + ' WIB'; }
function toInput(ms) { const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const ic = (n, c) => html`<span class="ms ${c || ''}" aria-hidden="true">${n}</span>`;
const SLBL = { hadir: 'HADIR', terlambat: 'TERLAMBAT', izin: 'IZIN', alpa: 'TIDAK HADIR', belum: 'BELUM' };
const pill = s => html`<span class="pill ${s}">${SLBL[s] || s}</span>`;
function acaraPill(a) { return a.status === 'berlangsung' ? html`<span class="pill live">Sedang Berlangsung</span>` : a.status === 'akan datang' ? html`<span class="pill akan">Akan Datang</span>` : html`<span class="pill selesai">Selesai</span>`; }
function avatar(nama, foto, cls) { return html`<span class="av ${cls || ''}"><span>${initials(nama)}</span>${foto ? html`<img data-foto="${foto}" alt="" hidden>` : ''}</span>`; }
const pct = n => Math.max(0, Math.min(100, Math.round(n || 0)));
function haversine(a, b, c, d) { const R = 6371000, t = x => x * Math.PI / 180, dl = t(c - a), dn = t(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dn / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }
const mapsUrl = a => `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;

/* ---- Toast & sheet ---- */
let toastT;
function toast(msg, kind) { $$('.toast').forEach(t => t.remove()); const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.setAttribute('role', 'status'); t.innerHTML = (kind === 'err' ? '<span class="ms sm">error</span>' : kind === 'ok' ? '<span class="ms sm">check_circle</span>' : '') + '<span></span>'; t.lastChild.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3800); }
function sheet(content, opts) {
  closeSheet(); const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'sheet';
  ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div id="sheet-body"></div></div>';
  document.body.appendChild(ov); put($('#sheet-body'), content);
  ov.addEventListener('mousedown', e => { if (e.target === ov && !(opts && opts.sticky)) closeSheet(); });
  const f = $('input,select,textarea,button.btn', ov); if (f && !(opts && opts.nofocus)) setTimeout(() => f.focus({ preventScroll: true }), 50);
  return ov;
}
const closeSheet = () => { const s = $('#sheet'); if (s) s.remove(); };
function confirmBox(title, text, okLabel, danger) { return new Promise(res => { sheet(html`<h3 class="t-md">${title}</h3><p class="mut mt8">${text}</p><div class="row mt16"><button class="btn out grow" data-act="sheet-no">Batal</button><button class="btn ${danger ? 'danger' : 'pri'} grow" data-act="sheet-yes">${okLabel || 'Ya, lanjutkan'}</button></div>`, { nofocus: false }); const o = $('#sheet'); o.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'sheet-yes') { closeSheet(); res(true); } else if (b.dataset.act === 'sheet-no') { closeSheet(); res(false); } }); o.addEventListener('mousedown', e => { if (e.target === o) res(false); }); }); }

/* ---- Aksi delegasi & form ---- */
const ACT = {}, FORM = {};
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || !ACT[b.dataset.act]) return; if (b.tagName === 'A' && b.dataset.act) e.preventDefault(); ACT[b.dataset.act](b, e); });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f || !FORM[f.dataset.form]) return; e.preventDefault(); FORM[f.dataset.form](f, formData(f), e); });
function formData(f) { const o = {}; new FormData(f).forEach((v, k) => { if (typeof v === 'string') o[k] = v.trim(); }); return o; }
/** Bungkus tombol submit: nonaktif + teks sementara sampai selesai. */
async function busy(btn, fn) { const t = btn && btn.innerHTML; if (btn) { btn.disabled = true; btn.dataset.l = t; btn.innerHTML = '<span class="ms sm">progress_activity</span> Memproses…'; } try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.innerHTML = t; } } }
const errMsg = e => (e && e.message) || 'Terjadi kesalahan.';
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat pustaka. Periksa koneksi internet.')); document.head.appendChild(s); }); }
function download(name, mime, b64orText, isB64) { const bytes = isB64 ? Uint8Array.from(atob(b64orText), c => c.charCodeAt(0)) : b64orText; const url = URL.createObjectURL(new Blob([bytes], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
/** Kompres gambar dari File/canvas ke data URI JPEG. */
function fileToDataUri(file, maxW, q) { return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { const s = Math.min(1, maxW / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q || .7)); }; img.onerror = () => rej(new Error('Foto tidak bisa dibaca.')); img.src = url; }); }
const skeleton = (n) => html`${Array.from({ length: n || 3 }, () => html`<div class="sk" style="height:96px;margin-bottom:14px"></div>`)}`;
const emptyBox = (icon, t, s) => html`<div class="empty">${ic(icon)}<b>${t}</b>${s || ''}</div>`;
