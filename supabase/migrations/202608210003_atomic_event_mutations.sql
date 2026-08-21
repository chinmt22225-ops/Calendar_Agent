-- Serialize recurrence-aware event mutations per user and keep bulk AI inserts
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
