-- AI Calendar Agent - Supabase schema
-- This file is intentionally idempotent for a fresh Supabase project.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  day_start time not null default '07:00',
  day_end time not null default '22:00',
  pomodoro_minutes integer not null default 50 check (pomodoro_minutes between 15 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_valid_day_range check (day_end > day_start)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  color text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  category text not null default 'Học tập' check (char_length(category) between 1 and 60),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  is_ai_generated boolean not null default false,
  all_day boolean not null default false,
  recurrence_rule text check (recurrence_rule is null or recurrence_rule in ('daily', 'weekly', 'monthly')),
  recurrence_end date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_time_range check (end_time > start_time),
  constraint events_recurrence_end_valid check (
    (recurrence_rule is null and recurrence_end is null)
    or (recurrence_rule is not null and recurrence_end is not null and recurrence_end >= start_time::date)
  )
);

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  subject text not null check (char_length(subject) between 1 and 80),
  estimated_hours numeric(7,2) not null check (estimated_hours > 0 and estimated_hours <= 500),
  deadline date not null,
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'pending' check (status in ('pending', 'planned', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Đoạn chat mới' check (char_length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_timezone_idx on public.profiles(timezone);
create index if not exists events_user_id_idx on public.events(user_id);
create index if not exists events_user_time_idx on public.events(user_id, start_time, end_time) where deleted_at is null;
create index if not exists events_user_category_idx on public.events(user_id, category);
create index if not exists events_user_deleted_idx on public.events(user_id, deleted_at);
create index if not exists study_tasks_user_id_idx on public.study_tasks(user_id);
create index if not exists study_tasks_user_deadline_idx on public.study_tasks(user_id, deadline);
create index if not exists chat_messages_user_id_idx on public.chat_messages(user_id);
create index if not exists conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index if not exists chat_messages_conversation_idx
  on public.chat_messages(user_id, conversation_id, created_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_no_scheduled_overlap'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_no_scheduled_overlap
      exclude using gist (
        user_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      )
      where (status = 'scheduled' and deleted_at is null);
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists study_tasks_set_updated_at on public.study_tasks;
create trigger study_tasks_set_updated_at
before update on public.study_tasks
for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.study_tasks enable row level security;
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = id)
with check ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = id);

drop policy if exists "events_select_own" on public.events;
create policy "events_select_own"
on public.events for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
on public.events for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
on public.events for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own"
on public.events for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "study_tasks_select_own" on public.study_tasks;
create policy "study_tasks_select_own"
on public.study_tasks for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "study_tasks_insert_own" on public.study_tasks;
create policy "study_tasks_insert_own"
on public.study_tasks for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "study_tasks_update_own" on public.study_tasks;
create policy "study_tasks_update_own"
on public.study_tasks for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "study_tasks_delete_own" on public.study_tasks;
create policy "study_tasks_delete_own"
on public.study_tasks for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own"
on public.conversations for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own"
on public.conversations for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "conversations_update_own" on public.conversations;
create policy "conversations_update_own"
on public.conversations for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "conversations_delete_own" on public.conversations;
create policy "conversations_delete_own"
on public.conversations for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
on public.chat_messages for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
on public.chat_messages for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own"
on public.chat_messages for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
on public.chat_messages for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.study_tasks to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
