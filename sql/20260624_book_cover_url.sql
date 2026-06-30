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
      with prepared as (
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
          )) as cover_value
        from (
          select to_jsonb(src) as row_data
          from public.%I as src
        ) imported_rows
      )
      update public.buku as target
      set cover_url = prepared.cover_value
      from prepared
      where coalesce(target.cover_url, '') = ''
        and prepared.cover_value is not null
        and prepared.cover_value <> ''
        and lower(trim(target.judul)) = lower(prepared.title_value)
        and lower(trim(target.penulis)) = lower(prepared.author_value)
        and lower(trim(coalesce(target.kategori, ''))) = lower(coalesce(prepared.category_value, ''))
        and lower(trim(coalesce(target.isbn, ''))) = lower(coalesce(prepared.isbn_value, ''));
    $sql$, source_table);
  end loop;
end
$$;
