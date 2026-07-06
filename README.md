# Literasea

# juansiringo

Literasea adalah aplikasi perpustakaan digital berbasis web statis yang terhubung dengan Supabase untuk autentikasi, data buku, peminjaman, pengembalian, helpdesk, masukan buku, dan fitur admin/owner.

## Halaman Utama

- `index.html` - halaman pengguna/anggota perpustakaan.
- `admin.html` - panel admin dan owner.

## Fitur

### Anggota

- Login dan registrasi akun.
- Dashboard statistik perpustakaan.
- Katalog buku dengan pencarian dan kategori.
- Detail buku dan pengajuan peminjaman.
- Status peminjaman dan pengembalian.
- Pembayaran denda melalui pengajuan ke helpdesk.
- Kartu anggota digital dengan foto.
- Chat helpdesk.
- Pengajuan saran buku.

### Admin

- Dashboard statistik.
- Kelola koleksi buku.
- Konfirmasi peminjaman.
- Konfirmasi pengembalian dan verifikasi denda.
- Kelola anggota.
- Chat helpdesk dengan anggota.
- Kelola masukan buku.
- Penerimaan buku.

### Owner

- Dashboard performa.
- Kelola akun admin.
- Laporan peminjaman dan denda.
- Rekomendasi pembelian buku.
- Purchase order.
- Rekap semua buku, anggota, dan transaksi.

## Struktur Folder

```text
Literasea/
+-- index.html
+-- admin.html
+-- README.md
+-- assets/
|   +-- css/
|   |   +-- index.css
|   |   +-- admin.css
|   +-- js/
|   |   +-- auth.js
|   |   +-- dashboard.js
|   |   +-- books.js
|   |   +-- borrow.js
|   |   +-- return.js
|   |   +-- helpdesk.js
|   |   +-- profile.js
|   |   +-- supabase.js
|   |   +-- utils.js
|   |   +-- admin-auth.js
|   |   +-- admin-dashboard.js
|   |   +-- admin-books.js
|   |   +-- admin-borrow.js
|   |   +-- admin-return.js
|   |   +-- admin-helpdesk.js
|   |   +-- admin-profile.js
|   |   +-- admin-owner.js
|   +-- images/
|       +-- logoPerpus2_bgremoved.png
+-- sql/
+-- docs/
|   +-- STRUCTURE.md
+-- supabase/
    +-- function/
```

## Pembagian File JavaScript

### Halaman Anggota

- `auth.js` - login, registrasi, logout, session restore, dan bootstrap aplikasi anggota.
- `dashboard.js` - kategori, navigasi, berita dashboard, dan status penangguhan akun.
- `books.js` - normalisasi data buku, realtime sync, dan helper cover buku.
- `borrow.js` - alur peminjaman dan pengajuan pembayaran denda.
- `return.js` - daftar pengembalian, status pinjaman, dan panel denda.
- `helpdesk.js` - chat helpdesk dan saran buku.
- `profile.js` - kartu anggota, foto profil, dan barcode anggota.
- `utils.js` - helper umum seperti toast, escape HTML, toggle password, dan tema.
- `supabase.js` - konfigurasi dan client Supabase bersama.

### Halaman Admin

- `admin-auth.js` - auth guard admin/owner dan setup awal dashboard.
- `admin-dashboard.js` - statistik dashboard, navigasi, modal, toast, dan utilitas admin.
- `admin-books.js` - kelola koleksi buku dan integrasi data buku.
- `admin-borrow.js` - konfirmasi peminjaman.
- `admin-return.js` - konfirmasi pengembalian dan denda.
- `admin-helpdesk.js` - helpdesk admin.
- `admin-profile.js` - data dan detail anggota.
- `admin-owner.js` - fitur owner, purchase order, masukan buku, dan laporan owner.

## Cara Menjalankan

Karena proyek ini berupa web statis, halaman bisa dibuka langsung dari browser:

- Buka `index.html` untuk aplikasi anggota.
- Buka `admin.html` untuk panel admin/owner.

Jika ingin menjalankan lewat server lokal:

```bash
python -m http.server 4173
```

Lalu buka:

```text
http://127.0.0.1:4173/index.html
http://127.0.0.1:4173/admin.html
```

## Konfigurasi Supabase

Konfigurasi Supabase berada di:

```text
assets/js/supabase.js
```

File ini berisi:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `supabaseClient`

Pastikan nilai anon key sesuai dengan project Supabase yang digunakan.

## Database

File SQL migrasi berada di folder:

```text
sql/
```

Gunakan file tersebut untuk menyiapkan tabel dan policy Supabase yang dibutuhkan aplikasi.

## Dokumentasi Diagram

- `docs/DFD.md` - Data Flow Diagram level 0 dan level 1.
- `docs/ERD.md` - Entity Relationship Diagram dan ringkasan relasi tabel.
- `docs/DFD.svg` - gambar DFD visual dengan arah panah.
- `docs/ERD.svg` - gambar ERD visual dengan arah panah relasi.

## Supabase Edge Functions

Source Edge Function masih berada di:

```text
supabase/function/
```

Catatan: frontend saat ini memanggil endpoint `functions/v1/quick-api` untuk pembuatan akun admin oleh owner. Pastikan nama function yang dideploy di Supabase sesuai dengan endpoint yang dipanggil frontend.

## Validasi Setelah Perubahan

Untuk mengecek sintaks JavaScript:

```bash
node --check assets/js/supabase.js
```

Atau cek semua file JS melalui PowerShell:

```powershell
Get-ChildItem assets\js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Catatan Pengembangan

- Jangan mengembalikan CSS atau JavaScript inline ke `index.html` dan `admin.html`.
- Simpan styling di `assets/css/`.
- Simpan logic fitur di `assets/js/`.
- Simpan gambar dan aset visual di `assets/images/`.
- Simpan migrasi database di `sql/`.
- Dokumentasi struktur teknis tambahan ada di `docs/STRUCTURE.md`.
