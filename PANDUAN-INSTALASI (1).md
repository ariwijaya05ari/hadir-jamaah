# Panduan Instalasi HADIR JAMA'AH

Aplikasi terdiri dari dua bagian yang dipasang terpisah:

| Bagian | Isi | Dipasang di |
|---|---|---|
| **Backend** | `Kode.gs` + `appsscript.json` | Google Apps Script (akun Google Anda) |
| **Frontend** | `hadir-jamaah-frontend.zip` | GitHub Pages (gratis) |

Urutannya: **Backend dulu → salin URL-nya → Frontend → isi alamat situs di Pengaturan.**
Perkiraan waktu: 30–45 menit.

---

## BAGIAN 1 — Pasang Backend (Google Apps Script)

### 1.1 Buat proyek
1. Buka <https://script.google.com> dengan akun Google yang akan menjadi **pemilik data** (disarankan akun khusus pengurus, bukan akun pribadi).
2. Klik **Proyek baru**. Ganti nama proyek menjadi `HADIR JAMAAH API`.

### 1.2 Tempel kode
1. Di editor, buka berkas `Code.gs`, hapus isinya, lalu **tempel seluruh isi `Kode.gs`** dari paket ini. Simpan (Ctrl+S).
2. Klik ikon roda gigi **Setelan Proyek** → centang **"Tampilkan file manifes appsscript.json di editor"**.
3. Kembali ke **Editor**, buka `appsscript.json`, hapus isinya, lalu **tempel isi `appsscript.json`** dari paket ini. Simpan.

### 1.3 Jalankan `setup` (sekali saja)
1. Pada menu pilihan fungsi di atas editor, pilih **`setup`** lalu klik **Jalankan**.
2. Klik **Tinjau izin** → pilih akun Anda → **Lanjutan** → **Buka HADIR JAMAAH API (tidak aman)** → **Izinkan**.
   (Peringatan ini normal untuk skrip buatan sendiri. Izin yang diminta: Spreadsheet, Drive, kirim email, dan koneksi eksternal untuk ekspor.)
3. Buka **Log eksekusi** (di bawah editor). Anda akan melihat tiga hal penting. **Catat dan simpan di tempat aman:**
   - `ADMIN PERTAMA email: … | kata sandi: …` → akun administrator pertama.
   - `KATA SANDI AKSES DARURAT: …` → untuk pemulihan jika semua admin terkunci. **Hanya tampil sekali.**
   - Alamat Google Sheets database (`HADIR_JAMAAH_DB`).

> `setup` aman dijalankan ulang: tidak membuat admin atau sandi darurat ganda.

Setup otomatis membuat: 1 spreadsheet berisi sheet `Pengguna`, `Jamaah`, `Acara`, `Absensi`, `Pengaturan`, `Audit_Log`; 2 folder Drive (`HJ_Foto_Profil`, `HJ_Foto_Selfie`); dan rahasia aplikasi di **Script Properties** (Setelan Proyek → Properti skrip). Rahasia **tidak** ada di kode maupun di Sheets.

### 1.4 Pasang pengirim email otomatis
Pilih fungsi **`pasangTrigger`** → **Jalankan**. Ini membuat pekerja latar setiap 5 menit yang mengirim email dalam antrean dan menjaga server tetap hangat.

### 1.5 Deploy sebagai Web App
1. Klik **Deploy** → **Deployment baru** → ikon roda gigi → **Aplikasi web**.
2. **Jalankan sebagai:** *Saya*. **Yang memiliki akses:** *Siapa saja*.
3. Klik **Deploy**, lalu **salin URL Aplikasi Web** (berakhiran `/exec`). Simpan, ini dipakai di Bagian 2.

> Setiap kali Anda mengubah `Kode.gs`, buat **Deployment baru / Kelola deployment → Edit → Versi baru**, supaya perubahan aktif. URL tetap sama jika memakai "Kelola deployment".

---

## BAGIAN 2 — Pasang Frontend (GitHub Pages)

### 2.1 Siapkan folder
1. Ekstrak `hadir-jamaah-frontend.zip` ke sebuah folder, misalnya `hadir-jamaah`. Pastikan **`index.html` langsung berada di dalam folder itu** (bukan di subfolder lagi).
2. Buka `js/config.js` dengan Notepad/TextEdit dan isi:
   ```js
   window.HJ_CONFIG = {
     API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
     APP_NAME: "HADIR JAMA'AH"
   };
   ```
   (tempel URL `/exec` dari langkah 1.5). Simpan. Berkas ini boleh publik, tidak berisi rahasia.

### 2.2 Pasang Git dan akun GitHub
1. Unduh dan pasang Git dari <https://git-scm.com/downloads>.
2. Buat akun di <https://github.com/signup>.
3. Buat repository: <https://github.com/new> → nama `hadir-jamaah` → **Public** → **jangan** centang README/gitignore → **Create repository**.

### 2.3 Unggah dari terminal
Buka terminal (Windows: *Git Bash*; Mac: *Terminal*) **di dalam folder `hadir-jamaah`** (yang ada `index.html`-nya):

```bash
git init
git add .
git commit -m "Pasang HADIR JAMAAH"
git branch -M main
git remote add origin https://github.com/USERNAME/hadir-jamaah.git
git push -u origin main
```
Ganti `USERNAME` dengan nama pengguna GitHub Anda. Saat diminta kata sandi, **pakai Personal Access Token**, bukan sandi akun:
GitHub → foto profil → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token** → centang **`repo`** → salin token dan tempel sebagai kata sandi.

### 2.4 Aktifkan GitHub Pages
Repository → **Settings → Pages** → *Source:* **Deploy from a branch** → *Branch:* **main** / **(root)** → **Save**. Tunggu 1–3 menit. Alamat situs: `https://USERNAME.github.io/hadir-jamaah/`

### 2.5 Update di kemudian hari
Setelah mengubah berkas di folder:
```bash
git add .
git commit -m "Perbarui"
git push
```

---

## BAGIAN 3 — Pengaturan Awal

1. Buka situs Anda → masuk dengan **akun administrator** dari Log setup.
2. **Pengaturan** → isi **Alamat situs aplikasi** (`https://USERNAME.github.io/hadir-jamaah/`) → **Simpan**. *Wajib*, agar tombol di email "Atur ulang kata sandi" bisa dibuka.
3. Atur radius default, toleransi terlambat, dan jam buka absen sesuai kebiasaan majelis.
4. **Kelola Pengguna** → tambah akun **pengurus**. Kata sandi sementara tampil sekali; berikan kepada yang bersangkutan.
5. **Ganti kata sandi admin** lewat menu Profil.
6. (Opsional) **Data Jamaah → Import** untuk memasukkan jamaah lama dari Excel/CSV (judul kolom: `nama, hp, email, alamat, jenis kelamin, tgl lahir`). Pratinjau dulu, aman diulang. Jamaah impor membuat kata sandi sendiri lewat "Lupa kata sandi".

### Alur harian
- Pengurus: **Acara → Buat Acara** (isi lokasi, klik *Gunakan lokasi saya* saat berada di masjid, atur radius) → buka detail acara → tampilkan **QR Layar Penuh** di lokasi.
- Jamaah: daftar sendiri → pengurus **Setujui** → jamaah masuk → **Absen** (selfie atau scan QR) saat berada di radius.

---

## Aturan Kehadiran
- Absen dibuka sekian menit sebelum mulai (default 60) hingga acara selesai.
- **Hadir** bila absen sebelum *mulai + toleransi*; setelahnya **Terlambat**.
- Satu jamaah hanya bisa absen **sekali** per acara.
- Izin dan koreksi dicatat pengurus (wajib mengisi catatan, tercatat di Audit_Log).
- **Persentase kehadiran** = (hadir + terlambat) ÷ (sesi − izin). Sesi dihitung dari acara yang sudah selesai sejak jamaah terdaftar.
- Pengurus hanya melihat/mengelola acara yang **ditugaskan** kepadanya; administrator melihat semua.

## Keamanan
- Kata sandi disimpan sebagai hash bergaram; token sesi bertanda tangan HMAC. Rahasia hanya di Script Properties.
- Login dikunci 15 menit setelah 6 kali salah; akses darurat 30 menit setelah 5 kali salah.
- Foto hanya bisa dibuka lewat aplikasi oleh yang berhak (pengurus/admin, atau pemilik foto). Foto tersimpan di Drive pemilik skrip, tidak dibagikan publik.
- **Jangan mengubah `TOKEN_SECRET`** di Script Properties: semua kata sandi tersimpan ikut tidak berlaku. Jika terpaksa, pulihkan lewat akses darurat lalu reset sandi pengguna.
- Memutar sandi darurat: jalankan fungsi `putarSandiDarurat`, baca hasilnya di Log.

### Batasan yang perlu diketahui
- **GPS dari browser tidak bisa dijamin anti-palsu.** Aplikasi menolak data lokasi yang janggal (akurasi 0 atau terlalu lemah), menghitung jarak di server, dan meminta selfie/QR, tetapi pengurus tetap perlu memeriksa selfie yang mencurigakan (ikon gambar di daftar hadir).
- Verifikasi wajah otomatis tidak tersedia di Apps Script; selfie adalah bukti visual.
- Kamera dan GPS **hanya bekerja lewat HTTPS** (GitHub Pages sudah HTTPS).

## Kuota Google (akun gratis)
| Batas | Dampak |
|---|---|
| Email ±100/hari | Email hanya untuk pendaftaran, verifikasi, dan lupa sandi. Sisa kuota tampil di *Pengaturan*. |
| Eksekusi 6 menit | Pembacaan data dibatch dan di-cache; import besar sebaiknya per ±500 baris. |
| Ekspor Excel/PDF | Dibuat dari spreadsheet sementara yang otomatis dibuang. |

## Pemecahan Masalah
| Gejala | Solusi |
|---|---|
| Halaman putih / "Backend belum terhubung" | `API_URL` di `js/config.js` kosong atau salah. Harus berakhiran `/exec`. |
| "Tidak bisa terhubung ke server" | Deploy belum "Siapa saja", atau perubahan kode belum dibuat versi baru. |
| Email tidak datang | Jalankan `pasangTrigger`; cek folder spam; cek sisa kuota di Pengaturan. |
| Link di email tidak membuka aplikasi | Isi *Alamat situs aplikasi* di Pengaturan. |
| Situs GitHub Pages 404 | `index.html` harus di akar repository; cek *Settings → Pages*. |
| Kamera tidak menyala | Izinkan kamera & lokasi untuk situs di pengaturan browser. |
| `git push` ditolak "Authentication failed" | Gunakan Personal Access Token (bukan sandi akun). |
| Lupa semua kata sandi admin | Masuk lewat `#/darurat` di alamat situs dengan sandi darurat. |

## Struktur Berkas
```
hadir-jamaah/            ← isi ZIP frontend (root repo)
├── index.html
├── css/style.css
└── js/ config.js  api.js  ui.js  auth.js  jamaah.js  staff.js  app.js
Kode.gs, appsscript.json ← ditempel ke Apps Script (bukan ke GitHub)
```
