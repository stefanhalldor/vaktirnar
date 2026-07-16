# Codex addendum: provider card architecture clarification

Created: 2026-07-15 08:50
Timezone: Atlantic/Reykjavik

TODO reference: todo-086
Builds on: `ai-handoff/2026-07-15-0848-todo-086-v201-codex-v200-prerelease-review.md`

## Stebbi clarification

Stebbi confirmed an important nuance after v201:

- selected/worst cards are currently correct for **Veðurstofan** points;
- the visible `Ófullnægjandi gögn` mismatch is for **MET/Yr** selected/worst cards;
- nevertheless, the real product requirement is broader:
  - worst card,
  - selected card,
  - all-points cards,
  - across all providers

must share the same status/label/card logic as much as reasonably possible.

The goal is not just to patch one MET/Yr panel. The goal is to prevent the same class of drift when Vegagerðin is added.

## Updated interpretation of v201 blocker

The blocker from v201 still stands, but it should be framed more precisely:

- **Bug:** MET/Yr selected/worst cards compute `no_data` because `PointDetailsPanel` uses `summary.status !== undefined` as `hasData`, while active-candidate `buildPointSummary()` intentionally leaves `summary.status` undefined.
- **Not a bug:** Veðurstofan selected/worst cards are currently correct in Stebbi's screenshots.
- **Architectural issue:** MET/Yr and Veðurstofan already use different card/display paths, so labels can drift by provider and by context.

## Recommended implementation shape

Do not solve this by adding one-off conditionals only inside `PointDetailsPanel`.

Preferred direction:

1. Keep provider-specific adapters/models.
2. Share the card shell, status badge, title/header behavior, and status resolver concepts.
3. Ensure each provider has one canonical card display model used for:
   - worst point,
   - selected point,
   - all points.

Suggested shape:

```ts
type WeatherProviderPointCardModel = {
  provider: 'metno' | 'vedurstofan' | 'vegagerdin'
  title: string
  providerLabel: string
  status: WindDisplayStatus
  statusSource: 'metno' | 'vedurstofan' | 'vegagerdin'
  routeTimingRows: Array<{ label: string; value: string }>
  forecastRows: Array<...provider display row...>
  sourceLinks: Array<{ label: string; href: string }>
}
```

Then:

- `buildMetnoPointCardModel(...)`
- `buildVedurstofanPointCardModel(...)`
- later `buildVegagerdinPointCardModel(...)`

can feed a shared shell such as:

- `WeatherPointCardShell`
- `WeatherPointStatusHeader`
- `ProviderBadge`
- `WindStatusBadge`

This keeps provider-specific details where they belong, while preventing label/status/header/layout drift.

## Minimum acceptable fix for the current blocker

If Claude Code wants to keep this small for the immediate prerelease:

1. Extract one MET/Yr resolver:

```ts
resolveMetnoPointDisplayStatus({
  pt,
  summary,
  activeCandidate,
  activeLeg,
  thresholdsUsed,
})
```

2. Use that resolver in:
   - `TravelAuditMap` selected/worst panel,
   - route marker/status count paths,
   - `RoutePointRow` for "Allir spápunktar".

3. Do not touch Veðurstofan selected/worst behavior except to ensure it keeps using its existing working display model.

This minimum fix is acceptable only if Claude Code clearly notes that the next architectural step is shared card shell/provider adapter reuse before Vegagerðin is folded in.

## Strong recommendation before Vegagerðin

Before adding live Vegagerðin points into the travel flow, create the shared card contract/shell. Otherwise we will likely repeat the same issue:

- map marker says one status,
- selected card says another,
- all-points list says a third.

The shared shell should make the following impossible or very hard:

- selected and all-points cards disagreeing on status;
- provider labels differing by context;
- source links showing on the wrong provider;
- "no data" labels appearing when the card is displaying valid values;
- adding Vegagerðin by copying a third independent card path.

## Localhost checks for Stebbi

After the MET/Yr status fix and any shared-card refactor:

1. Test with only `met.no` enabled:
   - worst card status equals map pill/all-points status;
   - selected card status equals the clicked all-points row status;
   - no false `Ófullnægjandi gögn` when wind/forecast values are shown.
2. Test with only `Veðurstofan` enabled:
   - selected/worst Veðurstofan cards stay correct;
   - the current working Veðurstofan behavior is not regressed.
3. Test with both `met.no` and `Veðurstofan` enabled:
   - if MET/Yr is decisive, MET/Yr card status is correct;
   - if Veðurstofan is decisive, Veðurstofan card status is correct;
   - all-points list keeps provider labels clear.
4. Expand "Allir spápunktar":
   - compare at least one met.no point and one Veðurstofan point against the selected card;
   - status chip style should match the same shared `WindStatusBadge` pattern.
5. Do not run SQL77 again.

## What to send Claude Code

Send this addendum together with v201. The key instruction is:

> The immediate visual bug is MET/Yr-specific, but the fix must move us toward shared provider card logic. Veðurstofan selected/worst is currently correct, so do not break it. Reuse status/card logic across worst, selected, and all-points contexts for each provider, and avoid creating a third independent path before Vegagerðin comes in.

## Commands Run By Codex

Read-only:

- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-0848-todo-086-v201-codex-v200-prerelease-review.md'`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No code files changed.
No tests run.
No SQL run.
