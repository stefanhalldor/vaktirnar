# TODO 086 v364 - Claude handoff: v363 done, prerelease

Created: 2026-07-16 21:45
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-2132-todo-086-v363-codex-holmavik-curated-caution-trigger-handoff.md`

## Status

v363 implemented, committed, and pushed. 125/125 tests pass. Type-check clean.
Commit: `983cd26`

---

## Changes in this pass

### `lib/weather/google.server.ts`

Replaced the origin/destination-based Hólmavík curated rule with a caution-triggered rule:

```ts
// Before:
{
  id: 'any-iceland-to-westfjords-north-via-holmavik',
  logName: 'Vestfirðir / Hólmavík',
  origin: { bounds: [ICELAND_BOUNDS] },
  excludedOrigin: { bounds: [WESTFJORDS_NORTH_BOUNDS] },
  destination: { bounds: [WESTFJORDS_NORTH_BOUNDS] },
  minFastestRouteDistanceM: 180_000,
  vias: [HOLMAVIK_VIA],
  labels: ['CURATED_VIA_HOLMAVIK'],
}

// After:
{
  id: 'safe-westfjords-via-holmavik',
  logName: 'Vestfirðir / Hólmavík',
  triggerCautionId: 'westfjords-south-route60',
  minFastestRouteDistanceM: 180_000,
  vias: [HOLMAVIK_VIA],
  labels: ['CURATED_VIA_HOLMAVIK'],
}
```

The `westfjords-south-route60` caution fires when at least one party (origin OR destination)
is in `WESTFJORDS_NORTH_BOUNDS` and the route avoids Hólmavík. This correctly handles both:
- Garðabær → Ísafjörður (destination in Westfjords)
- Ísafjörður → Akureyri (origin in Westfjords)

The existing `getCuratedRouteOptions` caution-trigger flow handles validation: if the curated
route via Hólmavík still receives the same caution, it is suppressed. `shouldSkipCuratedHolmavik`
remains as a belt-and-suspenders duplicate guard.

### `lib/__tests__/weather-google.test.ts`

Updated 3 existing tests whose curated route mock was a generic auto-generated route (which
doesn't pass near Hólmavík and would fail the new caution validation):
- `'capital area → Ísafjörður triggers CURATED_VIA_HOLMAVIK'`
- `'capital area → Bolungarvík also triggers CURATED_VIA_HOLMAVIK'`
- `'Höfn → Ísafjörður triggers CURATED_VIA_HOLMAVIK'`

All three now use `makeRouteResponseFromCoords([[-21.685, 65.703], ...], [], 15_000)` for the
curated mock, so the first point is exactly at `HOLMAVIK_VIA` — clears the caution → kept.

Updated comment on `'CURATED_VIA_HOLMAVIK is suppressed when base route already passes Hólmavík'`:
mechanism now is the caution gate (base via Hólmavík → no caution → trigger doesn't fire) rather
than `shouldSkipCuratedHolmavik`, but the outcome and assertion are unchanged.

Replaced the now-wrong test `'Westfjords origin does NOT trigger CURATED_VIA_HOLMAVIK (excludedOrigin guard)'`
with three new Ísafjörður → Akureyri tests:
1. Trigger fires and CURATED_VIA_HOLMAVIK appears
2. Curated request uses HOLMAVIK_VIA as `via: true` intermediate
3. Base route already via Hólmavík → no caution → no curated fetch

---

## Pending localhost verification

1. Open `/vedrid`, search Ísafjörður → Akureyri.
2. Default route shows `Varasamt með eftirvagna` (westfjords-south-route60 caution).
3. A second route option `Gegnum Hólmavík` appears and routes through/near Hólmavík.
4. The Hólmavík route does NOT show `Varasamt með eftirvagna`.
5. Verify existing directions still work:
   - Reykjavík/Garðabær → Ísafjörður: `Gegnum Hólmavík` still offered.
   - Höfn → Ísafjörður: `Gegnum Hólmavík` still offered.
   - Reykjavík → Akureyri: `Gegnum Hólmavík` NOT offered.

No Supabase, SQL, auth, RLS, env, secrets, migration, or additional deploy work required.
