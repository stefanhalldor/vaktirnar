# TODO 086 - v043 distance semantics Codex review

Created: 2026-07-12 21:50
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Post-release product/UX review
Input reviewed: `ai-handoff/2026-07-12-2140-todo-086-v043-claude-phase2a-released.md`
Scope: Review and product guidance only. No source code changes, no commit, no push, no deploy, no migration.

## Findings

### 1. Current wording is technically true but product-misleading

Claude Code is right about the current data model:

- `vedurstofanStation.distanceM` is measured from the selected route sample point to the nearest Vedurstofan station.
- It is not measured from the MET/Yr forecast coordinate.
- It is not measured from the nearest road to the Vedurstofan station.

But Stebbi is right about the product interpretation:

When the user is looking at a MET/Yr route point detail card, the line "Nalægasti punktur er 9,2 km fra veginum" reads like the Vedurstofan point is being compared to the same local road/forecast point context as Yr. That makes the card feel more precise and directly comparable than it really is.

The distance is useful metadata, but it is weak as a compact comparison line inside the Yr point card.

### 2. Stebbi's mental model is mostly correct

There are three different coordinates in play:

1. **Route point / road point**: the sampled coordinate on the chosen route.
2. **MET/Yr forecast point**: the forecast coordinate used for MET/Yr values, usually close to the route point after grid/coordinate handling.
3. **Vedurstofan station**: a physical station from the curated station list.

In the example:

- MET/Yr forecast point is 21 m from the selected route point.
- Vedurstofan station is 9.2 km from the selected route point.

So the Vedurstofan station is also approximately 9.2 km from the MET/Yr forecast point. More exactly, because the Yr point is only 21 m away from the route point, the station-to-Yr distance must be within about 21 m of 9.2 km.

Small correction to Stebbi's rough math: 21 m is 0.021 km, so if all three points happened to line up, 9.2 km minus 21 m would be 9.179 km, not 8.99 km. But that arithmetic detail does not change the product conclusion: the station is far enough away that it should not be presented as a direct same-point comparison.

### 3. Do not call the Vedurstofan station a "spapunktur" in this context

The current UI should avoid implying that Vedurstofan has a forecast point equivalent to the MET/Yr route forecast coordinate.

Better wording if the card keeps the block temporarily:

- "Nalægasta Vedurstofu-stod er {distance} fra thessum leidarpunkti"
- "Stod: {stationName} - {distance} fra leidinni"
- "Til vidmidunar fra naerri Vedurstofu-stod"

Even better for clarity:

- Remove the distance line from the compact route point card.
- Keep only "Vedurstofa Islands - til vidmidunar" + station name + values.
- Put the detailed distance/coverage/confidence in a dedicated station explorer or separate Vedurstofan section.

### 4. Product recommendation: stop blending Vedurstofan into the Yr point card as if it is peer data

Codex agrees with Stebbi's updated instinct:

The clean product direction is to show Vedurstofan stations as their own information layer, not as if every Yr route point has a directly comparable Vedurstofan row.

Recommended next step:

**Phase 2A hotfix / copy simplification**

- Remove or soften the current distance line in the route point card.
- If kept, change "fra veginum" to "fra thessum leidarpunkti" or "fra leidinni" so it does not sound like "the station is far from the road it stands by".
- Consider hiding Vedurstofan from the compact detail card when confidence is weak or distance is above a threshold, unless shown with clear "langt fra leid" wording.

Then:

**Phase 2B0**

- Build "Elta vedrid" station explorer as recommended in v040.
- Show Vedurstofan stations as station cards/markers with their own data.
- Let Stebbi validate station placement, values, and coverage without route/Yr coupling.

## Why this matters

The current comparison can accidentally teach the user the wrong mental model:

- MET/Yr looks like "forecast at this route point".
- Vedurstofan looks like "forecast at this route point from another provider".

But the real model is:

- MET/Yr is route-point forecast data.
- Vedurstofan is nearest-station context, sometimes close, sometimes meaningfully far away.

That difference should be visible in the product language and layout.

## Suggested copy/paste to Claude Code

```text
TODO 086 follow-up from Stebbi/Codex:

Do not implement unless Stebbi gives explicit implementation permission.

Stebbi and Codex agree that the current Vedurstofan distance line in the Yr route-point detail card is technically based on route-point-to-station distance, but product-misleading. It makes the station feel like a peer forecast point to Yr, when it is really nearest-station context.

If Stebbi approves a small hotfix, change the route point card so Vedurstofan is not framed as directly comparable to the Yr point:

- Either remove the distance line from the compact card entirely, or
- Change "Nálægasti punktur er {distance} frá veginum" to wording like "Nálægasta Veðurstofu-stöð er {distance} frá þessum leiðarpunkti" / "Nearest Veðurstofan station is {distance} from this route point".

Do not change verdict logic, heatmap, API behavior, Supabase, cache, provider filters, or station mapping.

Then Phase 2B0 should be the separate "Elta veðrið" station explorer: show Vedurstofan station markers/cards independently, with all station data and freshness, without blending them into each Yr route-point card as peer data.
```

## Localhost checks for Stebbi

If a small wording/removal hotfix is implemented:

1. Open `/vedrid` locally.
2. Calculate a route with route points where Vedurstofan station distance is several km.
3. Open a route point detail card.
4. Confirm the UI no longer implies the Vedurstofan station is the same kind of point as the MET/Yr forecast coordinate.
5. Confirm the card still clearly says Vedurstofan is only for reference at this stage.
6. Check mobile width around 360-460 px for no overlap, no awkward wrapping, and no extra dense text.
7. Confirm route verdict, heatmap, markers, and MET/Yr values are unchanged.

If Phase 2B0 station explorer is implemented later:

1. Open the internal "Elta vedrid" station explorer page/mode.
2. Confirm Vedurstofan stations are shown as their own station layer.
3. Click station markers/cards and confirm station metadata, forecast rows, freshness/stale/error state, and attribution are visible.
4. Confirm no route verdict is derived from these station cards yet.

Do not commit, push, deploy, run migrations, or touch Supabase console unless Stebbi explicitly approves those actions.

## Commands run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2140-todo-086-v043-claude-phase2a-released.md'`
  - Exit code: 0
- `git status --short`
  - Exit code: 0
  - Result: TODO086 source files are clean after commit; unrelated dirty/untracked files remain. Existing permission warning for `C:\Users\Lenovo/.config/git/ignore` appeared.
- `Get-Content` with line numbers for `lib/weather/providers/vedurstofanStations.ts`
  - Exit code: 0
  - Result: confirmed `distanceFromRoutePointM` is route point to station.
- `Get-Content` with line numbers for `app/api/teskeid/weather/travel/route.ts`
  - Exit code: 0
  - Result: confirmed `distanceM` is set from `mapping.distanceFromRoutePointM`.
- `Get-Content` with line numbers for relevant `components/weather/travelAuditMap.helpers.ts`
  - Exit code: 0
  - Result: confirmed MET/Yr forecast distance is a separate route point to MET/Yr forecast coordinate distance.
- `Get-Content` with line numbers for relevant `components/weather/RouteWeatherPointDetailCard.tsx`
  - Exit code: 0
  - Result: confirmed current UI renders `vedurStofanNearestPoint`.
- `git show --stat --oneline --decorate --no-renames a1eda72`
  - Exit code: 0
  - Result: confirmed local `HEAD -> main, origin/main` at `a1eda72`.
- `git show --name-only --format=fuller --no-renames a1eda72`
  - Exit code: 0
  - Result: reviewed commit metadata and file scope.
- `rg -n "distanceFromRoutePointM|forecastDistanceFromRouteM|distanceM|vedurStofanNearestPoint|Spápunktur um" lib/weather components/weather app/api/teskeid/weather messages/is.json messages/en.json`
  - Exit code: 0
  - Result: confirmed relevant distance labels and sources.
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - Exit code: 0
  - Result: `2026-07-12 21:50`

## Supabase / RLS / Production

- No SQL written.
- No migration written or run.
- No RLS, grants, auth, or production schema change.
- No Supabase command run.
- This review recommends UI/product wording only.

## Files changed by Codex in this review

- Added `ai-handoff/2026-07-12-2150-todo-086-v044-codex-v043-distance-semantics-review.md`

No source code, tests, SQL, env, TODO/DONE, commit, push, deploy, or Supabase state was changed by Codex.

## Tests

No tests were run for this v044 review because it is a product/semantics review only.

If Claude Code implements a copy-only hotfix, `npm.cmd run type-check` is probably enough, plus any existing targeted test if component/message typing is touched. Manual browser check matters more here because the issue is user interpretation.

## Óvissa / þarf að staðfesta

- Whether Stebbi wants an immediate copy/removal hotfix on the already-released card.
- Whether Stebbi wants to remove Vedurstofan from the route point card entirely until Phase 2B0 station explorer exists.
- Whether future UI should show confidence thresholds directly, for example "nærri", "nokkuð langt fra", "langt fra", instead of raw km alone.
