# 2026-07-19 05:47 - TODO 086 v539 - Codex: v538 review + route-memory implementation handoff

Created: 2026-07-19 05:47
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

v538 er í lagi sem lítil polish/hardening breyting, en það er eitt UX-edge case sem þarf að hafa með næsta skrefi: empty-filter hintið má ekki rugla saman vind-filter og leiðar-filter.

Næsta stóra framkvæmd er að breyta `/vedrid` frá grófri corridor-nálgun yfir í route-memory:

- `/ferdalagid` reiknar leiðina eins og áður.
- Þegar leið hefur verið reiknuð vistum við normalized `Frá`/`Til` og nákvæman lista af þeim Veðurstofu- og Vegagerðarstöðvum sem komu upp á þessari reiknuðu leið.
- `/vedrid` notar síðan þessa töflu til að sía kortið á nákvæmlega þessar stöðvar þegar notandi velur sama normalized `Frá`/`Til`.
- Engin kílómetra-giskun, enginn broad corridor, engin Google Routes köll á `/vedrid` fyrir þessa bráðabirgðasíu.

---

## Review á v538

### Findings

1. **Medium: empty-filter hintið notar `marker.visible`, sem inniheldur líka route filter**

   Í [WeatherOverviewClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/WeatherOverviewClient.tsx:458>) er `allMarkersHidden` skilgreint sem “status filter active but every marker hidden”. En checkið í [WeatherOverviewClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/WeatherOverviewClient.tsx:464>) notar `activeLayer.markers.every(m => !m.visible)`.

   `marker.visible` er ekki bara vind-status filter. Það inniheldur líka route filter, því marker visibility er byggt á bæði:

   - route filter (`vedurstofanRouteFilterIds` / `vegagerdinRouteFilterIds`)
   - status filter (`visibleStatuses`)

   Afleiðing: þegar route-sía felur allt, getur UI birt “Engin stöð fellur undir virku síurnar. Sýna allt”, en `Sýna allt` hreinsar aðeins `visibleStatuses`, ekki route-síuna. Þá getur notandi smellt og kortið helst tómt.

   Þetta er sérstaklega mikilvægt núna þar sem næsta skref er nákvæm route-memory sía á `/vedrid`.

   **Fix í næsta skrefi:** rename-a eða skipta þessu í tvö aðskilin states:

   - `allMarkersHiddenByStatusFilter`: route-filtered candidate set exists, but active wind-status pills hide all of it.
   - `routeLensHasNoStations`: route-memory lookup resolved/missed/has no stations for active provider.

   `Sýna allt` á aðeins að birtast fyrir fyrra tilvikið. Ef route-memory skilar engum stöðvum á að sýna route-specific skilaboð, t.d. “Engar stöðvar eru skráðar á þessari leið enn. Prófaðu Ferðalagið.”

2. **Low: inline `Sýna allt` er secondary tap target**

   Þetta blokkerar ekki, því pillan `Sýna allt` er líka til staðar. En Design.md minnir á touch targets og mobile-first app-upplifun. Ef við snertum þetta svæði í næsta skrefi er betra að hafa empty-state action sem sama pill/button component frekar en pínulítinn textalink sem aðal leið út.

### Staðfestingar sem Codex keyrði

```txt
npm run type-check
exit 0

npm run test:run -- lib/__tests__/windObservationStatus.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
exit 0
4 test files passed
106 tests passed
```

### Release stance fyrir v538 eitt og sér

v538 er ekki með SQL, auth eða RLS breytingar og prófin eru græn. Ég myndi ekki stoppa útgáfu út af v538 ef Stebbi vill gefa hana út, en þar sem við erum strax að fara í stærra route-memory skref er best að laga `allMarkersHidden` conflation þar.

---

## Framkvæmdarhandoff til Claude Code

### Skilningur á samþykki

Stebbi hefur samþykkt að fara í framkvæmd sem krefst SQL migration og bað Codex um handoff.

Þetta handoff heimilar Claude Code, ef Stebbi sendir það með `Workflow`, að:

- skrifa nýja SQL migration skrá
- skrifa tengdan kóða til að nota migrationina
- uppfæra tests og docs/handoff

Þetta heimilar ekki:

- að keyra SQL migration
- að keyra Supabase breytingu á production eða local DB nema Stebbi biðji sérstaklega um það
- commit
- push
- deploy
- Vercel/env/secrets breytingar

Claude Code á að stoppa og skila handoff eftir framkvæmd. Stebbi keyrir migration síðar með sérstöku samþykki.

---

## Product decision / ný sannleikslína

Núverandi `/vedrid` route lens notar `ROUTE_FAMILIES` og `filterStationIdsForRouteLens()` með broad corridor. Þetta var ágætis brú, en er ekki lengur það sem Stebbi vill.

Ný regla:

1. `/ferdalagid` er eini staðurinn sem reiknar raunverulega leið.
2. Í hvert skipti sem `/ferdalagid` skilar reiknaðri leið, eigum við að vista provider-neutral route-memory observation í Supabase.
3. Observation inniheldur:
   - normalized `from` key/label
   - normalized `to` key/label
   - safe route variant key/label ef við höfum route option
   - provider station IDs sem komu upp á þeirri reiknuðu leið
   - provider type: `vedurstofan` eða `vegagerdin`
   - route order / distance-from-origin fyrir stöðvarnar
4. `/vedrid` flettir upp í route-memory þegar notandi velur `Frá` og `Til`.
5. Ef memory hit: `/vedrid` síar kortið á nákvæmlega þær station IDs sem eru í route-memory, provider fyrir provider.
6. Ef memory miss: `/vedrid` má ekki giska. Sýna hlutlaust “ekki til í hraðskjánum enn” og CTA í `Ferðalagið`.

Ekki nota kílómetra-nálgun eða `ROUTE_FAMILIES` corridor sem fallback þegar route-memory missar. Það myndi endurvekja vandamálið sem Stebbi er að taka út.

---

## SQL / migration plan

### Ekki nota `sql/85` sem production migration

[sql/85_route_observation_aggregate.sql](</c/Users/Lenovo/Documents/vaktirnar/sql/85_route_observation_aggregate.sql:1>) er merkt:

```sql
-- !! DRAFT — DO NOT RUN !!
```

Ekki segja Stebba að keyra 85. Ekki gera implementation sem krefst þess að 85 hafi verið keyrð.

### Búa til nýja migration

Codex tillaga: `sql/86_weather_route_memory.sql`

Ef Claude Code telur að réttara sé að breyta 85 úr draft yfir í production-ready migration, stoppa og skila spurningu. Sjálfgefið: ný 86, 85 látin ósnert.

### Schema markmið

Nota tvær töflur, eins og Stebbi lýsti:

1. Route rows: normalized `Frá`/`Til` + variant/meta.
2. Station rows: allar stöðvar sem komu upp á þessari route row, provider fyrir provider.

Suggested schema, má fínstilla:

```sql
create table if not exists public.weather_route_memory_routes (
  id uuid primary key default gen_random_uuid(),
  route_key text not null unique,
  from_place_key text not null,
  from_place_label text not null,
  to_place_key text not null,
  to_place_label text not null,
  route_variant_key text not null default 'default',
  route_variant_label text,
  source text not null default 'ferdalagid',
  usage_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in ('ferdalagid'))
);

create table if not exists public.weather_route_memory_stations (
  route_id uuid not null references public.weather_route_memory_routes(id) on delete cascade,
  provider text not null,
  station_id text not null,
  station_name text,
  route_order integer not null,
  distance_from_origin_m integer,
  distance_from_route_m integer,
  route_fraction double precision,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (route_id, provider, station_id),
  check (provider in ('vedurstofan', 'vegagerdin'))
);
```

Indexes:

- unique on `route_key`
- lookup index on `(from_place_key, to_place_key, last_seen_at desc)`
- station index on `(route_id, provider, route_order)`
- optional `(provider, station_id)`

Security:

- `REVOKE ALL FROM PUBLIC, anon, authenticated`
- `GRANT SELECT, INSERT, UPDATE, DELETE TO service_role`
- Enable RLS, but no anon/authenticated policies. Use service-role server API only.
- No user_id.
- No raw street address.
- No raw Google polyline, steps, duration, distance or route response content.

Rollback:

- Drop station table first, then route table.
- If adding functions/triggers, drop them in rollback comments.

### Upsert behavior

Implementation can use direct service-role queries or SQL functions. Either is fine.

Required semantics:

- Upsert route row by `route_key`.
- Increment `usage_count`.
- Update `last_seen_at`.
- Replace station rows for that route/provider+route variant with latest station set.
- Preserve `first_seen_at` when existing station row remains if easy; otherwise okay to replace rows if documented.

Important: do not silently union stations from multiple route variants into one row. If two variants exist for same `from/to`, they need separate `route_variant_key` or a clear variant selection strategy.

---

## Place normalization / privacy

Current [routeObservation.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/iceland-routes/routeObservation.ts:49>) maps Reykjavík, Garðabær, Hafnarfjörður, Kópavogur etc. all to `hofudborgarsvaedi`.

That is privacy-safe, but possibly too coarse for this new table because Stebbi explicitly mentioned “Melás 8 verður Garðabær”.

Claude Code should add a reusable normalization helper, probably in `lib/iceland-routes/routePlaceNormalization.ts`, that returns a safe public place key/label:

- Use known locality/municipality/settlement label when available.
- Never store street address, house number, raw query, or full formatted address.
- If we cannot normalize safely, skip route-memory write.
- Keep tests for:
  - `Melás 8, Garðabær` → `gardabaer` / `Garðabær` if enough data is available
  - `Reykjavík` → `reykjavik`
  - `Akureyri` → `akureyri`
  - unrecognized private-looking address without locality → `null`

If only `origin.name` is available and it contains a private address, do not store it.

---

## Server write path

Current write is client-side localStorage in [FerdalagidClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/app/auth-mvp/vedrid/FerdalagidClient.tsx:722>):

```ts
const obs = buildRouteObservation(...)
if (obs) recordRouteObservation(obs)
```

This is not enough for the new requirement because `/vedrid` needs shared memory across users/sessions/devices.

### New intended write path

Record route-memory server-side inside `/api/teskeid/weather/travel` after route calculation succeeds.

The best current location is after `vedurstofanLayer` is built and before returning response in [app/api/teskeid/weather/travel/route.ts](</c/Users/Lenovo/Documents/vaktirnar/app/api/teskeid/weather/travel/route.ts:417>).

Existing Veðurstofan matching already happens at [app/api/teskeid/weather/travel/route.ts](</c/Users/Lenovo/Documents/vaktirnar/app/api/teskeid/weather/travel/route.ts:262>) using `matchProviderPointsToRoute()` and `DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M`.

Add Vegagerðin matching there too:

- Read current Vegagerðin data via `readVegagerdinCurrentWithHistoryFallback()`.
- If unavailable, record only Veðurstofan station IDs.
- If available, run `matchProviderPointsToRoute()` over `payload.measurements`.
- Use `routeGeometry.providerMatchingPoints ?? routeGeometry.points`.
- Store `route_order`, `distanceFromOriginM`, `distanceM`, `routeFraction`.

The write must be:

- best-effort
- awaited or otherwise reliably completed before response ends
- fully caught so travel calculation never fails because route-memory write failed
- logged without leaking raw addresses or station payload

Do not make this a public client POST where users can send arbitrary station IDs. If a separate API route is created, it must validate everything server-side and use service role; preferred first version is internal server helper called from the travel route.

---

## Lookup path for `/vedrid`

Create a read API, e.g.:

`POST /api/teskeid/weather/route-memory/lookup`

Input:

- `from` and `to` selected place objects or safe labels
- no raw coordinates required for lookup if route-memory suggestions are used

Output:

```ts
type WeatherRouteMemoryLookupResponse =
  | { status: 'miss'; fromPlaceKey?: string; toPlaceKey?: string }
  | {
      status: 'resolved'
      routeKey: string
      routeLabel: string
      variants: Array<{
        routeVariantKey: string
        routeVariantLabel: string | null
        lastSeenAt: string
        usageCount: number
        vedurstofanStationIds: string[]
        vegagerdinStationIds: string[]
      }>
    }
```

Provider access:

- Respect base weather access.
- If Veðurstofan provider is access-restricted for caller, do not return Veðurstofan station IDs.
- If Vegagerðin provider is access-restricted for caller, do not return Vegagerðin station IDs.
- It is okay if UI later ignores provider IDs for a layer that did not load, but the API should not leak gated provider station lists.

Variant behavior:

- If exactly one variant exists, use it.
- If multiple variants exist, do not silently union them unless Stebbi explicitly accepts that. Preferred: return variants and let UI pick most recent/highest-usage first, then later add selector.
- For this first implementation, a reasonable compromise is default to most recent route variant and include enough response metadata to add selector next.

Reverse direction:

- Exact direction first.
- If Claude Code wants to support reverse-direction fallback, make it explicit and tested. Do not quietly merge reverse direction without documenting route order semantics.

---

## `/vedrid` client behavior

Replace current route-lens filtering as the source of truth.

Current broad filtering:

- [WeatherOverviewClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/WeatherOverviewClient.tsx:315>) computes `vedurstofanRouteFilterIds` via `filterStationIdsForRouteLens`.
- [WeatherOverviewClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/WeatherOverviewClient.tsx:328>) computes `vegagerdinRouteFilterIds` the same way.

New behavior:

- When no `Frá`/`Til`: no route station filter.
- When `Frá` and `Til` are selected: call route-memory lookup.
- If resolved:
  - `vedurstofanRouteFilterIds = new Set(response.activeVariant.vedurstofanStationIds)`
  - `vegagerdinRouteFilterIds = new Set(response.activeVariant.vegagerdinStationIds)`
  - Do not apply kilometer/corridor fallback.
  - Show `Bráðabirgðaniðurstöður` because this is route-memory, not fresh route calculation.
- If miss:
  - do not filter the map
  - show cache miss text + CTA into `Ferðalagið`
  - keep the sessionStorage draft flow so `Ferðalagið` opens with same from/to

Route-memory suggestions:

- If feasible in this same pass, make `/vedrid` Frá/Til dropdown prefer known route-memory places/routes instead of Google autocomplete.
- If that is too large, keep current selector for now, but route-memory lookup must be the only map-filter source after selection.
- In either case, avoid adding Google Routes calls to `/vedrid`.

Fix v538 empty-state edge case in same pass:

- `Sýna allt` only clears status filters.
- If route-memory returns no stations for active provider, show route-memory/no-stations copy, not status-filter copy.

---

## Tests

Add focused tests. Do not rely only on browser checks.

Minimum test set:

1. SQL migration test
   - new tables exist
   - grants are service_role only
   - RLS enabled
   - no anon/authenticated grants
   - rollback comment exists

2. Place normalization tests
   - known places normalize
   - private address without locality does not store
   - `Melás 8, Garðabær` type input maps to `gardabaer` when locality is present

3. Route-memory writer tests
   - upserts route row
   - stores Veðurstofan station rows in route order
   - stores Vegagerðin station rows in route order
   - write failure is swallowed by travel route
   - does not store raw address / raw route geometry

4. Lookup tests
   - exact from/to hit returns exact station IDs
   - miss returns `status: 'miss'`
   - multiple variants are not silently unioned
   - provider gating strips provider-specific station IDs

5. `/vedrid` pure/client tests where possible
   - route-memory resolved filters by exact IDs
   - route-memory miss does not filter map
   - status-filter empty hint does not appear for route-filter empty state

Recommended existing commands:

```txt
npm run type-check
npm run test:run -- lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/overview-route-draft.test.ts
```

Add new route-memory tests to that list.

---

## Migration instructions for Stebbi

Claude Code must include a clear “SQL status” section in the next handoff.

Expected after implementation:

- New migration file written: likely `sql/86_weather_route_memory.sql`
- SQL NOT run
- 85 still DO NOT RUN

What Stebbi should run later, only after Codex review:

1. Run the new route-memory migration only, e.g. `sql/86_weather_route_memory.sql`.
2. Do not run the whole `sql/` folder.
3. Do not run `sql/85_route_observation_aggregate.sql`.
4. `82`, `83`, `84` are separate concerns:
   - `82`: user preference storage, not required for route-memory lookup unless saving thresholds is being tested.
   - `83`: Vegagerðin measurement history, recommended for stable Vegagerðin data, but route-memory migration should not hard-depend on it.
   - `84`: Yr/met.no point history, not required for this route-memory station filtering.
   - `85`: draft, do not run.

If Claude Code introduces a dependency on 83, it must say so explicitly and explain why. Preferred: route-memory write works with current Vegagerðin cache and degrades gracefully if history is unavailable.

---

## Route intelligence check

- Route/landshluti: all `/ferdalagid` routes and `/vedrid` quick route filtering.
- New knowledge belongs in `IcelandRoadmap.md` and `lib/iceland-routes/`.
- Provider-neutral requirement: route-memory table stores provider type + station IDs; not Google-specific route content.
- Needed domain additions:
  - route-memory place normalization
  - route-memory schema
  - route-memory writer/lookup helpers
  - station-set exact filter for `/vedrid`
- Privacy:
  - aggregate rows only
  - no user ID
  - no raw street address
  - no raw Google geometry/steps/duration/distance
  - station IDs and normalized public place labels only
- IcelandRoadmap.md should be updated: current R5 “curated corridor route lens” is now transitional; new R4/R5 source should be route-memory station sets from `/ferdalagid`.

---

## Design.md check

This work touches `/vedrid` form/filter/map behavior, so Design.md applies.

Keep:

- mobile-first form layout
- inputs at 16px or higher on mobile
- route lookup loading/pending state visible
- no horizontal overflow in Frá/Til row
- clear empty/miss state
- `Ferðalagið` CTA obvious but not blocking map exploration
- no tiny text link as the only way out of an empty state

Use existing Teskeið tokens/components where possible.

---

## Localhost checks for Stebbi

After Claude Code implements but before any release:

1. **Before running SQL**
   - Open `/vedrid`.
   - Expected: page should not crash if route-memory table is missing.
   - Selecting Frá/Til may show route-memory unavailable/miss, but normal overview map should still work.

2. **After Stebbi explicitly runs the new route-memory migration**
   - Open `/auth-mvp/vedrid/ferdalagid`.
   - Reikna route, e.g. Reykjavík → Akureyri.
   - Confirm travel result still works and no user-visible route-memory error appears.

3. **Back on `/vedrid`**
   - Select same normalized Frá/Til.
   - Expected: `/vedrid` filters to exactly the station IDs recorded from `/ferdalagid`, not broad corridor guesses.
   - Confirm Veðurstofan and Vegagerðin both respect the same route-memory result if both providers have station rows.

4. **Miss flow**
   - Select a route that has not been calculated in `/ferdalagid`.
   - Expected: no map guessing, no broad station cloud. UI says route is not in quick view yet and offers `Ferðalagið`.

5. **Filter edge**
   - Apply status filters so visible route stations disappear.
   - Expected: status empty hint can show and `Sýna allt` actually restores station visibility.
   - If route-memory itself has no stations, expected: route-specific empty/miss message, not `Sýna allt`.

6. **Privacy sanity**
   - Check any visible route-memory debug/UI text.
   - Expected: no full street address like “Melás 8” shown or stored as route-memory label unless it has been normalized to safe place label like “Garðabær”.

Do not test SQL casually on production. Running migration requires separate explicit Stebbi approval.

---

## Óvissa / þarf að staðfesta

- Exact shape of route variant IDs depends on current route option IDs/labels. Claude Code must inspect `RouteOption` types and avoid storing raw Google route content.
- Vegagerðin station matching in `/ferdalagid` may need a small provider-neutral helper so it does not duplicate Veðurstofan matching code.
- If `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`, lookup endpoint must not leak Vegagerðin station IDs to unauthorized users.
- The desired granularity for normalization (`Garðabær` vs `Höfuðborgarsvæðið`) should lean toward the safest useful public place label. If Claude Code cannot infer locality safely, skip route-memory write rather than store raw address.

---

## Niðurstaða

v538 is technically clean enough, but next implementation should fix the route-filter/status-filter empty-state confusion.

The route-memory work should replace the current `/vedrid` corridor lens as the source of station filtering. `/ferdalagid` writes exact provider station sets; `/vedrid` reads those sets. That gives Stebbi the behavior he described: no approximate kilometer logic on `/vedrid`, just the exact stations that have previously appeared on the real trip calculation.
