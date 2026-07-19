-- !! DRAFT — DO NOT RUN !!
-- This migration has not been reviewed for production use.
-- Required before running:
--   - Transaction wrapper and rollback plan reviewed by Stebbi
--   - RLS / grants / service-role policy decided
--   - Column set confirmed against final RouteObservation type (vegagerdinStationIds etc.)
--   - All writes confirmed to go via service-role API route only (no anon writes)
--   - parity with localStorage shape in lib/iceland-routes/routeObservation.ts verified
-- DO NOT RUN without Stebbi's explicit permission.

-- Route observation aggregate — provider-neutral derived route knowledge.
-- Stores normalized ASCII area keys and matched station IDs only.
-- Never stores raw addresses, raw Google route content, or user identity.
--
-- First version: aggregate only (no per-user rows, no raw query text).
-- Privacy: no user_id, no exact street addresses, no raw from/to query text.

begin;

create table if not exists public.route_observation_aggregate (
  route_family_key        text        primary key,  -- ASCII slug e.g. 'hofudborgarsvaedi--akureyri'
  from_area_key           text        not null,
  from_area_label         text        not null,
  to_area_key             text        not null,
  to_area_label           text        not null,
  route_family_label      text        not null,     -- e.g. 'Höfuðborgarsvæðið → Akureyri'
  vedurstofan_station_ids text[]      not null default '{}',
  vegagerdin_station_ids  text[]      not null default '{}',
  route_segment_ids       text[]      not null default '{}',
  route_caution_ids       text[]      not null default '{}',
  usage_count             integer     not null default 1,
  last_seen_at            timestamptz not null default now()
);

comment on table public.route_observation_aggregate is
  'Aggregate route-family observations from successful /ferdalagid calculations. '
  'Only normalized area keys and matched station/segment/caution IDs — '
  'no raw addresses, no user identity, no raw Google route content.';

-- Upsert: increment count, refresh all ID arrays and timestamp on each new observation.
create or replace function public.upsert_route_observation_aggregate(
  p_route_family_key        text,
  p_from_area_key           text,
  p_from_area_label         text,
  p_to_area_key             text,
  p_to_area_label           text,
  p_route_family_label      text,
  p_vedurstofan_station_ids text[],
  p_vegagerdin_station_ids  text[],
  p_route_segment_ids       text[],
  p_route_caution_ids       text[]
) returns void language plpgsql as $$
begin
  insert into public.route_observation_aggregate (
    route_family_key, from_area_key, from_area_label,
    to_area_key, to_area_label, route_family_label,
    vedurstofan_station_ids, vegagerdin_station_ids,
    route_segment_ids, route_caution_ids,
    usage_count, last_seen_at
  ) values (
    p_route_family_key, p_from_area_key, p_from_area_label,
    p_to_area_key, p_to_area_label, p_route_family_label,
    p_vedurstofan_station_ids, p_vegagerdin_station_ids,
    p_route_segment_ids, p_route_caution_ids,
    1, now()
  )
  on conflict (route_family_key) do update set
    vedurstofan_station_ids = excluded.vedurstofan_station_ids,
    vegagerdin_station_ids  = excluded.vegagerdin_station_ids,
    route_segment_ids       = excluded.route_segment_ids,
    route_caution_ids       = excluded.route_caution_ids,
    usage_count             = public.route_observation_aggregate.usage_count + 1,
    last_seen_at            = now();
end;
$$;

commit;
