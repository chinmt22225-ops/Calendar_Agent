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
  all_day_start date,
  all_day_end date,
  recurrence_rule text check (recurrence_rule is null or recurrence_rule in ('daily', 'weekly', 'monthly')),
  recurrence_end date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_time_range check (end_time > start_time),
  constraint events_all_day_dates_valid check (
    (all_day = false and all_day_start is null and all_day_end is null)
    or (
      all_day = true
      and all_day_start is not null
      and all_day_end is not null
      and all_day_end > all_day_start
    )
  ),
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
  updated_at timestamptz not null default now(),
  constraint conversations_id_user_unique unique (id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.conversations(id, user_id)
    on delete cascade
);

create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 60),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, bucket)
);

create table if not exists public.ai_chat_operations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  response_text text,
  actions jsonb not null default '[]'::jsonb,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_chat_operations_id_user_unique unique (id, user_id)
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
create index if not exists ai_chat_operations_user_created_idx
  on public.ai_chat_operations(user_id, created_at desc);

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

create or replace function public.persist_chat_exchange(
  p_operation_id uuid,
  p_conversation_id uuid,
  p_user_id uuid,
  p_is_new boolean,
  p_title text,
  p_user_message text,
  p_user_metadata jsonb,
  p_assistant_message text,
  p_assistant_metadata jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assistant_row public.chat_messages%rowtype;
begin
  if p_is_new then
    insert into public.conversations (id, user_id, title)
    values (p_conversation_id, p_user_id, p_title);
  else
    update public.conversations
    set updated_at = now()
    where id = p_conversation_id and user_id = p_user_id;
    if not found then
      raise exception 'conversation_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.chat_messages (
    user_id, conversation_id, role, content, metadata
  ) values (
    p_user_id, p_conversation_id, 'user', p_user_message, coalesce(p_user_metadata, '{}'::jsonb)
  );

  insert into public.chat_messages (
    user_id, conversation_id, role, content, metadata
  ) values (
    p_user_id, p_conversation_id, 'assistant', p_assistant_message,
    coalesce(p_assistant_metadata, '{}'::jsonb)
  ) returning * into assistant_row;

  update public.ai_chat_operations
  set status = 'completed',
      response_text = p_assistant_message,
      actions = coalesce(p_assistant_metadata -> 'actions', '[]'::jsonb),
      error_detail = null,
      updated_at = now()
  where id = p_operation_id and user_id = p_user_id and status = 'pending';
  if not found then
    raise exception 'chat_operation_not_pending' using errcode = '23505';
  end if;

  return to_jsonb(assistant_row);
end;
$$;

revoke all on function public.persist_chat_exchange(
  uuid, uuid, uuid, boolean, text, text, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_chat_exchange(
  uuid, uuid, uuid, boolean, text, text, jsonb, text, jsonb
) to service_role;

create or replace function public.begin_ai_chat_operation(
  p_operation_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_row public.ai_chat_operations%rowtype;
  operation_created boolean;
begin
  insert into public.ai_chat_operations (id, user_id, conversation_id, request_fingerprint)
  values (p_operation_id, p_user_id, p_conversation_id, p_request_fingerprint)
  on conflict (id) do nothing;
  operation_created := found;

  select * into operation_row
  from public.ai_chat_operations
  where id = p_operation_id and user_id = p_user_id;
  if not found then
    raise exception 'chat_operation_owner_mismatch' using errcode = '42501';
  end if;
  if operation_row.request_fingerprint <> p_request_fingerprint then
    raise exception 'chat_operation_payload_mismatch' using errcode = '23505';
  end if;
  return to_jsonb(operation_row) || jsonb_build_object('created', operation_created);
end;
$$;

create or replace function public.fail_ai_chat_operation(
  p_operation_id uuid,
  p_user_id uuid,
  p_error_detail text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ai_chat_operations
  set status = 'failed', error_detail = left(p_error_detail, 500), updated_at = now()
  where id = p_operation_id and user_id = p_user_id and status = 'pending';
$$;

revoke all on function public.begin_ai_chat_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.begin_ai_chat_operation(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.fail_ai_chat_operation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_chat_operation(uuid, uuid, text)
  to service_role;

create or replace function public.consume_api_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.api_rate_limits%rowtype;
  current_timestamp_value timestamptz := clock_timestamp();
  elapsed_seconds integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid_rate_limit_configuration' using errcode = '22023';
  end if;

  insert into public.api_rate_limits (user_id, bucket, window_started_at, request_count)
  values (p_user_id, p_bucket, current_timestamp_value, 1)
  on conflict (user_id, bucket) do update
  set window_started_at = case
        when public.api_rate_limits.window_started_at
          <= current_timestamp_value - make_interval(secs => p_window_seconds)
        then current_timestamp_value
        else public.api_rate_limits.window_started_at
      end,
      request_count = case
        when public.api_rate_limits.window_started_at
          <= current_timestamp_value - make_interval(secs => p_window_seconds)
        then 1
        else public.api_rate_limits.request_count + 1
      end
  returning * into current_row;

  elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (current_timestamp_value - current_row.window_started_at)))::integer
  );
  return jsonb_build_object(
    'allowed', current_row.request_count <= p_limit,
    'remaining', greatest(0, p_limit - current_row.request_count),
    'retry_after', greatest(1, p_window_seconds - elapsed_seconds)
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(uuid, text, integer, integer)
  to service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.study_tasks enable row level security;
alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.ai_chat_operations enable row level security;

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

+-- Serialize recurrence-aware event mutations per user and keep bulk AI inserts
-- all-or-nothing. The existing exclusion constraint remains the final guard
-- for non-recurring base ranges.

create or replace function public.event_occurrence_ranges(
  p_start timestamptz,
  p_end timestamptz,
  p_recurrence_rule text,
  p_recurrence_end date
)
returns table (occurrence_start timestamptz, occurrence_end timestamptz)
language plpgsql
immutable
set search_path = ''
as $$
declare
  current_start timestamptz := p_start;
  event_duration interval := p_end - p_start;
  occurrence_count integer := 0;
  month_offset integer := 0;
  anchor_day integer := extract(day from (p_start at time zone 'UTC'))::integer;
  anchor_time time := (p_start at time zone 'UTC')::time;
  target_month date;
  days_in_month integer;
begin
  loop
    exit when occurrence_count >= 2000;
    exit when p_recurrence_end is not null
      and (current_start at time zone 'UTC')::date > p_recurrence_end;

    occurrence_start := current_start;
    occurrence_end := current_start + event_duration;
    return next;
    occurrence_count := occurrence_count + 1;

    if p_recurrence_rule is null then
      return;
    elsif p_recurrence_rule = 'daily' then
      current_start := current_start + interval '1 day';
    elsif p_recurrence_rule = 'weekly' then
      current_start := current_start + interval '7 days';
    elsif p_recurrence_rule = 'monthly' then
      loop
        month_offset := month_offset + 1;
        target_month := (
          date_trunc('month', p_start at time zone 'UTC')
          + make_interval(months => month_offset)
        )::date;
        if p_recurrence_end is not null and target_month > p_recurrence_end then
          return;
        end if;
        days_in_month := extract(day from (
          (target_month + interval '1 month') - interval '1 day'
        ))::integer;
        if anchor_day <= days_in_month then
          current_start := ((target_month + (anchor_day - 1)) + anchor_time) at time zone 'UTC';
          exit;
        end if;
      end loop;
    else
      raise exception 'unsupported_recurrence_rule' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.find_calendar_event_conflict(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_status text,
  p_recurrence_rule text,
  p_recurrence_end date,
  p_exclude_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  conflict jsonb;
begin
  if p_status <> 'scheduled' then
    return null;
  end if;

  select jsonb_build_object('id', existing.id, 'title', existing.title)
  into conflict
  from public.events as existing
  cross join lateral public.event_occurrence_ranges(
    p_start, p_end, p_recurrence_rule, p_recurrence_end
  ) as candidate_occurrence
  cross join lateral public.event_occurrence_ranges(
    existing.start_time, existing.end_time,
    existing.recurrence_rule, existing.recurrence_end
  ) as existing_occurrence
  where existing.user_id = p_user_id
    and existing.status = 'scheduled'
    and existing.deleted_at is null
    and (p_exclude_id is null or existing.id <> p_exclude_id)
    and tstzrange(
      candidate_occurrence.occurrence_start,
      candidate_occurrence.occurrence_end,
      '[)'
    ) && tstzrange(
      existing_occurrence.occurrence_start,
      existing_occurrence.occurrence_end,
      '[)'
    )
  limit 1;

  return conflict;
end;
$$;

create or replace function public.create_calendar_event_atomic(
  p_user_id uuid,
  p_event jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict jsonb;
  inserted public.events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  conflict := public.find_calendar_event_conflict(
    p_user_id,
    (p_event ->> 'start_time')::timestamptz,
    (p_event ->> 'end_time')::timestamptz,
    coalesce(p_event ->> 'status', 'scheduled'),
    nullif(p_event ->> 'recurrence_rule', ''),
    nullif(p_event ->> 'recurrence_end', '')::date,
    null
  );
  if conflict is not null then
    raise exception 'calendar_conflict:%', conflict ->> 'title' using errcode = '23P01';
  end if;

  insert into public.events (
    user_id, title, description, start_time, end_time, color, category,
    status, is_ai_generated, all_day, all_day_start, all_day_end,
    recurrence_rule, recurrence_end
  ) values (
    p_user_id,
    p_event ->> 'title',
    p_event ->> 'description',
    (p_event ->> 'start_time')::timestamptz,
    (p_event ->> 'end_time')::timestamptz,
    coalesce(p_event ->> 'color', '#2563eb'),
    coalesce(p_event ->> 'category', 'Học tập'),
    coalesce(p_event ->> 'status', 'scheduled'),
    coalesce((p_event ->> 'is_ai_generated')::boolean, false),
    coalesce((p_event ->> 'all_day')::boolean, false),
    nullif(p_event ->> 'all_day_start', '')::date,
    nullif(p_event ->> 'all_day_end', '')::date,
    nullif(p_event ->> 'recurrence_rule', ''),
    nullif(p_event ->> 'recurrence_end', '')::date
  ) returning * into inserted;

  return to_jsonb(inserted);
end;
$$;

create or replace function public.update_calendar_event_atomic(
  p_user_id uuid,
  p_event_id uuid,
  p_event jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict jsonb;
  current_row public.events%rowtype;
  updated public.events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into current_row
  from public.events
  where id = p_event_id and user_id = p_user_id and deleted_at is null
  for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  conflict := public.find_calendar_event_conflict(
    p_user_id,
    (p_event ->> 'start_time')::timestamptz,
    (p_event ->> 'end_time')::timestamptz,
    p_event ->> 'status',
    nullif(p_event ->> 'recurrence_rule', ''),
    nullif(p_event ->> 'recurrence_end', '')::date,
    p_event_id
  );
  if conflict is not null then
    raise exception 'calendar_conflict:%', conflict ->> 'title' using errcode = '23P01';
  end if;

  update public.events set
    title = p_event ->> 'title',
    description = p_event ->> 'description',
    start_time = (p_event ->> 'start_time')::timestamptz,
    end_time = (p_event ->> 'end_time')::timestamptz,
    color = p_event ->> 'color',
    category = p_event ->> 'category',
    status = p_event ->> 'status',
    is_ai_generated = (p_event ->> 'is_ai_generated')::boolean,
    all_day = (p_event ->> 'all_day')::boolean,
    all_day_start = nullif(p_event ->> 'all_day_start', '')::date,
    all_day_end = nullif(p_event ->> 'all_day_end', '')::date,
    recurrence_rule = nullif(p_event ->> 'recurrence_rule', ''),
    recurrence_end = nullif(p_event ->> 'recurrence_end', '')::date
  where id = p_event_id and user_id = p_user_id
  returning * into updated;

  return to_jsonb(updated);
end;
$$;

create or replace function public.restore_calendar_event_atomic(
  p_user_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict jsonb;
  current_row public.events%rowtype;
  restored public.events%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into current_row
  from public.events
  where id = p_event_id and user_id = p_user_id and deleted_at is not null
  for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  conflict := public.find_calendar_event_conflict(
    p_user_id, current_row.start_time, current_row.end_time,
    current_row.status, current_row.recurrence_rule,
    current_row.recurrence_end, p_event_id
  );
  if conflict is not null then
    raise exception 'calendar_conflict:%', conflict ->> 'title' using errcode = '23P01';
  end if;

  update public.events set deleted_at = null
  where id = p_event_id and user_id = p_user_id
  returning * into restored;
  return to_jsonb(restored);
end;
$$;

create or replace function public.create_calendar_events_atomic(
  p_user_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  created jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'events_array_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) > 50 then
    raise exception 'too_many_events' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  for item in select value from jsonb_array_elements(p_events)
  loop
    created := created || jsonb_build_array(
      public.create_calendar_event_atomic(p_user_id, item)
    );
  end loop;
  return created;
end;
$$;

revoke all on function public.event_occurrence_ranges(timestamptz, timestamptz, text, date)
  from public, anon, authenticated;
revoke all on function public.find_calendar_event_conflict(uuid, timestamptz, timestamptz, text, text, date, uuid)
  from public, anon, authenticated;
revoke all on function public.create_calendar_event_atomic(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_calendar_event_atomic(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.restore_calendar_event_atomic(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.create_calendar_events_atomic(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.event_occurrence_ranges(timestamptz, timestamptz, text, date)
  to service_role;
grant execute on function public.find_calendar_event_conflict(uuid, timestamptz, timestamptz, text, text, date, uuid)
  to service_role;
grant execute on function public.create_calendar_event_atomic(uuid, jsonb)
  to service_role;
grant execute on function public.update_calendar_event_atomic(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.restore_calendar_event_atomic(uuid, uuid)
  to service_role;
grant execute on function public.create_calendar_events_atomic(uuid, jsonb)
  to service_role;
