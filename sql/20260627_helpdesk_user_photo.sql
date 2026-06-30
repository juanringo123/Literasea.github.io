alter table if exists public.helpdesk_messages
  add column if not exists user_photo text;

alter table if exists public.helpdesk_chat
  add column if not exists user_photo text;
