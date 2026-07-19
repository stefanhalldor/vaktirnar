# 2026-07-19 12:11 - TODO 086 v207 - Codex restore overview Safnpuls hotfix

Created: 2026-07-19 12:11
Timezone: Atlantic/Reykjavik

## Context

Stebbi reported after telling Claude Code to release that the top Safnpuls / conditions drawer is missing from `/vedrid`, even when no route/place filter is selected. This is visible in production screenshot: banner + thresholds, then map, with no `Fréttir af aðstæðum frá notendum Teskeiðarinnar` drawer.

Codex inspected this read-only. No code, SQL, commit, push, deploy, or production action was performed.

## Findings

1. **Likely root cause: the overview Safnpuls hides itself when the feed has zero items.**
   `components/weather/ConditionsFeedPreview.tsx` returns `null` when:

   - `items.length === 0`
   - `emptyBehavior === 'hide'`

   `components/weather/WeatherOverviewClient.tsx` passes `emptyBehavior="hide"` to the top conditions drawer. That contradicts the comment saying the drawer is "always visible at the top".

2. **The public top feed currently queries only Vegagerdin pulse targets.**
   `app/api/teskeid/weather/vedurpuls/feed-preview/route.ts` calls:

   `getLatestConditionFeedPreviews(limitItems, ['vegagerdin_station'])`

   This was intentional in the Vegagerdin migration phase, but it means old Veðurstofan pulse messages no longer populate the overview feed. If Stebbi recently hard-deleted test Vegagerdin messages, or if production only has older Veðurstofan messages, the feed returns `[]` and the entire drawer disappears.

3. **The route filtering logic itself still exists.**
   `filteredConditionsItems` in `WeatherOverviewClient.tsx` filters feed items against `vedurstofanRouteFilterIds` and `vegagerdinRouteFilterIds`. So the feature was not fully removed; the visible shell is disappearing before users can see it.

4. **Potential legacy-provider edge case.**
   Some old Veðurstofan threads may have `provider = null`. The current filter passes unknown provider items through unfiltered. If Claude Code decides to include both target types again, filtering should infer provider from `targetType` when `provider` is null.

## Recommended hotfix

Keep the hotfix small and release-safe:

1. In `WeatherOverviewClient.tsx`, make the top Safnpuls drawer render even when empty:
   - remove `emptyBehavior="hide"` or set `emptyBehavior="message"`
   - pass `emptyLabel={tOv('conditionsFeedEmpty')}`

   Expected result: the drawer/header is visible at the top, with a friendly empty state if no messages match.

2. Decide feed scope explicitly:
   - **Recommended for this hotfix:** read both providers in the public preview endpoint:
     `['vegagerdin_station', 'vedurstofan_station']`
   - Reason: this preserves existing historical Veðurstofan pulse content while the product transitions to Vegagerdin write-primary reports.
   - If Stebbi wants Vegagerdin-only from now on, keep endpoint as-is, but the drawer must still be visible with an empty state.

3. If both providers are included, update route filtering to infer provider from `targetType`:

   - `vegagerdin_station` -> `vegagerdin`
   - `vedurstofan_station` -> `vedurstofan`

   Use that inferred provider both for filtering and `targetHref`.

4. Add/adjust tests:
   - `ConditionsFeedPreview` or overview behavior: empty feed with message behavior renders the drawer/title instead of null.
   - `feed-preview` API: if both providers are chosen, update expected target types.
   - `filteredConditionsItems`: legacy `provider: null`, `targetType: 'vedurstofan_station'` filters correctly when a route is selected.

## Do not expand scope

Do not redesign the page, change route-memory SQL, touch cron, or alter write permissions in this hotfix. This is only to restore the missing top Safnpuls and preserve route filtering.

## SQL / production notes

- No SQL should be needed for the small UI/API hotfix if SQL81 has already been run.
- If the endpoint remains Vegagerdin-only, no SQL/data change is needed.
- If both target types are included, it is read-only and uses already-supported `target_type` values.
- Do not run SQL85.

## Route intelligence check

- Affected route context: `/vedrid` route/place station filtering, not `/ferdalagid` calculation itself.
- Affected provider station sets: `vedurstofanRouteFilterIds` and `vegagerdinRouteFilterIds`.
- The desired behavior is provider-neutral: Safnpuls items should filter to the active station set regardless of whether the item came from Veðurstofan or Vegagerdin.
- No raw Google route geometry, user routes, addresses, or place IDs are involved.
- No `IcelandRoadmap.md` update is needed for this hotfix because this is UI/feed restoration, not new route-domain intelligence.

## Localhost checks for Stebbi

1. Open `/vedrid` with no `Frá`/`Til` selected.
   - Expected: `Fréttir af aðstæðum frá notendum Teskeiðarinnar` drawer is visible above the map.
   - If there are no messages, it shows the empty state instead of disappearing.

2. Select a known route/place pair in the route pills.
   - Expected: Safnpuls remains visible and filters to messages from the selected route station set.

3. Clear the route.
   - Expected: Safnpuls returns to global/all-route visible feed state.

4. If both providers are included:
   - Confirm old Veðurstofan messages can appear read-only.
   - Confirm Vegagerdin station links open the Vegagerdin pulse page and Veðurstofan station links open the Veðurstofan pulse page.

5. Confirm clicking route/place pills does not open a station detail card.

## Suggested release decision

If Safnpuls visibility matters for this release, pause deployment or follow immediately with this hotfix. The current code can look like the community pulse feature was removed, even though the underlying logic still exists.
