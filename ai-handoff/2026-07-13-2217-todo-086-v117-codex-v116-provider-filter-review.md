# TODO 086 v117 - Codex review of Claude v116 provider filter prerelease

Created: 2026-07-13 22:17
Timezone: Atlantic/Reykjavik

Review target: `2026-07-13-2215-todo-086-v116-claude-v115-done-prerelease.md`

## Findings

### 1. Medium - `met.no` toggle only hides the explainer list, not the MET/Yr map layer or open forecast drawers

`app/auth-mvp/vedrid/FerdalagidClient.tsx:891` toggles `showMetno`, and `app/auth-mvp/vedrid/FerdalagidClient.tsx:1281` uses that state to hide/show `RoutePointRow` cards in "Allir spápunktarnir".

But the interactive map still receives the full MET/Yr route point list unconditionally at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1205-1223`:

- `weatherPoints={result.travelPlan!.routeWeatherPoints!}`
- `onOpenForecastDrawer` still opens MET/Yr forecast rows

Also, unlike the Veðurstofan toggle at `app/auth-mvp/vedrid/FerdalagidClient.tsx:411-414`, the met.no toggle does not close an already-open forecast drawer or comparison drawer.

Why this matters:

- The UI says `Gagnaveitur`, so users will reasonably read `met.no` off as "hide met.no source/layer".
- In practice, turning `met.no` off only hides one list section. The map can still show MET/Yr markers, selected MET/Yr point details, and forecast drawers.
- This creates a confusing state: `met.no` looks disabled in the filter, while met.no data is still visible and interactive elsewhere.

Recommended fix:

- Either rename/reframe the toggle as a list-only filter, which is not what Stebbi asked for, or
- make `showMetno` consistently affect MET/Yr visibility across all provider-aware UI surfaces:
  - "Allir spápunktarnir"
  - map markers / selected point panel
  - forecast drawer opening
  - any comparison/drawer state that is based on hidden MET/Yr rows
- At minimum, when `showMetno` changes to false, close `forecastDrawerData` and `compareDrawerOpen`, similar to `toggleVedurstofan`.

### 2. Medium - Feature-off flow is not actually unchanged because MET/Yr badges are always added

v116 Localhost check #14 says:

> With feature flag/access off: provider filter not visible, existing weather flow unchanged.

But `app/auth-mvp/vedrid/FerdalagidClient.tsx:1290` always passes a provider label to `RoutePointRow`:

```tsx
providerLabel={vedurstofanLayer && showVedurstofan ? tf('metnoBlendedLabel') : tf('providerMetnoLabel')}
```

So when `vedurstofanLayer` is absent, ordinary route point cards still get a new `met.no` badge through `RoutePointRow` at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1797-1799`.

This may be product-desirable eventually, but it contradicts the stated feature-flag expectation that existing weather flow is unchanged.

Recommended fix:

- Decide explicitly:
  - If provider labels should be released to all users now, update the handoff/release notes and localhost checks to say so.
  - If this whole provider-aware UI is still feature-gated, pass `providerLabel` only when `vedurstofanLayer` exists or another explicit provider-UI flag is on.

### 3. Medium/low - `met.no off` + `Veðurstofan off` leaves "Allir spápunktarnir" with no visible point rows and no empty explanation

The explainer body renders when the underlying MET/Yr route point list exists at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1278`, even if `showMetno` is false and `showVedurstofan` is false.

That means the user can see:

- "Allir spápunktarnir á leiðinni"
- the transparency copy
- no visible point cards

Recommended fix:

- Either prevent both enabled sources from being off at the same time, or
- show a short empty state such as "Engin gagnaveita valin" / "No data source selected".
- If the summary still depends on MET/Yr even when `met.no` is off, the UI should make that distinction explicit.

### 4. Existing residual risk - Veðurstofan rows are still route-sample based, not deduped station/provider points

Claude Code correctly calls this out as not fixed in v116.

The risk from v115 remains:

- API layer points are still built by looping over every route point and mapping each route point to nearest station.
- The UI still renders `vedurstofanLayer.points.map(...)` at `app/auth-mvp/vedrid/FerdalagidClient.tsx:1312-1317`.
- The same station can appear repeatedly in "Veðurstofan punktar (í prófun)".

This can be a follow-up if Stebbi accepts it for local testing, but it is still the biggest product-shape gap versus "72 + provider points".

## What improved in v116

- The met.no row is now a real full-row switch instead of a static indicator.
- The Veðurstofan switch now uses the whole row as the interactive target, which addresses the 40x40 touch-target issue from Design.md.
- MET/Yr route cards get provider labels, and blended rows are labelled `met.no + Veðurstofan`.
- Veðurstofan cards are visually distinct from MET/Yr cards.
- No SQL, migrations, Supabase config, cron, commit, push, or deploy changes were made in this patch.

## Tests run by Codex

Command:

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result:

- exit 0
- 2 test files passed
- 24 tests passed

Command:

```bash
npm run type-check
```

Result:

- exit 0

## Release recommendation

I would do one more small v118 patch before calling this release-ready.

The key decision is product semantics:

- If `Gagnaveitur` is meant to be a true provider/layer visibility filter, then `met.no` off must also affect the map and selected point surfaces.
- If it is only meant to filter "Allir spápunktarnir", then the label/copy should say that, because right now it reads broader than that.

My recommendation: make it a true provider visibility filter, at least for visible point surfaces. Keep the main summary assessment visible if needed, but label clearly that the assessment still uses the selected calculation source.

## Suggested next instruction to Claude Code

```text
Claude Code, rýndu v117 og gerðu lítinn v118 patch áður en þetta fer í release.

Markmið:
1. Láta `met.no` toggle ekki aðeins fela MET/Yr spjöldin í "Allir spápunktarnir", heldur líka passa við map/selected-point/drawer hegðun. Ef `met.no` er off, eiga MET/Yr markers/selected MET point detail/forecast drawer ekki að halda áfram eins og ekkert hafi gerst.
2. Þegar `met.no` er togglað off, lokaðu opnum forecast drawer og comparison drawer eins og gert er í `toggleVedurstofan`.
3. Forðastu tómt og óskýrt "Allir spápunktarnir" state þegar bæði `met.no` og `Veðurstofan` eru off. Annaðhvort koma í veg fyrir að allt sé off eða sýna skýrt empty state.
4. Staðfestu hvort `met.no` provider badge á venjulegum feature-off notendum sé viljandi. Ef provider-aware UI á enn að vera feature-gated, ekki sýna badge utan flaggs/access.

Ekki breyta SQL, migrations, cron, Supabase config, commit-a, push-a eða deploya.
Keyrðu targeted tests og type-check og skilaðu prerelease handoff með Localhost checks for Stebbi.
```

## Localhost checks for Stebbi

After a v118 patch:

1. Open the route weather flow with `elta-vedrid` access and the experimental flags on.
2. Confirm `Gagnaveitur` appears near the top of the result card.
3. Turn `met.no` off.
4. Confirm MET/Yr cards disappear from "Allir spápunktarnir".
5. Confirm MET/Yr map markers and selected MET/Yr point details are also hidden or clearly unavailable while `met.no` is off.
6. Confirm any open MET/Yr forecast drawer closes when `met.no` is turned off.
7. Turn `Veðurstofan` on while `met.no` is off. Confirm only Veðurstofan provider rows/points are visible where expected.
8. Turn both providers off if the UI allows it. Confirm the UI either prevents it or shows a clear empty state.
9. Turn `met.no` on again. Confirm MET/Yr map/list/card behavior returns.
10. With feature flag/access off, confirm whether provider badges are expected. If they are not expected, confirm ordinary users do not see the provider filter or provider badges.
11. Check 360, 390, and 460 px widths for no horizontal overflow and comfortable row-level toggles.

Do not test production cron, Supabase migrations, or production data changes as part of this UI check unless Stebbi separately approves that.

## Uncertainty / needs confirmation

The main uncertainty is product intent: should `met.no` off hide every visible MET/Yr surface, or only the point list?

Based on Stebbi's wording ("toggle'a inn og út Met.no, Veðurstofan og Vegagerðin") and the UI title `Gagnaveitur`, I read it as a provider/layer visibility filter, not just a list filter.
