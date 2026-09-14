create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

grant select, insert on public.room_members to authenticated;
alter table public.room_members enable row level security;
create policy "members can read their memberships" on public.room_members for select to authenticated using (user_id = (select auth.uid()));
create policy "users can join active rooms" on public.room_members for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.rooms r where r.id = room_id and r.is_active = true and r.expires_at > now()));

create or replace function public.join_room(p_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_room_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into v_room_id from public.rooms where code = lower(trim(p_code)) and is_active = true and expires_at > now() limit 1;
  if v_room_id is null then raise exception 'room not found or expired'; end if;
  insert into public.room_members(room_id, user_id) values (v_room_id, auth.uid()) on conflict do nothing;
  return v_room_id;
end;
$$;
revoke execute on function public.join_room(text) from public;
grant execute on function public.join_room(text) to authenticated;

drop policy if exists "authenticated users can read active rooms" on public.rooms;
drop policy if exists "authenticated users can create their own rooms" on public.rooms;
drop policy if exists "room hosts can update their rooms" on public.rooms;
create policy "authenticated users can create their own rooms" on public.rooms for insert to authenticated with check (host_user_id = (select auth.uid()));
create policy "room members can read active rooms" on public.rooms for select to authenticated using (is_active = true and expires_at > now() and exists (select 1 from public.room_members m where m.room_id = rooms.id and m.user_id = (select auth.uid())));
create policy "room hosts can update their rooms" on public.rooms for update to authenticated using (host_user_id = (select auth.uid())) with check (host_user_id = (select auth.uid()));

drop policy if exists "authenticated users can create room events" on public.room_events;
drop policy if exists "authenticated users can read room events" on public.room_events;
create policy "room members can create room events" on public.room_events for insert to authenticated with check (actor_user_id = (select auth.uid()) and exists (select 1 from public.room_members m where m.room_id = room_events.room_id and m.user_id = (select auth.uid())) and exists (select 1 from public.rooms r where r.id = room_events.room_id and r.is_active = true and r.expires_at > now()));
create policy "room members can read room events" on public.room_events for select to authenticated using (exists (select 1 from public.room_members m where m.room_id = room_events.room_id and m.user_id = (select auth.uid())));
