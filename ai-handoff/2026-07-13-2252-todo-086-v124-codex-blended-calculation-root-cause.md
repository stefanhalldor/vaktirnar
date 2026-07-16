# TODO 086 v124 - Codex root-cause addendum for Veðurstofan blend behavior

Created: 2026-07-13 22:52
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on: `2026-07-13-2245-todo-086-v123-codex-v122-provider-split-review.md`
User evidence: Stebbi screenshots showing MET/Yr-only green, Veðurstofan cards visually green, but Veðurstofan-enabled result turns orange with `11 m/s`

## Bottom line

Do not send v123 alone. Send this addendum with it.

The UI is now moving in the right direction because Veðurstofan stations appear as their own provider points under "Allir spápunktar". But the calculation layer is still doing something different from what the UI suggests:

- Turning off `met.no` hides MET/Yr cards, but it does **not** create a Veðurstofan-only calculation.
- Turning on `Veðurstofan` swaps the displayed result to `vedurstofanLayer.augmentedResult`.
- That `augmentedResult` is still a MET/Yr route-point assessment, but with Veðurstofan values max-blended into each MET/Yr point.

So the current product state is:

> UI provider filter says "show/hide providers", but Veðurstofan toggle also changes the assessment calculation to a blended MET/Yr + Veðurstofan result.

That explains why the user can see:

- MET/Yr-only route = green.
- Veðurstofan station cards shown separately and looking harmless.
- Veðurstofan-enabled assessment = orange everywhere, with a worst point of `11 m/s`.

## Is it hviða?

Probably not.

The blend helper only blends:

- `windSpeedMs`
- `precipitationMmPerHour`

It does **not** blend `windGustMs`.

Reference:
- `lib/weather/providers/vedurstofanBlend.ts:40-48`

So the `11 m/s` shown as `Vindur 11 m/s` is almost certainly a blended sustained wind value, not a gust/hviða value.

## Are we adding MET/Yr and Veðurstofan together?

Not literally adding.

The code uses `Math.max`, not `+`.

Reference:
- `lib/weather/providers/vedurstofanBlend.ts:42-47`

Current rule:

```ts
windSpeedMs = Math.max(metNoWind, vedurstofanWind)
precipitationMmPerHour = Math.max(metNoPrecip, vedurstofanPrecip)
```

So if MET/Yr says `7.9 m/s` and the nearest Veðurstofan row says `11 m/s`, the blended value becomes `11 m/s`. Since Stebbi's threshold says "Jafnvindur óþægilegur í 10 m/s", `11 m/s` turns the result orange.

## Why does `11 m/s` look like a value that is not visible anywhere?

There are two likely reasons in the current UI:

### 1. Veðurstofan station cards show only the first forecast row

Reference:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1828`

Current station card:

```ts
const nearestRow = vpt.forecastRows.length > 0 ? vpt.forecastRows[0] : null
```

Despite the variable name, this is not the nearest row to the active route ETA. It is just `forecastRows[0]`.

But the blend helper chooses the nearest Veðurstofan row to each MET/Yr forecast hour within ±1.5h:

Reference:
- `lib/weather/providers/vedurstofanBlend.ts:29-39`

So a station card may show, for example, the first row with `9 m/s`, while the assessment uses a later row near `23:00` with `11 m/s`. To Stebbi, that looks like `11 m/s` came from nowhere.

### 2. The worst point is still a MET/Yr route point, not a Veðurstofan station card

Reference:
- `app/api/teskeid/weather/travel/route.ts:341-349`

The server still loops over each MET/Yr route point, maps that route point to the nearest Veðurstofan station, max-blends the route-point hours, and then reruns `checkTravelWeather`.

So the worst point card can still say `Punktur 26/72` and show a blended value even though the user-facing Veðurstofan cards are now separate.

That is internally understandable but product-confusing.

## Why do all departure times become orange?

Because once `showVedurstofan` is true, the client swaps from the baseline result to `vedurstofanLayer.augmentedResult`.

Reference:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:409-415`

```ts
setResult(show ? vedurstofanLayer.augmentedResult : baselineResult)
```

If one or more route points receive a max-blended `windSpeedMs >= 10`, then many or all departure candidates can become orange depending on the time windows and route-point ETA matching.

This is not controlled by the `met.no` visibility toggle. Hiding `met.no` does not stop MET/Yr route points from being the skeleton of the calculation.

## What should Claude Code do next?

This needs a small architecture/product correction before more UI polish.

Recommended next patch:

1. Separate provider display toggles from calculation mode.
   - `showMetno` and `showVedurstofan` should mean "show/hide cards/layers".
   - They should not silently redefine the result unless the UI explicitly says "use this provider in the assessment".

2. For now, safest validation behavior:
   - Keep baseline MET/Yr result as the main route assessment.
   - Show Veðurstofan as an independent validation layer.
   - Do **not** let Veðurstofan alter all departure statuses by default just because the display toggle is on.

3. If we want a calculation toggle, make it explicit and scary-clear:
   - e.g. `Nota Veðurstofu í mati (tilraun)`
   - separate from `Sýna Veðurstofu`
   - default off until Stebbi validates the station data and semantics.

4. If `augmentedResult` remains available for debugging, expose provenance:
   - which MET/Yr point was changed,
   - which Veðurstofan station changed it,
   - which forecast row/time supplied the value,
   - original MET/Yr value,
   - Veðurstofan value,
   - final max-blended value.

5. Fix the station cards to show the row relevant to the selected departure/ETA, or at least show enough rows that the value used in calculation is visible.
   - The current `forecastRows[0]` display is misleading.

## Suggested wording for the product decision

For the next step, I recommend:

> Keep Veðurstofan visible as a separate validation layer, but do not let it change the route assessment by default. The route assessment remains MET/Yr until we have a separate explicit "use Veðurstofan in assessment" experimental control and provenance explaining exactly which station/time changed the result.

This is consistent with Stebbi's earlier direction: better for the user, future-proof, but not misleading.

## Localhost checks for Stebbi

After Claude Code patches this:

1. Run the same route from the screenshots.
2. Turn `met.no` on and `Veðurstofan` off.
   - Expected: baseline route assessment.
3. Turn both `met.no` and `Veðurstofan` on.
   - Expected, if display-only patch is chosen: route assessment stays the same as baseline, but Veðurstofan station cards appear separately.
4. Turn `met.no` off and `Veðurstofan` on.
   - Expected: MET/Yr cards disappear, Veðurstofan station cards remain, but route assessment does not pretend to be Veðurstofan-only unless there is an explicit calculation mode.
5. If an explicit "Nota Veðurstofu í mati" toggle is added:
   - default should be off,
   - turning it on may change the assessment,
   - the UI must explain which station/time/value caused the change.
6. Confirm there is no mysterious `11 m/s` value unless it is visible in the provenance/forecast row used.
7. Confirm hviður are not implied unless actual gust data is being used and labelled as such.

No SQL, migration, Supabase, cron, deploy, push, or commit should be part of this patch.
