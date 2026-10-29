/* Router hash + kerangka (header, dock, sidebar) untuk jamaah dan staf. */
const App = (() => {
  const A = { nama: HJ_CONFIG.APP_NAME, cleanup: null, shellKey: '' };
  const NAV = {
    jamaah: { items: [['#/', 'home', 'Beranda', p => p === '/'], ['#/jadwal', 'calendar_month', 'Jadwal', p => p === '/jadwal'], ['#/absen', 'qr_code_scanner', 'Absen', p => p.indexOf('/absen') === 0, 1], ['#/riwayat', 'history', 'Riwayat', p => p === '/riwayat'], ['#/profil', 'person', 'Profil', p => p === '/profil']] },
    pengurus: { items: [['#/admin', 'dashboard', 'Beranda', p => p === '/admin'], ['#/admin/acara', 'event', 'Acara', p => /^\/admin\/acara/.test(p)], ['#/admin/qr', 'qr_code_2', 'QR', p => p === '/admin/qr', 1], ['#/admin/laporan', 'assessment', 'Laporan', p => p === '/admin/laporan'], ['#/profil', 'person', 'Profil', p => p === '/profil']] }
  };
  const SIDE = {
    jamaah: [['#/', 'home', 'Beranda'], ['#/jadwal', 'calendar_month', 'Jadwal'], ['#/absen', 'qr_code_scanner', 'Absen'], ['#/riwayat', 'history', 'Riwayat'], ['#/profil', 'person', 'Profil']],
    staff: p => [['#/admin', 'dashboard', 'Beranda'], ['#/admin/jamaah', 'groups', 'Data Jamaah'], ['#/admin/acara', 'event', 'Acara & QR'], ['#/admin/laporan', 'assessment', 'Laporan & Ekspor']].concat(p === 'administrator' ? [['#/admin/pengguna', 'admin_panel_settings', 'Pengguna'], ['#/admin/pengaturan', 'settings', 'Pengaturan']] : []).concat([['#/profil', 'person', 'Profil']])
  };
  const ROUTES = [
    ['/login', 'pub', () => Auth.login()], ['/daftar', 'pub', () => Auth.daftar()], ['/lupa', 'pub', () => Auth.lupa()], ['/reset/:token', 'pub', p => Auth.reset(p)], ['/reset', 'pub', p => Auth.reset(p)], ['/darurat', 'pub', () => Auth.darurat()],
    ['/', 'J', () => Jamaah.beranda(), 'Beranda'], ['/jadwal', 'J', () => Jamaah.jadwal(), 'Jadwal'], ['/absen', 'J', p => Jamaah.absen(p), 'Absen'], ['/absen/:id', 'J', p => Jamaah.absen(p), 'Absen'], ['/riwayat', 'J', p => Jamaah.riwayat(p, 'riwayat'), 'Riwayat'],
    ['/profil', 'JS', (p, role) => role === 'jamaah' ? Jamaah.riwayat(p, 'pribadi') : Staff.profil(), 'Profil'],
    ['/admin', 'S', () => Staff.dash(), 'Beranda'], ['/admin/jamaah', 'S', p => Staff.jamaah(p), 'Data Jamaah'], ['/admin/acara', 'S', () => Staff.acara(), 'Acara'], ['/admin/acara/:id', 'S', p => Staff.detail(p), 'Detail Acara'], ['/admin/qr', 'S', () => Staff.qrPicker(), 'QR Acara'],
    ['/admin/laporan', 'S', () => Staff.laporan(), 'Laporan'], ['/admin/pengguna', 'A', () => Staff.pengguna(), 'Pengguna'], ['/admin/pengaturan', 'A', () => Staff.pengaturan(), 'Pengaturan']
  ];
  function match(path) {
    for (const r of ROUTES) { const a = r[0].split('/'), b = path.split('/'); if (a.length !== b.length) continue; const p = {}; let ok = true; for (let i = 0; i < a.length; i++) { if (a[i][0] === ':') p[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) { ok = false; break; } } if (ok) return { r, p }; }
    return null;
  }
  const homeOf = u => (u && u.peran === 'jamaah' ? '#/' : '#/admin');

  function shell(force) {
    const u = API.S.user, key = u.peran === 'jamaah' ? 'jamaah' : 'staff' + u.peran;
    if (!force && A.shellKey === key && $('#view')) { refreshHeader(); return; }
    A.shellKey = key; const isJ = u.peran === 'jamaah', nav = (isJ ? NAV.jamaah : NAV.pengurus).items, side = isJ ? SIDE.jamaah : SIDE.staff(u.peran);
    document.body.className = 'has-side';
    put($('#app'), html`<aside class="side" aria-label="Menu utama"><div class="brand"><span class="logo">${ic('mosque', 'fill')}</span><div><b class="t-sm" style="display:block">${A.nama}</b><span class="t-xxs mut">Presensi Pengajian</span></div></div><div class="grp">MENU UTAMA</div>${side.map(s => html`<a href="${s[0]}" data-nav="${s[0]}">${ic(s[1])}${s[2]}</a>`)}</aside>
      <header class="hdr"><div class="in"><div class="row"><span class="logo">${ic('mosque', 'fill')}</span><div><b class="t-xs mut" style="display:block;letter-spacing:.02em">${A.nama}</b><b class="t-sm" id="ttl"></b></div></div><div class="row gap4">${isJ ? html`<button class="iconbtn" data-act="bell" aria-label="Pengingat">${ic('notifications')}</button>` : ''}<a href="#/profil" id="hav" aria-label="Profil saya"></a></div></div></header>
      <main class="main" id="view" tabindex="-1" aria-live="polite"></main>
      <nav class="dock" aria-label="Navigasi utama">${nav.map(n => n[4] ? html`<a href="${n[0]}" data-nav="${n[0]}" aria-label="${n[2]}"><span class="fabw"><span class="fab">${ic(n[1], 'lg')}</span>${n[2]}</span></a>` : html`<a href="${n[0]}" data-nav="${n[0]}">${ic(n[1])}${n[2]}</a>`)}</nav>`);
    refreshHeader();
  }
  function refreshHeader() { const u = API.S.user, h = $('#hav'); if (h && u) put(h, avatar(u.nama, u.jamaah ? u.jamaah.foto : '', 'm')); }
  function setActive(path, title) {
    const t = $('#ttl'); if (t) t.textContent = title || ''; document.title = (title ? title + ' · ' : '') + A.nama;
    const isJ = API.S.user.peran === 'jamaah', items = (isJ ? NAV.jamaah : NAV.pengurus).items;
    $$('[data-nav]').forEach(a => { const n = items.find(x => x[0] === a.dataset.nav); const on = n ? n[3](path) : (path === a.dataset.nav.slice(1) || (a.dataset.nav !== '#/admin' && path.indexOf(a.dataset.nav.slice(1)) === 0)); a.classList.toggle('on', !!on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function noApi() { document.body.className = ''; put($('#app'), html`<div class="auth"><div class="card center"><div class="sq" style="margin:0 auto 12px">${ic('settings')}</div><h1 class="t-md">Backend belum terhubung</h1><p class="mut mt8">Isi <code>API_URL</code> di berkas <code>js/config.js</code> dengan URL Web App Apps Script (berakhiran <code>/exec</code>), lalu muat ulang halaman.</p></div></div>`); }

  async function route() {
    if (A.cleanup) { try { A.cleanup(); } catch (e) { /* abaikan */ } A.cleanup = null; } closeSheet(); const qf = $('#qrfull'); if (qf) qf.remove();
    if (!HJ_CONFIG.API_URL) return noApi();
    const h = location.hash.slice(1) || '/', [path, qs] = h.split('?'), m = match(path.length > 1 ? path.replace(/\/$/, '') : path), u = API.S.user, tok = API.S.token;
    if (!m) { location.replace(tok ? homeOf(u) : '#/login'); return; }
    const [pat, role, fn, title] = m.r, params = Object.assign({ q: new URLSearchParams(qs || '') }, m.p);
    if (role === 'pub') {
      if (tok && u && /^(\/login|\/daftar|\/lupa)$/.test(pat)) { location.replace(homeOf(u)); return; }
      document.body.className = ''; A.shellKey = ''; window.scrollTo(0, 0); fn(params); return;
    }
    if (!tok || !u) { location.replace('#/login'); return; }
    const isJ = u.peran === 'jamaah', isA = u.peran === 'administrator';
    if ((role === 'J' && !isJ) || (role === 'S' && isJ) || (role === 'A' && !isA)) { location.replace(homeOf(u)); return; }
    shell(); setActive(path, title); window.scrollTo(0, 0); const v = $('#view');
    try { const c = await fn(params, u.peran); if (location.hash.slice(1) === h || true) A.cleanup = typeof c === 'function' ? c : null; }
    catch (e) { if (e.code === 'SESSION') return; put(v, html`<div class="card center"><div class="empty">${ic('cloud_off')}<b>Tidak dapat memuat halaman</b><p>${errMsg(e)}</p></div><button class="btn pri" data-act="retry">Coba Lagi</button></div>`); }
  }
  ACT.retry = () => route();
  addEventListener('hashchange', route);
  // Simpan tinggi layar untuk browser mobile & cegah zoom ganda
  A.boot = () => route(); A.shell = shell;
  return A;
})();
document.addEventListener('DOMContentLoaded', () => App.boot());
