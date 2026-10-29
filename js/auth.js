/* Halaman publik: login, daftar (3 langkah), lupa & atur ulang kata sandi, akses darurat. */
const Auth = (() => {
  const brand = (sub) => html`<div class="center" style="margin-bottom:22px"><div class="logo">${ic('mosque', 'lg fill')}</div><h1 class="t-lg">${App.nama}</h1><p class="mut mt8">${sub}</p></div>`;
  const home = u => (u.peran === 'jamaah' ? '#/' : '#/admin');
  const pwField = (name, label, ph, auto) => html`<div class="field"><label for="${name}">${label}</label><div class="input-i">${ic('lock')}<input class="input" id="${name}" name="${name}" type="password" placeholder="${ph || '••••••••'}" autocomplete="${auto || 'current-password'}" required minlength="8"><button type="button" class="ms eye" data-act="eye" aria-label="Tampilkan kata sandi">visibility</button></div></div>`;
  ACT.eye = b => { const i = b.parentElement.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'visibility_off' : 'visibility'; };

  function login() {
    put($('#app'), html`<div class="auth">${brand('Silakan masuk ke akun Anda')}
      <form class="form card" data-form="login" novalidate><div id="msg"></div>
        <div class="field"><label for="ident">Email atau Nomor HP</label><div class="input-i">${ic('person')}<input class="input" id="ident" name="ident" placeholder="contoh@email.com / 0812…" autocomplete="username" inputmode="email" required></div></div>
        ${pwField('sandi', 'Kata Sandi')}
        <a href="#/lupa" class="t-xs" style="align-self:flex-end">Lupa kata sandi?</a>
        <button class="btn pri block" type="submit">Masuk ${ic('arrow_forward', 'sm')}</button>
        <p class="center mut t-body">Belum punya akun? <a href="#/daftar" class="b">Daftar sebagai jamaah</a></p></form>
      <p class="center hint mt16">Peran (administrator, pengurus, jamaah) dikenali otomatis setelah masuk.</p></div>`);
  }
  FORM.login = async (f, d) => {
    const m = $('#msg', f); m.innerHTML = '';
    if (!d.ident || !d.sandi) { put(m, html`<div class="notice err">${ic('error', 'sm')}Isi email/nomor HP dan kata sandi.</div>`); return; }
    await busy($('button[type=submit]', f), async () => {
      try { const r = await API.call('auth.login', d); API.setSession(r.token, r.user); location.hash = home(r.user); App.boot(); }
      catch (e) { put(m, html`<div class="notice ${e.code === 'PENDING' ? 'warn' : 'err'}" role="alert">${ic(e.code === 'PENDING' ? 'hourglass_top' : 'error', 'sm')}<span>${errMsg(e)}</span></div>`); }
    });
  };

  /* ---- Daftar ---- */
  const R = { step: 1, d: {}, foto: '' };
  function daftar() { R.step = 1; R.d = {}; R.foto = ''; drawDaftar(); }
  const steps = n => html`<div class="steps" aria-label="Langkah ${n} dari 3">${[1, 2, 3].map(i => html`<i class="${i <= n ? 'on' : ''}"></i>`)}</div><p class="t-xs mut mt8">Langkah ${n} dari 3 · ${['Data Diri', 'Foto Profil', 'Konfirmasi'][n - 1]}</p>`;
  function drawDaftar() {
    const d = R.d, s = R.step; let body;
    if (s === 1) body = html`<form class="form" data-form="daftar1" novalidate><div id="msg"></div>
      <div class="field"><label for="nama">Nama Lengkap (sesuai KTP)</label><input class="input" id="nama" name="nama" value="${d.nama || ''}" autocomplete="name" required></div>
      <div class="field"><label for="hp">Nomor WhatsApp / HP</label><input class="input" id="hp" name="hp" value="${d.hp || ''}" inputmode="tel" autocomplete="tel" placeholder="0812-3456-7890" required></div>
      <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" value="${d.email || ''}" autocomplete="email" placeholder="nama@email.com" required><span class="hint">Dipakai untuk masuk dan atur ulang kata sandi.</span></div>
      ${pwField('sandi', 'Buat Kata Sandi', 'Minimal 8 karakter', 'new-password')}
      <div class="field"><label for="alamat">Alamat Domisili</label><textarea class="input" id="alamat" name="alamat" required placeholder="Jl. Kebon Jeruk No. 12, RT 03/RW 02">${d.alamat || ''}</textarea></div>
      <div class="field"><span class="lbl">Jenis Kelamin</span><div class="radio"><label><input type="radio" name="gender" value="L" ${d.gender !== 'P' ? 'checked' : ''}><span>Laki-laki</span></label><label><input type="radio" name="gender" value="P" ${d.gender === 'P' ? 'checked' : ''}><span>Perempuan</span></label></div></div>
      <div class="field"><label for="tglLahir">Tanggal Lahir</label><input class="input" id="tglLahir" name="tglLahir" type="date" value="${d.tglLahir || ''}" max="${dkey(Date.now())}" required></div>
      <div class="row"><a class="btn out" href="#/login">Batal</a><button class="btn pri grow" type="submit">Lanjut ke Foto Profil ${ic('arrow_forward', 'sm')}</button></div></form>`;
    else if (s === 2) body = html`<form class="form" data-form="daftar2"><div id="msg"></div>
      <label class="photo-pick" tabindex="0">${R.foto ? html`<img src="${R.foto}" alt="Pratinjau foto profil">` : html`<span class="center">${ic('add_a_photo', 'lg')}<br><span class="t-xs">Ambil / pilih foto</span></span>`}<input type="file" accept="image/*" capture="user" id="foto" hidden></label>
      <p class="center hint">Gunakan foto wajah yang jelas. Foto dikompres otomatis di perangkat Anda.</p>
      <div class="row"><button type="button" class="btn out" data-act="dg-back">Kembali</button><button class="btn pri grow" type="submit">Lanjut ke Konfirmasi ${ic('arrow_forward', 'sm')}</button></div></form>`;
    else body = html`<form class="form" data-form="daftar3"><div id="msg"></div>
      <div class="card tight"><div class="row">${R.foto ? html`<span class="av l"><img src="${R.foto}" alt=""></span>` : ''}<div><p class="b">${d.nama}</p><p class="mut t-body">${d.hp} · ${d.email}</p><span class="pill menunggu mt8">CALON JAMAAH</span></div></div>
        <dl class="kv mt16"><dt>Jenis kelamin</dt><dd>${d.gender === 'P' ? 'Perempuan' : 'Laki-laki'}</dd><dt>Tgl. lahir</dt><dd>${tgl(Date.parse(d.tglLahir + 'T00:00:00+07:00'))}</dd><dt>Domisili</dt><dd>${d.alamat}</dd></dl></div>
      <label class="row" style="align-items:flex-start"><input type="checkbox" id="setuju" required style="width:22px;height:22px;margin-top:2px"><span class="t-body">Saya menyatakan data di atas benar untuk keperluan absensi dan kegiatan pengajian.</span></label>
      <div class="row"><button type="button" class="btn out" data-act="dg-back">Kembali</button><button class="btn pri grow" type="submit">Kirim Pendaftaran</button></div></form>`;
    put($('#app'), html`<div class="auth"><div class="row" style="margin-bottom:14px"><a class="iconbtn" href="#/login" aria-label="Kembali ke login">${ic('arrow_back')}</a><h1 class="t-md">Pendaftaran Jamaah</h1></div><div class="card">${steps(s)}<div class="mt16">${body}</div></div></div>`);
    const fi = $('#foto'); if (fi) fi.onchange = async () => { if (fi.files[0]) { try { R.foto = await fileToDataUri(fi.files[0], 480, .72); drawDaftar(); } catch (e) { toast(errMsg(e), 'err'); } } };
  }
  ACT['dg-back'] = () => { R.step--; drawDaftar(); };
  FORM.daftar1 = (f, d) => {
    const m = $('#msg', f), bad = t => put(m, html`<div class="notice err" role="alert">${ic('error', 'sm')}${t}</div>`), hp = d.hp.replace(/\D/g, '');
    if (d.nama.length < 3) return bad('Nama lengkap minimal 3 karakter.'); if (hp.length < 9 || hp.length > 15) return bad('Nomor WhatsApp/HP tidak valid.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return bad('Format email tidak valid.'); if ((d.sandi || '').length < 8) return bad('Kata sandi minimal 8 karakter.');
    if (d.alamat.length < 5) return bad('Alamat domisili wajib diisi.'); if (!d.tglLahir) return bad('Tanggal lahir wajib diisi.');
    R.d = Object.assign(R.d, d, { sandi: d.sandi }); R.step = 2; drawDaftar();
  };
  FORM.daftar2 = f => { if (!R.foto) return put($('#msg', f), html`<div class="notice err" role="alert">${ic('error', 'sm')}Foto profil wajib diunggah.</div>`); R.step = 3; drawDaftar(); };
  FORM.daftar3 = async f => {
    if (!$('#setuju', f).checked) return put($('#msg', f), html`<div class="notice err" role="alert">${ic('error', 'sm')}Centang pernyataan terlebih dahulu.</div>`);
    await busy($('button[type=submit]', f), async () => {
      try { const r = await API.call('auth.daftar', Object.assign({}, R.d, { foto: R.foto })); R.d = {}; R.foto = '';
        put($('#app'), html`<div class="auth"><div class="card center"><div class="result"><div class="big ok">${ic('check', 'lg')}</div><h1 class="t-lg">Pendaftaran Berhasil Dikirim</h1><p class="mut mt8">Akun Anda sedang menunggu verifikasi pengurus. Kami kabari lewat email setelah disetujui.</p>
          <div class="notice mt16" style="justify-content:center"><span>ID jamaah: <b>${r.id}</b> (menunggu)</span></div></div><a class="btn pri block" href="#/login">Kembali ke Halaman Login</a></div></div>`);
      } catch (e) { put($('#msg', f), html`<div class="notice err" role="alert">${ic('error', 'sm')}${errMsg(e)}</div>`); if (e.code === 'DUP') { R.step = 1; setTimeout(drawDaftar, 1800); } }
    });
  };

  /* ---- Lupa & reset ---- */
  let cd = null;
  function lupa() {
    put($('#app'), html`<div class="auth"><div class="row" style="margin-bottom:14px"><a class="iconbtn" href="#/login" aria-label="Kembali ke login">${ic('arrow_back')}</a><h1 class="t-md">Kembali ke Login</h1></div>
      <div class="card"><div class="sq" style="margin-bottom:14px">${ic('key')}</div><h2 class="t-lg">Atur Ulang Kata Sandi</h2><p class="mut mt8">Masukkan email yang terdaftar. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
      <form class="form mt16" data-form="lupa" novalidate><div id="msg"></div><div class="field"><label for="ident">Email Terdaftar</label><div class="input-i">${ic('mail')}<input class="input" id="ident" name="ident" type="email" placeholder="nama@email.com" required autocomplete="email"></div></div>
      <button class="btn pri block" id="kirim" type="submit">Kirim Tautan Atur Ulang ${ic('send', 'sm')}</button></form></div></div>`);
  }
  FORM.lupa = async (f, d) => {
    if (!d.ident) return put($('#msg', f), html`<div class="notice err" role="alert">${ic('error', 'sm')}Isi email Anda.</div>`);
    await busy($('#kirim'), async () => {
      try { await API.call('auth.lupa', d);
        put($('#msg', f), html`<div class="notice ok" role="status">${ic('check_circle', 'sm')}<span>Jika email terdaftar, tautan sudah dikirim. Periksa kotak masuk dan folder spam (bisa butuh beberapa menit).</span></div>`);
        let s = 60; const b = $('#kirim'); clearInterval(cd); b.disabled = true; cd = setInterval(() => { s--; if (!$('#kirim')) return clearInterval(cd); b.textContent = s > 0 ? `Kirim Ulang (${s}d)` : 'Kirim Ulang'; if (s <= 0) { clearInterval(cd); b.disabled = false; } }, 1000);
      } catch (e) { put($('#msg', f), html`<div class="notice err" role="alert">${ic('error', 'sm')}${errMsg(e)}</div>`); }
    });
  };
  function reset(p) {
    const tok = p.token || '';
    put($('#app'), html`<div class="auth">${brand('Buat kata sandi baru')}<form class="form card" data-form="reset" novalidate><div id="msg"></div>
      ${tok ? html`<input type="hidden" name="token" value="${tok}">` : html`<div class="field"><label for="token">Kode dari email</label><textarea class="input" id="token" name="token" required placeholder="Tempel kode dari email"></textarea></div>`}
      ${pwField('sandi', 'Kata Sandi Baru', 'Minimal 8 karakter', 'new-password')}${pwField('sandi2', 'Ulangi Kata Sandi', 'Ulangi kata sandi', 'new-password')}
      <button class="btn pri block" type="submit">Simpan Kata Sandi</button></form></div>`);
  }
  FORM.reset = async (f, d) => {
    const m = $('#msg', f); if (d.sandi !== d.sandi2) return put(m, html`<div class="notice err" role="alert">${ic('error', 'sm')}Kedua kata sandi harus sama.</div>`);
    await busy($('button[type=submit]', f), async () => {
      try { const r = await API.call('auth.reset', { token: d.token, sandi: d.sandi }); toast(r.status === 'menunggu' ? 'Kata sandi tersimpan. Akun masih menunggu verifikasi.' : 'Kata sandi tersimpan. Silakan masuk.', 'ok'); location.hash = '#/login'; }
      catch (e) { put(m, html`<div class="notice err" role="alert">${ic('error', 'sm')}${errMsg(e)}</div>`); }
    });
  };
  function darurat() {
    put($('#app'), html`<div class="auth">${brand('Akses darurat administrator')}<form class="form card" data-form="darurat" novalidate><div id="msg"></div><div class="notice warn">${ic('warning', 'sm')}<span>Hanya untuk pemulihan jika akun administrator tidak bisa dipakai. Kata sandi ada di Log hasil setup() Apps Script.</span></div>
      ${pwField('sandi', 'Kata Sandi Darurat')}<button class="btn pri block" type="submit">Masuk Darurat</button><a href="#/login" class="center t-xs">Kembali ke login biasa</a></form></div>`);
  }
  FORM.darurat = async (f, d) => { await busy($('button[type=submit]', f), async () => { try { const r = await API.call('auth.darurat', d); API.setSession(r.token, r.user); location.hash = '#/admin'; App.boot(); } catch (e) { put($('#msg', f), html`<div class="notice err" role="alert">${ic('error', 'sm')}${errMsg(e)}</div>`); } }); };
  return { login, daftar, lupa, reset, darurat };
})();
