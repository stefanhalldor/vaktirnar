# 2026-07-17 11:16 — TODO-086 v412 — Codex review of v411 B3A + workflow principle update

Created: 2026-07-17 11:16  
Timezone: Atlantic/Reykjavik

Source reviewed:
- `2026-07-17-1114-todo-086-v411-claude-b3a-overview-map-plan.md`
- `WORKFLOW.md`
- `Design.md`

Codex also updated:
- `WORKFLOW.md`

## Findings

### Medium: Do not make `distanceM` optional as the core abstraction; make the card shell context-neutral

v411 asks whether to make `distanceM` optional in `ProviderStationPreviewCard` [v411:103-112](</c/Users/Lenovo/Documents/vaktirnar/ai-handoff/2026-07-17-1114-todo-086-v411-claude-b3a-overview-map-plan.md:103>).

I agree with the instinct behind option A: do not create a separate `ProviderOverviewPreviewCard` just because overview has no route distance.

But the cleaner reusable move is not simply `distanceM?: number`. That keeps a route-specific prop as part of the generic card contract.

Recommended contract:

- Keep one shared provider preview shell.
- Replace or supplement `distanceM` with a generic optional context/meta slot, for example:
  - `contextLine?: React.ReactNode`
  - or `meta?: React.ReactNode`
  - or `secondary?: React.ReactNode`
- Route wizard passes the existing “x km frá leiðinni” line through that slot.
- Overview map omits it, or later passes overview-specific context.

This keeps one component, avoids duplicate UI, and prevents the overview map from inheriting route-specific language.

### Medium: `ProviderMapMarkerStatus` should be display-neutral enough for Vegagerðin and later layers

v411 proposes `ProviderMapMarkerStatus = 'ok' | 'stale' | 'unavailable'` [v411:55-68](</c/Users/Lenovo/Documents/vaktirnar/ai-handoff/2026-07-17-1114-todo-086-v411-claude-b3a-overview-map-plan.md:55>).

That is good for Veðurstofan data freshness, but it may be too semantically narrow for Vegagerðin, campsites, fishing rivers, golf courses, hiking routes, or later route-interest layers.

Recommendation:

- Keep provider-specific status outside the map engine.
- Let the layer convert provider domain state into a shared display tone before markers reach `IcelandOverviewMap`.
- Prefer something like:
  - `tone: 'ok' | 'warning' | 'danger' | 'muted' | 'unavailable'`
  - optional `statusLabel?: string`
  - optional `title?: string`
- The map should render marker appearance from `tone`, not know whether the provider status is “stale”, “closed”, “icy”, “missing data”, etc.

If Claude Code wants a smaller first step, `status` is acceptable only if documented as a display status, not provider domain status.

### Low: Keep filters outside `IcelandOverviewMap`

v411 asks whether filter tabs belong inside the map or outside [v411:164](</c/Users/Lenovo/Documents/vaktirnar/ai-handoff/2026-07-17-1114-todo-086-v411-claude-b3a-overview-map-plan.md:164>).

I agree with Claude Code: keep filters outside the map.

Reason:

- Veðurstofan filters by data freshness/status.
- Vegagerðin may filter by road condition, warning type, open/closed, weather station type, etc.
- Future layers may not have filters at all.

`IcelandOverviewMap` should render the layer data it receives and report marker selection. Provider-specific filtering belongs in the page/layer adapter.

### Low: v411 is correctly scoped, but implementation should explicitly cite Design.md

v411 is a plan for a UI/map component. Design.md requires UI/layout/navigation work to cite relevant design rules. The plan is directionally aligned with Design.md:

- reusable components over one-off screens,
- mobile-first with desktop considered,
- no nested card-heavy dashboard behavior,
- clear loading/error states,
- no dead controls.

Claude Code should mention Design.md in the implementation handoff and include mobile + desktop checks.

## WORKFLOW Update Made

I added a new section to `WORKFLOW.md`:

`## Vöru- og architecture-principles`

It now explicitly says:

- build Teskeið from reusable core pieces rather than one-off shortcuts,
- evaluate components, hooks, helpers, types, API contracts, and domain logic for reuse,
- avoid feature-specific dead ends,
- do not take technical shortcuts that make UX worse or more confusing,
- always consider direct cost such as Google, AI, Supabase, Vercel, and cache/reuse where legal and sensible,
- call out tradeoffs when reuse and simplicity pull in different directions.

Relevant lines after edit:
- [WORKFLOW.md](</c/Users/Lenovo/Documents/vaktirnar/WORKFLOW.md:170>)
- [WORKFLOW.md](</c/Users/Lenovo/Documents/vaktirnar/WORKFLOW.md:188>)

## Answers To Claude Code

### 1. Option A vs B for preview card

Choose modified A:

- one shared card/shell,
- no separate overview card,
- but do not make `distanceM` the generic abstraction.

Use a generic optional `contextLine`/`meta` slot so route-specific distance remains route-specific content.

### 2. `ProviderMapLayer` type design

Direction is sound, but make status display-oriented:

- `tone` or `displayStatus` is better than provider-domain `status`.
- Keep provider-specific meanings in layer adapters.
- Avoid per-layer `getColor(marker)` for B3A unless truly needed; functions make the map API more flexible but also less predictable and harder to serialize/test.

Recommended B3A contract:

```ts
export type ProviderMapMarkerTone =
  | 'ok'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'unavailable'

export interface ProviderMapMarker {
  id: string
  lat: number
  lon: number
  label: string
  tone: ProviderMapMarkerTone
  statusLabel?: string
}

export interface ProviderMapLayer {
  layerId: string
  providerLabel: string
  markers: ProviderMapMarker[]
  visible?: boolean
}
```

This can be simplified if Claude Code finds current code wants less, but the naming should avoid confusing freshness status with generic map display state.

### 3. Filter tabs inside or outside map

Outside. The map renders what it receives.

## Recommended Next Prompt For Claude Code

```txt
Workflow

Please read:
- ai-handoff/2026-07-17-1114-todo-086-v411-claude-b3a-overview-map-plan.md
- ai-handoff/2026-07-17-1116-todo-086-v412-codex-v411-b3a-review-workflow-update.md
- WORKFLOW.md section "Vöru- og architecture-principles"
- relevant Design.md sections for reusable components, mobile app experience, loading states, and map/UI layout

Proceed with B3A only if no blockers appear.

Scope:
- Extract a reusable Iceland overview map engine.
- Keep filters outside the map.
- Use a provider-neutral map-layer contract.
- Keep provider-domain state in adapters; the map should consume display-ready marker tone/status.
- Use one reusable provider preview shell, but make the route-distance line a generic optional context/meta slot rather than the core abstraction.
- Keep Veðurstofan as the first adapter using the new shared map component.

Do not:
- implement Vegagerðin ingestion,
- add route cache or heatmap,
- reopen Öxi/Höfn/Djúpivogur or Reynisfjall/Vík deferred geometry work,
- add SQL/migrations,
- change env/Vercel,
- deploy, push, or commit unless separately asked.

Run focused tests/type-check if implementation happens, then create a handoff immediately.
```

## Localhost Checks for Stebbi

After B3A implementation, Stebbi should test:

1. `/auth-mvp/vedrid/elta-vedrid` or the current Veðurstofan overview page.
   - Expected: map still shows Iceland-wide stations.
   - Expected: selected station still opens the same useful detail.
   - Expected: URL sync with `?stationId=` still works.

2. Mobile viewport around 390-460 px.
   - Expected: no horizontal overflow.
   - Expected: marker selection and preview card fit naturally.
   - Expected: controls do not force zoom or awkward scrolling.

3. Desktop/wide viewport.
   - Expected: overview map benefits from wider space and does not feel like a stretched mobile-only layout.

4. Filters.
   - Expected: Veðurstofan filters still work outside the shared map component.
   - Expected: map only renders filtered marker set.

5. Regression.
   - Route wizard `/vedrid` behavior should not change.
   - `ProviderStationPreviewCard` route distance line should still appear where route context exists.
   - Púls and selected-station content should still behave as before.

No Supabase, SQL, RLS, env, Vercel, deploy, billing, or production-data checks apply to this B3A plan unless Claude Code unexpectedly changes scope.

## Commands Run By Codex

- Read v411 handoff.
- Read `WORKFLOW.md`.
- Read `Design.md`.
- Read `ai-handoff/README.md`.
- Updated `WORKFLOW.md`.
- Created this review/handoff.

No product code was changed. No tests were run.

## Uncertainty / Needs Confirmation

I did not inspect the current `ProviderStationPreviewCard` implementation in this pass. The recommendation is contract-level. Claude Code should verify exact prop names and make the smallest clean refactor that preserves current route wizard behavior.
