# TODO 086 v343 - Claude: v342 position statement + Öxi screenshot analysis

Created: 2026-07-16 17:07
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-1655-todo-086-v341-claude-v338-v339-v340-done-prerelease.md`
- `2026-07-16-1659-todo-086-v342-codex-v341-prerelease-review.md`

---

## Position on v342 findings

### Finding 1 (High): missing-via is transitional, not true segment-based

**Position taken: keep missing-via as an explicit transitional proxy, do not redesign now.**

Rationale:

The semantics are correct. Routes to northern Westfjords that avoid Hólmavík (Route 61) almost certainly use Route 60 mountain passes. The Hólmavík via-point is a valid proxy because:

- Route 61 via Hólmavík is the known safer alternative
- Route 60's mountain passes are the realistic alternative when Google doesn't route via Hólmavík
- The detection fires only when anyPartyBounds is satisfied, preventing false positives on unrelated Icelandic routes

What was changed in this pass: `lib/weather/routeCautions.ts` now has a prominent `⚠️ TRANSITIONAL PROXY` comment on the Westfjords segment and an expanded comment on the `missing-via` detection type explaining exactly what it does and does not detect. The `source.verified: false` flag was already present.

What is NOT done (and shouldn't be done without visual verification):
- Converting to `present-near-corridor` with actual Route 60 corridor waypoints
- Removing the anyPartyBounds gate (would cause false positives everywhere)

**When to graduate:** Trace Route 60 corridor waypoints visually on localhost (look for the Dynjandivegur / Geldingafjörður area between Hólmavík and Þingeyri), then replace with `present-near-corridor` detection and remove anyPartyBounds.

---

### Finding 2 (Medium): Hólmavík alternate still destination-bound

**Position taken: known transitional limitation, documented.**

The curated route alternate (CURATED_VIA_HOLMAVIK) is triggered by `destination: WESTFJORDS_NORTH_BOUNDS`. This means `Ísafjörður → Höfn` would not get the Hólmavík alternate offered, even though the caution fires (anyPartyBounds catches origin in Westfjords).

This is a conscious v1 choice. The full segment-first alternate architecture (where a matched segment triggers a curated alternate regardless of direction) requires either:
- A bidirectional curated route rule
- Or a segment-aware alternate generation that calls Google with the appropriate via-point for both directions

Neither is implemented. The v341 handoff already documented this as `Ísafjörður → Höfn Hólmavík alternate: pending`.

---

### Finding 3 (Medium): Öxi disabled

**Position taken: correct. Do not enable without verified coordinates.**

See Öxi analysis below.

---

### Finding 4 (Medium): Tests validate proxy rule, not true segment rule

**Position taken: correct, accepted.**

The tests confirm the current behavior of the `missing-via` proxy, which is the implemented behavior. Adding tests that claim to validate "route polyline passes through hazardous segment" would be misleading — the model doesn't have verified segment geometry yet. When Öxi is enabled or Route 60 gets proper corridor points, those tests should be added then.

---

### Finding 5 (Low/UX): Summary text inside button

**Position taken: acceptable for v1, monitor when Öxi is added.**

Currently only one caution segment is active. The button layout is manageable. When Öxi and any future segments are added, a `max 1 summary + sjá nánar` disclosure should be considered. No change now.

---

## Öxi screenshot analysis

**Screenshot:** `Skjámynd 2026-07-16 165938` — `Egilsstaðir → Höfn`, route labeled `Hringvegur/Leið 1`, 184 km, 2 klst. 38 mín.

**Conclusion: this route DOES use Öxi. Stebbi confirmed the red box in the screenshot marks the Öxi section (Road 939).**

Initial analysis was wrong — the route goes via Öxi / Axarvegur 939 through the mountain pass, not the coastal fjord roads. Google routes `Egilsstaðir → Höfn` via Öxi because it is significantly shorter than the coastal alternative.

**Action taken:** Öxi detection has been enabled in `lib/weather/routeCautions.ts`. The `oxi-axarvegur-939` segment is now active with:

```ts
detection: {
  type: 'present-near-corridor',
  corridorPoints: [
    // APPROXIMATE — visual confirmation from Skjámynd 2026-07-16 165938.
    // GPS precision not verified — adjust after localhost map check.
    { lat: 64.860, lon: -14.365, radiusM: 6_000 },
  ],
},
```

`source.verified: false` — coordinates are approximate. Stebbi should verify on localhost that the detection point lands on the Öxi mountain section and not on coastal Route 1 roads nearby. If the detection over-fires (coastal routes getting the caution), tighten the radius or move the corridor point further into the mountain pass interior.

---

## Changes made in this pass

### `lib/weather/routeCautions.ts`

1. Expanded `missing-via` type comment to clearly label it `TRANSITIONAL PROXY` and explain exactly what it does and doesn't detect.

2. Added `⚠️ TRANSITIONAL PROXY (see v342 review)` to the `westfjords-south-route60` segment definition.

3. **Enabled Öxi detection** (`oxi-axarvegur-939`) after Stebbi confirmed the screenshot route DOES use Öxi (the red box marks the Öxi section):
   - Segment uncommented and active in `SENSITIVE_ROAD_SEGMENTS`
   - `detection.type: 'present-near-corridor'`, corridor `{ lat: 64.860, lon: -14.365, radiusM: 6_000 }`
   - `source.verified: false` — approximate coordinates, needs localhost verification
   - Added 5 Öxi unit tests in `lib/__tests__/weather-route-cautions.test.ts`

117/117 tests pass, type-check clean.

---

## Summary: what is and isn't "segment-based" right now

| Aspect | Status |
|--------|--------|
| Model type (`SensitiveRoadSegment`) | Segment-based model ✓ |
| Westfjords detection mechanism | Transitional proxy (`missing-via`) — bounds-aware |
| Öxi detection mechanism | Active (`present-near-corridor`, approximate coords, `source.verified: false`) |
| Full polyline evaluation | Done — cautions evaluated before samplePoints() ✓ |
| Shared constants | Centralized in routeCautionConstants.ts ✓ |
| Bidirectional (both directions flagged) | Partial — anyPartyBounds covers both directions ✓ |
| Bidirectional alternate route | Not done (curated rule is destination-only) |

---

## What Stebbi needs to do to verify Öxi coordinates

Öxi detection is now active. The corridor coordinates are approximate. Verify on localhost:

1. Open `http://localhost:3004/vedrid`
2. Route `Egilsstaðir → Höfn` — confirm the Öxi caution chip appears ("Varasamt með eftirvagna")
3. Check the map — confirm the route passes through the Öxi mountain section (Road 939), not the coastal fjord roads
4. If the caution does NOT appear: the corridor point `{ lat: 64.860, lon: -14.365 }` may be off — adjust and re-test
5. If the caution fires on the coastal route (Route 1, fjords): tighten `radiusM` (try 4_000) or move the point further into the mountain pass interior
6. Once verified correct: set `source.verified: true` in `routeCautions.ts`

No SQL, deploy, or Vercel changes needed for this step.
