create extension if not exists pgcrypto;

create table if not exists public.helpdesk_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  user_email text,
  user_photo text,
  sender_role text not null check (sender_role in ('user', 'admin')),
  admin_id uuid references auth.users(id) on delete set null,
  admin_name text,
  message text not null,
  read_at_admin timestamptz,
  read_at_user timestamptz,
  created_at timestamptz not null default now()
);

alter table public.helpdesk_messages
  add column if not exists user_photo text;

create index if not exists helpdesk_messages_user_created_idx
  on public.helpdesk_messages (user_id, created_at desc);

alter table public.helpdesk_messages enable row level security;

drop policy if exists helpdesk_select_messages on public.helpdesk_messages;
create policy helpdesk_select_messages
on public.helpdesk_messages
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);

drop policy if exists helpdesk_insert_messages on public.helpdesk_messages;
create policy helpdesk_insert_messages
on public.helpdesk_messages
for insert
to authenticated
with check (
  (
    sender_role = 'user'
    and user_id = auth.uid()
  )
  or (
    sender_role = 'admin'
    and exists (
      select 1
      from public.admin_users
      where admin_users.id = auth.uid()
        and admin_users.role in ('admin', 'owner')
    )
  )
);

drop policy if exists helpdesk_update_messages on public.helpdesk_messages;
create policy helpdesk_update_messages
on public.helpdesk_messages
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_users
    where admin_users.id = auth.uid()
      and admin_users.role in ('admin', 'owner')
  )
);
