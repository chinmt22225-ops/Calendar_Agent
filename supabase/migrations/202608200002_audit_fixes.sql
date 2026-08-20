-- Audit fixes: recurrence, trash, conversation management and Vietnam timezone.

alter table public.profiles
  alter column timezone set default 'Asia/Ho_Chi_Minh';

update public.profiles
set timezone = 'Asia/Ho_Chi_Minh'
where timezone = 'Asia/Bangkok';

alter table public.events
  add column if not exists all_day boolean not null default false,
  add column if not exists recurrence_end date,
  add column if not exists deleted_at timestamptz;

update public.events
set recurrence_rule = lower(recurrence_rule)
where recurrence_rule is not null;

alter table public.events
  drop constraint if exists events_recurrence_rule_valid,
  drop constraint if exists events_recurrence_end_valid;

alter table public.events
  add constraint events_recurrence_rule_valid
    check (recurrence_rule is null or recurrence_rule in ('daily', 'weekly', 'monthly')),
  add constraint events_recurrence_end_valid
    check (
      (recurrence_rule is null and recurrence_end is null)
      or (recurrence_rule is not null and recurrence_end is not null and recurrence_end >= start_time::date)
    );

drop index if exists public.events_user_time_idx;
create index events_user_time_idx
  on public.events(user_id, start_time, end_time)
  where deleted_at is null;
create index if not exists events_user_deleted_idx
  on public.events(user_id, deleted_at);

alter table public.events drop constraint if exists events_no_scheduled_overlap;
alter table public.events
  add constraint events_no_scheduled_overlap
  exclude using gist (
    user_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (status = 'scheduled' and deleted_at is null);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Đoạn chat mới' check (char_length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.conversations (id, user_id, title, created_at, updated_at)
select
  messages.conversation_id,
  messages.user_id,
  left(coalesce(
    min(messages.content) filter (where messages.role = 'user'),
    'Đoạn chat mới'
  ), 100),
  min(messages.created_at),
  max(messages.created_at)
from public.chat_messages as messages
group by messages.conversation_id, messages.user_id
on conflict (id) do nothing;

alter table public.chat_messages
  drop constraint if exists chat_messages_conversation_id_fkey;
alter table public.chat_messages
  add constraint chat_messages_conversation_id_fkey
  foreign key (conversation_id) references public.conversations(id) on delete cascade;

create index if not exists conversations_user_updated_idx
  on public.conversations(user_id, updated_at desc);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

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

grant select, insert, update, delete on public.conversations to authenticated;
