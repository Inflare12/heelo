-- Keep maintenance/trigger functions out of the public Data API surface.
-- They remain callable by trusted database roles, but not by anon/authenticated clients.
revoke execute on function public.cleanup_expired_rooms() from public;
revoke execute on function public.touch_room_updated_at() from public;

grant execute on function public.cleanup_expired_rooms() to postgres;
grant execute on function public.touch_room_updated_at() to postgres;
