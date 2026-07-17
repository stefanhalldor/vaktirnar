# 2026-07-17 09:51 — TODO-086 v403 — Codex review of v402 B0.5 type fix

Created: 2026-07-17 09:51  
Timezone: Atlantic/Reykjavik  

Source reviewed: `2026-07-17-0948-todo-086-v402-claude-v401-b05-type-fix-prerelease`

## Findings

No blocking findings.

v402 fixes the v401 issue correctly: `ProviderStationPreviewCard` no longer depends on `ProviderStationPoint` or any Veðurstofan-specific forecast shape. The shell now accepts only the display fields it renders itself:

- `stationName`
- `distanceM`
- `providerLabel`
- `onClose`
- `children`

That is the right B0.5 boundary. Vegagerðin can now reuse the same shell without pretending to be a Veðurstofan station.

## Non-Blocking Notes

### Handoff file timestamps are still messy

The user-facing handoff file is `2026-07-17-0948-todo-086-v402-claude-v401-b05-type-fix-prerelease.md`, while the content says `Created: 2026-07-17 11:00`, and git status shows a deleted tracked `2026-07-17-1100...` file.

This is bookkeeping noise, not a product issue. Do not spend implementation time on it unless Claude Code is explicitly cleaning handoff history. The important code change is clean.

### RouteSelectionStep remains Veðurstofan-specific at the callsite, as expected

[components/weather/RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:453>) passes `stationName` and `distanceM` to the neutral shell, then renders Veðurstofan forecast rows and `VedurstofanPulseInline` as children.

That is fine for now because the current route-selection layer is Veðurstofan only. When Vegagerðin lands, keep following this split:

- shared shell stays dumb,
- provider-specific body is rendered as children,
- avoid adding broad provider-specific logic inside `ProviderStationPreviewCard`.

## What Looks Good

- `ProviderStationPreviewCard` has no import from `providerRouteMatching`.
- The shell renders only generic header/label/distance/close layout.
- Veðurstofan-specific `forecastRows` stay in the Veðurstofan callsite.
- Púls remains as provider-specific child content.
- The rendered UI should remain unchanged for Stebbi.
- No Vík/Mýrdalur work was reopened.

## Commands Run By Codex

```txt
Get-Content -Encoding UTF8 ai-handoff/2026-07-17-0948-todo-086-v402-claude-v401-b05-type-fix-prerelease.md
git status --short
git show --stat --oneline HEAD
git diff --stat HEAD~1..HEAD
Get-Content / line inspection for:
  components/weather/ProviderStationPreviewCard.tsx
  components/weather/RouteSelectionStep.tsx
rg -n "ProviderStationPreviewCard|ProviderStationPoint|forecastRows|stationName=|distanceM=" components/weather app lib
git diff HEAD~1..HEAD -- components/weather/ProviderStationPreviewCard.tsx components/weather/RouteSelectionStep.tsx
npm run type-check
npm run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-provider-stations.test.ts
```

## Verification

- `npm run type-check` → pass
- `npm run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/providerRouteMatching.test.ts lib/__tests__/weather-provider-stations.test.ts` → 5 files passed, 73 tests passed

## Recommended Next Step

B0.5 can be treated as complete.

Next step should be B1: localhost validation of provider geometry and route-selection station behavior, without reopening Vík `verified:true`.

Suggested B1 handoff/request to Claude Code:

1. Do not change product code unless a clear bug is found and Stebbi explicitly approves implementation.
2. Produce a concise B1 validation plan for Stebbi:
   - which routes to test,
   - what stations should appear,
   - what public/auth/provider flag states to verify,
   - what regressions to watch.
3. If Claude Code already has enough from prior handoffs, B1 may be a review/validation handoff only.

Do not mix in:

- route cache / heatmap,
- Iceland overview map,
- Vegagerðin implementation,
- Vík/Mýrdalur `verified:true`,
- SQL, env, deploy, Supabase, or production changes.

## Localhost Checks For Stebbi

For v402 itself:

1. Open `http://localhost:3004/vedrid`.
2. Use a state/account where the Veðurstofan route-selection layer is visible.
3. Choose a route with Veðurstofan stations.
4. Toggle the Veðurstofan layer on.
5. Click a station marker on the route-selection map.
6. Expected: preview card appears with station name, Veðurstofan label, distance from route, forecast rows, and Veðurpúls content.
7. Click close, then click another station.
8. Expected: content changes to the new station and no stale preview remains.

Regression checks:

- final result Veðurstofan cards still look unchanged,
- met.no cards are unchanged,
- Púls links and login/return behavior are unchanged from before v402,
- no need to test Vík/Mýrdalur verified route-control yet.

## Óvissa / þarf að staðfesta

I did not run browser/localhost tests. Confidence is high on the type-contract fix and automated checks; visual confirmation still belongs to Stebbi on localhost.
