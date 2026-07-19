# 2026-07-17 12:01 — TODO-086 v416 — Codex review of v415 B3A hardening

Created: 2026-07-17 12:01  
Timezone: Atlantic/Reykjavik

Source reviewed:
- `ai-handoff/2026-07-17-1200-todo-086-v415-claude-b3a-hardening-prerelease.md`

Context reviewed:
- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/ProviderStationPreviewCard.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`

## Findings

### Medium: Close button clears selected state but leaves stale `stationId` in the URL

[VedurstofanStationExplorerClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:191>) renders the selected station detail with:

```tsx
onClose={() => setSelectedProvider(null)}
```

That dismisses the card visually, but it does not call `syncUrl(null)`. If the current URL is `/auth-mvp/vedrid/elta-vedrid?stationId=31392`, closing the card leaves `stationId=31392` in the URL. Reloading, sharing, or returning to the page can reopen the station the user explicitly closed.

Recommended fix:

- Use the same selection path for close as map/list deselection, for example `onClose={() => handleSelect(null)}`.
- Or create `clearSelection()` that does both:
  - `setSelectedProvider(null)`
  - `syncUrl(null)`

This is small but user-visible and matters because we have already cared a lot about return-state and route/state preservation in this flow.

### Medium: `statusLabel` is still not actually passed into the Veðurstofan map markers

v415 fixed `IcelandOverviewMap` so it uses `m.statusLabel` in `markerTitle()` at [IcelandOverviewMap.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/IcelandOverviewMap.tsx:38>), which is good.

But the Veðurstofan layer built in [VedurstofanStationExplorerClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:92>) still creates markers with only:

```tsx
id, lat, lon, label, tone, visible
```

So the current user-facing marker title is still just the station name, not station + status. The reusable component is ready, but the active caller does not exercise the new contract.

Recommended fix:

- Add a small helper such as `stationStatusLabel(status, t)` or a local inline mapping.
- Pass `statusLabel` into each marker:
  - `ok` → `t('statusOk')`
  - `stale` → `t('statusStale')`
  - `unavailable` → `t('statusUnavailable')`

This keeps the provider-neutral map contract honest and improves accessibility/tooltips immediately.

### Low: Refit bounds includes hidden markers when new markers are added

[IcelandOverviewMap.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/IcelandOverviewMap.tsx:181>) refits bounds across all markers in `layers`, including markers with `visible: false`.

For the current Veðurstofan explorer this is acceptable because the initial overview is meant to fit all Icelandic stations. But the reusable contract now says callers should keep filtered-out markers in `layers` with `visible:false`; future provider toggles could add a hidden layer and unexpectedly refit the map to hidden markers.

Recommendation:

- Not a blocker for this v415 hardening.
- Before using `IcelandOverviewMap` with multiple provider layers and show/hide toggles, decide whether fit bounds should use:
  - all markers,
  - only visible markers,
  - or an explicit `fitBoundsMarkers`/`fitStrategy` prop.

## Positive Notes

- The biggest v414 concern is mostly resolved: map initialization and marker reconciliation are now separated.
- New markers can now be created after map init, existing markers update, and removed keys are hidden.
- `ProviderStationPreviewCard` now has a clearer i18n contract with required `closeLabel`.
- Wrapping the explorer station detail in the shared provider shell is directionally right and helps prevent future provider preview drift.
- No SQL, env, Supabase, Vercel, commit, push, deploy, or production-data changes are involved.

## Design.md Notes

The v415 direction matches `Design.md` better than v413 because it reduces one-off card shells and keeps provider previews on a shared component. The remaining UX concern is stale URL state after closing details: app-like navigation should preserve what the user sees and not surprise them on reload/back/return. Claude Code should also verify the shared card still behaves well at 360-460 px because `StationDetail` now has richer content inside the shared shell.

## Recommended Next Step

Ask Claude Code for a tiny v417 follow-up:

1. Fix selected-station close so it also removes `stationId` from URL.
2. Pass `statusLabel` into Veðurstofan map markers.
3. Optionally add a short comment/TODO about future fit-bounds behavior for hidden markers and multi-provider layers.
4. Run type-check and focused tests or full tests as Claude Code considers appropriate.
5. Return a handoff.

I would not turn this into a broader B3B/B4 change. This is a small polish pass on the reusable B3A foundation.

## Suggested Claude Code Prompt

```txt
Workflow

Please read:
- ai-handoff/2026-07-17-1200-todo-086-v415-claude-b3a-hardening-prerelease.md
- ai-handoff/2026-07-17-1201-todo-086-v416-codex-v415-b3a-hardening-review.md
- WORKFLOW.md

Do a tiny B3A follow-up only.

Scope:
- In /auth-mvp/vedrid/elta-vedrid, make the selected-station close button clear both selected state and the `stationId` URL param.
- Pass localized `statusLabel` into Veðurstofan `ProviderMapMarker`s so IcelandOverviewMap marker titles/tooltips include station status.
- If useful, add a short comment/TODO near fitBounds about deciding all-vs-visible markers before multi-provider overview layers.

Do not:
- implement Vegagerðin,
- change SQL/env,
- reopen route geometry, Öxi, Hólmavík, Reynisfjall/Vík, route cache, heatmap, or overview-map next phases,
- commit, push, or deploy.

Run type-check and relevant tests, then create a handoff.
```

## Localhost Checks for Stebbi

After the follow-up:

1. Open `/auth-mvp/vedrid/elta-vedrid?stationId=31392` or another known station.
   - Expected: station detail opens.
   - Click close X.
   - Expected: station detail closes and `stationId` disappears from URL.
   - Reload.
   - Expected: closed station does not reopen.

2. Open `/auth-mvp/vedrid/elta-vedrid`.
   - Hover over a marker on desktop or inspect marker title behavior if possible.
   - Expected: marker title includes station name and status, not only station name.

3. Filter tabs:
   - All/Ok/Stale/Unavailable still update map and list.
   - No markers remain visually stuck after filtering.

4. Mobile 390 px:
   - Selected station detail still fits without horizontal overflow.
   - Close button is tappable and does not shift layout.

No Supabase, SQL, RLS, auth, env, billing, deployment, or production-data testing applies to this small follow-up.

## Commands Run By Codex

- Read `WORKFLOW.md`.
- Read v415 handoff.
- Read `ai-handoff/README.md`.
- Read relevant implementation files with line numbers.
- Searched for `ProviderStationPreviewCard`, `closeLabel`, `closeDetail`, `SelectedProviderMarker`, `ProviderMapMarker`, and `IcelandOverviewMap`.
- Read relevant `messages/is.json` and `messages/en.json` snippets.
- Reviewed `git status --short`.

No tests were run by Codex. No product code was changed by Codex in this review.

## Óvissa / þarf að staðfesta

I did not run localhost/browser checks. The close-button URL issue and missing `statusLabel` pass-through are based on source inspection.
