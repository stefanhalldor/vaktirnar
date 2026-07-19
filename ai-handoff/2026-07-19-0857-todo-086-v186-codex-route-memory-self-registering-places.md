# 2026-07-19 08:57 - TODO 086 v186 - Route-memory self-registering places

Created: 2026-07-19 08:57
Timezone: Atlantic/Reykjavik

## Context

Follow-up after:

- `2026-07-19-0850-todo-086-v185-claude-v184-no-auto-open-siglufjordur-refetch`
- Stebbi feedback: adding `Siglufjörður` as a known route is not a good long-term approach. We need a better route-memory place model that works without manually cleaning up every town.

## Short answer

Stebbi is right.

Adding Siglufjörður to the whitelist is acceptable as a tiny hotfix, but it is not the architecture we want. The long-term route-memory model should self-register public endpoint labels from real `/ferdalagid` calculations, instead of requiring every possible Icelandic place to be pre-added to `routePlaceNormalization.ts` and `routePlaces.ts`.

## What is wrong with the current model

Current route-memory endpoint logic has two hidden assumptions:

1. `normalizePlaceForMemory()` must recognize the place from a hardcoded list.
2. `RouteMemoryPicker` needs `getCanonicalPlace(place.key)` coordinates to create a `RouteDraftPlace`.

This means a valid real route can fail to become visible on `/vedrid` just because the destination is missing from our manual registry.

Even worse: `RouteMemoryPicker.tsx:235-242` falls back to Reykjavík coordinates when a key is not in `routePlaces.ts`:

```ts
lat: canonical?.lat ?? 64.1355,
lon: canonical?.lon ?? -21.8954,
```

That is a smell. A route-memory place that exists in Supabase should not need a hand-maintained coordinate entry to participate in `/vedrid`.

## Better model

Split the concept into two separate things:

1. Route-memory endpoint identity:
   - `{ place_key, place_label }`
   - derived from the actual `/ferdalagid` selected/geocoded endpoint
   - stored privacy-safely
   - not dependent on a hardcoded known-place list

2. Map filtering:
   - exact station IDs from `weather_route_memory_stations`
   - no coordinate guessing for route selection
   - for single-place selection, derive endpoint station IDs from route-memory itself, not from canonical place coordinates

## Proposed implementation

### 1. Replace whitelist-only normalization with generic public-place extraction

Keep `routePlaceNormalization.ts`, but change its role.

Instead of “return null unless this town is in PLACE_NORM_ENTRIES”, do:

1. Prefer structured place/locality fields if available from our geocoding/place resolution pipeline.
2. Fallback to a formatted-address parser:
   - split by comma
   - remove `Iceland` / `Ísland`
   - strip postal-code prefixes, e.g. `580 Siglufjörður` -> `Siglufjörður`
   - ignore street-like parts containing house numbers, e.g. `Melás 8`
   - choose the first public locality-like part
3. Fallback to `displayName` if it is not street-like and not too broad.
4. Generate key by slugifying the label:
   - lowercase
   - normalize Icelandic diacritics consistently
   - remove punctuation
   - collapse whitespace/hyphens

Manual entries can remain only as aliases/exceptions, not as the gatekeeper.

Examples:

- `Melás 8`, `Melás 8, Garðabær, Iceland` -> `gardabaer` / `Garðabær`
- `Siglufjörður`, `Siglufjörður, Iceland` -> `siglufjordur` / `Siglufjörður`
- `580 Siglufjörður, Iceland` -> `siglufjordur` / `Siglufjörður`
- `Strandvegur 4, Sandgerði, Iceland` -> `sandgerdi` / `Sandgerði`
- bare `Melás 8` -> null, because no public locality is known

Privacy rule stays:

- never store raw street address
- never store exact user/home coordinates
- never store raw Google geometry

### 2. Do not require canonical coordinates for `/vedrid` route-memory filtering

Change `/vedrid` route-memory state to use place keys/labels directly, not `RouteDraftPlace` as the source of truth.

Instead of:

```ts
RouteDraftPlace { name, formattedAddress, lat, lon }
```

the overview picker should primarily return:

```ts
RouteMemoryPlace { key, label }
```

When both places are selected:

- call `/api/teskeid/weather/route-memory/lookup` using keys, or labels only as fallback
- filter exact station IDs from the stored route
- no coords needed

### 3. Single-place filter should use route-memory endpoint station IDs

Current single-place filter computes nearest stations from canonical coordinates. That creates the whitelist dependency.

Better:

- Add a server helper/API for selected place only, e.g. `/api/teskeid/weather/route-memory/place-focus?placeKey=...`
- It returns the station IDs that best represent that endpoint, derived from existing route-memory rows.

With current SQL 86 this can be derived without schema changes:

- For rows where `from_place_key = placeKey`, take first station(s) by `route_order` per provider.
- For rows where `to_place_key = placeKey`, take last station(s) by `route_order` per provider.
- Deduplicate.
- Return one or a few station IDs per provider.

This means selecting `Akureyri` can filter to the Akureyri endpoint station(s) without needing Akureyri coordinates in `routePlaces.ts`.

If this becomes slow or ambiguous later, add a small derived endpoint-stations table, but do not start there unless needed.

### 4. `routePlaces.ts` becomes optional seed/fallback, not a gate

Keep `routePlaces.ts` only for:

- curated popular places we want to show before route-memory exists
- optional Ferðalagið prefill ergonomics
- test fixtures

It must not decide whether a real route-memory endpoint is allowed to exist.

### 5. Ferðalagið CTA from `/vedrid`

For exact detailed trip calculation, it is okay that `/ferdalagid` uses Google when the user explicitly opens/recalculates the detailed trip.

But `/vedrid` filtering should remain cache-only.

Options:

- Short term: if both route-memory endpoints are selected, pass only labels into the route draft and let `/ferdalagid` geocode/resolve when it actually calculates.
- Or keep canonical coords only for known seeded places, but never let missing coords break `/vedrid` route-memory filtering.

## Recommended Claude Code handoff

```md
## Route-memory endpoint model: remove hard dependency on manual known-place registry

Stebbi is not comfortable with the Siglufjörður fix as the long-term pattern. Adding one town at a time is not robust enough.

Goal:
Make route-memory endpoints self-register from real `/ferdalagid` calculations so valid Icelandic places appear on `/vedrid` without manually adding each one to `routePlaceNormalization.ts` and `routePlaces.ts`.

Important:
This can be the next post-release hardening phase unless Stebbi explicitly decides to block release. The current Siglufjörður patch may remain as a hotfix, but the architecture should move away from whitelist-gated places.

### Required direction

1. Refactor `routePlaceNormalization.ts`.
   - Keep the file as the route-memory endpoint normalizer.
   - Replace whitelist-only matching with generic public-place extraction:
     - prefer structured locality/place fields if available
     - fallback parse `formattedAddress`
     - strip street/house-number parts
     - strip postal prefixes and country suffix
     - generate key via slugified public label
   - Keep manual alias table only for exceptions/synonyms, not as the gatekeeper.

2. Stop requiring `routePlaces.ts` coordinates for `/vedrid` filtering.
   - RouteMemoryPicker should operate on `{ key, label }`.
   - Exact route lookup should use route-memory keys.
   - Do not fallback missing place coords to Reykjavík for map filtering.

3. Replace single-place nearest-coordinate filter with route-memory endpoint station filter.
   - Add a server helper/API that returns endpoint station IDs for a selected place key.
   - Derive from SQL 86 station rows:
     - if selected place is route `from`, use first station(s) per provider by `route_order`
     - if selected place is route `to`, use last station(s) per provider by `route_order`
   - Deduplicate and return provider-specific station IDs.
   - No new Google calls.
   - Prefer deriving from existing SQL 86 first. Add schema only if the derivation is clearly insufficient.

4. Preserve privacy.
   - Do not store raw street addresses.
   - Do not store exact home/user coordinates.
   - Do not store raw Google route geometry, steps, duration, distance, or raw route content.
   - If considering Google `place_id`, pause for terms/privacy review before making it canonical.

5. Preserve `/vedrid` cost profile.
   - `/vedrid` route-memory picker and filtering must remain cache-only.
   - Detailed Google route calculation belongs in `/ferdalagid` after the user chooses to calculate a detailed trip.

### Suggested tests

Add tests showing that these work without adding each place to a whitelist:

- `Siglufjörður, Iceland` -> `siglufjordur`
- `580 Siglufjörður, Iceland` -> `siglufjordur`
- `Strandvegur 4, Sandgerði, Iceland` -> `sandgerdi`
- `Melás 8, Garðabær, Iceland` -> `gardabaer`
- bare `Melás 8` -> null
- exact route lookup still works bidirectionally
- single-place endpoint focus uses first/last route-memory station rows, not canonical coords

### Localhost checks for Stebbi

1. Calculate a route in `/ferdalagid` to a place that is not prelisted in `routePlaces.ts`.
2. Return to `/vedrid`.
3. Expected: the place appears in `Skoða veðrið á ákveðinni leið` without adding a hardcoded town entry.
4. Select only that place.
   - Expected: map filters to endpoint station(s) from route-memory.
   - Expected: no station card opens automatically.
5. Select the counterpart place.
   - Expected: map filters to exact stored provider station IDs for that route.
6. Click `Ferðalagið`.
   - Expected: detailed trip flow still opens and can calculate the route.
7. Network tab on `/vedrid`:
   - Expected: only `/api/teskeid/weather/route-memory/*` for route picker/filtering.
   - Expected: no Google call from the overview picker.
8. Privacy check:
   - Inspect route-memory rows in local Supabase only if Stebbi has intentionally run the migration locally.
   - Expected: no raw street address, no exact home coords, no raw Google geometry.
```

## Release stance

I would not block the immediate release solely on this if the current release has:

- no auto-open card
- Siglufjörður hotfix
- focus/refetch
- type-check/tests/build green

But I would put this v186 as the first route-memory hardening item after release. It is the correct architecture and prevents us from chasing one town at a time.

If Stebbi wants `/vedrid` to be more than a temporary demo before public rollout, then this should move before release. Otherwise: release, start collecting real route-memory, then harden endpoint normalization immediately.

## Route intelligence check

1. Route/place touched: all route-memory endpoints, with Siglufjörður as the example.
2. New knowledge belongs in `lib/iceland-routes/routePlaceNormalization.ts` and route-memory server helpers, not UI.
3. Provider-neutral: yes. Endpoint identity must not depend on Veðurstofan, Vegagerðin, or Google UI components.
4. Needed fixtures: generic address/place normalization tests and single-place endpoint station derivation tests.
5. Privacy: must remain public locality labels only. No raw addresses or raw Google route content.
6. Google: `/vedrid` must remain cache-only. Any use of Google is confined to explicit detailed `/ferdalagid` calculation.
7. `IcelandRoadmap.md` already points this way, but should be updated after implementation to say route-memory endpoints are self-registering and whitelist is only aliases/seeds.

## SQL / migration status

Try this without a new migration first by deriving endpoint station IDs from existing SQL 86 route/station rows.

Possible future schema, only if needed:

- `weather_route_memory_endpoint_stations`
- or additional derived endpoint metadata

Do not write or run a new migration until the existing SQL 86 derivation has been assessed.

## Commands run by Codex

- Read `ai-handoff/2026-07-19-0850-todo-086-v185-claude-v184-no-auto-open-siglufjordur-refetch`
- Read `ai-handoff/README.md`
- Read relevant snippets from:
  - `IcelandRoadmap.md`
  - `lib/iceland-routes/routePlaceNormalization.ts`
  - `components/weather/RouteMemoryPicker.tsx`
- Searched route-memory/place/geocode references.
- No tests run by Codex.

