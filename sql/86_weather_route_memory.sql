-- sql/86_weather_route_memory.sql
-- Route memory: stores exact weather station sets matched on real /ferdalagid calculations.
-- /vedrid uses this to filter its map to exactly the stations seen on a computed trip,
-- with no approximate corridor or kilometer-radius guessing.
--
-- Two tables:
--   weather_route_memory_routes   — one row per unique route (normalized from + to + variant)
--   weather_route_memory_stations — station rows linked to a route, one per provider station
--
-- Privacy guarantees:
--   - No user ID stored
--   - No raw street addresses (only normalized public place keys/labels)
--   - No raw Google route geometry, steps, duration, or distance
--   - No raw Google place IDs
--   - Only provider station IDs and normalized place labels
--
-- !! DO NOT RUN without explicit Stebbi approval !!
-- Service-role writes only. No anon or authenticated access.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.weather_route_memory_stations;
--   DROP TABLE IF EXISTS public.weather_route_memory_routes;

begin;

-- ── Routes table ───────────────────────────────────────────────────────────────
-- One row per unique route_key (normalized from + to + variant combination).
-- route_key format: '{from_place_key}--{to_place_key}--{route_variant_key}'

create table if not exists public.weather_route_memory_routes (
  id                   uuid        primary key default gen_random_uuid(),
  route_key            text        not null,
  from_place_key       text        not null,
  from_place_label     text        not null,
  to_place_key         text        not null,
  to_place_label       text        not null,
  route_variant_key    text        not null default 'default',
  route_variant_label  text,
  source               text        not null default 'ferdalagid',
  usage_count          integer     not null default 1,
  first_seen_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint weather_route_memory_routes_route_key_unique unique (route_key),
  constraint weather_route_memory_routes_source_check
    check (source in ('ferdalagid'))
);

comment on table public.weather_route_memory_routes is
  'Normalized route pairs recorded from /ferdalagid trip calculations. No user IDs or raw addresses.';

-- ── Stations table ─────────────────────────────────────────────────────────────
-- One row per (route, provider, station_id) — ordered by route_order (distance from origin).

create table if not exists public.weather_route_memory_stations (
  route_id               uuid        not null
    references public.weather_route_memory_routes(id) on delete cascade,
  provider               text        not null,
  station_id             text        not null,
  station_name           text,
  route_order            integer     not null,
  distance_from_origin_m integer,
  distance_from_route_m  integer,
  route_fraction         double precision,
  first_seen_at          timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  constraint weather_route_memory_stations_pk
    primary key (route_id, provider, station_id),
  constraint weather_route_memory_stations_provider_check
    check (provider in ('vedurstofan', 'vegagerdin'))
);

comment on table public.weather_route_memory_stations is
  'Weather station IDs matched to a route, ordered by position along the route.';

-- ── Indexes ────────────────────────────────────────────────────────────────────

-- Primary lookup: from + to key pair, most recent first
create index if not exists idx_wrmr_place_keys
  on public.weather_route_memory_routes (from_place_key, to_place_key, last_seen_at desc);

-- Station rows ordered along a route
create index if not exists idx_wrms_order
  on public.weather_route_memory_stations (route_id, provider, route_order);

-- Cross-provider station lookup (which routes include a given station)
create index if not exists idx_wrms_provider_station
  on public.weather_route_memory_stations (provider, station_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- No anon or authenticated policies — service_role bypasses RLS by default.

alter table public.weather_route_memory_routes  enable row level security;
alter table public.weather_route_memory_stations enable row level security;

revoke all on public.weather_route_memory_routes  from public;
revoke all on public.weather_route_memory_routes  from anon;
revoke all on public.weather_route_memory_routes  from authenticated;

revoke all on public.weather_route_memory_stations from public;
revoke all on public.weather_route_memory_stations from anon;
revoke all on public.weather_route_memory_stations from authenticated;

grant select, insert, update, delete
  on public.weather_route_memory_routes  to service_role;

grant select, insert, update, delete
  on public.weather_route_memory_stations to service_role;

commit;
