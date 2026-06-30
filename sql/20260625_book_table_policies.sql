grant usage on schema public to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['buku', 'book', 'books'] loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      target_table
    );

    execute format(
      'alter table public.%I enable row level security',
      target_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_select_authenticated',
      target_table
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      target_table || '_select_authenticated',
      target_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_write_admin',
      target_table
    );

    execute format($policy$
      create policy %I
      on public.%I
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.admin_users
          where admin_users.id = auth.uid()
            and admin_users.role in ('admin', 'owner')
        )
      )
      with check (
        exists (
          select 1
          from public.admin_users
          where admin_users.id = auth.uid()
            and admin_users.role in ('admin', 'owner')
        )
      )
    $policy$,
      target_table || '_write_admin',
      target_table
    );
  end loop;
end
$$;
