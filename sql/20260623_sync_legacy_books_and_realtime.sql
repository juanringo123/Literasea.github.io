create extension if not exists pgcrypto;

create table if not exists public.buku (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  penulis text not null,
  isbn text,
  penerbit text,
  kategori text not null,
  stok integer not null default 0,
  cover_url text,
  deskripsi text,
  created_at timestamptz not null default now()
);

alter table if exists public.buku
add column if not exists cover_url text;

do $$
declare
  source_table text;
begin
  foreach source_table in array array['book', 'books'] loop
    if to_regclass(format('public.%I', source_table)) is null then
      continue;
    end if;

    execute format($sql$
      insert into public.buku (judul, penulis, isbn, penerbit, kategori, stok, cover_url, deskripsi)
      select
        prepared.title_value,
        prepared.author_value,
        nullif(prepared.isbn_value, ''),
        nullif(prepared.publisher_value, ''),
        prepared.category_value,
        case
          when nullif(regexp_replace(prepared.stock_raw, '[^0-9-]', '', 'g'), '') is null then 1
          else greatest((nullif(regexp_replace(prepared.stock_raw, '[^0-9-]', '', 'g'), '')::integer), 0)
        end as stock_value,
        nullif(prepared.cover_value, ''),
        nullif(prepared.description_value, '')
      from (
        select
          trim(coalesce(
            row_data->>'judul',
            row_data->>'Judul',
            row_data->>'judul_buku',
            row_data->>'Judul Buku',
            row_data->>'book_title',
            row_data->>'Book Title',
            row_data->>'title',
            row_data->>'Title',
            row_data->>'nama_buku',
            row_data->>'Nama Buku',
            row_data->>'name',
            row_data->>'Name'
          )) as title_value,
          trim(coalesce(
            row_data->>'penulis',
            row_data->>'Penulis',
            row_data->>'penulis_buku',
            row_data->>'Penulis Buku',
            row_data->>'pengarang',
            row_data->>'Pengarang',
            row_data->>'author',
            row_data->>'Author',
            row_data->>'author_name',
            row_data->>'Author Name',
            row_data->>'writer',
            row_data->>'Writer'
          )) as author_value,
          trim(coalesce(
            row_data->>'isbn',
            row_data->>'ISBN',
            row_data->>'isbn_buku',
            row_data->>'ISBN Buku'
          )) as isbn_value,
          trim(coalesce(
            row_data->>'penerbit',
            row_data->>'Penerbit',
            row_data->>'penerbit_buku',
            row_data->>'Penerbit Buku',
            row_data->>'publisher',
            row_data->>'Publisher'
          )) as publisher_value,
          trim(coalesce(
            row_data->>'kategori',
            row_data->>'Kategori',
            row_data->>'kategori_buku',
            row_data->>'Kategori Buku',
            row_data->>'category',
            row_data->>'Category',
            row_data->>'genre',
            row_data->>'Genre'
          )) as category_value,
          trim(coalesce(
            row_data->>'stok',
            row_data->>'Stok',
            row_data->>'stok_buku',
            row_data->>'Stok Buku',
            row_data->>'stock',
            row_data->>'Stock',
            row_data->>'jumlah',
            row_data->>'Jumlah',
            row_data->>'qty',
            row_data->>'Qty',
            row_data->>'quantity',
            row_data->>'Quantity'
          )) as stock_raw,
          trim(coalesce(
            row_data->>'cover_url',
            row_data->>'Cover URL',
            row_data->>'url_cover',
            row_data->>'URL Cover',
            row_data->>'cover',
            row_data->>'Cover',
            row_data->>'cover_buku',
            row_data->>'Cover Buku',
            row_data->>'gambar',
            row_data->>'Gambar',
            row_data->>'gambar_url',
            row_data->>'Gambar URL',
            row_data->>'url_gambar',
            row_data->>'URL Gambar',
            row_data->>'image',
            row_data->>'Image',
            row_data->>'image_url',
            row_data->>'Image URL',
            row_data->>'image_link',
            row_data->>'Image Link',
            row_data->>'thumbnail',
            row_data->>'Thumbnail',
            row_data->>'cover_image',
            row_data->>'Cover Image'
          )) as cover_value,
          trim(coalesce(
            row_data->>'deskripsi',
            row_data->>'Deskripsi',
            row_data->>'deskripsi_buku',
            row_data->>'Deskripsi Buku',
            row_data->>'description',
            row_data->>'Description',
            row_data->>'sinopsis',
            row_data->>'Sinopsis',
            row_data->>'sinopsis_buku',
            row_data->>'Sinopsis Buku',
            row_data->>'ringkasan',
            row_data->>'Ringkasan'
          )) as description_value
        from (
          select to_jsonb(src) as row_data
          from public.%I as src
        ) imported_rows
      ) as prepared
      where prepared.title_value is not null
        and prepared.title_value <> ''
        and prepared.author_value is not null
        and prepared.author_value <> ''
        and prepared.category_value is not null
        and prepared.category_value <> ''
        and not exists (
          select 1
          from public.buku existing
          where lower(trim(existing.judul)) = lower(prepared.title_value)
            and lower(trim(existing.penulis)) = lower(prepared.author_value)
            and lower(trim(coalesce(existing.kategori, ''))) = lower(prepared.category_value)
            and lower(trim(coalesce(existing.isbn, ''))) = lower(coalesce(prepared.isbn_value, ''))
        );
    $sql$, source_table);
  end loop;
end
$$;

do $$
declare
  realtime_table text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    return;
  end if;

  foreach realtime_table in array array[
    'buku',
    'book',
    'books',
    'profiles',
    'peminjaman',
    'helpdesk_messages'
  ] loop
    if to_regclass(format('public.%I', realtime_table)) is null then
      continue;
    end if;

    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      continue;
    end if;

    execute format(
      'alter publication supabase_realtime add table public.%I',
      realtime_table
    );
  end loop;
end
$$;
