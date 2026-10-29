/* Portal jamaah: Beranda, Jadwal, Absen (selfie/QR + GPS), Riwayat & Profil. */
const Jamaah = (() => {
  const J = { data: null, chip: 'hari', q: '', f: 'semua', day: null, wk: 0, tab: 'riwayat', bulan: '' };
  const HADITS = [['Barangsiapa menempuh jalan untuk mencari ilmu, Allah memudahkan baginya jalan menuju surga.', 'HR. Muslim no. 2699'], ['Sebaik-baik kalian adalah orang yang mempelajari Al-Qur\u2019an dan mengajarkannya.', 'HR. Bukhari no. 5027'], ['Sesungguhnya setiap amal tergantung pada niatnya.', 'HR. Bukhari no. 1 dan Muslim no. 1907']];
  const canAbsen = (a, now) => !a.my && a.status !== 'selesai' && now >= a.mulai - 60 * 60000;
  const myJ = () => (API.S.user && API.S.user.jamaah) || {};
  const pile = n => n > 0 ? html`<div class="facepile" aria-hidden="true">${['AF', 'NA', 'BS'].slice(0, Math.min(3, n)).map((x, i) => html`<span class="av" style="background:${['#E4DFFF', '#DCFCE7', '#FEF3C7'][i]}">${x}</span>`)}</div>` : '';
  const hadirTxt = n => n > 0 ? html`<span class="t-body mut">+${n} Jama'ah</span>` : html`<span class="t-body mut">Belum ada yang hadir</span>`;

  function statusOf(a, now) {
    if (a.my) return pill(a.my.status);
    if (a.status === 'selesai' && a.mulai >= (myJ().dibuat || 0)) return pill('alpa');
    return acaraPill(a);
  }
  function action(a, now) {
    if (a.my) return html`<span class="tag2 g">${ic('check_circle', 'sm')}Tercatat ${jam(a.my.waktu)}</span>`;
    if (canAbsen(a, now)) return html`<a class="btn soft sm" href="#/absen/${a.id}">${a.status === 'berlangsung' ? 'Masuk' : 'Absen'} ${ic('arrow_forward', 'sm')}</a>`;
    if (a.status === 'akan datang') return html`<button class="btn soft sm" data-act="remind" data-id="${a.id}">${ic('notifications', 'sm')}Ingatkan</button>`;
    return '';
  }
  function card(a, now) {
    return html`<article class="card sched" style="padding:16px"><div class="top"><span class="sq ${a.status === 'berlangsung' ? 'amber' : ''}">${ic(a.status === 'berlangsung' ? 'menu_book' : 'volunteer_activism')}</span>
      <div class="grow"><div class="row between"><span>${statusOf(a, now)}</span><span class="t-xs mut">${relDay(a.mulai, now)}</span></div><h3 class="t-sm mt8">${a.nama}</h3><p class="mut ell">${a.ustaz}</p></div></div>
      <div class="foot"><span class="row gap8 grow" style="min-width:0">${ic('schedule', 'sm')}<span class="nw">${jam(a.mulai)} WIB</span>${ic('mosque', 'sm')}<span class="ell">${a.lokasi}</span></span>${action(a, now)}</div></article>`;
  }
  function counts(list, now) { const t = dkey(now); return { hari: list.filter(a => dkey(a.mulai) === t).length, datang: list.filter(a => a.status === 'akan datang').length, selesai: list.filter(a => a.status === 'selesai').length }; }
  function filtered(list, now) {
    const t = dkey(now), q = J.q.toLowerCase();
    return list.filter(a => {
      if (J.chip === 'hari' && dkey(a.mulai) !== t) return false; if (J.chip === 'datang' && a.status !== 'akan datang') return false; if (J.chip === 'selesai' && a.status !== 'selesai') return false;
      if (J.f === 'belum' && (a.my || a.status === 'selesai')) return false; if (J.f === 'sudah' && !a.my) return false;
      return !q || (a.nama + ' ' + a.ustaz + ' ' + a.lokasi).toLowerCase().indexOf(q) >= 0;
    }).sort((x, y) => J.chip === 'selesai' ? y.mulai - x.mulai : x.mulai - y.mulai);
  }

  /* ---------- Beranda ---------- */
  async function beranda() {
    put($('#view'), skeleton(4));
    const d = await API.read('beranda', {}, 20); J.data = d; draw(d);
    const t = setInterval(() => { if ($('#bd-list')) drawList(); else clearInterval(t); }, 30000);
    return () => clearInterval(t);
  }
  function drawList() {
    const d = J.data, now = Date.now(), l = filtered(d.acara, now), box = $('#bd-list'); if (!box) return;
    put(box, l.length ? html`${l.map(a => card(a, now))}` : emptyBox('event_busy', J.chip === 'hari' ? 'Tidak ada pengajian hari ini' : 'Belum ada jadwal', html`<p>Ganti filter atau lihat <a href="#/jadwal">semua jadwal</a>.</p>`));
    const c = counts(d.acara, now); $$('.chip[data-chip] .n').forEach(n => { n.textContent = c[n.parentElement.dataset.chip]; });
  }
  function draw(d) {
    const now = Date.now(), me = d.me, j = me.jamaah || {}, s = d.stat, c = counts(d.acara, now);
    const next = d.acara.find(a => a.status === 'berlangsung' && !a.my) || d.acara.find(a => a.status === 'akan datang') || d.acara.find(a => a.status === 'berlangsung');
    const h = HADITS[Math.floor(now / DAY) % HADITS.length];
    const hero = next ? html`<section class="hero" aria-label="Pengajian berikutnya"><div class="row between wrap gap8"><span class="tag">${next.status === 'berlangsung' ? html`<i class="dot" style="background:#FACC15"></i>SEDANG BERLANGSUNG` : html`<i class="dot" style="background:#FACC15"></i>PENGAJIAN BERIKUTNYA`}</span><span class="row gap4 t-xs" style="opacity:.9">${ic('location_on', 'sm')}Radius ${next.radius}m</span></div>
        <h2 class="t-md mt16" style="font-weight:800">${next.nama}</h2><p class="row gap8 mt8" style="opacity:.92">${ic('group', 'sm')}${next.ustaz}</p>
        <div class="col gap8 mt16" style="align-items:flex-start"><span class="meta">${ic('schedule', 'sm')}${relDay(next.mulai, now)}, ${rentang(next)}</span><span class="meta">${ic('mosque', 'sm')}<span class="ell">${next.lokasi}</span></span></div>
        <div class="foot"><div class="row gap8">${pile(next.hadir)}<span class="t-xs" style="opacity:.95">${next.hadir > 0 ? '+' + next.hadir + ' Jama\'ah' : 'Jadilah yang pertama'}</span></div>
        ${next.my ? html`<span class="btn white" style="pointer-events:none">${ic('check_circle', 'sm')}Sudah Absen</span>` : html`<a class="btn white" href="#/absen/${next.id}">${ic('qr_code_scanner', 'sm')}Absen Sekarang ${ic('arrow_forward', 'sm')}</a>`}</div></section>`
      : html`<section class="hero"><h2 class="t-md">Belum ada pengajian terjadwal</h2><p class="mt8" style="opacity:.9">Jadwal baru dari pengurus akan muncul di sini.</p></section>`;
    put($('#view'), html`
      <div class="row"><span style="position:relative">${avatar(me.nama, j.foto, 'l')}<i class="dot" style="position:absolute;right:2px;bottom:2px;width:14px;height:14px;background:var(--ok);border:2px solid var(--canvas)"></i></span>
        <div class="grow"><p class="mut">Assalamu'alaikum,</p><h1 class="t-md ell">${me.nama}</h1></div><span class="pill aktif">Jama'ah Aktif</span></div>
      <div class="search mt16" role="search">${ic('search')}<input id="bd-q" type="search" placeholder="Cari jadwal pengajian atau ustaz" aria-label="Cari jadwal" value="${J.q}"><button class="tune" data-act="filter" aria-label="Filter">${ic('tune', 'sm')}</button></div>
      <div class="chips mt8" role="tablist">${[['hari', 'Hari Ini'], ['datang', 'Mendatang'], ['selesai', 'Selesai']].map(x => html`<button class="chip ${J.chip === x[0] ? 'on' : ''}" data-act="chip" data-chip="${x[0]}" role="tab">${x[1]}<span class="n">${c[x[0]]}</span></button>`)}</div>
      <div class="mt8">${hero}</div>
      <section class="card mt16" aria-label="Kehadiran saya"><div class="row between"><div class="row"><span class="sq">${ic('bar_chart')}</span><h2 class="t-sm">Kehadiran Saya</h2></div><a href="#/riwayat" class="t-xs b">Lihat Riwayat ${ic('chevron_right', 'sm')}</a></div>
        <div class="row between mt16"><span class="mut">Tingkat Keaktifan</span><span class="stat" style="color:var(--ok-t);font-size:18px">${s.persen}%</span></div><div class="progress mt8" role="progressbar" aria-valuenow="${s.persen}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct(s.persen)}%"></i></div>
        <div class="tiles mt16">${[['hadir', 'Hadir'], ['terlambat', 'Terlambat'], ['izin', 'Izin'], ['alpa', 'Alpa']].map(x => html`<div class="tile ${x[0]}"><span class="t-xs">${x[1]}</span><span class="stat">${s[x[0]]}</span></div>`)}</div></section>
      <div class="sec"><div class="sec-h"><h2 class="t-sm">Jadwal Pengajian Terdekat</h2><a class="t-xs b" href="#/jadwal">Semua Jadwal</a></div><div id="bd-list"></div></div>
      <section class="card quote mt16">${'' /* kutipan */}<span class="sq" style="background:var(--grad);color:#fff">${ic('auto_stories')}</span><div><p style="font-style:italic">\u201C${h[0]}\u201D</p><p class="mut mt8 t-xs">${h[1]}</p></div></section>`);
    drawList();
    $('#bd-q').oninput = e => { J.q = e.target.value; drawList(); };
  }
  ACT.chip = b => { J.chip = b.dataset.chip; $$('.chip[data-chip]').forEach(x => x.classList.toggle('on', x === b)); drawList(); };
  ACT.filter = () => sheet(html`<h3 class="t-md">Filter jadwal</h3><div class="col mt16">${[['semua', 'Semua jadwal'], ['belum', 'Belum saya absen'], ['sudah', 'Sudah saya absen']].map(x => html`<button class="chip ${J.f === x[0] ? 'on' : ''}" style="height:48px" data-act="setf" data-f="${x[0]}">${x[1]}</button>`)}</div>`);
  ACT.setf = b => { J.f = b.dataset.f; closeSheet(); drawList(); };
  ACT.remind = async b => {
    const a = (J.data ? J.data.acara : []).find(x => x.id === b.dataset.id) || (J.jd || []).find(x => x.id === b.dataset.id); if (!a) return;
    const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HADIR JAMAAH//ID', 'BEGIN:VEVENT', 'UID:' + a.id + '@hadirjamaah', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(a.mulai), 'DTEND:' + z(a.selesai), 'SUMMARY:' + a.nama.replace(/[,;\n]/g, ' '), 'LOCATION:' + a.lokasi.replace(/[,;\n]/g, ' '), 'DESCRIPTION:' + a.ustaz.replace(/[,;\n]/g, ' '), 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Pengajian dimulai 30 menit lagi', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    download('pengajian-' + a.id + '.ics', 'text/calendar', ics); toast('Buka berkas untuk menambah pengingat ke kalender Anda.', 'ok');
  };
  ACT.share = async b => { const a = (J.jd || []).find(x => x.id === b.dataset.id); if (!a) return; const t = `${a.nama}\n${a.ustaz}\n${tglL(a.mulai)}, ${rentang(a)}\n${a.lokasi}\n${mapsUrl(a)}`; try { if (navigator.share) await navigator.share({ title: a.nama, text: t }); else { await navigator.clipboard.writeText(t); toast('Info pengajian disalin.', 'ok'); } } catch (e) { /* dibatalkan */ } };
  ACT.bell = async () => {
    const d = await API.read('jadwal', {}, 20), now = Date.now(), l = d.acara.filter(a => canAbsen(a, now) || (a.status === 'akan datang' && dkey(a.mulai) === dkey(now)));
    sheet(html`<h3 class="t-md">Pengingat</h3><div class="list mt8">${l.length ? l.map(a => html`<a class="li" href="#/absen/${a.id}" data-act="sheet-no"><span class="sq ${a.status === 'berlangsung' ? 'amber' : ''}">${ic('event')}</span><div class="grow"><b class="ell" style="display:block">${a.nama}</b><span class="mut t-body">${relDay(a.mulai, now)} · ${rentang(a)}</span></div>${canAbsen(a, now) ? html`<span class="pill live">Absen dibuka</span>` : ''}</a>`) : emptyBox('notifications_off', 'Tidak ada pengingat', html`<p>Anda sudah rapi hari ini.</p>`)}</div>`);
    $('#sheet').addEventListener('click', e => { if (e.target.closest('a')) closeSheet(); });
  };

  /* ---------- Jadwal ---------- */
  async function jadwal() {
    put($('#view'), skeleton(3)); const d = await API.read('jadwal', {}, 20); J.jd = d.acara; drawJadwal();
    const t = setInterval(() => { if ($('#jd-list')) drawJadwal(); else clearInterval(t); }, 45000); return () => clearInterval(t);
  }
  function weekDays(offset) { const now = Date.now(), base = Date.parse(dkey(now) + 'T00:00:00+07:00'), dow = (new Date(base + 7 * 3600e3).getUTCDay() + 6) % 7, start = base - dow * DAY + offset * 7 * DAY; return Array.from({ length: 7 }, (_, i) => start + i * DAY); }
  function drawJadwal() {
    const l = J.jd, now = Date.now(), days = weekDays(J.wk), key = dkey(now), sel = J.day, ch = J.jchip || 'datang';
    const has = {}; l.forEach(a => { has[dkey(a.mulai)] = 1; });
    let list = sel ? l.filter(a => dkey(a.mulai) === sel) : l.filter(a => ch === 'datang' ? a.status === 'akan datang' : ch === 'live' ? a.status === 'berlangsung' : a.status === 'selesai');
    list = list.sort((x, y) => ch === 'selesai' && !sel ? y.mulai - x.mulai : x.mulai - y.mulai);
    const c = { datang: l.filter(a => a.status === 'akan datang').length, live: l.filter(a => a.status === 'berlangsung').length, selesai: l.filter(a => a.status === 'selesai').length };
    const wk = l.filter(a => days[0] <= a.mulai && a.mulai < days[6] + DAY), done = wk.filter(a => a.my && (a.my.status === 'hadir' || a.my.status === 'terlambat')).length;
    put($('#view'), html`
      <div class="row between"><div class="search grow" style="height:48px;padding:0 6px"><button class="iconbtn" style="width:36px;height:36px" data-act="wk" data-d="-1" aria-label="Pekan sebelumnya">${ic('chevron_left')}</button><span class="grow center b">${ic('calendar_month', 'sm')} ${bulan(days[3])}</span><button class="iconbtn" style="width:36px;height:36px" data-act="wk" data-d="1" aria-label="Pekan berikutnya">${ic('chevron_right')}</button></div>
        <button class="btn soft" data-act="today">${ic('today', 'sm')}Hari Ini</button></div>
      <div class="card mt16" style="padding:12px"><div class="week" role="group" aria-label="Pilih tanggal">${days.map(d => { const k = dkey(d); return html`<button class="${sel === k || (!sel && k === key) ? 'on' : ''}" data-act="day" data-k="${k}" aria-pressed="${sel === k}"><small>${fHariS.format(d).slice(0, 3).toUpperCase()}</small><span>${+k.slice(8)}</span><i class="${has[k] ? 'has' : ''}"></i></button>`; })}</div></div>
      <div class="chips mt16">${[['datang', 'Mendatang'], ['live', 'Berlangsung'], ['selesai', 'Selesai']].map(x => html`<button class="chip ${!sel && ch === x[0] ? 'on' : ''}" data-act="jchip" data-c="${x[0]}">${x[1]}<span class="n">${c[x[0]]}</span></button>`)}</div>
      <div id="jd-list" class="mt8">${list.length ? list.map(a => jcard(a, now)) : emptyBox('event_busy', sel ? 'Tidak ada pengajian di tanggal ini' : 'Belum ada jadwal', html`<p>Coba pilih tanggal atau filter lain.</p>`)}</div>
      <section class="card quote mt16" style="padding:14px"><span class="sq" style="background:var(--grad);color:#fff">${ic('verified')}</span><div><p class="b">Target Kehadiran Pekan Ini</p><p class="mut t-body">${wk.length ? `${done} dari ${wk.length} kajian pekan ini sudah Anda hadiri.` : 'Belum ada kajian terjadwal pekan ini.'}</p></div></section>`);
  }
  function jcard(a, now) {
    const tags = html`<div class="tags">${a.status === 'berlangsung' ? html`<span class="tag2 a">${ic('podcasts', 'sm')}Sedang Berlangsung</span>` : ''}<span class="tag2 g">${ic('near_me', 'sm')}Radius ${a.radius}m</span><span class="tag2">${ic('schedule', 'sm')}${jam(a.mulai)} WIB</span>${a.my ? pill(a.my.status) : ''}</div>`;
    return html`<article class="card" style="padding:16px;margin-bottom:14px">${tags}<h3 class="t-sm mt16">${a.nama}</h3><p class="row gap8 mut mt8">${ic('school', 'sm')}${a.ustaz} <span>·</span> ${relDay(a.mulai, now)}</p>
      <div class="place mt16">${ic('mosque')}<div class="grow" style="min-width:0"><b class="ell" style="display:block">${a.lokasi}</b><span class="mut t-body">${tglL(a.mulai)}</span></div></div>
      <div class="row between mt16">${a.hadir > 0 ? html`<div class="row gap8">${pile(a.hadir)}${hadirTxt(a.hadir)}</div>` : html`<span></span>`}
        <div class="row gap8">${canAbsen(a, now) ? html`<a class="btn pri sm" href="#/absen/${a.id}">Absen ${ic('qr_code_scanner', 'sm')}</a>` : a.status === 'akan datang' ? html`<button class="btn soft sm" data-act="remind" data-id="${a.id}" aria-label="Ingatkan">${ic('notifications', 'sm')}</button>` : ''}
        <button class="btn soft sm" data-act="share" data-id="${a.id}" aria-label="Bagikan">${ic('share', 'sm')}</button><a class="btn ${canAbsen(a, now) ? 'soft' : 'pri'} sm" target="_blank" rel="noopener" href="${mapsUrl(a)}">Detail & Rute ${ic('arrow_forward', 'sm')}</a></div></div></article>`;
  }
  ACT.wk = b => { J.wk += +b.dataset.d; J.day = null; drawJadwal(); };
  ACT.today = () => { J.wk = 0; J.day = null; J.jchip = 'datang'; drawJadwal(); };
  ACT.day = b => { J.day = J.day === b.dataset.k ? null : b.dataset.k; drawJadwal(); };
  ACT.jchip = b => { J.jchip = b.dataset.c; J.day = null; drawJadwal(); };

  /* ---------- Absen ---------- */
  let A = null;
  function stopAll() { if (!A) return; try { A.stream && A.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* abaikan */ } if (A.watch != null) navigator.geolocation.clearWatch(A.watch); A.timers.forEach(clearInterval); A.scanning = false; A = null; }
  async function absen(p) {
    put($('#view'), skeleton(2)); const d = await API.read('jadwal', {}, 5), now = Date.now();
    const cand = d.acara.filter(a => canAbsen(a, now)); let a = p.id ? d.acara.find(x => x.id === p.id) : (cand.length === 1 ? cand[0] : null);
    if (!a) {
      put($('#view'), cand.length ? html`<h1 class="t-lg">Pilih pengajian</h1><p class="mut mt8">Ada beberapa sesi yang bisa diabsen sekarang.</p><div class="mt16">${cand.map(x => card(x, now))}</div>` : emptyBox('event_available', 'Belum ada sesi absen yang dibuka', html`<p>Absensi dibuka 60 menit sebelum pengajian dimulai.</p><a class="btn soft mt16" href="#/jadwal">Lihat Jadwal</a>`)); return;
    }
    if (a.my) { put($('#view'), html`<div class="card result"><div class="big ok">${ic('check', 'lg')}</div><h1 class="t-lg">Anda sudah absen</h1><p class="mut mt8">${a.nama}: ${a.my.status} pukul ${jam(a.my.waktu)} WIB.</p><a class="btn pri block mt16" href="#/">Kembali ke Beranda</a></div>`); return; }
    if (a.status === 'selesai') { put($('#view'), emptyBox('event_busy', 'Acara sudah selesai', html`<p>Hubungi pengurus bila Anda hadir namun belum tercatat.</p>`)); return; }
    A = { a, mode: 'selfie', stream: null, watch: null, pos: null, timers: [], busy: false };
    put($('#view'), html`
      <div class="row between wrap gap8"><div style="min-width:0"><span class="pill aktif"><i class="dot" style="background:var(--ok);width:7px;height:7px"></i>Sesi Sedang Dibuka</span><h1 class="t-md mt8">${a.nama}</h1></div><span class="pill late" id="lim" style="background:var(--late-s);color:var(--late-t);height:32px;padding:0 12px"></span></div>
      <div class="seg mt16" role="tablist"><button class="on" data-act="mode" data-m="selfie" role="tab">${ic('photo_camera', 'sm')} Selfie Bukti</button><button data-act="mode" data-m="qr" role="tab">${ic('qr_code_scanner', 'sm')} Scan QR Acara</button></div>
      <div class="cam mt16" id="cam" aria-live="polite"></div><div id="amsg" class="mt16" role="alert"></div>
      <section class="card mt16" id="gps" aria-label="Status lokasi"></section>
      <div class="shoot-wrap"><button class="btn pri block" id="shoot" style="min-height:56px;font-size:15px">${ic('photo_camera')} AMBIL FOTO &amp; CATAT HADIR</button></div>
      <p class="center hint mt16">${ic('verified_user', 'sm')} Selfie dan koordinat GPS disimpan aman di Google Drive &amp; Sheets milik pengurus.</p>`);
    drawGps(); startGps(); startCam('user'); tickLimit(); A.timers.push(setInterval(tickLimit, 15000));
    $('#shoot').onclick = onShoot; return stopAll;
  }
  function tickLimit() {
    const el = $('#lim'); if (!el || !A) return; const a = A.a, now = Date.now(), lim = a.mulai + a.toleransi * 60000;
    const m = Math.ceil((lim - now) / 60000); el.innerHTML = '';
    put(el, now <= lim ? html`${ic('timer', 'sm')} Tepat waktu: ${m} mnt lagi` : html`${ic('timer', 'sm')} Lewat batas, dicatat terlambat`);
  }
  function startGps() {
    if (!navigator.geolocation) { A.gerr = 'Perangkat tidak mendukung GPS.'; return drawGps(); }
    A.watch = navigator.geolocation.watchPosition(p => { A.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; A.gerr = ''; drawGps(); },
      e => { A.gerr = e.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser.' : 'Lokasi belum terbaca. Pastikan GPS aktif.'; drawGps(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  function drawGps() {
    const box = $('#gps'); if (!box || !A) return; const a = A.a, p = A.pos;
    if (!p) { put(box, html`<div class="row">${ic('my_location', 'lg')}<div><b>${A.gerr ? 'Lokasi belum tersedia' : 'Mencari lokasi Anda…'}</b><p class="mut t-body">${A.gerr || 'Izinkan akses lokasi bila browser menanyakan.'}</p></div></div>`); return; }
    const dist = haversine(p.lat, p.lng, a.lat, a.lng), inr = dist <= a.radius, w = Math.min(100, Math.round(dist / a.radius * 100)); A.dist = dist;
    put(box, html`<div class="row between wrap gap8"><span class="pill ${inr ? 'hadir' : 'alpa'}" style="height:30px">${ic(inr ? 'check_circle' : 'wrong_location', 'sm')}${inr ? 'Di Dalam Radius Acara' : 'Di Luar Radius Acara'}</span><span class="t-xs" style="color:var(--pri)">${ic('my_location', 'sm')} GPS ${p.acc <= 30 ? 'Akurat' : p.acc <= 100 ? 'Cukup' : 'Lemah'} (±${Math.round(p.acc)}m)</span></div>
      <div class="row mt16"><span class="sq">${ic('mosque')}</span><div style="min-width:0"><b class="ell" style="display:block">${a.lokasi}</b><span class="mut t-body">Lat ${p.lat.toFixed(5)} · Long ${p.lng.toFixed(5)}</span></div></div>
      <div class="place mt16" style="display:block"><div class="row between t-xs"><span>${ic('navigation', 'sm')} Jarak Anda: ${dist} meter</span><span class="mut">Radius Maks: ${a.radius}m</span></div><div class="gps-bar mt8 ${inr ? '' : 'bad'}"><i style="width:${w}%"></i></div></div>`);
  }
  async function startCam(facing) {
    const cam = $('#cam'); if (!cam || !A) return; try { A.stream && A.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* abaikan */ }
    put(cam, html`<div class="ph">${ic('photo_camera', 'lg')}<span>Menyalakan kamera…</span></div>`);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Kamera memerlukan koneksi HTTPS dan browser terbaru.');
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false }); if (!A) { st.getTracks().forEach(t => t.stop()); return; } A.stream = st;
      put(cam, html`<video playsinline muted autoplay class="${facing === 'user' ? 'mirror' : ''}"></video>${facing === 'user' ? html`<div class="oval"></div><span class="cap">Posisikan wajah Anda di dalam lingkaran</span>` : html`<div class="qrbox"></div><span class="cap">Arahkan ke QR Code di lokasi acara</span>`}<i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i>`);
      const v = $('video', cam); v.srcObject = st; await v.play().catch(() => { }); if (facing !== 'user') scanLoop();
    } catch (e) { put(cam, html`<div class="ph">${ic('no_photography', 'lg')}<b>Kamera tidak bisa dipakai</b><span class="t-body" style="opacity:.85">${e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini, lalu coba lagi.' : errMsg(e)}</span><button class="btn white sm" data-act="retrycam">Coba Lagi</button></div>`); }
  }
  ACT.retrycam = () => startCam(A && A.mode === 'qr' ? 'environment' : 'user');
  ACT.mode = b => { if (!A) return; A.mode = b.dataset.m; $$('.seg button').forEach(x => x.classList.toggle('on', x === b)); $('#amsg').innerHTML = ''; $('.shoot-wrap').classList.toggle('hide', A.mode === 'qr'); A.scanning = false; startCam(A.mode === 'qr' ? 'environment' : 'user'); };
  async function scanLoop() {
    try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'); } catch (e) { put($('#amsg'), html`<div class="notice err">${ic('error', 'sm')}${errMsg(e)}</div>`); return; }
    if (!A) return; A.scanning = true; const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
    const step = () => { if (!A || !A.scanning) return; const v = $('video'); if (v && v.readyState >= 2) { const w = 360, h = Math.round(w * v.videoHeight / v.videoWidth) || 480; c.width = w; c.height = h; x.drawImage(v, 0, 0, w, h); const r = jsQR(x.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (r && r.data.indexOf('HJ|') === 0) { A.scanning = false; submit({ metode: 'qr', qr: r.data }); return; } } setTimeout(step, 140); };
    step();
  }
  function onShoot() {
    if (!A || A.busy) return; const v = $('video'); if (!v || v.readyState < 2) return toast('Kamera belum siap.', 'err');
    const c = document.createElement('canvas'); c.width = 480; c.height = 640; const x = c.getContext('2d'), r = Math.max(480 / v.videoWidth, 640 / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r; x.drawImage(v, (480 - w) / 2, (640 - h) / 2, w, h);
    submit({ metode: 'selfie', selfie: c.toDataURL('image/jpeg', .6) });
  }
  async function submit(extra) {
    if (!A || A.busy) return; if (!A.pos) { toast('Lokasi belum terbaca. Tunggu GPS siap.', 'err'); if (A.mode === 'qr') { A.scanning = true; scanLoop(); } return; }
    A.busy = true; const btn = $('#shoot'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ms">progress_activity</span> Mencatat kehadiran…'; } put($('#amsg'), '');
    try { const r = await API.call('absen.submit', Object.assign({ acaraId: A.a.id, lat: A.pos.lat, lng: A.pos.lng, akurasi: A.pos.acc }, extra)); const nm = A.a.nama; stopAll(); API.bust();
      put($('#view'), html`<div class="card result"><div class="big ${r.status === 'hadir' ? 'ok' : 'late'}">${ic(r.status === 'hadir' ? 'check' : 'schedule', 'lg')}</div><h1 class="t-lg">${r.status === 'hadir' ? 'Absen Berhasil' : 'Tercatat Terlambat'}</h1><p class="mut mt8">${nm}</p>
        <div class="tags mt16" style="justify-content:center"><span class="tag2">${ic('schedule', 'sm')}${jam(r.waktu)} WIB</span><span class="tag2 g">${ic('near_me', 'sm')}${r.jarak} m dari lokasi</span>${pill(r.status)}</div>
        <div class="row mt24"><a class="btn out grow" href="#/riwayat">Lihat Riwayat</a><a class="btn pri grow" href="#/">Ke Beranda</a></div></div>`);
    } catch (e) {
      A.busy = false; if (btn) { btn.disabled = false; btn.innerHTML = '<span class="ms">photo_camera</span> AMBIL FOTO &amp; CATAT HADIR'; }
      put($('#amsg'), html`<div class="notice err">${ic('error', 'sm')}<span>${errMsg(e)}</span></div>`); toast(errMsg(e), 'err');
      if (e.code === 'DUP') { API.bust(); setTimeout(() => { location.hash = '#/riwayat'; }, 1600); } else if (A && A.mode === 'qr' && !['BAD_QR', 'DUP'].includes(e.code)) { setTimeout(() => { if (A) { A.scanning = true; scanLoop(); } }, 2000); } else if (A && A.mode === 'qr') { setTimeout(() => { if (A) { A.scanning = true; scanLoop(); } }, 2500); }
    }
  }

  /* ---------- Riwayat & Profil ---------- */
  async function riwayat(p, tab) {
    J.tab = tab || J.tab; put($('#view'), skeleton(3)); const d = await API.read('riwayat', {}, 10); J.rw = d; API.setUser(d.me); drawRw();
  }
  function drawRw() {
    const d = J.rw, me = d.me, j = me.jamaah || {}, s = d.stat, now = Date.now();
    d.rows.forEach(r => { r.t = r.jarak ? r.waktu : (r.mulai || r.waktu); }); d.rows.sort((x, y) => y.t - x.t); // catatan manual memakai tanggal acara
    const months = [...new Set(d.rows.map(r => mkey(r.t)).concat([mkey(now)]))].sort().reverse();
    if (!J.bulan || months.indexOf(J.bulan) < 0) J.bulan = months[0];
    const rows = d.rows.filter(r => mkey(r.t) === J.bulan);
    const hist = rows.length ? rows.map(r => html`<article class="card" style="padding:16px;margin-bottom:12px"><div class="row" style="align-items:flex-start"><span class="sq ${r.status === 'terlambat' ? 'amber' : ''}" style="${r.status === 'izin' ? 'background:var(--izin-s);color:var(--izin-t)' : r.status === 'hadir' ? 'background:var(--ok-s);color:var(--ok-t)' : ''}">${ic(r.status === 'hadir' ? 'check_circle' : r.status === 'terlambat' ? 'schedule' : r.status === 'izin' ? 'assignment' : 'cancel')}</span>
        <div class="grow" style="min-width:0"><div class="row between gap8" style="align-items:flex-start"><h3 class="t-sm">${r.nama}</h3>${pill(r.status)}</div><p class="mut">${r.ustaz}</p></div></div>
        <div class="place mt16 row between"><span class="row gap8">${ic('schedule', 'sm')}${tgl(r.t)}, ${jam(r.t)} WIB</span>${r.status === 'hadir' ? html`<b style="color:var(--ok-t)">Tepat Waktu</b>` : r.status === 'terlambat' ? html`<b style="color:var(--late-t)">${r.jarak ? '+' + Math.max(1, Math.round((r.waktu - r.mulai) / 60000)) + ' menit' : 'Terlambat'}</b>` : r.status === 'izin' ? html`<b style="color:var(--izin-t)">Izin Resmi</b>` : ''}</div>
        <p class="t-xs mut mt8 row gap8">${r.jarak ? html`${ic('my_location', 'sm')}${r.metode.indexOf('qr') === 0 ? 'QR' : 'Selfie'} &amp; radius ${r.jarak}m terverifikasi` : html`${ic('edit_note', 'sm')}${r.catatan || 'Dicatat pengurus'}`}</p></article>`) : emptyBox('history', 'Belum ada riwayat di bulan ini', html`<p>Riwayat muncul setelah Anda absen.</p>`);
    const pribadi = html`<div class="card"><dl class="kv"><dt>Nama</dt><dd>${me.nama}</dd><dt>ID Jamaah</dt><dd>${j.id}</dd><dt>Email</dt><dd>${me.email}</dd><dt>Nomor HP</dt><dd>${me.hp}</dd><dt>Alamat</dt><dd>${j.alamat}</dd><dt>Jenis kelamin</dt><dd>${j.gender === 'P' ? 'Perempuan' : 'Laki-laki'}</dd><dt>Tgl. lahir</dt><dd>${j.tglLahir ? tgl(Date.parse(j.tglLahir + 'T00:00:00+07:00')) : '-'}</dd></dl></div>
      <div class="col mt16"><button class="btn soft block" data-act="ubahprofil">${ic('edit', 'sm')}Ubah Profil</button><button class="btn out block" data-act="gantisandi">${ic('lock_reset', 'sm')}Ganti Kata Sandi</button><button class="btn danger block" data-act="logout">${ic('logout', 'sm')}Keluar</button></div>`;
    put($('#view'), html`
      <section class="card" style="position:relative;overflow:hidden"><div style="position:absolute;right:-40px;top:-40px;width:140px;height:140px;border-radius:50%;background:var(--soft)"></div><div class="row" style="position:relative">${avatar(me.nama, j.foto, 'xl')}<div style="min-width:0"><h1 class="t-md">${me.nama}</h1><span class="pill aktif mt8">${ic('circle', 'sm')} Jamaah Aktif</span><p class="t-sm mt8" style="color:var(--pri)">ID: ${j.id}</p><p class="mut t-body row gap4">${ic('location_on', 'sm')}<span class="ell">${(j.alamat || '').split(',').slice(-2).join(',')}</span></p></div></div>
        <div class="row mt16" style="position:relative"><span class="btn soft grow sm" style="pointer-events:none">${ic('verified_user', 'sm')}Akun Terverifikasi</span><button class="btn pri sm grow" data-act="ubahprofil">${ic('edit', 'sm')}Ubah Profil</button></div></section>
      <div class="tiles mt16" style="grid-template-columns:repeat(3,1fr)"><div class="card tight"><p class="t-xs mut">Kehadiran</p><p class="stat" style="color:var(--ok-t)">${s.persen}%</p><div class="progress mt8"><i style="width:${pct(s.persen)}%"></i></div></div><div class="card tight"><p class="t-xs mut">Total Hadir</p><p class="stat">${s.hadir + s.terlambat}x</p><p class="t-xs mut">dari ${s.sesi} sesi</p></div><div class="card tight"><p class="t-xs mut">Izin Resmi</p><p class="stat" style="color:var(--izin-t)">${s.izin}x</p><p class="t-xs mut">${s.alpa} Alpa</p></div></div>
      <div class="seg mt16" role="tablist"><button class="${J.tab === 'riwayat' ? 'on' : ''}" data-act="rtab" data-t="riwayat" role="tab">Riwayat Absensi</button><button class="${J.tab === 'pribadi' ? 'on' : ''}" data-act="rtab" data-t="pribadi" role="tab">Data Pribadi</button></div>
      <div class="mt16">${J.tab === 'riwayat' ? html`<div class="row between gap8 no-print"><label class="search grow" style="height:48px;padding:0 14px">${ic('calendar_month', 'sm')}<select id="bln" style="flex:1;border:0;background:none;font-weight:600;min-width:0" aria-label="Pilih bulan">${months.map(m => html`<option value="${m}" ${m === J.bulan ? 'selected' : ''}>${bulan(Date.parse(m + '-15T12:00:00+07:00'))}</option>`)}</select></label><button class="btn out" data-act="print">${ic('download', 'sm')}Unduh PDF</button></div><div class="mt16">${hist}</div>` : pribadi}</div>`);
    const b = $('#bln'); if (b) b.onchange = () => { J.bulan = b.value; drawRw(); };
  }
  ACT.rtab = b => { J.tab = b.dataset.t; history.replaceState(null, '', J.tab === 'pribadi' ? '#/profil' : '#/riwayat'); drawRw(); };
  ACT.print = () => { toast('Pilih “Simpan sebagai PDF” pada dialog cetak.'); setTimeout(() => window.print(), 400); };
  ACT.ubahprofil = () => { const me = J.rw ? J.rw.me : API.S.user, j = me.jamaah || {}; sheet(html`<h3 class="t-md">Ubah Profil</h3><form class="form mt16" data-form="ubahprofil"><div id="msg"></div>
    <label class="photo-pick" style="width:96px;height:96px"><span class="center">${ic('add_a_photo')}</span><img id="pv" alt="" hidden><input type="file" accept="image/*" id="pf" hidden></label>
    <div class="field"><label for="nama">Nama Lengkap</label><input class="input" id="nama" name="nama" value="${me.nama}" required></div><div class="field"><label for="hp">Nomor HP</label><input class="input" id="hp" name="hp" value="${me.hp}" inputmode="tel" required></div><div class="field"><label for="alamat">Alamat</label><textarea class="input" id="alamat" name="alamat">${j.alamat || ''}</textarea></div>
    <div class="row"><button type="button" class="btn out grow" data-act="sheet-no">Batal</button><button class="btn pri grow" type="submit">Simpan</button></div></form>`); const pf = $('#pf'); pf.onchange = async () => { if (pf.files[0]) { J.newFoto = await fileToDataUri(pf.files[0], 480, .72); const pv = $('#pv'); pv.src = J.newFoto; pv.hidden = false; } }; J.newFoto = ''; };
  ACT['sheet-no'] = () => closeSheet();
  FORM.ubahprofil = async (f, d) => { await busy($('button[type=submit]', f), async () => { try { const u = await API.call('me.ubah', Object.assign({}, d, { foto: J.newFoto || '' })); API.setUser(u); closeSheet(); toast('Profil diperbarui.', 'ok'); API.bust(); App.shell(); riwayat({}, J.tab); } catch (e) { put($('#msg', f), html`<div class="notice err">${ic('error', 'sm')}${errMsg(e)}</div>`); } }); };
  ACT.gantisandi = () => sheet(html`<h3 class="t-md">Ganti Kata Sandi</h3><form class="form mt16" data-form="gantisandi"><div id="msg"></div><div class="field"><label for="lama">Kata sandi lama</label><input class="input" id="lama" name="lama" type="password" autocomplete="current-password" required></div><div class="field"><label for="baru">Kata sandi baru (min. 8 karakter)</label><input class="input" id="baru" name="baru" type="password" minlength="8" autocomplete="new-password" required></div><div class="row"><button type="button" class="btn out grow" data-act="sheet-no">Batal</button><button class="btn pri grow" type="submit">Simpan</button></div></form>`);
  FORM.gantisandi = async (f, d) => { await busy($('button[type=submit]', f), async () => { try { await API.call('me.sandi', d); closeSheet(); toast('Kata sandi diganti.', 'ok'); } catch (e) { put($('#msg', f), html`<div class="notice err">${ic('error', 'sm')}${errMsg(e)}</div>`); } }); };
  ACT.logout = async () => { if (await confirmBox('Keluar dari akun?', 'Anda perlu masuk lagi untuk menggunakan aplikasi.', 'Keluar', true)) { API.setSession('', null); location.hash = '#/login'; App.boot(); } };
  return { beranda, jadwal, absen, riwayat, state: J };
})();
