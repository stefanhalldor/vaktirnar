# TODO 086 v144 - Claude done: v143 tie-break fix, prerelease

Created: 2026-07-14 08:06 Atlantic/Reykjavik
Agent: Claude Code
Implements: `2026-07-14-0801-todo-086-v143-codex-v142-prerelease-review.md`

## Result

Type-check: exit 0
Tests: 134 passed + 5 skipped = 139 total (was 133+5=138 before this batch)

## Changes Made

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**Fixed decisive provider tie-break (v143 Medium)**

Previous logic: Veðurstofan wins whenever its severity is at least as bad as MET/Yr (`<=`). This incorrectly showed Veðurstofan as decisive even when MET/Yr had higher actual wind in the same severity band.

New logic implements v141 spec exactly: severity first, then windMs, then stable provider order:

```ts
const vedurstofanDsIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(vedurstofanDs)
const metnoDsIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(metnoDs)
if (vedurstofanDsIdx < metnoDsIdx) return true   // Veðurstofan strictly worse severity
if (vedurstofanDsIdx > metnoDsIdx) return false  // MET/Yr strictly worse severity
// Same severity band: higher windMs wins
const vedurstofanWindMs = worstVedurstofanData.windMs ?? 0
const metnoWindMs = activeOutboundCandidate.worstWind?.value ?? 0
if (metnoWindMs > vedurstofanWindMs) return false // MET/Yr has higher wind
return true  // Veðurstofan wins tie-break (same or higher wind, or no wind data)
```

Before fix example that was wrong:
- MET/Yr = `othaegilegt` 11 m/s, Veðurstofan = `othaegilegt` 8 m/s → decisive was Veðurstofan (wrong)

After fix:
- MET/Yr = `othaegilegt` 11 m/s, Veðurstofan = `othaegilegt` 8 m/s → decisive is MET/Yr (correct)
- MET/Yr = `othaegilegt` 8 m/s, Veðurstofan = `othaegilegt` 11 m/s → decisive is Veðurstofan (correct)
- MET/Yr = `othaegilegt`, Veðurstofan = `othaegilegt`, equal wind → decisive is Veðurstofan (stable provider order)

### `messages/is.json` + `messages/en.json`

Removed unused `vedurstofanLayerDisclaimer` key from both files (v143 Low).

### `lib/__tests__/weather-vedurstofan-blend.test.ts`

Added test: `"metno is decisive when same severity band but metno has higher windMs (v143 tie-break fix)"`:
- Both `othaegilegt`, MET/Yr 11 m/s vs Veðurstofan 8 m/s.
- Asserts `decisiveIsVedurstofan` is false when `metnoWindMs > vedurstofanWindMs`.

## What Was NOT Changed

- Map/selected-point mismatch when Veðurstofan is decisive: acknowledged as next feature task (generic provider-selection patch). Not in scope for v144.
- SQL, Supabase, cron, Vercel, migrations, feature access.
- No commit, no push.

## Open Items After v144

### Next Feature Patch (generic provider-selection)
- Clickable Veðurstofan overlay markers/cards on the map.
- When `combinedDecisiveVedurstofan` is true, the map selected point panel should reflect the Veðurstofan decisive station, not only MET/Yr route points.
- Vegagerðin will reuse the same selection model.

## Localhost Checks For Stebbi

Preconditions: Stebbi runs localhost. `WEATHER_ELTA_VEDRID_FLAG=true`. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`. Veðurstofan product table warmed. No migrations, cron, push, commit.

### Both providers — tie-break check

Find a slot where MET/Yr and Veðurstofan are both in the same severity band but MET/Yr has higher wind:
- Expected: summary "Á leiðinni" shows MET/Yr as decisive (not Veðurstofan).

Find a slot where Veðurstofan is in a worse severity band than MET/Yr:
- Expected: summary shows Veðurstofan as decisive.

Find a slot where MET/Yr is in a worse severity band:
- Expected: summary shows MET/Yr as decisive.

### No-provider disclaimer text gone

Turn Veðurstofan on. Confirm the old disclaimer paragraph "Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn." is no longer shown anywhere in the card.
