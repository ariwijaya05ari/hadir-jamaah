/**
 * HADIR JAMA'AH — Backend REST API (Google Apps Script)
 * Frontend terpisah (GitHub Pages) memanggil Web App ini lewat fetch() — JSON saja.
 *
 * Rahasia (TOKEN_SECRET, hash akses darurat, ID spreadsheet/folder) hanya ada di Script Properties.
 * Jalankan setup() SEKALI dari editor Apps Script, lalu deploy sebagai Web App
 * (Execute as: Me, Who has access: Anyone).
 */

const APP = "HADIR JAMA'AH";
const TZ = 'Asia/Jakarta';
const DAY = 86400000;
const CACHE_TTL = 21600; // 6 jam (batas maksimum CacheService)
const ROLE = { A: 'administrator', S: 'pengurus', J: 'jamaah' };

/** Skema 4 sheet utama (PRD) + 2 sheet pendukung. Urutan kolom = urutan di Sheets. */
const SHEETS = {
  Pengguna: ['ID', 'Nama', 'Email', 'HP', 'Peran', 'HashSandi', 'Salt', 'Status', 'DibuatPada'],
  Jamaah: ['JamaahID', 'Nama', 'HP', 'Email', 'Alamat', 'Gender', 'TglLahir', 'FotoID', 'Status', 'UserID', 'DibuatPada'],
  Acara: ['AcaraID', 'Nama', 'Ustaz', 'Deskripsi', 'Mulai', 'Selesai', 'Lokasi', 'Lat', 'Lng', 'Radius', 'QRID', 'Toleransi', 'Pengurus', 'Status', 'DibuatOleh', 'DibuatPada'],
  Absensi: ['AbsensiID', 'AcaraID', 'JamaahID', 'Waktu', 'Lat', 'Lng', 'JarakM', 'SelfieID', 'Metode', 'Status', 'Catatan'],
  Pengaturan: ['Kunci', 'Nilai'],
  Audit_Log: ['Waktu', 'Aktor', 'Aksi', 'Detail']
};
// Kolom yang HARUS tetap teks (nomor HP berawalan 0, tanggal/jam): format '@'
const TEXT_COLS = { Pengguna: ['HP', 'DibuatPada'], Jamaah: ['HP', 'TglLahir', 'DibuatPada'], Acara: ['Mulai', 'Selesai', 'DibuatPada'], Absensi: ['Waktu'] };
const CFG_DEF = { namaApp: APP, radiusDefault: '100', toleransiDefault: '15', bukaMenit: '60', frontendUrl: '', emailNotif: 'ya' };

let _SS = null;
const _NQ = []; // antrean notifikasi untuk satu permintaan

/* ============================ UTIL DASAR ============================ */

function E_(code, msg) { const e = new Error(msg); e.code = code; return e; }
function P_() { return PropertiesService.getScriptProperties(); }
function prop_(k) { return P_().getProperty(k); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rand_(n) { return (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, n); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ss_() { if (!_SS) { const id = prop_('SPREADSHEET_ID'); if (!id) throw E_('NOT_SETUP', 'Backend belum disetup. Jalankan setup() di editor Apps Script.'); _SS = SpreadsheetApp.openById(id); } return _SS; }
function sheet_(n) { const s = ss_().getSheetByName(n); if (!s) throw E_('NOT_SETUP', 'Sheet ' + n + ' tidak ditemukan'); return s; }
function fmt_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function ms_(s) {
  if (!s) return 0; if (typeof s === 'number') return s; if (s instanceof Date) return s.getTime();
  const m = String(s).match(/^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?/);
  if (!m) return 0;
  return Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] || '00') + ':' + (m[5] || '00') + ':' + (m[6] || '00') + '+07:00');
}
function normHP_(v) { let d = String(v == null ? '' : v).replace(/\D/g, ''); if (d.indexOf('62') === 0) d = '0' + d.slice(2); else if (d.charAt(0) === '8') d = '0' + d; return d; }
function okEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')); }
function haversine_(a, b, c, d) {
  const R = 6371000, t = x => x * Math.PI / 180, dLat = t(c - a), dLon = t(d - b);
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/* ============================ CACHE BERVERSI ============================ */

function cput_(k, v, ttl) {
  const s = JSON.stringify(v), C = CacheService.getScriptCache(), SZ = 30000;
  if (s.length <= SZ) { C.put(k, s, ttl || CACHE_TTL); return; }
  const n = Math.ceil(s.length / SZ), o = {};
  for (let i = 0; i < n; i++) o[k + '#' + i] = s.slice(i * SZ, (i + 1) * SZ);
  o[k] = '@@' + n; C.putAll(o, ttl || CACHE_TTL);
}
function cget_(k) {
  const C = CacheService.getScriptCache(), v = C.get(k);
  if (v == null) return null;
  try {
    if (v.slice(0, 2) === '@@') {
      const n = +v.slice(2), keys = []; for (let i = 0; i < n; i++) keys.push(k + '#' + i);
      const m = C.getAll(keys); let s = '';
      for (let i = 0; i < n; i++) { if (m[keys[i]] == null) return null; s += m[keys[i]]; }
      return JSON.parse(s);
    }
    return JSON.parse(v);
  } catch (x) { return null; }
}
function cdel_(k) { CacheService.getScriptCache().remove(k); }
/** Versi per cakupan: menaikkan versi = semua cache turunan otomatis basi (tanpa hapus satu-satu). */
function ver_(scope) {
  const C = CacheService.getScriptCache(), k = 'v_' + scope; let v = C.get(k);
  if (!v) { v = String(Date.now()); C.put(k, v, CACHE_TTL); }
  return v;
}
function bump_() { const C = CacheService.getScriptCache(); for (let i = 0; i < arguments.length; i++) C.put('v_' + arguments[i], String(Date.now() + Math.floor(Math.random() * 1000)), CACHE_TTL); }
function limit_(key, max, sec) { // true = masih boleh
  const C = CacheService.getScriptCache(), v = +(C.get(key) || 0);
  if (v >= max) return false; C.put(key, String(v + 1), sec); return true;
}
function lockedOut_(key, max) { return +(CacheService.getScriptCache().get(key) || 0) >= max; }
function withLock_(fn, ms) {
  const L = LockService.getScriptLock(); L.waitLock(ms || 10000);
  try { return fn(); } finally { L.releaseLock(); }
}

/* ============================ AKSES SHEET ============================ */

function norm_(v) { return v instanceof Date ? fmt_(v.getTime()) : v; }
function rowObj_(name, r, rowNo) { const o = { _r: rowNo }; SHEETS[name].forEach((h, i) => { o[h] = norm_(r[i]); }); return o; }
/** Tabel kecil (Pengguna, Jamaah, Acara) — cache berversi. */
function tbl_(name) {
  const k = 't_' + name + '_' + ver_(name), c = cget_(k); if (c) return c;
  const sh = sheet_(name), last = sh.getLastRow(); let rows = [];
  if (last > 1) rows = sh.getRange(2, 1, last - 1, SHEETS[name].length).getValues().map((r, i) => rowObj_(name, r, i + 2));
  cput_(k, rows); return rows;
}
function readAll_(name) { const sh = sheet_(name), last = sh.getLastRow(); return last < 2 ? [] : sh.getRange(2, 1, last - 1, SHEETS[name].length).getValues().map((r, i) => rowObj_(name, r, i + 2)); }
/** Baca baris yang kolomnya sama dengan nilai tanpa memuat seluruh sheet (hanya kolom kunci + blok terkait). */
function rowsWhere_(name, col, val) {
  const sh = sheet_(name), last = sh.getLastRow(); if (last < 2) return [];
  const w = SHEETS[name].length, ci = SHEETS[name].indexOf(col) + 1, keys = sh.getRange(2, ci, last - 1, 1).getValues(), hit = [];
  for (let i = 0; i < keys.length; i++) if (String(keys[i][0]) === String(val)) hit.push(i + 2);
  if (!hit.length) return [];
  const runs = []; let s = hit[0], p = hit[0];
  for (let i = 1; i < hit.length; i++) { if (hit[i] === p + 1) p = hit[i]; else { runs.push([s, p]); s = p = hit[i]; } }
  runs.push([s, p]);
  const out = [];
  if (runs.length > 25) { // tersebar: satu blok lebih murah daripada puluhan panggilan
    const a = hit[0], b = hit[hit.length - 1];
    sh.getRange(a, 1, b - a + 1, w).getValues().forEach((r, i) => { if (String(r[ci - 1]) === String(val)) out.push(rowObj_(name, r, a + i)); });
    return out;
  }
  runs.forEach(g => sh.getRange(g[0], 1, g[1] - g[0] + 1, w).getValues().forEach((r, i) => out.push(rowObj_(name, r, g[0] + i))));
  return out;
}
function rowArr_(name, o) { return SHEETS[name].map(h => o[h] === undefined || o[h] === null ? '' : o[h]); }
function appendRows_(name, objs) {
  if (!objs.length) return; const sh = sheet_(name), r = sh.getLastRow() + 1;
  sh.getRange(r, 1, objs.length, SHEETS[name].length).setValues(objs.map(o => rowArr_(name, o))); bump_(name);
}
function updateRow_(name, rowNo, o) { sheet_(name).getRange(rowNo, 1, 1, SHEETS[name].length).setValues([rowArr_(name, o)]); bump_(name); }
function nextId_(key, prefix, pad) { // panggil DI DALAM lock
  const n = (+prop_('CTR_' + key) || 0) + 1; P_().setProperty('CTR_' + key, String(n));
  return prefix + String(n).padStart(pad, '0');
}
function audit_(ctx, aksi, detail) {
  try { appendRows_('Audit_Log', [{ Waktu: fmt_(Date.now()), Aktor: (ctx.user && ctx.user.ID) || '-', Aksi: aksi, Detail: String(detail || '').slice(0, 300) }]); } catch (x) { /* log tidak boleh menggagalkan aksi */ }
}

/* ============================ PENGATURAN ============================ */

function cfg_() {
  const k = 'cfg_' + ver_('Pengaturan'), c = cget_(k); if (c) return c;
  const o = Object.assign({}, CFG_DEF), sh = sheet_('Pengaturan'), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 2).getValues().forEach(r => { if (r[0]) o[r[0]] = String(r[1]); });
  cput_(k, o); return o;
}
function cfgSet_(vals) {
  const sh = sheet_('Pengaturan'), last = sh.getLastRow(), cur = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  Object.keys(vals).forEach(k => {
    const i = cur.findIndex(r => r[0] === k);
    if (i >= 0) { cur[i][1] = vals[k]; } else cur.push([k, vals[k]]);
  });
  if (cur.length) sh.getRange(2, 1, cur.length, 2).setValues(cur);
  bump_('Pengaturan');
}

/* ============================ AUTH (token HMAC + hash sandi) ============================ */

function secret_() { const s = prop_('TOKEN_SECRET'); if (!s) throw E_('NOT_SETUP', 'Backend belum disetup.'); return s; }
function hmac_(s, key) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, key || secret_())).replace(/=+$/, ''); }
function b64u_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function unb64u_(s) { const pad = (4 - s.length % 4) % 4; return Utilities.newBlob(Utilities.base64DecodeWebSafe(s + '===='.slice(0, pad))).getDataAsString(); }
function signTok_(payload, ttlSec) {
  const body = b64u_(JSON.stringify(Object.assign({ i: Date.now(), x: Date.now() + ttlSec * 1000 }, payload)));
  return 'h1.' + body + '.' + hmac_(body);
}
function verifyTok_(t) {
  const p = String(t || '').split('.'); if (p.length !== 3 || p[0] !== 'h1') return null;
  const want = hmac_(p[1]); if (want.length !== p[2].length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ p[2].charCodeAt(i);
  if (diff) return null;
  try { const o = JSON.parse(unb64u_(p[1])); return o.x > Date.now() ? o : null; } catch (x) { return null; }
}
function hashPass_(pw, salt) { let h = salt + pw; const key = salt + secret_(); for (let i = 0; i < 120; i++) h = hmac_(h, key); return h; }
function sameStr_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function checkPass_(pw, hash, salt) { return !!hash && sameStr_(hashPass_(String(pw), salt), hash); }
function pwOk_(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 72; }

function findUser_(ident) {
  const id = String(ident || '').trim().toLowerCase(); if (!id) return null;
  const hp = normHP_(id);
  return tbl_('Pengguna').find(u => (u.Email && String(u.Email).toLowerCase() === id) || (hp.length >= 9 && u.HP && normHP_(u.HP) === hp)) || null;
}
function userById_(id) { return tbl_('Pengguna').find(u => u.ID === id) || null; }
function jamaahByUser_(uid) { return tbl_('Jamaah').find(j => j.UserID === uid) || null; }
function jamaahById_(id) { return tbl_('Jamaah').find(j => j.JamaahID === id) || null; }

function auth_(token, roles) {
  const t = verifyTok_(token); if (!t) throw E_('SESSION', 'Sesi berakhir. Silakan masuk kembali.');
  let user;
  if (t.u === 'DARURAT') user = { ID: 'DARURAT', Nama: 'Akses Darurat', Peran: ROLE.A, Status: 'aktif' };
  else { user = userById_(t.u); if (!user || user.Status !== 'aktif') throw E_('SESSION', 'Sesi berakhir. Silakan masuk kembali.'); }
  if (roles && roles.indexOf(user.Peran) < 0) throw E_('FORBIDDEN', 'Anda tidak memiliki akses ke fitur ini.');
  const ctx = { user: user, role: user.Peran };
  if (user.Peran === ROLE.J) ctx.jamaah = jamaahByUser_(user.ID);
  return ctx;
}
function userView_(u, j) {
  return { id: u.ID, nama: u.Nama, email: u.Email || '', hp: u.HP || '', peran: u.Peran, jamaah: j ? jamaahView_(j) : null };
}
function jamaahView_(j) {
  return { id: j.JamaahID, nama: j.Nama, hp: j.HP || '', email: j.Email || '', alamat: j.Alamat || '', gender: j.Gender, tglLahir: j.TglLahir || '', status: j.Status, foto: j.FotoID || '', dibuat: ms_(j.DibuatPada), userId: j.UserID };
}

/* ============================ FOTO (Drive) ============================ */

function saveImg_(folderKey, dataUri, name) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUri || ''));
  if (!m) throw E_('BAD_IMG', 'Format foto tidak valid.');
  if (m[2].length > 700000) throw E_('BIG_IMG', 'Ukuran foto terlalu besar. Coba ambil ulang.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.jpg');
  return DriveApp.getFolderById(prop_(folderKey)).createFile(blob).getId();
}
function trashFile_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) { /* abaikan */ } }

/* ============================ SETUP (jalankan sekali) ============================ */

function setup() {
  const p = P_();
  if (!p.getProperty('TOKEN_SECRET')) p.setProperty('TOKEN_SECRET', rand_(48));
  let ss; const sid = p.getProperty('SPREADSHEET_ID');
  if (sid) ss = SpreadsheetApp.openById(sid); else { ss = SpreadsheetApp.create('HADIR_JAMAAH_DB'); p.setProperty('SPREADSHEET_ID', ss.getId()); }
  _SS = ss;
  Object.keys(SHEETS).forEach(n => {
    const sh = ss.getSheetByName(n) || ss.insertSheet(n), h = SHEETS[n];
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#EEEDFD');
    sh.setFrozenRows(1);
    (TEXT_COLS[n] || []).forEach(c => sh.getRange(2, h.indexOf(c) + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'));
  });
  ['Sheet1', 'Sheet 1', 'Lembar1'].forEach(n => { const s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
  [['FOLDER_PROFIL', 'HJ_Foto_Profil'], ['FOLDER_SELFIE', 'HJ_Foto_Selfie']].forEach(f => {
    if (!p.getProperty(f[0])) p.setProperty(f[0], DriveApp.createFolder(f[1]).getId());
  });
  const msg = [];
  if (!tbl_('Pengguna').some(u => u.Peran === ROLE.A)) {
    const email = Session.getEffectiveUser().getEmail() || 'admin@example.com', pw = rand_(12), salt = rand_(16);
    appendRows_('Pengguna', [{ ID: 'U-0001', Nama: 'Administrator', Email: email, HP: '', Peran: ROLE.A, HashSandi: hashPass_(pw, salt), Salt: salt, Status: 'aktif', DibuatPada: fmt_(Date.now()) }]);
    p.setProperty('CTR_USER', '1');
    msg.push('ADMIN PERTAMA  email: ' + email + '  |  kata sandi: ' + pw + '  (ganti setelah masuk)');
  }
  if (!p.getProperty('EMERG_HASH')) {
    const pw = rand_(16), salt = rand_(16);
    p.setProperty('EMERG_SALT', salt); p.setProperty('EMERG_HASH', hashPass_(pw, salt));
    msg.push('KATA SANDI AKSES DARURAT (simpan offline, tampil sekali): ' + pw);
  }
  bump_('Pengguna', 'Pengaturan');
  Logger.log('SETUP SELESAI. Spreadsheet: ' + ss.getUrl());
  msg.forEach(m => Logger.log(m));
  return ss.getUrl();
}
/** Pasang trigger pengirim email + penghangat (tiap 5 menit). Jalankan sekali setelah setup(). */
function pasangTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'pekerjaLatar') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pekerjaLatar').timeBased().everyMinutes(5).create();
}
/** Dipanggil trigger: kirim email dalam antrean + hangatkan cache. Sengaja tanpa garis bawah agar bisa dipilih sebagai trigger. */
function pekerjaLatar() { drain_(); cfg_(); }
/** Putar ulang kata sandi akses darurat (hasil tampil di Log). */
function putarSandiDarurat() {
  const pw = rand_(16), salt = rand_(16); P_().setProperty('EMERG_SALT', salt); P_().setProperty('EMERG_HASH', hashPass_(pw, salt));
  Logger.log('KATA SANDI DARURAT BARU: ' + pw);
}

/* ============================ ROUTER ============================ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try { if (p.w) cfg_(); } catch (x) { /* penghangat: abaikan */ }
  return out_({ ok: true, app: APP, t: Date.now() });
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return out_({ ok: false, code: 'BAD_JSON', err: 'Permintaan tidak valid.' }); }
  _NQ.length = 0;
  let res;
  try { res = req.action === 'batch' ? batch_(req) : run_(req); } catch (x) { res = errRes_(x); }
  if (res.ok) flushNQ_(res); else _NQ.length = 0;
  return out_(res);
}
function errRes_(x) {
  if (x && x.code) return { ok: false, code: x.code, err: x.message };
  if (x && /lock/i.test(String(x.message))) return { ok: false, code: 'BUSY', err: 'Server sedang sibuk melayani banyak permintaan. Coba lagi sebentar.' };
  Logger.log('ERR ' + (x && x.stack ? x.stack : x));
  return { ok: false, code: 'SERVER', err: 'Terjadi kesalahan di server. Coba lagi sebentar.' };
}
function run_(req) {
  const r = routes_()[req.action]; if (!r) throw E_('NO_ROUTE', 'Aksi tidak dikenal.');
  const ctx = r.pub ? {} : auth_(req.token, r.roles);
  return { ok: true, data: r.fn(ctx, req.data || {}) };
}
function batch_(req) {
  const items = Array.isArray(req.items) ? req.items.slice(0, 10) : [];
  const out = items.map(it => {
    try {
      const r = routes_()[it.action]; if (!r || !r.read) throw E_('NO_ROUTE', 'Aksi batch tidak diizinkan.');
      return run_({ action: it.action, token: req.token, data: it.data });
    } catch (x) { return errRes_(x); }
  });
  return { ok: true, data: out };
}

const AJ = [ROLE.A, ROLE.S, ROLE.J], AS = [ROLE.A, ROLE.S], AA = [ROLE.A], JJ = [ROLE.J];
let _R = null;
function routes_() { return _R || (_R = {
  'auth.config': { pub: 1, read: 1, fn: () => { const c = cfg_(); return { namaApp: c.namaApp }; } },
  'auth.login': { pub: 1, fn: (c, d) => authLogin_(c, d) },
  'auth.darurat': { pub: 1, fn: (c, d) => authDarurat_(c, d) },
  'auth.daftar': { pub: 1, fn: (c, d) => authDaftar_(c, d) },
  'auth.lupa': { pub: 1, fn: (c, d) => authLupa_(c, d) },
  'auth.reset': { pub: 1, fn: (c, d) => authReset_(c, d) },
  'drain': { pub: 1, fn: () => drain_() },
  'me': { roles: AJ, read: 1, fn: (c, d) => me_(c, d) },
  'me.ubah': { roles: AJ, fn: (c, d) => meUbah_(c, d) },
  'me.sandi': { roles: AJ, fn: (c, d) => meSandi_(c, d) },
  'foto.get': { roles: AJ, read: 1, fn: (c, d) => fotoGet_(c, d) },
  'beranda': { roles: JJ, read: 1, fn: (c, d) => beranda_(c, d) },
  'jadwal': { roles: AJ, read: 1, fn: (c, d) => jadwal_(c, d) },
  'riwayat': { roles: JJ, read: 1, fn: (c, d) => riwayat_(c, d) },
  'absen.submit': { roles: JJ, fn: (c, d) => absenSubmit_(c, d) },
  'dash': { roles: AS, read: 1, fn: (c, d) => dash_(c, d) },
  'jamaah.list': { roles: AS, read: 1, fn: (c, d) => jamaahList_(c, d) },
  'jamaah.verifikasi': { roles: AS, fn: (c, d) => jamaahVerifikasi_(c, d) },
  'jamaah.simpan': { roles: AA, fn: (c, d) => jamaahSimpan_(c, d) },
  'jamaah.status': { roles: AA, fn: (c, d) => jamaahStatus_(c, d) },
  'jamaah.resetSandi': { roles: AA, fn: (c, d) => jamaahResetSandi_(c, d) },
  'jamaah.import': { roles: AA, fn: (c, d) => jamaahImport_(c, d) },
  'acara.list': { roles: AS, read: 1, fn: (c, d) => acaraList_(c, d) },
  'acara.simpan': { roles: AS, fn: (c, d) => acaraSimpan_(c, d) },
  'acara.batal': { roles: AS, fn: (c, d) => acaraBatal_(c, d) },
  'acara.qr': { roles: AS, fn: (c, d) => acaraQr_(c, d) },
  'acara.monitor': { roles: AS, read: 1, fn: (c, d) => acaraMonitor_(c, d) },
  'absen.koreksi': { roles: AS, fn: (c, d) => absenKoreksi_(c, d) },
  'laporan': { roles: AS, read: 1, fn: (c, d) => laporan_(c, d) },
  'laporan.export': { roles: AS, fn: (c, d) => laporanExport_(c, d) },
  'pengguna.list': { roles: AA, read: 1, fn: (c, d) => penggunaList_(c, d) },
  'pengguna.simpan': { roles: AA, fn: (c, d) => penggunaSimpan_(c, d) },
  'pengguna.status': { roles: AA, fn: (c, d) => penggunaStatus_(c, d) },
  'pengguna.reset': { roles: AA, fn: (c, d) => penggunaReset_(c, d) },
  'config.get': { roles: AA, read: 1, fn: (c, d) => configGet_(c, d) },
  'config.simpan': { roles: AA, fn: (c, d) => configSimpan_(c, d) },
  'sistem.status': { roles: AA, read: 1, fn: (c, d) => sistemStatus_(c, d) }
}); }

/* ============================ NOTIFIKASI (antrean, dikirim di luar jalur respons) ============================ */

function nq_(tipe, p) { _NQ.push(Object.assign({ tipe: tipe }, p)); }
function flushNQ_(res) {
  if (!_NQ.length) return;
  try {
    withLock_(() => { const q = cget_('nq') || []; _NQ.forEach(j => q.push(j)); cput_('nq', q, 3600); res.nq = q.length; }, 3000);
  } catch (x) { res.nq = 0; Logger.log('nq gagal: ' + x); }
  _NQ.length = 0;
}
function drain_() {
  const q0 = cget_('nq'); if (!q0 || !q0.length) return { n: 0 }; // antrean kosong: tanpa lock
  let jobs = [];
  try { withLock_(() => { const q = cget_('nq') || []; jobs = q.splice(0, 10); cput_('nq', q, 3600); }, 3000); } catch (x) { return { n: 0 }; }
  let sent = 0;
  jobs.forEach(j => { try { if (kirimEmail_(j)) sent++; } catch (x) { Logger.log('email gagal: ' + x); } });
  return { n: sent };
}
function kirimEmail_(j) {
  const c = cfg_(), app = esc_(c.namaApp); let subject, html;
  if (j.tipe !== 'reset' && c.emailNotif !== 'ya') return false;
  if (!j.to || !okEmail_(j.to)) return false;
  const box = t => '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border-radius:16px;background:#F5F6FB;color:#1E1D2B"><h2 style="color:#4B3FC4;margin:0 0 12px">' + app + '</h2>' + t + '</div>';
  if (j.tipe === 'daftar') { subject = 'Pendaftaran diterima'; html = box('<p>Assalamu\'alaikum ' + esc_(j.nama) + ',</p><p>Pendaftaran Anda sudah kami terima dengan nomor <b>' + esc_(j.id) + '</b>. Akun akan aktif setelah diverifikasi pengurus. Kami akan mengirim kabar lewat email ini.</p>'); }
  else if (j.tipe === 'verifikasi') { subject = j.ok ? 'Akun Anda sudah aktif' : 'Pendaftaran belum dapat disetujui'; html = box('<p>Assalamu\'alaikum ' + esc_(j.nama) + ',</p>' + (j.ok ? '<p>Akun Anda sudah aktif. Silakan masuk dan mulai absen di pengajian.</p>' : '<p>Pendaftaran Anda belum dapat disetujui. Silakan hubungi pengurus untuk informasi lebih lanjut.</p>')); }
  else if (j.tipe === 'reset') {
    subject = 'Atur ulang kata sandi';
    const link = j.url ? j.url.replace(/\/?$/, '/') + '#/reset/' + j.token : '';
    html = box('<p>Assalamu\'alaikum ' + esc_(j.nama) + ',</p><p>Kami menerima permintaan atur ulang kata sandi. Tautan berlaku 30 menit dan hanya bisa dipakai sekali.</p>' +
      (link ? '<p><a href="' + esc_(link) + '" style="background:#6C5CE7;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;display:inline-block">Atur kata sandi baru</a></p>' : '<p>Tempel kode berikut di halaman Atur Ulang Kata Sandi:<br><code style="word-break:break-all">' + esc_(j.token) + '</code></p>') +
      '<p style="color:#7A7A8C;font-size:12px">Jika bukan Anda yang meminta, abaikan email ini.</p>');
  } else return false;
  MailApp.sendEmail({ to: j.to, subject: '[' + c.namaApp + '] ' + subject, htmlBody: html, name: c.namaApp });
  return true;
}

/* ============================ AUTH ROUTES ============================ */

function sessionFor_(u) {
  const ttl = u.Peran === ROLE.J ? 14 * 86400 : 2 * 86400;
  return { token: signTok_({ u: u.ID, r: u.Peran }, ttl), user: userView_(u, u.Peran === ROLE.J ? jamaahByUser_(u.ID) : null) };
}
function authLogin_(ctx, d) {
  const ident = String(d.ident || '').trim().toLowerCase(), pw = String(d.sandi || '');
  if (!ident || !pw) throw E_('BAD_INPUT', 'Isi email/nomor HP dan kata sandi.');
  const fk = 'lf_' + ident;
  if (lockedOut_(fk, 6)) throw E_('LOCKED', 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
  const u = findUser_(ident);
  if (!u || !u.HashSandi) {
    if (u && !u.HashSandi) throw E_('NOPASS', 'Kata sandi belum dibuat. Gunakan "Lupa kata sandi" untuk membuatnya.');
    limit_(fk, 6, 900); throw E_('BAD_LOGIN', 'Email/nomor HP atau kata sandi salah.');
  }
  if (!checkPass_(pw, u.HashSandi, u.Salt)) { limit_(fk, 6, 900); throw E_('BAD_LOGIN', 'Email/nomor HP atau kata sandi salah.'); }
  if (u.Status === 'menunggu') throw E_('PENDING', 'Akun Anda masih menunggu verifikasi pengurus.');
  if (u.Status !== 'aktif') throw E_('DISABLED', 'Akun tidak aktif. Hubungi pengurus.');
  cdel_(fk);
  return sessionFor_(u);
}
function authDarurat_(ctx, d) {
  const fk = 'lf_darurat';
  if (lockedOut_(fk, 5)) throw E_('LOCKED', 'Akses darurat terkunci sementara. Coba lagi dalam 30 menit.');
  const h = prop_('EMERG_HASH'), s = prop_('EMERG_SALT');
  if (!h || !checkPass_(String(d.sandi || ''), h, s)) { limit_(fk, 5, 1800); throw E_('BAD_LOGIN', 'Kata sandi darurat salah.'); }
  cdel_(fk);
  return { token: signTok_({ u: 'DARURAT', r: ROLE.A }, 4 * 3600), user: { id: 'DARURAT', nama: 'Akses Darurat', email: '', hp: '', peran: ROLE.A, jamaah: null } };
}
function authDaftar_(ctx, d) {
  const nama = String(d.nama || '').trim().replace(/\s+/g, ' '), hp = normHP_(d.hp), email = String(d.email || '').trim().toLowerCase();
  const alamat = String(d.alamat || '').trim(), gender = d.gender === 'P' ? 'P' : d.gender === 'L' ? 'L' : '';
  const tgl = String(d.tglLahir || '');
  if (nama.length < 3 || nama.length > 80) throw E_('BAD_INPUT', 'Nama lengkap 3–80 karakter.');
  if (hp.length < 9 || hp.length > 15) throw E_('BAD_INPUT', 'Nomor WhatsApp/HP tidak valid.');
  if (!okEmail_(email)) throw E_('BAD_INPUT', 'Format email tidak valid.');
  if (!pwOk_(d.sandi)) throw E_('BAD_INPUT', 'Kata sandi minimal 8 karakter.');
  if (alamat.length < 5 || alamat.length > 200) throw E_('BAD_INPUT', 'Alamat domisili wajib diisi.');
  if (!gender) throw E_('BAD_INPUT', 'Pilih jenis kelamin.');
  const tm = ms_(tgl);
  if (!/^\d{4}-\d\d-\d\d$/.test(tgl) || !tm || tm > Date.now()) throw E_('BAD_INPUT', 'Tanggal lahir tidak valid.');
  if (!d.foto) throw E_('BAD_INPUT', 'Foto profil wajib diunggah.');
  if (!limit_('rg_' + hp, 5, 3600)) throw E_('LIMIT', 'Terlalu banyak percobaan pendaftaran. Coba lagi nanti.');
  const fotoId = saveImg_('FOLDER_PROFIL', d.foto, 'profil_' + hp + '_' + Date.now());
  let res;
  try {
    res = withLock_(() => {
      const us = readAll_('Pengguna');
      if (us.some(u => (u.Email && String(u.Email).toLowerCase() === email) || (u.HP && normHP_(u.HP) === hp))) throw E_('DUP', 'Email atau nomor HP sudah terdaftar.');
      const uid = nextId_('USER', 'U-', 4), jid = nextId_('JAMAAH', 'HJ-', 4), now = fmt_(Date.now()), salt = rand_(16);
      appendRows_('Pengguna', [{ ID: uid, Nama: nama, Email: email, HP: hp, Peran: ROLE.J, HashSandi: hashPass_(d.sandi, salt), Salt: salt, Status: 'menunggu', DibuatPada: now }]);
      appendRows_('Jamaah', [{ JamaahID: jid, Nama: nama, HP: hp, Email: email, Alamat: alamat, Gender: gender, TglLahir: tgl, FotoID: fotoId, Status: 'menunggu verifikasi', UserID: uid, DibuatPada: now }]);
      return { id: jid, nama: nama };
    });
  } catch (x) { trashFile_(fotoId); throw x; }
  nq_('daftar', { to: email, nama: nama, id: res.id });
  return res;
}
function authLupa_(ctx, d) {
  const ident = String(d.ident || '').trim().toLowerCase();
  if (!ident) throw E_('BAD_INPUT', 'Isi email yang terdaftar.');
  if (!limit_('lp_' + ident, 3, 3600)) throw E_('LIMIT', 'Permintaan terlalu sering. Coba lagi dalam 1 jam.');
  const u = findUser_(ident);
  if (u && u.Email && okEmail_(u.Email) && u.Status !== 'nonaktif') {
    const tok = signTok_({ u: u.ID, k: 'reset', p: String(u.HashSandi || '').slice(0, 10) }, 1800);
    nq_('reset', { to: u.Email, nama: u.Nama, token: tok, url: cfg_().frontendUrl });
  }
  return { terkirim: true }; // jawaban sama untuk akun ada/tidak ada
}
function authReset_(ctx, d) {
  const t = verifyTok_(String(d.token || '').trim());
  if (!t || t.k !== 'reset') throw E_('BAD_TOKEN', 'Tautan tidak valid atau sudah kedaluwarsa.');
  if (!pwOk_(d.sandi)) throw E_('BAD_INPUT', 'Kata sandi minimal 8 karakter.');
  return withLock_(() => {
    const u = readAll_('Pengguna').find(x => x.ID === t.u);
    if (!u || String(u.HashSandi || '').slice(0, 10) !== t.p) throw E_('BAD_TOKEN', 'Tautan sudah dipakai atau kedaluwarsa.');
    const salt = rand_(16); u.Salt = salt; u.HashSandi = hashPass_(d.sandi, salt);
    if (u.Status === 'belum aktif') u.Status = 'aktif';
    updateRow_('Pengguna', u._r, u);
    return { ok: true, status: u.Status };
  });
}

/* ============================ PROFIL ============================ */

function me_(ctx) { return userView_(ctx.user, ctx.jamaah); }
function meUbah_(ctx, d) {
  if (ctx.user.ID === 'DARURAT') throw E_('FORBIDDEN', 'Akun darurat tidak punya profil.');
  const nama = String(d.nama || '').trim(), hp = normHP_(d.hp), alamat = String(d.alamat || '').trim();
  if (nama.length < 3) throw E_('BAD_INPUT', 'Nama minimal 3 karakter.');
  if (hp.length < 9 || hp.length > 15) throw E_('BAD_INPUT', 'Nomor HP tidak valid.');
  const newFoto = d.foto ? saveImg_('FOLDER_PROFIL', d.foto, 'profil_' + hp + '_' + Date.now()) : '';
  try {
    withLock_(() => {
      const us = readAll_('Pengguna'), me = us.find(u => u.ID === ctx.user.ID);
      if (us.some(u => u.ID !== me.ID && u.HP && normHP_(u.HP) === hp)) throw E_('DUP', 'Nomor HP sudah dipakai akun lain.');
      me.Nama = nama; me.HP = hp; updateRow_('Pengguna', me._r, me);
      if (ctx.role === ROLE.J) {
        const j = readAll_('Jamaah').find(x => x.UserID === me.ID);
        if (j) { j.Nama = nama; j.HP = hp; if (alamat) j.Alamat = alamat; if (newFoto) j.FotoID = newFoto; updateRow_('Jamaah', j._r, j); }
      }
    });
  } catch (x) { if (newFoto) trashFile_(newFoto); throw x; }
  const u = userById_(ctx.user.ID); return userView_(u, ctx.role === ROLE.J ? jamaahByUser_(u.ID) : null);
}
function meSandi_(ctx, d) {
  if (ctx.user.ID === 'DARURAT') throw E_('FORBIDDEN', 'Akun darurat tidak bisa mengganti sandi dari sini.');
  if (!pwOk_(d.baru)) throw E_('BAD_INPUT', 'Kata sandi baru minimal 8 karakter.');
  return withLock_(() => {
    const u = readAll_('Pengguna').find(x => x.ID === ctx.user.ID);
    if (!checkPass_(String(d.lama || ''), u.HashSandi, u.Salt)) throw E_('BAD_LOGIN', 'Kata sandi lama salah.');
    const salt = rand_(16); u.Salt = salt; u.HashSandi = hashPass_(d.baru, salt); updateRow_('Pengguna', u._r, u); return { ok: true };
  });
}
function fotoGet_(ctx, d) {
  const ids = (Array.isArray(d.ids) ? d.ids : []).filter(x => /^[\w-]{10,60}$/.test(String(x))).slice(0, 12), out = {};
  let mine = null;
  if (ctx.role === ROLE.J) { mine = {}; if (ctx.jamaah && ctx.jamaah.FotoID) mine[ctx.jamaah.FotoID] = 1; absJamaah_(ctx.jamaah.JamaahID).forEach(r => { if (r.SelfieID) mine[r.SelfieID] = 1; }); }
  const okParents = [prop_('FOLDER_PROFIL'), prop_('FOLDER_SELFIE')];
  ids.forEach(id => {
    if (mine && !mine[id]) return;
    const k = 'ft_' + id, c = cget_(k); if (c) { out[id] = c; return; }
    try {
      const f = DriveApp.getFileById(id), ps = f.getParents();
      if (!ps.hasNext() || okParents.indexOf(ps.next().getId()) < 0) return; // hanya foto milik aplikasi
      const b = f.getBlob(), uri = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
      cput_(k, uri, CACHE_TTL); out[id] = uri;
    } catch (x) { /* berkas hilang */ }
  });
  return out;
}

/* ============================ ACARA & JADWAL ============================ */

function acaraAll_() { return tbl_('Acara'); }
function acaraStatus_(a, now) {
  if (a.Status === 'batal') return 'batal';
  const m = ms_(a.Mulai), s = ms_(a.Selesai);
  return now < m ? 'akan datang' : now <= s ? 'berlangsung' : 'selesai';
}
function qrPayload_(a) { return 'HJ|' + a.AcaraID + '|' + a.QRID; }
function acaraView_(a, now, staff) {
  const o = { id: a.AcaraID, nama: a.Nama, ustaz: a.Ustaz, deskripsi: a.Deskripsi || '', mulai: ms_(a.Mulai), selesai: ms_(a.Selesai), lokasi: a.Lokasi, lat: +a.Lat, lng: +a.Lng, radius: +a.Radius || 100, toleransi: +a.Toleransi, status: acaraStatus_(a, now) };
  if (staff) { o.qr = qrPayload_(a); o.pengurus = String(a.Pengurus || '').split(',').filter(Boolean); o.dibuatOleh = a.DibuatOleh; }
  return o;
}
function canAcara_(ctx, a) {
  if (ctx.role === ROLE.A) return true;
  return a.DibuatOleh === ctx.user.ID || String(a.Pengurus || '').split(',').indexOf(ctx.user.ID) >= 0;
}
function acaraScope_(ctx) { return acaraAll_().filter(a => a.Status !== 'batal' && canAcara_(ctx, a)); }

/** Jumlah hadir (hadir+terlambat) per acara — satu kali baca kolom, di-cache berversi. */
function absCounts_() {
  const k = 'cnt_' + ver_('Absensi'), c = cget_(k); if (c) return c;
  const sh = sheet_('Absensi'), last = sh.getLastRow(), o = {};
  if (last > 1) {
    const a = sh.getRange(2, 2, last - 1, 1).getValues(), s = sh.getRange(2, 10, last - 1, 1).getValues();
    for (let i = 0; i < a.length; i++) if (s[i][0] === 'hadir' || s[i][0] === 'terlambat') o[a[i][0]] = (o[a[i][0]] || 0) + 1;
  }
  cput_(k, o); return o;
}
function absJamaah_(jid) {
  const k = 'abj_' + jid + '_' + ver_('abj_' + jid), c = cget_(k); if (c) return c;
  const rows = rowsWhere_('Absensi', 'JamaahID', jid); cput_(k, rows); return rows;
}
function absView_(r) { return { id: r.AbsensiID, acara: r.AcaraID, waktu: ms_(r.Waktu), jarak: +r.JarakM || 0, metode: r.Metode, status: r.Status, catatan: r.Catatan || '', selfie: r.SelfieID || '' }; }

function jadwalList_(jid) {
  const now = Date.now(), lo = now - 45 * DAY, hi = now + 90 * DAY, cnt = absCounts_();
  const my = {}; if (jid) absJamaah_(jid).forEach(r => { my[r.AcaraID] = absView_(r); });
  return acaraAll_().filter(a => a.Status !== 'batal' && ms_(a.Selesai) >= lo && ms_(a.Mulai) <= hi)
    .sort((x, y) => ms_(x.Mulai) - ms_(y.Mulai)).slice(0, 150)
    .map(a => { const v = acaraView_(a, now); v.hadir = cnt[a.AcaraID] || 0; v.my = my[a.AcaraID] || null; return v; });
}
function jadwal_(ctx) { return { acara: jadwalList_(ctx.jamaah ? ctx.jamaah.JamaahID : null), now: Date.now() }; }
function beranda_(ctx) {
  if (!ctx.jamaah) throw E_('NO_JAMAAH', 'Data jamaah tidak ditemukan.');
  const jid = ctx.jamaah.JamaahID, k = 'bd_' + jid + '_' + ver_('abj_' + jid) + '_' + ver_('Acara') + '_' + ver_('Absensi'), c = cget_(k);
  if (c) return Object.assign({}, c, { now: Date.now() });
  const o = { me: userView_(ctx.user, ctx.jamaah), stat: statJamaah_(ctx.jamaah), acara: jadwalList_(jid) };
  cput_(k, o, 120); o.now = Date.now(); return o;
}
function riwayat_(ctx) {
  if (!ctx.jamaah) throw E_('NO_JAMAAH', 'Data jamaah tidak ditemukan.');
  const ac = {}; acaraAll_().forEach(a => { ac[a.AcaraID] = a; });
  const rows = absJamaah_(ctx.jamaah.JamaahID).map(r => { const a = ac[r.AcaraID] || {}; const v = absView_(r); v.nama = a.Nama || '(acara dihapus)'; v.ustaz = a.Ustaz || ''; v.lokasi = a.Lokasi || ''; v.mulai = ms_(a.Mulai); return v; })
    .sort((x, y) => y.waktu - x.waktu);
  return { rows: rows, stat: statJamaah_(ctx.jamaah), me: userView_(ctx.user, ctx.jamaah) };
}

/** Statistik satu jamaah: sesi = acara selesai (atau sudah ada catatan) sejak ia terdaftar. */
function statJamaah_(j) {
  const idx = {}; absJamaah_(j.JamaahID).forEach(r => { idx[r.AcaraID] = r.Status; });
  return statCalc_(j, acaraAll_().filter(a => a.Status !== 'batal'), idx);
}
function statCalc_(j, acaras, idx, now) {
  now = now || Date.now(); const s = { hadir: 0, terlambat: 0, izin: 0, alpa: 0, sesi: 0, persen: 0 }, reg = ms_(j.DibuatPada);
  acaras.forEach(a => {
    const st = idx[a.AcaraID];
    if (st) { if (s[st] !== undefined) { s[st]++; s.sesi++; } } // catatan yang ada selalu dihitung
    else if (ms_(a.Selesai) < now && ms_(a.Mulai) >= reg) { s.alpa++; s.sesi++; } // alpa hanya untuk acara setelah ia terdaftar
  });
  const dasar = s.sesi - s.izin; s.persen = dasar > 0 ? Math.round((s.hadir + s.terlambat) / dasar * 100) : 0;
  return s;
}

/* ============================ ABSENSI (jamaah) ============================ */

function absenSubmit_(ctx, d) {
  const j = ctx.jamaah; if (!j) throw E_('NO_JAMAAH', 'Data jamaah tidak ditemukan.');
  if (j.Status !== 'aktif') throw E_('NOT_ACTIVE', 'Akun Anda belum aktif untuk absen.');
  const a = acaraAll_().find(x => x.AcaraID === d.acaraId); if (!a) throw E_('NO_ACARA', 'Acara tidak ditemukan.');
  const now = Date.now(), st = acaraStatus_(a, now), buka = (+cfg_().bukaMenit || 60) * 60000;
  if (st === 'batal') throw E_('CLOSED', 'Acara ini dibatalkan.');
  if (st === 'selesai') throw E_('CLOSED', 'Acara sudah selesai. Hubungi pengurus untuk koreksi.');
  if (now < ms_(a.Mulai) - buka) throw E_('NOT_OPEN', 'Absensi dibuka ' + Math.round(buka / 60000) + ' menit sebelum acara dimulai.');
  const metode = d.metode === 'qr' ? 'qr' : 'selfie';
  if (metode === 'qr') {
    const p = String(d.qr || '').split('|');
    if (p.length !== 3 || p[0] !== 'HJ' || p[1] !== a.AcaraID || !sameStr_(p[2], a.QRID)) throw E_('BAD_QR', 'QR Code tidak cocok dengan acara ini.');
  } else if (!d.selfie) throw E_('NO_SELFIE', 'Ambil foto selfie dulu.');
  const lat = Number(d.lat), lng = Number(d.lng), acc = Number(d.akurasi);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) throw E_('NO_GPS', 'Lokasi belum terbaca. Aktifkan GPS lalu coba lagi.');
  if (isFinite(acc) && acc <= 0) throw E_('GPS_WEAK', 'Data lokasi tidak valid. Matikan aplikasi lokasi palsu (mock GPS) lalu coba lagi.');
  if (isFinite(acc) && acc > 150) throw E_('GPS_WEAK', 'Sinyal GPS kurang akurat (±' + Math.round(acc) + ' m). Pindah ke area terbuka lalu coba lagi.');
  const jarak = haversine_(lat, lng, +a.Lat, +a.Lng), radius = +a.Radius || 100;
  if (jarak > radius) throw E_('OUT_RADIUS', 'Anda berada ' + jarak + ' m dari lokasi. Batas absen ' + radius + ' m.');
  if (absJamaah_(j.JamaahID).some(r => r.AcaraID === a.AcaraID)) throw E_('DUP', 'Anda sudah tercatat absen di acara ini.');
  const selfieId = metode === 'selfie' ? saveImg_('FOLDER_SELFIE', d.selfie, 'selfie_' + j.JamaahID + '_' + a.AcaraID) : '';
  let res;
  try {
    res = withLock_(() => {
      if (rowsWhere_('Absensi', 'AcaraID', a.AcaraID).some(r => r.JamaahID === j.JamaahID)) throw E_('DUP', 'Anda sudah tercatat absen di acara ini.');
      const t = Date.now(), status = t <= ms_(a.Mulai) + (+a.Toleransi || 0) * 60000 ? 'hadir' : 'terlambat', id = nextId_('ABSEN', 'AB-', 6);
      appendRows_('Absensi', [{ AbsensiID: id, AcaraID: a.AcaraID, JamaahID: j.JamaahID, Waktu: fmt_(t), Lat: lat, Lng: lng, JarakM: jarak, SelfieID: selfieId, Metode: metode, Status: status, Catatan: '' }]);
      return { id: id, status: status, waktu: t, jarak: jarak, acara: a.Nama };
    });
  } catch (x) { if (selfieId) trashFile_(selfieId); throw x; }
  bump_('Absensi', 'abj_' + j.JamaahID); return res;
}

/* ============================ ACARA (pengurus/admin) ============================ */

function acaraList_(ctx) {
  const now = Date.now(), cnt = absCounts_();
  const rows = acaraAll_().filter(a => canAcara_(ctx, a)).sort((x, y) => ms_(y.Mulai) - ms_(x.Mulai)).slice(0, 300)
    .map(a => { const v = acaraView_(a, now, true); v.hadir = cnt[a.AcaraID] || 0; return v; });
  const staff = ctx.role === ROLE.A ? tbl_('Pengguna').filter(u => u.Peran !== ROLE.J && u.Status === 'aktif').map(u => ({ id: u.ID, nama: u.Nama })) : [];
  return { acara: rows, pengurus: staff, cfg: { radius: +cfg_().radiusDefault, toleransi: +cfg_().toleransiDefault } };
}
function acaraSimpan_(ctx, d) {
  const nama = String(d.nama || '').trim(), ustaz = String(d.ustaz || '').trim(), lokasi = String(d.lokasi || '').trim(), desk = String(d.deskripsi || '').trim().slice(0, 500);
  const mulai = ms_(d.mulai), selesai = ms_(d.selesai), lat = Number(d.lat), lng = Number(d.lng), radius = Math.round(Number(d.radius)), tol = Math.round(Number(d.toleransi));
  if (nama.length < 3) throw E_('BAD_INPUT', 'Nama atau tema acara minimal 3 karakter.');
  if (!ustaz) throw E_('BAD_INPUT', 'Nama ustaz wajib diisi.');
  if (!lokasi) throw E_('BAD_INPUT', 'Nama lokasi wajib diisi.');
  if (!mulai || !selesai || selesai <= mulai) throw E_('BAD_INPUT', 'Waktu selesai harus setelah waktu mulai.');
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (!lat && !lng)) throw E_('BAD_INPUT', 'Koordinat lokasi belum valid.');
  if (!(radius >= 20 && radius <= 2000)) throw E_('BAD_INPUT', 'Radius absensi 20–2000 meter.');
  if (!(tol >= 0 && tol <= 180)) throw E_('BAD_INPUT', 'Toleransi terlambat 0–180 menit.');
  return withLock_(() => {
    let a;
    if (d.id) { a = readAll_('Acara').find(x => x.AcaraID === d.id); if (!a) throw E_('NO_ACARA', 'Acara tidak ditemukan.'); if (!canAcara_(ctx, a)) throw E_('FORBIDDEN', 'Acara ini bukan penugasan Anda.'); }
    else a = { AcaraID: nextId_('ACARA', 'AC-', 4), QRID: rand_(12), Status: 'aktif', DibuatOleh: ctx.user.ID, DibuatPada: fmt_(Date.now()) };
    let peng = String(a.Pengurus || '').split(',').filter(Boolean);
    if (ctx.role === ROLE.A) peng = (Array.isArray(d.pengurus) ? d.pengurus : []).map(String).filter(x => /^U-\d+$/.test(x));
    else if (peng.indexOf(ctx.user.ID) < 0) peng.push(ctx.user.ID);
    Object.assign(a, { Nama: nama, Ustaz: ustaz, Deskripsi: desk, Mulai: fmt_(mulai), Selesai: fmt_(selesai), Lokasi: lokasi, Lat: lat, Lng: lng, Radius: radius, Toleransi: tol, Pengurus: peng.join(',') });
    if (d.id) updateRow_('Acara', a._r, a); else appendRows_('Acara', [a]);
    audit_(ctx, d.id ? 'acara.ubah' : 'acara.baru', a.AcaraID + ' ' + nama);
    return acaraView_(a, Date.now(), true);
  });
}
function acaraBatal_(ctx, d) {
  return withLock_(() => {
    const a = readAll_('Acara').find(x => x.AcaraID === d.id); if (!a) throw E_('NO_ACARA', 'Acara tidak ditemukan.');
    if (!canAcara_(ctx, a)) throw E_('FORBIDDEN', 'Acara ini bukan penugasan Anda.');
    a.Status = 'batal'; updateRow_('Acara', a._r, a); audit_(ctx, 'acara.batal', a.AcaraID); return { ok: true };
  });
}
function acaraQr_(ctx, d) {
  return withLock_(() => {
    const a = readAll_('Acara').find(x => x.AcaraID === d.id); if (!a) throw E_('NO_ACARA', 'Acara tidak ditemukan.');
    if (!canAcara_(ctx, a)) throw E_('FORBIDDEN', 'Acara ini bukan penugasan Anda.');
    a.QRID = rand_(12); updateRow_('Acara', a._r, a); audit_(ctx, 'acara.qrBaru', a.AcaraID); return { qr: qrPayload_(a) };
  });
}
/** Daftar hadir real-time: yang sudah tercatat + jamaah aktif yang belum tercatat. */
function acaraDetail_(a, now) {
  now = now || Date.now();
  const rows = rowsWhere_('Absensi', 'AcaraID', a.AcaraID), byJ = {}; rows.forEach(r => { byJ[r.JamaahID] = r; });
  const jams = tbl_('Jamaah').filter(j => j.Status === 'aktif' && (ms_(j.DibuatPada) <= ms_(a.Mulai) || byJ[j.JamaahID])), done = ms_(a.Selesai) < now;
  const jm = {}; tbl_('Jamaah').forEach(j => { jm[j.JamaahID] = j; });
  const rec = rows.map(r => { const j = jm[r.JamaahID] || {}; return { jamaahId: r.JamaahID, nama: j.Nama || r.JamaahID, foto: j.FotoID || '', status: r.Status, waktu: ms_(r.Waktu), jarak: +r.JarakM || 0, metode: r.Metode, selfie: r.SelfieID || '', catatan: r.Catatan || '' }; })
    .sort((x, y) => x.waktu - y.waktu);
  const belum = jams.filter(j => !byJ[j.JamaahID]).map(j => ({ jamaahId: j.JamaahID, nama: j.Nama, foto: j.FotoID || '', status: done ? 'alpa' : 'belum' }));
  const c = { hadir: 0, terlambat: 0, izin: 0, alpa: 0, belum: 0 };
  rec.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
  belum.forEach(b => { c[b.status]++; });
  return { rec: rec, belum: belum, ringkas: c, target: jams.length };
}
function acaraMonitor_(ctx, d) {
  const a = acaraAll_().find(x => x.AcaraID === d.id); if (!a) throw E_('NO_ACARA', 'Acara tidak ditemukan.');
  if (!canAcara_(ctx, a)) throw E_('FORBIDDEN', 'Acara ini bukan penugasan Anda.');
  const det = acaraDetail_(a); det.acara = acaraView_(a, Date.now(), true); det.now = Date.now(); return det;
}
function absenKoreksi_(ctx, d) {
  const st = String(d.status || ''); if (['hadir', 'terlambat', 'izin', 'alpa'].indexOf(st) < 0) throw E_('BAD_INPUT', 'Status tidak valid.');
  const cat = String(d.catatan || '').trim().slice(0, 200); if (!cat) throw E_('BAD_INPUT', 'Catatan koreksi wajib diisi.');
  const a = acaraAll_().find(x => x.AcaraID === d.acaraId), j = jamaahById_(d.jamaahId);
  if (!a || !j) throw E_('NO_ACARA', 'Acara atau jamaah tidak ditemukan.');
  if (!canAcara_(ctx, a)) throw E_('FORBIDDEN', 'Acara ini bukan penugasan Anda.');
  withLock_(() => {
    const ex = rowsWhere_('Absensi', 'AcaraID', a.AcaraID).find(r => r.JamaahID === j.JamaahID), by = ' [oleh ' + ctx.user.ID + ']';
    if (ex) { ex.Status = st; ex.Catatan = cat + by; if (String(ex.Metode).indexOf('koreksi') < 0) ex.Metode = ex.Metode + '+koreksi'; updateRow_('Absensi', ex._r, ex); }
    else appendRows_('Absensi', [{ AbsensiID: nextId_('ABSEN', 'AB-', 6), AcaraID: a.AcaraID, JamaahID: j.JamaahID, Waktu: fmt_(Date.now()), Lat: '', Lng: '', JarakM: '', SelfieID: '', Metode: 'koreksi', Status: st, Catatan: cat + by }]);
    audit_(ctx, 'absen.koreksi', a.AcaraID + ' ' + j.JamaahID + ' -> ' + st);
  });
  bump_('Absensi', 'abj_' + j.JamaahID);
  return acaraMonitor_(ctx, { id: a.AcaraID });
}

/* ============================ DATA JAMAAH ============================ */

function jamaahList_(ctx, d) {
  const q = String(d.q || '').trim().toLowerCase(), st = String(d.status || ''), size = Math.min(Math.max(+d.size || 20, 5), 50), page = Math.max(+d.page || 1, 1);
  const all = tbl_('Jamaah'), c = { semua: all.length, aktif: 0, menunggu: 0, nonaktif: 0 };
  all.forEach(j => { if (j.Status === 'aktif') c.aktif++; else if (j.Status === 'nonaktif') c.nonaktif++; else c.menunggu++; });
  let rows = all.filter(j => {
    if (st === 'aktif' && j.Status !== 'aktif') return false;
    if (st === 'menunggu' && (j.Status === 'aktif' || j.Status === 'nonaktif')) return false;
    if (st === 'nonaktif' && j.Status !== 'nonaktif') return false;
    if (!q) return true;
    return String(j.Nama).toLowerCase().indexOf(q) >= 0 || String(j.JamaahID).toLowerCase().indexOf(q) >= 0 || String(j.HP).indexOf(normHP_(q) || '\u0000') >= 0;
  }).sort((a, b) => (a.Status === 'aktif') - (b.Status === 'aktif') || ms_(b.DibuatPada) - ms_(a.DibuatPada));
  const total = rows.length; rows = rows.slice((page - 1) * size, page * size);
  return { total: total, page: page, size: size, counts: c, items: rows.map(jamaahView_) };
}
function setJamaahStatus_(j, status, userStatus) {
  j.Status = status; updateRow_('Jamaah', j._r, j);
  const u = readAll_('Pengguna').find(x => x.ID === j.UserID);
  if (u) { u.Status = userStatus; updateRow_('Pengguna', u._r, u); }
}
function jamaahVerifikasi_(ctx, d) {
  const ok = d.aksi === 'setuju';
  const j = withLock_(() => {
    const x = readAll_('Jamaah').find(y => y.JamaahID === d.id); if (!x) throw E_('NO_JAMAAH', 'Jamaah tidak ditemukan.');
    if (x.Status === 'aktif' || x.Status === 'nonaktif') throw E_('DONE', 'Pendaftaran ini sudah diproses.');
    setJamaahStatus_(x, ok ? 'aktif' : 'nonaktif', ok ? 'aktif' : 'nonaktif');
    audit_(ctx, ok ? 'jamaah.setuju' : 'jamaah.tolak', x.JamaahID); return x;
  });
  nq_('verifikasi', { to: j.Email, nama: j.Nama, ok: ok });
  return jamaahView_(j);
}
function validJamaahInput_(d) {
  const nama = String(d.nama || '').trim(), hp = normHP_(d.hp), email = String(d.email || '').trim().toLowerCase();
  if (nama.length < 3) throw E_('BAD_INPUT', 'Nama minimal 3 karakter.');
  if (hp.length < 9 || hp.length > 15) throw E_('BAD_INPUT', 'Nomor HP tidak valid.');
  if (email && !okEmail_(email)) throw E_('BAD_INPUT', 'Format email tidak valid.');
  return { nama: nama, hp: hp, email: email, alamat: String(d.alamat || '').trim().slice(0, 200), gender: d.gender === 'P' ? 'P' : 'L', tgl: /^\d{4}-\d\d-\d\d$/.test(String(d.tglLahir || '')) ? d.tglLahir : '' };
}
function jamaahSimpan_(ctx, d) {
  const v = validJamaahInput_(d);
  return withLock_(() => {
    const us = readAll_('Pengguna'), js = readAll_('Jamaah');
    let j = d.id ? js.find(x => x.JamaahID === d.id) : null;
    if (d.id && !j) throw E_('NO_JAMAAH', 'Jamaah tidak ditemukan.');
    const uid = j ? j.UserID : null;
    if (us.some(u => u.ID !== uid && ((v.email && u.Email && String(u.Email).toLowerCase() === v.email) || (u.HP && normHP_(u.HP) === v.hp)))) throw E_('DUP', 'Email atau nomor HP sudah terdaftar.');
    if (j) {
      const u = us.find(x => x.ID === uid); Object.assign(j, { Nama: v.nama, HP: v.hp, Email: v.email, Alamat: v.alamat, Gender: v.gender, TglLahir: v.tgl });
      updateRow_('Jamaah', j._r, j); if (u) { u.Nama = v.nama; u.HP = v.hp; u.Email = v.email; updateRow_('Pengguna', u._r, u); }
      audit_(ctx, 'jamaah.ubah', j.JamaahID); return { jamaah: jamaahView_(j) };
    }
    const nu = nextId_('USER', 'U-', 4), nj = nextId_('JAMAAH', 'HJ-', 4), now = fmt_(Date.now()), salt = rand_(16), pw = rand_(10);
    appendRows_('Pengguna', [{ ID: nu, Nama: v.nama, Email: v.email, HP: v.hp, Peran: ROLE.J, HashSandi: hashPass_(pw, salt), Salt: salt, Status: 'aktif', DibuatPada: now }]);
    const row = { JamaahID: nj, Nama: v.nama, HP: v.hp, Email: v.email, Alamat: v.alamat, Gender: v.gender, TglLahir: v.tgl, FotoID: '', Status: 'aktif', UserID: nu, DibuatPada: now };
    appendRows_('Jamaah', [row]); audit_(ctx, 'jamaah.baru', nj);
    return { jamaah: jamaahView_(row), sandiSementara: pw };
  });
}
function jamaahStatus_(ctx, d) {
  const st = d.status === 'aktif' ? 'aktif' : 'nonaktif';
  return withLock_(() => {
    const j = readAll_('Jamaah').find(x => x.JamaahID === d.id); if (!j) throw E_('NO_JAMAAH', 'Jamaah tidak ditemukan.');
    setJamaahStatus_(j, st, st); audit_(ctx, 'jamaah.' + st, j.JamaahID); bump_('Absensi'); return jamaahView_(j);
  });
}
function jamaahResetSandi_(ctx, d) {
  return withLock_(() => {
    const j = readAll_('Jamaah').find(x => x.JamaahID === d.id); if (!j) throw E_('NO_JAMAAH', 'Jamaah tidak ditemukan.');
    const u = readAll_('Pengguna').find(x => x.ID === j.UserID), pw = rand_(10), salt = rand_(16);
    u.Salt = salt; u.HashSandi = hashPass_(pw, salt); if (u.Status === 'belum aktif') u.Status = 'aktif'; updateRow_('Pengguna', u._r, u);
    audit_(ctx, 'jamaah.resetSandi', j.JamaahID); return { sandiSementara: pw };
  });
}
/** Import massal dari CSV/tempel dari Excel. Aman diulang: baris yang sudah ada (HP/email sama) dilewati. dry=true hanya pratinjau. */
function parseCsv_(t) {
  const sep = t.indexOf('\t') >= 0 ? '\t' : (t.split('\n')[0].split(';').length > t.split('\n')[0].split(',').length ? ';' : ',');
  return t.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
}
function jamaahImport_(ctx, d) {
  const rows = parseCsv_(String(d.csv || '').slice(0, 400000)); if (rows.length < 2) throw E_('BAD_INPUT', 'Isi minimal 1 baris data beserta baris judul kolom.');
  const head = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, '')), col = n => head.indexOf(n);
  const ci = { nama: col('nama'), hp: Math.max(col('hp'), col('nohp'), col('whatsapp')), email: col('email'), alamat: col('alamat'), gender: Math.max(col('gender'), col('jeniskelamin')), tgl: Math.max(col('tgllahir'), col('tanggallahir')) };
  if (ci.nama < 0 || ci.hp < 0) throw E_('BAD_INPUT', 'Baris pertama harus berisi judul kolom, minimal: nama, hp.');
  const run = (commit) => {
    const us = readAll_('Pengguna'), seenHp = {}, seenEm = {}, lewati = [], err = [], baru = [];
    us.forEach(u => { if (u.HP) seenHp[normHP_(u.HP)] = 1; if (u.Email) seenEm[String(u.Email).toLowerCase()] = 1; });
    rows.slice(1).forEach((r, i) => {
      const line = i + 2, g = k => (ci[k] >= 0 ? r[ci[k]] || '' : '');
      try {
        const v = validJamaahInput_({ nama: g('nama'), hp: g('hp'), email: g('email'), alamat: g('alamat'), gender: /^(p|perempuan|wanita)/i.test(g('gender')) ? 'P' : 'L', tglLahir: g('tgl') });
        if (seenHp[v.hp] || (v.email && seenEm[v.email])) { lewati.push({ baris: line, nama: v.nama, alasan: 'Sudah terdaftar' }); return; }
        seenHp[v.hp] = 1; if (v.email) seenEm[v.email] = 1; baru.push(v);
      } catch (x) { err.push({ baris: line, nama: g('nama'), alasan: x.message }); }
    });
    if (commit && baru.length) {
      const now = fmt_(Date.now()), pu = [], pj = [];
      baru.forEach(v => { const nu = nextId_('USER', 'U-', 4), nj = nextId_('JAMAAH', 'HJ-', 4);
        pu.push({ ID: nu, Nama: v.nama, Email: v.email, HP: v.hp, Peran: ROLE.J, HashSandi: '', Salt: '', Status: 'belum aktif', DibuatPada: now });
        pj.push({ JamaahID: nj, Nama: v.nama, HP: v.hp, Email: v.email, Alamat: v.alamat, Gender: v.gender, TglLahir: v.tgl, FotoID: '', Status: 'aktif', UserID: nu, DibuatPada: now }); });
      appendRows_('Pengguna', pu); appendRows_('Jamaah', pj); audit_(ctx, 'jamaah.import', baru.length + ' baris');
    }
    return { baru: baru.length, lewati: lewati.slice(0, 50), jumlahLewati: lewati.length, error: err.slice(0, 50), jumlahError: err.length, dry: !commit };
  };
  return d.dry === false ? withLock_(() => run(true), 25000) : run(false);
}

/* ============================ PENGGUNA (admin) ============================ */

function penggunaList_() {
  return { items: tbl_('Pengguna').filter(u => u.Peran !== ROLE.J).map(u => ({ id: u.ID, nama: u.Nama, email: u.Email, hp: u.HP || '', peran: u.Peran, status: u.Status, dibuat: ms_(u.DibuatPada) })) };
}
function penggunaSimpan_(ctx, d) {
  const nama = String(d.nama || '').trim(), email = String(d.email || '').trim().toLowerCase(), hp = d.hp ? normHP_(d.hp) : '';
  const peran = d.peran === ROLE.A ? ROLE.A : ROLE.S;
  if (nama.length < 3) throw E_('BAD_INPUT', 'Nama minimal 3 karakter.');
  if (!okEmail_(email)) throw E_('BAD_INPUT', 'Format email tidak valid.');
  if (hp && (hp.length < 9 || hp.length > 15)) throw E_('BAD_INPUT', 'Nomor HP tidak valid.');
  return withLock_(() => {
    const us = readAll_('Pengguna'), u = d.id ? us.find(x => x.ID === d.id && x.Peran !== ROLE.J) : null;
    if (d.id && !u) throw E_('NO_USER', 'Pengguna tidak ditemukan.');
    if (us.some(x => x.ID !== (u && u.ID) && ((x.Email && String(x.Email).toLowerCase() === email) || (hp && x.HP && normHP_(x.HP) === hp)))) throw E_('DUP', 'Email atau nomor HP sudah dipakai.');
    if (u) { if (u.ID === ctx.user.ID && peran !== u.Peran) throw E_('BAD_INPUT', 'Anda tidak bisa mengubah peran akun sendiri.'); Object.assign(u, { Nama: nama, Email: email, HP: hp, Peran: peran }); updateRow_('Pengguna', u._r, u); audit_(ctx, 'pengguna.ubah', u.ID); return { id: u.ID }; }
    const id = nextId_('USER', 'U-', 4), pw = rand_(10), salt = rand_(16);
    appendRows_('Pengguna', [{ ID: id, Nama: nama, Email: email, HP: hp, Peran: peran, HashSandi: hashPass_(pw, salt), Salt: salt, Status: 'aktif', DibuatPada: fmt_(Date.now()) }]);
    audit_(ctx, 'pengguna.baru', id + ' ' + peran); return { id: id, sandiSementara: pw };
  });
}
function penggunaStatus_(ctx, d) {
  if (d.id === ctx.user.ID) throw E_('BAD_INPUT', 'Anda tidak bisa menonaktifkan akun sendiri.');
  return withLock_(() => {
    const u = readAll_('Pengguna').find(x => x.ID === d.id && x.Peran !== ROLE.J); if (!u) throw E_('NO_USER', 'Pengguna tidak ditemukan.');
    u.Status = d.status === 'aktif' ? 'aktif' : 'nonaktif'; updateRow_('Pengguna', u._r, u); audit_(ctx, 'pengguna.' + u.Status, u.ID); return { ok: true };
  });
}
function penggunaReset_(ctx, d) {
  return withLock_(() => {
    const u = readAll_('Pengguna').find(x => x.ID === d.id && x.Peran !== ROLE.J); if (!u) throw E_('NO_USER', 'Pengguna tidak ditemukan.');
    const pw = rand_(10), salt = rand_(16); u.Salt = salt; u.HashSandi = hashPass_(pw, salt); updateRow_('Pengguna', u._r, u); audit_(ctx, 'pengguna.reset', u.ID); return { sandiSementara: pw };
  });
}

/* ============================ KONFIGURASI & STATUS SISTEM ============================ */

function configGet_() { const c = cfg_(); return { namaApp: c.namaApp, radiusDefault: +c.radiusDefault, toleransiDefault: +c.toleransiDefault, bukaMenit: +c.bukaMenit, frontendUrl: c.frontendUrl, emailNotif: c.emailNotif }; }
function configSimpan_(ctx, d) { // allowlist: hanya kunci ini yang boleh diubah dari aplikasi
  const v = {}, nm = String(d.namaApp || '').trim();
  if (nm) { if (nm.length > 40) throw E_('BAD_INPUT', 'Nama aplikasi maksimal 40 karakter.'); v.namaApp = nm; }
  const r = Math.round(+d.radiusDefault), t = Math.round(+d.toleransiDefault), b = Math.round(+d.bukaMenit);
  if (!(r >= 20 && r <= 2000)) throw E_('BAD_INPUT', 'Radius default 20–2000 meter.'); v.radiusDefault = r;
  if (!(t >= 0 && t <= 180)) throw E_('BAD_INPUT', 'Toleransi default 0–180 menit.'); v.toleransiDefault = t;
  if (!(b >= 0 && b <= 720)) throw E_('BAD_INPUT', 'Jam buka absen 0–720 menit sebelum acara.'); v.bukaMenit = b;
  const u = String(d.frontendUrl || '').trim();
  if (u && !/^https:\/\/[\w.-]+(:\d+)?(\/[\w.\-~%\/]*)?$/.test(u)) throw E_('BAD_INPUT', 'Alamat situs harus diawali https://');
  v.frontendUrl = u; v.emailNotif = d.emailNotif === 'tidak' ? 'tidak' : 'ya';
  cfgSet_(v); audit_(ctx, 'config.simpan', Object.keys(v).join(',')); return configGet_();
}
function sistemStatus_() {
  const ss = ss_(), n = {}; ['Pengguna', 'Jamaah', 'Acara', 'Absensi'].forEach(k => { n[k] = Math.max(ss.getSheetByName(k).getLastRow() - 1, 0); });
  let mail = null; try { mail = MailApp.getRemainingDailyQuota(); } catch (x) { /* tanpa izin */ }
  return { url: ss.getUrl(), nama: ss.getName(), baris: n, sisaEmail: mail, antreanEmail: (cget_('nq') || []).length, versi: '1.0', waktu: Date.now() };
}

/* ============================ LAPORAN ============================ */

function rangeMs_(d) { // 'yyyy-MM-dd' (WIB) -> [awal, akhir)
  const a = d.dari ? ms_(d.dari) : 0, b = d.sampai ? ms_(d.sampai) + DAY : 9e15; return [a, b];
}
function absIndex_(acaras) { // seluruh absensi untuk himpunan acara -> {aid|jid: row}
  const set = {}; acaras.forEach(a => { set[a.AcaraID] = 1; }); const idx = {};
  if (acaras.length <= 3) acaras.forEach(a => rowsWhere_('Absensi', 'AcaraID', a.AcaraID).forEach(r => { idx[r.AcaraID + '|' + r.JamaahID] = r; }));
  else readAll_('Absensi').forEach(r => { if (set[r.AcaraID]) idx[r.AcaraID + '|' + r.JamaahID] = r; });
  return idx;
}
function eligible_(j, a) { return j.Status === 'aktif' && ms_(j.DibuatPada) <= ms_(a.Mulai); }
function periodik_(acaras, idx, jams, mode, now) {
  const kf = a => { const t = fmt_(ms_(a.Mulai)); return mode === 'harian' ? t.slice(0, 10) : mode === 'tahunan' ? t.slice(0, 4) : t.slice(0, 7); };
  const bk = {}, order = [];
  acaras.slice().sort((x, y) => ms_(x.Mulai) - ms_(y.Mulai)).forEach(a => {
    const k = kf(a); let b = bk[k]; if (!b) { b = bk[k] = { kunci: k, sesi: 0, hadir: 0, terlambat: 0, izin: 0, alpa: 0, persen: 0 }; order.push(k); }
    b.sesi++; const done = ms_(a.Selesai) < now;
    jams.forEach(j => {
      const r = idx[a.AcaraID + '|' + j.JamaahID]; // catatan yang ada selalu dihitung
      if (r) { if (b[r.Status] !== undefined) b[r.Status]++; } else if (done && eligible_(j, a)) b.alpa++;
    });
  });
  return order.map(k => { const b = bk[k], dasar = b.hadir + b.terlambat + b.alpa; b.persen = dasar > 0 ? Math.round((b.hadir + b.terlambat) / dasar * 100) : 0; return b; });
}
const BULAN_ = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function labelKunci_(k) { const p = k.split('-'); return p.length === 3 ? p[2] + ' ' + BULAN_[+p[1] - 1] + ' ' + p[0] : p.length === 2 ? BULAN_[+p[1] - 1] + ' ' + p[0] : k; }
function tgl_(ms) { return ms ? Utilities.formatDate(new Date(ms), TZ, 'dd MMM yyyy HH:mm') : ''; }

/**
 * Satu fungsi laporan untuk tampilan layar dan ekspor.
 * jenis: 'acara' (per acara) | 'jamaah' (per jamaah) | 'periodik' (harian/bulanan/tahunan)
 * Pengurus hanya melihat acara penugasannya; administrator melihat semua.
 */
function laporan_(ctx, d) {
  const now = Date.now(), jenis = d.jenis || 'jamaah', q = String(d.q || '').trim().toLowerCase(), rg = rangeMs_(d);
  const key = 'lp_' + ctx.role + '_' + ctx.user.ID + '_' + JSON.stringify([jenis, d.acaraId, d.dari, d.sampai, d.mode, q]) + '_' + ver_('Absensi') + ver_('Acara') + ver_('Jamaah');
  const hit = d.fresh ? null : cget_(key); if (hit) return hit;
  const scope = acaraScope_(ctx), inRange = scope.filter(a => ms_(a.Mulai) >= rg[0] && ms_(a.Mulai) < rg[1]);
  const jams = tbl_('Jamaah').filter(j => j.Status === 'aktif');
  let res;
  if (jenis === 'acara') {
    const a = scope.find(x => x.AcaraID === d.acaraId); if (!a) throw E_('NO_ACARA', 'Pilih acara yang ingin dilaporkan.');
    const det = acaraDetail_(a, now), all = det.rec.concat(det.belum).filter(r => !q || String(r.nama).toLowerCase().indexOf(q) >= 0 || String(r.jamaahId).toLowerCase().indexOf(q) >= 0);
    res = { jenis: jenis, judul: 'Laporan Kehadiran: ' + a.Nama, sub: a.Ustaz + ' · ' + tgl_(ms_(a.Mulai)) + ' · ' + a.Lokasi,
      kolom: ['No', 'ID Jamaah', 'Nama', 'Status', 'Waktu absen', 'Jarak (m)', 'Metode', 'Catatan'],
      baris: all.map((r, i) => [i + 1, r.jamaahId, r.nama, r.status, r.waktu ? tgl_(r.waktu) : '-', r.jarak || '', r.metode || '-', r.catatan || '']),
      extra: all.map(r => ({ foto: r.foto, selfie: r.selfie, status: r.status })), ringkas: det.ringkas, target: det.target };
  } else if (jenis === 'periodik') {
    const mode = ['harian', 'bulanan', 'tahunan'].indexOf(d.mode) >= 0 ? d.mode : 'bulanan', idx = absIndex_(inRange), bs = periodik_(inRange, idx, jams, mode, now);
    res = { jenis: jenis, mode: mode, judul: 'Rekap ' + mode[0].toUpperCase() + mode.slice(1) + ' Kehadiran', sub: ctx.role === ROLE.A ? 'Seluruh acara' : 'Acara yang Anda tangani',
      kolom: ['Periode', 'Jumlah acara', 'Hadir', 'Terlambat', 'Izin', 'Tidak hadir', 'Kehadiran (%)'],
      baris: bs.map(b => [labelKunci_(b.kunci), b.sesi, b.hadir, b.terlambat, b.izin, b.alpa, b.persen]), grafik: bs.map(b => ({ k: labelKunci_(b.kunci), p: b.persen, h: b.hadir + b.terlambat })) };
  } else {
    const idx = absIndex_(inRange), acs = inRange.filter(a => ms_(a.Mulai) < now);
    let list = jams.filter(j => !q || String(j.Nama).toLowerCase().indexOf(q) >= 0 || String(j.JamaahID).toLowerCase().indexOf(q) >= 0);
    const stats = list.map(j => { const ix = {}; acs.forEach(a => { const r = idx[a.AcaraID + '|' + j.JamaahID]; if (r) ix[a.AcaraID] = r.Status; }); return { j: j, s: statCalc_(j, acs, ix, now) }; })
      .sort((x, y) => y.s.persen - x.s.persen || y.s.hadir - x.s.hadir);
    const aktif = stats.filter(x => x.s.sesi > 0);
    res = { jenis: jenis, judul: 'Rekap Kehadiran per Jamaah', sub: (d.dari || 'awal') + ' s.d. ' + (d.sampai || 'sekarang') + ' · ' + acs.length + ' acara',
      kolom: ['No', 'ID Jamaah', 'Nama', 'Sesi', 'Hadir', 'Terlambat', 'Izin', 'Tidak hadir', 'Kehadiran (%)'],
      baris: stats.map((x, i) => [i + 1, x.j.JamaahID, x.j.Nama, x.s.sesi, x.s.hadir, x.s.terlambat, x.s.izin, x.s.alpa, x.s.persen]),
      top: { aktif: aktif.slice(0, 5).map(x => ({ id: x.j.JamaahID, nama: x.j.Nama, foto: x.j.FotoID, persen: x.s.persen, hadir: x.s.hadir + x.s.terlambat, sesi: x.s.sesi })),
        jarang: aktif.slice().reverse().slice(0, 5).map(x => ({ id: x.j.JamaahID, nama: x.j.Nama, foto: x.j.FotoID, persen: x.s.persen, hadir: x.s.hadir + x.s.terlambat, sesi: x.s.sesi })) },
      ringkas: { jamaah: stats.length, acara: acs.length, rata: aktif.length ? Math.round(aktif.reduce((t, x) => t + x.s.persen, 0) / aktif.length) : 0 } };
  }
  res.dibuat = now; cput_(key, res, 90); return res;
}
function laporanExport_(ctx, d) {
  const L = laporan_(ctx, Object.assign({}, d, { fresh: true })), fmt = d.format === 'pdf' ? 'pdf' : 'xlsx';
  const w = L.kolom.length, rows = [[L.judul], [L.sub || ''], [''], L.kolom].concat(L.baris).map(r => { const c = r.slice(); while (c.length < w) c.push(''); return c; });
  const ss = SpreadsheetApp.create('tmp_laporan_' + Date.now()), id = ss.getId();
  try {
    const sh = ss.getSheets()[0]; sh.getRange(1, 1, rows.length, w).setValues(rows);
    sh.getRange(1, 1).setFontWeight('bold').setFontSize(14); sh.getRange(4, 1, 1, w).setFontWeight('bold').setBackground('#EEEDFD');
    sh.autoResizeColumns(1, w); SpreadsheetApp.flush();
    const url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=' + fmt + (fmt === 'pdf' ? '&portrait=false&size=A4&fitw=true&gridlines=false' : '');
    const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw E_('EXPORT', 'Ekspor gagal. Coba lagi.');
    audit_(ctx, 'laporan.export', L.judul + ' ' + fmt);
    return { nama: 'Laporan_' + (L.jenis || 'hj') + '_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm') + '.' + fmt, base64: Utilities.base64Encode(r.getContent()), mime: fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  } finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) { /* abaikan */ } }
}

/* ============================ DASHBOARD PENGURUS/ADMIN ============================ */

function dash_(ctx) {
  const now = Date.now(), key = 'ds_' + ctx.role + '_' + ctx.user.ID + '_' + ver_('Absensi') + ver_('Acara') + ver_('Jamaah'), hit = cget_(key);
  if (hit) return Object.assign({}, hit, { now: now });
  const jall = tbl_('Jamaah'), jams = jall.filter(j => j.Status === 'aktif'), scope = acaraScope_(ctx), cnt = absCounts_();
  const hariIni = Utilities.formatDate(new Date(now), TZ, 'yyyy-MM-dd'), today = scope.filter(a => fmt_(ms_(a.Mulai)).slice(0, 10) === hariIni);
  const six = new Date(now - 150 * DAY), from = ms_(Utilities.formatDate(six, TZ, 'yyyy-MM') + '-01');
  const rangeA = scope.filter(a => ms_(a.Mulai) >= from && ms_(a.Mulai) <= now), idx = absIndex_(rangeA);
  const bulanan = periodik_(rangeA, idx, jams, 'bulanan', now), cur = bulanan.length ? bulanan[bulanan.length - 1] : { hadir: 0, terlambat: 0, izin: 0, alpa: 0, persen: 0 };
  const o = {
    kartu: { jamaahAktif: jams.length, menunggu: jall.filter(j => j.Status !== 'aktif' && j.Status !== 'nonaktif').length, acaraHariIni: today.length, hadirHariIni: today.reduce((t, a) => t + (cnt[a.AcaraID] || 0), 0), rata: cur.persen },
    tren: bulanan.slice(-6).map(b => ({ k: labelKunci_(b.kunci), p: b.persen })),
    distribusi: { hadir: cur.hadir, terlambat: cur.terlambat, izin: cur.izin, alpa: cur.alpa },
    acara: scope.filter(a => ms_(a.Selesai) >= now).sort((x, y) => ms_(x.Mulai) - ms_(y.Mulai)).slice(0, 6).map(a => { const v = acaraView_(a, now, true); v.hadir = cnt[a.AcaraID] || 0; return v; })
  };
  cput_(key, o, 90); o.now = now; return o;
}
