create table if not exists public.room_share_permissions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approved boolean not null default false,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_share_permissions_room_idx on public.room_share_permissions(room_id);

alter table public.room_share_permissions enable row level security;

drop policy if exists "members can read own share permission" on public.room_share_permissions;
create policy "members can read own share permission" on public.room_share_permissions
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "hosts can read room share permissions" on public.room_share_permissions;
create policy "hosts can read room share permissions" on public.room_share_permissions
for select to authenticated
using (exists (select 1 from public.rooms r where r.id = room_share_permissions.room_id and r.host_user_id = (select auth.uid())));

drop policy if exists "members can request screen sharing" on public.room_share_permissions;
create policy "members can request screen sharing" on public.room_share_permissions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and approved = false
  and exists (select 1 from public.room_members m where m.room_id = room_share_permissions.room_id and m.user_id = (select auth.uid()))
);

drop policy if exists "members can refresh their request" on public.room_share_permissions;
create policy "members can refresh their request" on public.room_share_permissions
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and approved = false);

drop policy if exists "hosts can approve screen sharing" on public.room_share_permissions;
create policy "hosts can approve screen sharing" on public.room_share_permissions
for update to authenticated
using (exists (select 1 from public.rooms r where r.id = room_share_permissions.room_id and r.host_user_id = (select auth.uid())))
with check (exists (select 1 from public.rooms r where r.id = room_share_permissions.room_id and r.host_user_id = (select auth.uid())));

grant select, insert, update on public.room_share_permissions to authenticated;

create or replace function public.request_screen_share(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = uid) then
    raise exception 'not a room member';
  end if;
  insert into public.room_share_permissions(room_id, user_id, approved, requested_at, updated_at)
  values (p_room_id, uid, false, now(), now())
  on conflict (room_id, user_id) do update set approved = false, requested_at = now(), updated_at = now();
  return true;
end;
$$;

create or replace function public.set_screen_share_permission(p_room_id uuid, p_user_id uuid, p_approved boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.rooms where id = p_room_id and host_user_id = uid) then
    raise exception 'only the host can change sharing permission';
  end if;
  insert into public.room_share_permissions(room_id, user_id, approved, updated_at)
  values (p_room_id, p_user_id, p_approved, now())
  on conflict (room_id, user_id) do update set approved = p_approved, updated_at = now();
  return true;
end;
$$;

grant execute on function public.request_screen_share(uuid) to authenticated;
grant execute on function public.set_screen_share_permission(uuid, uuid, boolean) to authenticated;
revoke execute on function public.request_screen_share(uuid) from public;
revoke execute on function public.set_screen_share_permission(uuid, uuid, boolean) from public;
