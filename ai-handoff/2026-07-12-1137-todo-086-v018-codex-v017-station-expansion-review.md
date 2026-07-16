# TODO 086 - Codex review of Claude v017 station expansion review

Created: 2026-07-12 11:37
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Prerelease review / Phase 1C guardrail review

Reviewed:

- `ai-handoff/2026-07-12-1135-todo-086-v017-claude-v016-station-expansion-review.md`
- `lib/weather/providers/vedurstofanStations.ts`
- `lib/__tests__/weather-vedurstofan-stations.test.ts`
- `lib/weather/metno.server.ts`
- `lib/weather/providers/vedurstofanXml.ts`

No app code was changed by Codex in this review. No SQL, Supabase, env, commit, push or deploy was done.

## Findings

No blocker for accepting the station-list expansion.

### P2 - Tighten Phase 1C cache key before implementation

Reference:

- `ai-handoff/2026-07-12-1135-todo-086-v017-claude-v016-station-expansion-review.md:115`
- `lib/weather/metno.server.ts:9`
- `lib/weather/providers/vedurstofanXml.ts:7`

Claude v017 proposes:

```text
Key: vedurstofan:{stationId}
```

That is too broad for Phase 1C. It is fine as a shorthand in review prose, but it should not become implementation.

Reason: Veðurstofan XML responses vary by:

- source/provider (`vedurstofan`);
- endpoint/service (`xml`);
- type (`forec`, later maybe `obs` or `txt`);
- time step (`3h` now, `6h` possible);
- language (`is`, later maybe `en`);
- params (`F;D;T;R;W`, later maybe different set);
- station ID.

The current MET cache key is source/endpoint/version/shape-specific:

```ts
metno:locationforecast:2.0:compact:{lat}:{lon}
```

For Veðurstofan, use a similarly explicit stable key, for example:

```text
vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}
```

or equivalent with constants. This avoids collisions if Phase 1C later adds observations, 6h forecast, English text, or different params.

This does not affect the current station-list expansion because no fetch/cache code exists yet. It should be corrected in the Phase 1C implementation plan.

### P3 - TTL should be deliberate, not described as aligned with existing MET behavior

Reference:

- `ai-handoff/2026-07-12-1135-todo-086-v017-claude-v016-station-expansion-review.md:115`
- `lib/weather/metno.server.ts:62`

Claude v017 suggests `TTL: 90 min (align with existing cache strategy)`.

MET currently parses the upstream `Expires` header and defaults to 1 hour if missing. Veðurstofan XML may not provide the same header semantics. A fixed 90-minute TTL may be reasonable, but it should be justified as a Veðurstofan-specific conservative TTL, not as "aligned" with the existing MET implementation.

Recommendation for Phase 1C:

- If XML response has a trustworthy `Expires` or similar header, use it.
- Otherwise choose a fixed conservative TTL and document why.
- Preserve stale fallback behavior so Veðurstofan failure never breaks MET/Yr route calculation.

### P3 - Handoff filename and Created timestamp do not match

Reference:

- filename: `2026-07-12-1135-todo-086-v017-claude-v016-station-expansion-review.md`
- `ai-handoff/2026-07-12-1135-todo-086-v017-claude-v016-station-expansion-review.md:3`

The filename says `1135`, but the `Created:` line says `2026-07-12 11:45`.

This is process-only and does not affect code. Still, WORKFLOW says the filename timestamp and `Created` line should reflect the real creation time. Claude Code should tighten this next time.

## What Looks Good

Claude v017 is right that Phase 1B station expansion is complete enough to keep.

Confirmed from current code:

- `VEDURSTOFAN_STATIONS` contains 29 stations.
- All default-list stations have `coordinatesVerified: true`.
- All longitudes are negative.
- The previous approximate Egilsstaðir and Höfn entries have official coordinates now.
- No fetch, cache, UI, route integration, SQL or Supabase behavior was added.
- `mapRoutePointToVedurstofanStation()` still uses haversine distance and returns `good` / `ok` / `weak` / `unavailable`.
- `getUniqueStationIdsForRoute()` still dedupes and filters `unavailable`.

Claude's two P3 notes are reasonable:

- The Hella to Vík / Markarfljót gap is acceptable for now if confidence and distance are surfaced later.
- Westfjords, Snæfellsnes and Þórsmörk are out of the initial routes 1, 41, 48, 51 scope.

## Verification Run By Codex

```text
npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       21 passed (21)
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

```text
npm.cmd run lint
```

Result:

```text
Exit code 0
```

Lint still reports existing unrelated warnings in:

- `app/s/[sessionId]/page.tsx`
- `components/landing/Avatar.tsx`
- `components/weather/TravelAuditMap.tsx`

Those are not introduced by TODO 086 station expansion.

## Recommendation

Keep Phase 1B station expansion.

Do not ask Claude Code to implement Phase 1C from v017 verbatim. If Stebbi approves Phase 1C, include these corrections in the prompt:

- Use a source/endpoint/type/lang/timeStep/params/station-specific cache key.
- Do not use `vedurstofan:{stationId}` as the actual cache key.
- Treat 90-minute TTL as a deliberate Veðurstofan choice, or parse a reliable upstream expiry header if present.
- Keep Phase 1C fetch/cache explicit-station or helper-level only until reviewed.
- Keep route/UI integration as a later explicit approval step.

## Suggested Copy/Paste If Stebbi Approves Phase 1C Later

```md
Claude Code, framkvæmdu Phase 1C fyrir TODO 086 með þröngu scope:

- Búa til server-only Veðurstofan fetch/cache wrapper fyrir explicit station IDs.
- Nota `parseVedurstofanXml()` úr Phase 1A.
- Sækja `type=forec`, `lang=is`, `view=xml`, `time=3h`, `params=F;D;T;R;W`.
- Batch-a að hámarki 10 station IDs í einu.
- Cache-a parsed JSONB per station í `weather_cache`.
- Cache key má EKKI vera bara `vedurstofan:{stationId}`. Notaðu source/endpoint/type/lang/timeStep/params/station-specific key, t.d. `vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}`.
- TTL skal annaðhvort byggja á traustum upstream expiry header eða vera skýrt rökstuddur Veðurstofan-specific fallback TTL.
- Veðurstofan bilun má aldrei brjóta núverandi MET/Yr route calculation.
- Bakvið server-only flagg.
- Engin route.ts/UI/assessment/travel integration í þessum áfanga nema Stebbi samþykki það sérstaklega.
- Engin SQL, migration, Supabase schema breyting, commit, push eða deploy.

Keyrðu viðeigandi unit tests og `npm run type-check`.
Skilaðu handoff með Localhost checks for Stebbi.
```

## Localhost checks for Stebbi

This review itself changes nothing user-visible.

For the current Phase 1B station expansion:

1. Run `npm run test:run -- lib/__tests__/weather-vedurstofan-stations.test.ts`.
2. Expected: 21 tests pass.
3. Run `npm run type-check`.
4. Expected: TypeScript passes.
5. Optional smoke check: open `/vedrid` on localhost and calculate a familiar route.
6. Expected: behavior is unchanged and no Veðurstofan network calls happen during normal navigation.

Do not test by repeatedly hitting `xmlweather.vedur.is`. Live fetching belongs to Phase 1C and should be cache-first, batched and fail-open.

No Supabase, auth, RLS, SQL, deployment, billing, secrets or user-data behavior changed in this review.

## Óvissa / þarf að staðfesta

- Codex did not re-verify every official station page again in this review turn; this review relied on the current station file, v016 handoff, v017 review and the already-passing station integrity tests.
- Phase 1C still needs a focused implementation plan or explicit implementation prompt before code changes.
