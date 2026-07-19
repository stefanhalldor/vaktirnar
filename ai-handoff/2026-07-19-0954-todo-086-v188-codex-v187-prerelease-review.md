# 2026-07-19 09:54 - TODO 086 v188 - Codex: v187 prerelease review

Created: 2026-07-19 09:54
Timezone: Atlantic/Reykjavik

## Context

Review of:

- `ai-handoff/2026-07-19-0950-todo-086-v187-claude-route-draft-hydration-options-warming.md`
- commit `e264822` (`fix: route-draft hydration in RouteSelectionStep, warm route-memory from route-options (#86)`)

Scope:

1. `/vedrid -> /ferdalagid` route draft hydration hotfix.
2. Route-memory warming from the `/ferdalagid` route-options endpoint.

## Findings

### 1. Route-options warming is fire-and-forget and may not reliably complete in production/serverless

Severity: High for the route-memory warming feature. Not a blocker for the
`Frá`/`Til` hydration hotfix itself.

Evidence:

- `app/api/teskeid/weather/travel/routes/route.ts:159-170`
- The code calls `void warmRouteMemoryFromOptions(sorted, fromNorm, toNorm)` and
  then immediately returns `NextResponse.json({ routes: sorted })`.
- `lib/iceland-routes/routeMemory.server.ts` explicitly documents that
  `recordRouteMemory()` "Must be awaited before the calling route returns to
  ensure the write completes."

Why this matters:

- On localhost, this will often appear to work because the Node process keeps
  running.
- In production/serverless, work kicked off after the response is no longer a
  reliable contract. The function may be frozen/terminated before Supabase writes
  finish.
- That means Stebbi may create a route option in `/ferdalagid`, return to
  `/vedrid`, and still not see the route-memory pair. It will look intermittent
  and frustrating.

Recommendation:

- Prefer a reliable mechanism:
  - simplest: `await warmRouteMemoryFromOptions(...)` before returning, since the
    helper and `recordRouteMemory()` are best-effort and swallow DB failures; or
  - if this repo/deployment uses a supported Next/Vercel background primitive
    (`after()`/waitUntil-equivalent), use that instead and document the runtime
    guarantee.
- Keep the no-extra-Google contract. Awaiting this helper should not create new
  Google calls; it only adds local station matching and Supabase writes.

### 2. Silent catch in route warming makes production diagnosis harder

Severity: Low/Medium.

Evidence:

- `app/api/teskeid/weather/travel/routes/route.ts:258-260`

The helper catches all exceptions and logs nothing. `recordRouteMemory()` logs
some DB failures internally, but any error before/around that call disappears.

Recommendation:

- Log a static, non-sensitive code, for example:
  `console.error('[route-memory] options warm failed')`
- Do not log route names, addresses, coordinates, geometry, user IDs, or raw
  provider payloads.

## Good Notes

- The `RouteSelectionStep` hydration fix matches the original bug very directly.
  `activeField` now closes when both places hydrate, and `handleOriginSelected`
  no longer forces `Til` open when destination is already selected.
- Route-options warming preserves the intended privacy shape:
  normalized public place labels/keys, route variant keys, station IDs and
  derived station-order metadata only.
- No extra Google call was added; the helper reuses already-returned route
  option geometry.
- Vegagerðin is read from cache/history fallback only, not live upstream.

## Verification Run By Codex

Commands:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/weather-travel-api.test.ts lib/__tests__/route-place-normalization.test.ts`

Results:

- Type-check: passed.
- Targeted tests: 2 files passed, 52 tests passed.

## SQL / Migration Notes

- No new migration was added by v187.
- Route-memory still depends on SQL86 being run in the target Supabase project.
- Codex did not run SQL.
- The new warming code should degrade safely if SQL86 is missing because
  `recordRouteMemory()` is best-effort, but route-memory will not populate.

## Route Intelligence Check

1. Route scope: all `/ferdalagid` route options and `/vedrid` route-memory quick
   filters.
2. New route knowledge: no new canonical road/segment knowledge was added.
3. Provider neutrality: the persistence target is provider-neutral route-memory;
   Google remains only the routing provider.
4. Cache/test fixtures: route-options warming should ideally get a focused test
   that proves each route option variant writes separate station rows without
   storing raw geometry.
5. Privacy: the current code avoids raw addresses, raw Google geometry, route
   steps, duration/distance cache, user IDs, and place IDs in route-memory.
6. Google cost: no extra Google call was found.
7. IcelandRoadmap: no update required; this advances the already-documented R4/R5
   route-memory plan.

## Design Check

- The hydration fix improves app-like continuity and removes a confusing split
  state.
- No visual/layout redesign was introduced.

## Localhost Checks For Stebbi

### Hydration hotfix

1. Open `/vedrid`.
2. Select a route-memory pair such as `Reykjavík` -> `Siglufjörður`.
3. Click `Ferðalagið`.
4. Expected:
   - `/ferdalagid` first step shows both `Frá` and `Til` as filled cards.
   - No empty `Frá` input is shown.
   - Route map/options match the two fields.
5. Clear only `Frá`.
6. Expected:
   - `Til` stays selected.
7. Select a new `Frá`.
8. Expected:
   - `Til` does not visually fall out unless explicitly cleared.

### Route-options warming

1. Open `/ferdalagid`.
2. Enter a new route, for example `Reykjavík` -> `Siglufjörður`.
3. Wait for route options to appear.
4. Do not continue to the final result.
5. Return/focus/reload `/vedrid`.
6. Expected after reliable warming fix:
   - the new route appears in route-memory picker.
   - selecting the pair filters the map to station IDs from that route.

## Recommendation

Do not hold the hydration hotfix. It is good and release-worthy.

Before relying on route-options warming in production, change the fire-and-forget
call to a reliable awaited/background-lifecycle-safe mechanism. This is the one
thing I would fix before telling Stebbi that `/ferdalagid` route options will
definitely populate `/vedrid` route-memory.
