# TODO 086 - Codex review of Claude v012 Phase 1B Veðurstofan station mapping

Created: 2026-07-12 11:06
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Prerelease review

Reviewed:
- `ai-handoff/2026-07-12-1103-todo-086-v012-claude-phase1b-done.md`
- `lib/weather/providers/vedurstofanStations.ts`
- `lib/__tests__/weather-vedurstofan-stations.test.ts`

No app code was changed by Codex. No SQL, Supabase, env, commit, push or deploy changes were made by Codex.

## Findings

No blocker for keeping Phase 1B.

The implementation is correctly scoped: station list + nearest-station mapping + tests only. It does not fetch from Veðurstofan, does not touch `/vedrid`, does not write cache, and does not affect current MET/Yr travel-weather behavior.

### P2 - Do not use the current default station list for real route-level shadow fetch yet

Reference: `lib/weather/providers/vedurstofanStations.ts:47-65`

The current default list has only three stations:

- Hellisheiði
- Egilsstaðaflugvöllur
- Höfn í Hornafirði

Two of them are explicitly `coordinatesVerified: false`. That is fine for a skeleton, but it is not enough coverage or certainty for a route-level Veðurstofan comparison. If Phase 1C uses this default list on a real route, most Icelandic route points will be `unavailable`, or worse, mapped to a far/approximate station with misleading confidence.

Recommendation:

- Phase 1C can proceed as a fetch/cache wrapper if it is still isolated and tested with explicit station IDs or mocked responses.
- Do **not** wire Phase 1C into real route shadow comparison for arbitrary `/vedrid` routes until the station list is expanded and key coordinates are verified.
- Before any route-level shadow compare, add at minimum Reykjavik/Garðabær, Selfoss/Suðurland, Vík/Kirkjubæjarklaustur, Akureyri/Norðurland, Egilsstaðir, Höfn, and common mountain/road stations.

### P2 - `coordinatesVerified` metadata is not used by mapping yet

Reference: `lib/weather/providers/vedurstofanStations.ts:18-23`, `lib/weather/providers/vedurstofanStations.ts:93-112`

`coordinatesVerified` is useful metadata, but `mapRoutePointToVedurstofanStation()` currently treats verified and approximate coordinates identically.

That is acceptable for Phase 1B tests, but Phase 1C/route-shadow should decide what to do with unverified stations:

- either exclude unverified coordinates from automatic route mapping,
- or include them but downgrade confidence / annotate source quality,
- or require the curated list to be fully verified before enabling route-shadow.

My preference: before live route-shadow, verify coordinates and avoid using unverified points in default mapping.

### P3 - Confidence threshold comments use `<`, implementation uses `<=`

Reference: `lib/weather/providers/vedurstofanStations.ts:30-33`, `lib/weather/providers/vedurstofanStations.ts:79-84`

Comments say `< 5 km`, `5–15 km`, `15–50 km`, while implementation uses `<=` at each threshold. This is tiny and not harmful, but align comments/tests later to avoid edge-case confusion.

## What Looks Good

- Longitudes are guarded as negative for Iceland.
- Hellisheiði known-coordinate test is present.
- Mapping uses haversine distance, not naive lat/lon difference.
- Empty station list returns `null`.
- `getUniqueStationIdsForRoute()` dedupes IDs and filters `unavailable`.
- Tests cover good/ok/weak/unavailable confidence and multi-station dedupe.
- No network calls or route integration were introduced.

## Verification Run By Codex

```text
npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       19 passed (19)
Exit code   0
```

```text
npm run type-check
```

Result:

```text
tsc --noEmit
Exit code 0
```

`git status --short` still shows a very dirty worktree with many unrelated modified/untracked files. This review only covers the Phase 1B station mapping files named above.

## Recommendation

Keep Phase 1B.

Next step can be Phase 1C only if the scope is kept narrow:

```text
Fetch/cache/batch wrapper for explicit station IDs, behind server-only flag, no broad route integration yet.
```

For Phase 1C, I recommend:

- Fetch by explicit station IDs, not arbitrary route points at first.
- Batch max 10 station IDs per request.
- Cache parsed JSON per station.
- Add timeout and fail-open behavior.
- Do not call Veðurstofan during normal `/vedrid` navigation unless a server-only shadow flag is enabled.
- Do not let a Veðurstofan failure break current MET/Yr route calculation.

Before route-level shadow comparison:

- Expand and verify the station list.
- Add tests for the expanded list.
- Add behavior for `coordinatesVerified === false`.

## Localhost checks for Stebbi

Nothing user-visible changed in Phase 1B.

Optional check:

1. Open `/vedrid` on localhost.
2. Reikna eina leið.
3. Expected: behavior is unchanged.
4. There should be no live calls to `xmlweather.vedur.is`.

No Supabase, auth, RLS, SQL, deployment, billing, secrets or user-data behavior changed in Phase 1B.

## Óvissa / þarf að staðfesta

- I did not review unrelated dirty worktree files.
- Egilsstaðaflugvöllur and Höfn coordinates are intentionally marked approximate in code. They should be verified against official station pages before route-level shadow comparison.
- The station list is far too small for product-level coverage; this is acceptable only because Phase 1B is a skeleton.
