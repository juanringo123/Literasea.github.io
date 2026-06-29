update public.peminjaman
set denda = 0
where coalesce(denda, 0) < 0;

update public.peminjaman
set status_pembayaran_denda = 'belum_dibayar'
where coalesce(denda, 0) <= 0
  and coalesce(status_pembayaran_denda, 'belum_dibayar') <> 'belum_dibayar';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'peminjaman_fine_status_requires_amount_check'
  ) then
    alter table public.peminjaman
      drop constraint peminjaman_fine_status_requires_amount_check;
  end if;

  alter table public.peminjaman
    add constraint peminjaman_fine_status_requires_amount_check
    check (
      coalesce(denda, 0) > 0
      or status_pembayaran_denda = 'belum_dibayar'
    );
end
$$;
