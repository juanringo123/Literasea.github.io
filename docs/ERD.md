# Entity Relationship Diagram (ERD) - Literasea

Dokumen ini menggambarkan relasi data utama Literasea. Skema berasal dari file SQL di `sql/` dan dari field yang dipakai oleh frontend/Edge Function.

## ERD

Versi gambar visual dengan arah panah:

![ERD Literasea](ERD.svg)

```mermaid
erDiagram
  AUTH_USERS ||--o| PROFILES : "has profile"
  AUTH_USERS ||--o| ADMIN_USERS : "may be staff"
  AUTH_USERS ||--o{ PEMINJAMAN : "creates"
  AUTH_USERS ||--o{ HELPDESK_MESSAGES : "owns"
  AUTH_USERS ||--o{ HELPDESK_CHAT : "legacy chat"
  AUTH_USERS ||--o{ MASUKAN_BUKU : "suggests"
  AUTH_USERS ||--o{ PURCHASE_ORDER : "creates"

  BUKU ||--o{ PEMINJAMAN : "borrowed as buku_id"
  PURCHASE_ORDER ||--o{ PURCHASE_ORDER_ITEM : "contains"
  MASUKAN_BUKU ||--o{ PURCHASE_ORDER_ITEM : "source recommendation"

  AUTH_USERS {
    uuid id PK
    text email
    jsonb raw_user_meta_data
    timestamptz created_at
  }

  PROFILES {
    uuid id PK
    text email
    text full_name
    text phone
    text member_id
    text tanggal_lahir
    text foto_url
    timestamptz created_at
  }

  ADMIN_USERS {
    uuid id PK
    text full_name
    text email
    text role
    timestamptz created_at
  }

  BUKU {
    uuid id PK
    text judul
    text penulis
    text isbn
    text penerbit
    text kategori
    integer stok
    text cover_url
    text deskripsi
    timestamptz created_at
  }

  PEMINJAMAN {
    uuid id PK
    uuid user_id FK
    text buku_id
    text judul_buku
    text nama_anggota
    date tanggal_pinjam
    date tanggal_kembali
    integer durasi_hari
    text status
    text catatan
    integer denda
    text status_pembayaran_denda
    timestamptz created_at
  }

  HELPDESK_MESSAGES {
    uuid id PK
    uuid user_id FK
    text user_name
    text user_email
    text user_photo
    text sender_role
    uuid admin_id FK
    text admin_name
    text message
    timestamptz read_at_admin
    timestamptz read_at_user
    timestamptz created_at
  }

  HELPDESK_CHAT {
    uuid id PK
    uuid user_id FK
    text nama_pengguna
    text pengirim
    text pesan
    text user_photo
    timestamptz created_at
  }

  MASUKAN_BUKU {
    uuid id PK
    uuid user_id FK
    text nama_user
    text judul_buku
    text penulis
    text alasan
    text status
    text catatan_admin
    timestamptz created_at
  }

  PURCHASE_ORDER {
    uuid id PK
    text nomor_po
    text penerbit
    text catatan
    text status
    uuid dibuat_oleh FK
    text nama_pembuat
    timestamptz created_at
    timestamptz updated_at
  }

  PURCHASE_ORDER_ITEM {
    uuid id PK
    uuid po_id FK
    uuid masukan_id FK
    text judul_buku
    text penulis
    integer jumlah
  }
```

## Relasi Utama

| Relasi | Keterangan |
| --- | --- |
| `auth.users` -> `profiles` | Satu akun anggota memiliki satu profil. Profil dibuat/diupdate melalui trigger dan fallback frontend. |
| `auth.users` -> `admin_users` | Akun auth dapat memiliki role `admin` atau `owner`. |
| `auth.users` -> `peminjaman` | Anggota membuat banyak pengajuan peminjaman. |
| `buku` -> `peminjaman` | Buku dipinjam lewat `peminjaman.buku_id`. Field ini bertipe `text` untuk mendukung data legacy, jadi relasinya logis dan tidak selalu FK database. |
| `auth.users` -> `helpdesk_messages` | Anggota memiliki thread/pesan helpdesk. Admin juga dapat membalas via `admin_id`. |
| `auth.users` -> `masukan_buku` | Anggota dapat mengirim banyak saran buku. |
| `masukan_buku` -> `purchase_order_item` | Saran yang disetujui dapat menjadi item purchase order. |
| `purchase_order` -> `purchase_order_item` | Satu PO memiliki banyak item. |

## Catatan Skema

- Tabel `buku`, `peminjaman`, `helpdesk_messages`, dan penambahan kolom `profiles.foto_url` terdefinisi di folder `sql/`.
- Tabel `admin_users`, `masukan_buku`, `purchase_order`, `purchase_order_item`, dan `helpdesk_chat` digunakan oleh kode tetapi migration lengkapnya tidak ada di folder `sql/`; atributnya diturunkan dari pemakaian frontend dan Edge Function.
- Aplikasi juga mendukung tabel legacy `book` dan `books` sebagai sumber data buku, tetapi tabel utama yang distandardisasi adalah `buku`.
