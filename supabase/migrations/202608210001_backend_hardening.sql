-- Backend hardening: atomic chat persistence and conversation ownership integrity.

alter table public.events
  add column if not exists all_day_start date,
  add column if not exists all_day_end date;

update public.events
set all_day_start = (start_time at time zone 'UTC')::date,
    all_day_end = (end_time at time zone 'UTC')::date
where all_day = true
  and (all_day_start is null or all_day_end is null);

alter table public.events
  drop constraint if exists events_all_day_dates_valid;
alter table public.events
  add constraint events_all_day_dates_valid check (
    (all_day = false and all_day_start is null and all_day_end is null)
    or (
      all_day = true
      and all_day_start is not null
      and all_day_end is not null
      and all_day_end > all_day_start
    )
  );

do $$
begin
  if exists (
    select 1
    from public.chat_messages as messages
    join public.conversations as conversations on conversations.id = messages.conversation_id
    where messages.user_id <> conversations.user_id
  ) then
    raise exception 'Cannot enforce conversation ownership: mismatched chat messages exist';
  end if;
end
$$;

alter table public.conversations
  drop constraint if exists conversations_id_user_unique;
alter table public.conversations
  add constraint conversations_id_user_unique unique (id, user_id);

alter table public.chat_messages
  drop constraint if exists chat_messages_conversation_id_fkey;
alter table public.chat_messages
  drop constraint if exists chat_messages_conversation_owner_fkey;
alter table public.chat_messages
  add constraint chat_messages_conversation_owner_fkey
  foreign key (conversation_id, user_id)
  references public.conversations(id, user_id)
  on delete cascade;

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

create index if not exists ai_chat_operations_user_created_idx
  on public.ai_chat_operations(user_id, created_at desc);
alter table public.ai_chat_operations enable row level security;

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

create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 60),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, bucket)
);

alter table public.api_rate_limits enable row level security;

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
  current_time timestamptz := clock_timestamp();
  elapsed_seconds integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid_rate_limit_configuration' using errcode = '22023';
  end if;

  insert into public.api_rate_limits (user_id, bucket, window_started_at, request_count)
  values (p_user_id, p_bucket, current_time, 1)
  on conflict (user_id, bucket) do update
  set window_started_at = case
        when public.api_rate_limits.window_started_at
          <= current_time - make_interval(secs => p_window_seconds)
        then current_time
        else public.api_rate_limits.window_started_at
      end,
      request_count = case
        when public.api_rate_limits.window_started_at
          <= current_time - make_interval(secs => p_window_seconds)
        then 1
        else public.api_rate_limits.request_count + 1
      end
  returning * into current_row;

  elapsed_seconds := greatest(
    0,
    floor(extract(epoch from (current_time - current_row.window_started_at)))::integer
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
