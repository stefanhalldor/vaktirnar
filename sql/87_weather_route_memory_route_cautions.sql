-- sql/87_weather_route_memory_route_cautions.sql
-- Adds route_caution_ids column to weather_route_memory_routes.
-- Stores caution IDs derived from /ferdalagid route option matching.
-- Prerequisite: sql/86_weather_route_memory.sql
--
-- Privacy: only route-option caution IDs are stored (e.g. 'trailer', 'oxi').
-- No raw Google geometry, route steps, user IDs, or raw addresses.
--
-- !! DO NOT RUN without explicit Stebbi approval !!
--
-- Rollback:
--   begin;
--   alter table public.weather_route_memory_routes drop column if exists route_caution_ids;
--   commit;

begin;

alter table public.weather_route_memory_routes
  add column if not exists route_caution_ids text[] not null default '{}';

comment on column public.weather_route_memory_routes.route_caution_ids is
  'Route caution IDs derived from /ferdalagid route option matching. No raw route geometry or user data.';

commit;
