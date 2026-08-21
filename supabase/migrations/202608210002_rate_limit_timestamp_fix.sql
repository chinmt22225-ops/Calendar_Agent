-- Avoid PostgreSQL's CURRENT_TIME keyword (timetz) shadowing the PL/pgSQL
-- variable that must be a timestamptz for api_rate_limits.window_started_at.

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
