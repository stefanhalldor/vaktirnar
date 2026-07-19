# 2026-07-17 11:36 — TODO-086 v414 — Codex review of v413 B3A implementation

Created: 2026-07-17 11:36  
Timezone: Atlantic/Reykjavik

Source reviewed:
- `2026-07-17-1130-todo-086-v413-claude-b3a-implementation-prerelease.md`

Files inspected:
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/ProviderStationPreviewCard.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `lib/weather/types.ts`
- `WORKFLOW.md`
- `Design.md`

## Findings

### Medium: `IcelandOverviewMap` does not reconcile marker additions/removals after initial map init

[IcelandOverviewMap.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/IcelandOverviewMap.tsx:79>) initializes the map and creates markers only once. Later the sync effect at [IcelandOverviewMap.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/IcelandOverviewMap.tsx:153>) only updates markers already in `markerRegistryRef`.

That means the reusable contract is currently narrower than the comments say:

- Passing “only visible markers” will not work: omitted markers remain visible because the sync loop never hides registry entries that are no longer in `layers`.
- Adding a new layer after map init will not work: new marker keys do not exist in the registry, so `markerRegistryRef.current.get(key)` returns nothing and the marker is never created.
- Refreshing provider data with new station IDs will not work.
- If the first `layers` value has a layer but no markers, the map initializes empty and later markers never appear.

Current Veðurstofan explorer happens to pass all markers with `visible` flags at [VedurstofanStationExplorerClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:92>), so the immediate filter UI may work. But B3A is supposed to be reusable foundation for future layers, including Vegagerðin. This should be fixed before treating the component as stable.

Recommended fix:

- Initialize the Google map once.
- Store the marker constructor/library if needed.
- Add a separate reconciliation effect:
  - compute desired marker keys from current `layers`,
  - create missing markers,
  - update existing marker position/title/icon/visibility/zIndex,
  - hide or remove markers whose keys are no longer desired,
  - optionally refit bounds when the marker set changes meaningfully.
- Either support both filtering modes (“omit filtered markers” and `visible:false`) or remove the “pass only visible markers” claim and standardize on `visible:false`.

### Medium/Architecture: Overview selection still uses a bespoke `StationDetail` card, not the shared provider shell

v413 says `ProviderStationPreviewCard` is now usable in overview-map contexts, but the overview page still renders selected stations through a bespoke `StationDetail` component at [VedurstofanStationExplorerClient.tsx](</c/Users/Lenovo/Documents/vaktirnar/app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:190>).

That might be OK if `StationDetail` is intentionally the provider-specific body for the explorer page. But if the goal is “one shared provider preview shell everywhere”, then this is only halfway extracted:

- route-selection preview uses `ProviderStationPreviewCard`,
- overview selected station uses a separate shell/card,
- future Vegagerðin could easily drift into another one-off preview.

Recommendation:

- Either wrap the selected station overview detail in `ProviderStationPreviewCard` and put Veðurstofan-specific metadata/forecast rows/Púls as children,
- or explicitly document that `StationDetail` is a full provider-specific explorer detail, not the generic preview shell.

My preference: use `ProviderStationPreviewCard` as the shell unless the overview detail needs a meaningfully different layout. That keeps us on the reusable-component track Stebbi asked for.

### Low: `ProviderStationPreviewCard` has a hardcoded Icelandic default `closeLabel`

[ProviderStationPreviewCard.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/ProviderStationPreviewCard.tsx:36>) defaults `closeLabel = 'Loka'` after removing `next-intl`.

The route wizard passes a translated label, so current visible route behavior should be fine. But the component is now meant to be reusable and import-free of i18n. A hardcoded Icelandic default can leak into English accessibility text when a future caller forgets to pass `closeLabel`.

Recommendation:

- Make `closeLabel` required, or
- keep a neutral fallback only as a development guard but document that product callers must pass translated text.

Given Teskeið rules that user-facing text belongs in messages, required `closeLabel` is cleaner.

### Low: `statusLabel` exists in the type but is not used by map markers

`ProviderMapMarker.statusLabel` is documented as screen-reader/tooltip text in [types.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/types.ts:365>), but [IcelandOverviewMap.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/IcelandOverviewMap.tsx:126>) sets marker title only to `m.label`.

Recommendation:

- Either include `statusLabel` in the marker title, for example `${m.label} — ${m.statusLabel}`,
- or remove/rename the comment until the field is actually consumed.

This is not a blocker, but when adding provider tones we should keep accessibility honest.

## Positive Notes

- v413 follows the right architectural direction: `ProviderMapLayer` + `IcelandOverviewMap` is the reusable core we want.
- `contextLine` in `ProviderStationPreviewCard` is the right move and avoids making route distance part of the generic card contract.
- Keeping filters outside the map is correct.
- Veðurstofan domain status is mapped into display tone before reaching the map, which protects Vegagerðin/future providers from inheriting Veðurstofan semantics.
- Scope discipline is good: no SQL, env, route cache, heatmap, Vegagerðin ingestion, or deferred geometry tuning.

## Design.md Notes

This direction matches `Design.md` on mobile-first app behavior, reusable components, stable controls, and avoiding one-off UI. The main Design.md risk is the same as the architecture risk above: if overview detail cards drift away from the shared provider shell, future provider previews can become visually inconsistent and harder to keep mobile-safe. Claude Code should keep the map/filter controls stable at 360-460 px and avoid nested card-heavy layouts when hardening this.

## Recommended Next Step

Before moving to the next bigger product phase, ask Claude Code to do a small B3A hardening pass:

1. Fix marker reconciliation in `IcelandOverviewMap`.
2. Decide and document/wrap the overview `StationDetail` relationship to `ProviderStationPreviewCard`.
3. Make `closeLabel` required or clearly required-by-product-callers.
4. Either use `statusLabel` in marker titles or adjust the type comment.
5. Run type-check and a focused test suite/full tests as appropriate.
6. Return a handoff.

This is not a huge refactor; it is the kind of small hardening that prevents the reusable foundation from being brittle when Vegagerðin arrives.

## Suggested Claude Code Prompt

```txt
Workflow

Please read:
- ai-handoff/2026-07-17-1130-todo-086-v413-claude-b3a-implementation-prerelease.md
- ai-handoff/2026-07-17-1136-todo-086-v414-codex-v413-b3a-implementation-review.md
- WORKFLOW.md section "Vöru- og architecture-principles"

Do a small B3A hardening pass only.

Scope:
- Fix IcelandOverviewMap marker reconciliation so markers can be added, removed, hidden, and updated after initial map init.
- Ensure the component contract is true: either support omitted filtered markers or standardize on visible:false and document it.
- Decide whether the overview selected-station detail should use ProviderStationPreviewCard as its shell. Prefer shared shell unless there is a clear UX reason not to.
- Make closeLabel required on ProviderStationPreviewCard, or otherwise prevent hardcoded Icelandic from leaking into future English callers.
- Use ProviderMapMarker.statusLabel in marker title/tooltip, or adjust the type comment.

Do not:
- implement Vegagerðin ingestion,
- add route cache/heatmap,
- reopen Öxi/Höfn/Djúpivogur or Reynisfjall/Vík deferred work,
- add SQL/migrations,
- change env/Vercel,
- commit/push/deploy.

Run type-check and relevant tests, then create a handoff.
```

## Localhost Checks for Stebbi

After Claude Code hardens B3A, Stebbi should test:

1. `/auth-mvp/vedrid/elta-vedrid`
   - Map loads.
   - All Veðurstofan markers appear.
   - Selecting marker highlights it and opens detail.
   - Clicking the same marker again clears selection.

2. Filters:
   - All/Ok/Stale/Unavailable update both map and station list.
   - No previously visible markers remain stuck after changing filters.

3. URL restore:
   - Open `/auth-mvp/vedrid/elta-vedrid?stationId=31392` or another known station.
   - Expected: station is selected after load and marker is highlighted.

4. Mobile + desktop:
   - 390 px mobile: no horizontal overflow, map/controls fit.
   - Wide desktop: overview does not feel broken or overly stretched.

5. Route wizard regression:
   - `/auth-mvp/vedrid` route-selection station preview still shows “x km frá veginum”.
   - Close button works.

No Supabase, SQL, RLS, env, Vercel, billing, deployment, or production-data testing applies to this hardening pass.

## Commands Run By Codex

- Read v413 handoff.
- Read `ai-handoff/README.md`.
- Searched for `IcelandOverviewMap`, `ProviderMapLayer`, `ProviderStationPreviewCard`, `contextLine`.
- Read relevant implementation files with line numbers.
- Reviewed `git status --short`.

No tests were run by Codex. No product code was changed by Codex in this review.

## Uncertainty / Needs Confirmation

I did not run browser/localhost checks. The marker reconciliation finding is based on source inspection and should be verified by Claude Code in implementation/tests.
