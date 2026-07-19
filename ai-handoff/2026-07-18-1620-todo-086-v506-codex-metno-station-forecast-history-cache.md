# 2026-07-18 16:20 - TODO 086 v506 - Codex handoff: met.no station forecast history cache

Created: 2026-07-18 16:20  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Mode: planning / SQL handoff only, no product code changes

## Stutt Mannamál

Þetta er framhald við:

- `ai-handoff/2026-07-18-1612-todo-086-v505-codex-prioritize-forecast-scrubber-yr-comparison.md`

Já, við ættum að búa til normaliseraða history/cache töflu fyrir met.no/Yr spágildi á sömu hnitum og Veðurstofustöðvarnar, áður en Yr-samanburðurinn verður að notendaupplifun.

Ástæðan: `weather_cache` geymir hrátt met.no payload eftir hnitum. Það er gott sem upstream-cache, en það er ekki gott product/query lag fyrir:

- 3-klst scrubber á `/vedrid`
- samanburð `Veðurstofan` vs `Yr` á sömu stöð
- sömu spátíma milli provider-a
- audit/history þegar við viljum vita hvað Yr sagði á sama tíma og Veðurstofan
- að forðast endurtekin met.no köll þegar notandi smellir á stöð eða hreyfir scrubber

## Recommendation

Claude Code ætti að skrifa nýja migration sem næsta lausa SQL númer:

- `sql/84_metno_point_forecasts_history.sql`

Migration á að búa til eina server-only product/history töflu fyrir met.no forecast rows á föstum provider-punktum. Í fyrsta fasa eru target-punktarnir Veðurstofustöðvar, en taflan má vera nógu almenn til að við getum síðar notað hana fyrir Vegagerðarstöðvar ef við viljum Yr-samanburð þar líka.

Ekki keyra migration. Skrifa hana aðeins.

## Why Not Just Use `weather_cache`

`sql/67_weather_cache.sql` er raw cache:

- `cache_key`
- `response_body`
- `expires_at`
- `last_modified`
- `fetched_at`

Það er rétt sem upstream-cache, en ef UI þarf að bera saman Veðurstofan/Yr á sama `forecast_time`, þá þurfum við structured rows. Annars endum við á að parse-a JSONB aftur og aftur, eða byggja samanburð á óskýru client-side payload-i.

Við erum þegar með sama mynstur fyrir Veðurstofuna:

- `sql/74_vedurstofan_product_tables.sql`
  - latest product tables
- `sql/77_vedurstofan_forecasts_history.sql`
  - history rows per `(station_id, atime, forecast_time)`

Met.no/Yr þarf sambærilegt product/history lag fyrir station-coordinate samanburð.

## Table Shape

Recommended table name:

```sql
public.metno_point_forecasts_history
```

Recommended columns:

```sql
target_type                 text NOT NULL,
target_id                   text NOT NULL,
target_name                 text,
target_lat                  numeric(9, 6) NOT NULL,
target_lon                  numeric(9, 6) NOT NULL,

metno_updated_at            timestamptz NOT NULL,
forecast_time               timestamptz NOT NULL,

paired_provider             text,
paired_provider_cycle_time  timestamptz,

wind_speed_ms               numeric(6, 2),
wind_direction_deg          numeric(6, 1),
temperature_c               numeric(5, 1),
precipitation_mm_per_hour   numeric(6, 2),
weather_symbol_code         text,

metno_cache_key             text,
expires_at                  timestamptz,
first_fetched_at            timestamptz NOT NULL DEFAULT now(),
last_fetched_at             timestamptz NOT NULL,
created_at                  timestamptz NOT NULL DEFAULT now(),
updated_at                  timestamptz NOT NULL DEFAULT now()
```

Recommended constraints:

```sql
CHECK (target_type IN ('vedurstofan_station'))
CHECK (paired_provider IS NULL OR paired_provider IN ('vedurstofan'))
PRIMARY KEY (target_type, target_id, metno_updated_at, forecast_time)
```

Why generic `target_type` instead of `station_id` only?

- It still solves the first use case: Yr at Veðurstofan station coordinates.
- It avoids creating a second near-identical Yr table later if we want Yr near Vegagerðin stations.
- It keeps the reusable product model: "met.no forecast at a fixed provider point".

Tradeoff:

- We do not get a simple FK to `vedurstofan_stations(station_id)` if the table is generic.
- That is acceptable in v1 because this is service-role only and written by trusted projector code.
- If Claude Code strongly prefers FK safety, an alternative is a Veðurstofan-specific table:
  - `public.metno_vedurstofan_station_forecasts_history`
  - `station_id text REFERENCES public.vedurstofan_stations(station_id)`
  - Same forecast columns.
- Codex preference: generic `metno_point_forecasts_history`, but keep the initial CHECK limited to `vedurstofan_station`.

## Indexes

Add indexes for the expected reads:

```sql
CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_target_cycle_idx
  ON public.metno_point_forecasts_history (
    target_type,
    target_id,
    paired_provider,
    paired_provider_cycle_time,
    forecast_time
  );

CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_forecast_time_idx
  ON public.metno_point_forecasts_history (forecast_time);

CREATE INDEX IF NOT EXISTS metno_point_forecasts_history_updated_at_idx
  ON public.metno_point_forecasts_history (metno_updated_at DESC);
```

Retention cleanup can use `metno_updated_at` or `last_fetched_at`. Use 14 days initially to match `vedurstofan_forecasts_history`.

## Access / RLS

Use the same safety model as weather cache/history:

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role`
- no RLS policies
- service role only

No anon/authenticated access. No client-side direct Supabase reads.

## Updated-at Trigger

Use shared trigger function:

```sql
public.teskeid_set_updated_at()
```

Same pattern as `sql/77_vedurstofan_forecasts_history.sql` and `sql/83_vegagerdin_measurements_history.sql`.

## How Rows Should Be Written Later

This migration only creates the table. A later implementation step should write rows like this:

1. Start with a small set of Veðurstofustöðvar:
   - selected station on `/vedrid`
   - route-scoped stations on `/vedrid/ferdalagid`
   - maybe visible/selected overview subset later
2. Fetch met.no through existing `lib/weather/metno.server.ts`.
3. Keep using `weather_cache` as raw upstream cache.
4. Parse the met.no forecast rows into normalized records.
5. Pair only rows whose `forecast_time` matches Veðurstofan forecast slots for that station.
6. Write normalized rows to `metno_point_forecasts_history`.

Do not fetch met.no for all 280 Veðurstofustöðvar on `/vedrid` page load.

## Pairing Rule

Initial rule should be strict:

- same target point
- same forecast valid time
- paired to the Veðurstofan cycle currently being compared when available

Recommended fields for pairing:

- `target_type = 'vedurstofan_station'`
- `target_id = vedurstofan.station_id`
- `forecast_time = vedurstofan.forecast_time`
- `paired_provider = 'vedurstofan'`
- `paired_provider_cycle_time = vedurstofan.atime`

If met.no does not have an exact forecast row for a Veðurstofan 3-hour slot, do not invent a row silently in the first pass. Skip it and log/return "comparison unavailable" for that slot. Nearest-neighbor pairing can be a later explicit decision.

## What This Does Not Do

This handoff does not ask Claude Code to:

- call met.no for all stations
- change `/vedrid` UI
- change the scrubber UI
- change `/ferdalagid` calculations
- expose the table to anon/authenticated users
- run SQL
- push, commit, deploy, or change env

It only prepares the DB/product-cache foundation for the Yr comparison phase.

## Tests To Add

Add static SQL migration tests in `lib/__tests__/sql-migration.test.ts` or the existing migration test area:

- file exists as `sql/84_metno_point_forecasts_history.sql`
- creates `public.metno_point_forecasts_history`
- enables RLS
- revokes from `PUBLIC, anon, authenticated`
- grants service_role only
- has primary key on `(target_type, target_id, metno_updated_at, forecast_time)`
- has target/cycle lookup index
- has updated_at trigger
- has rollback comment

No live Supabase tests. No migration execution.

## Suggested Prompt For Claude Code

```text
Workflow

Lestu og rýndu fyrst með gagnrýnum augum:
ai-handoff/2026-07-18-1612-todo-086-v505-codex-prioritize-forecast-scrubber-yr-comparison.md
ai-handoff/2026-07-18-1620-todo-086-v506-codex-metno-station-forecast-history-cache.md

Ef þú sérð blocking spurningar, stoppaðu og skilaðu handoff/review.

Ef ekkert blokkerar, framkvæmdu SQL-grunninn úr v506 sem afmarkað fyrsta skref fyrir Yr/met.no samanburð:
- skrifaðu migration `sql/84_metno_point_forecasts_history.sql`
- bættu við static migration tests
- ekki keyra migration
- ekki breyta Supabase production
- ekki commit-a, push-a eða deploy-a

Ef þú sérð að generic `metno_point_forecasts_history` er of óljóst eða hættulegt, stoppaðu og rökstuddu hvort Veðurstofan-specific tafla sé betri.

Eftir framkvæmd skaltu strax skila handoff með:
- hvaða SQL var skrifað
- hvaða RLS/grants áhrif eru
- hvort SQL var keyrt eða ekki
- hvaða tests voru keyrð og exit codes
- hvað er næsta skref í v505 scrubber/Yr comparison planinu
- Localhost checks for Stebbi
```

## Localhost Checks For Stebbi

Ef Claude Code skrifar bara migration og static tests:

1. Það er ekkert notendasýnilegt að prófa á localhost.
2. Stebbi á ekki að keyra SQL í Supabase fyrr en Codex hefur rýnt diffið.
3. Stebbi á sérstaklega að athuga í handoffi Claude Code:
   - að SQL hafi aðeins verið skrifað, ekki keyrt
   - að taflan sé service-role only
   - að RLS sé enabled
   - að engin anon/authenticated grants séu til staðar
   - að rollback sé skýr

Ef Claude Code bætir einnig við parser/writer í sama skrefi, þá þarf localhost check síðar að vera:

1. Opna `http://localhost:3004/vedrid`.
2. Velja Veðurstofustöð.
3. Staðfesta að engin viðbótar met.no/Yr gögn birtist fyrr en station detail eða comparison UI biður um þau.
4. Staðfesta að page load kalli ekki Yr fyrir allar 280 stöðvar.
5. Staðfesta að scrubber-hreyfing kalli ekki met.no aftur ef gögn eru þegar í cache/history.

## Óvissa / Þarf Að Staðfesta

- Hvort met.no `properties.meta.updated_at` á alltaf að vera til staðar í payload. Ef ekki, þarf öruggt fallback áður en `metno_updated_at` er `NOT NULL`.
- Hvort við viljum strict exact-time pairing eingöngu eða nearest-row fallback seinna. Codex mælir með strict í fyrsta pass.
- Hvort generic target table sé betri en Veðurstofan-specific FK table. Codex mælir með generic table með þröngum CHECK í v1, vegna þess að Vegagerðin gæti nýtt sama mynstur síðar.

