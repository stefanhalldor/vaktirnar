# 2026-07-19 12:17 - TODO 086 v208 - Claude done, post-release

Created: 2026-07-19 12:17
Timezone: Atlantic/Reykjavik

## What was done

Two commits pushed to main for TODO-086 release.

---

### Commit 1: feat: route-variant dominance, caution IDs, threshold save-button fix (#86)

SHA: 33875c6

Changes from earlier in this session (v191-v203):

- `WeatherThresholdBar`: dirty flag reset only on explicit reset click, not on
  threshold prop changes. Save button stays visible after valid typing.
- `dedupeRouteVariants`: Phase 2 drops non-curated variants whose station set is
  an exact subset of any curated variant.
- Route-memory: `route_caution_ids` wired end-to-end. Requires sql/87.
- `vercel.json`: warm-vegagerdin cron at `*/3 * * * *`.
- `sql/87_weather_route_memory_route_cautions.sql`: additive migration (not yet run).
- 80 tests pass.

---

### Commit 2: fix: restore Safnpuls drawer on /vedrid overview (#86)

SHA: 6733e95

Hotfix per v207 Codex handoff:

**`app/api/teskeid/weather/vedurpuls/feed-preview/route.ts`**
- `['vegagerdin_station']` → `['vegagerdin_station', 'vedurstofan_station']`
- Both providers included so historical Veðurstofan pulse content remains visible
  during the write-primary transition to Vegagerðin.

**`components/weather/WeatherOverviewClient.tsx`**
- `emptyBehavior="hide"` → `emptyBehavior="message"` with `emptyLabel={tOv('conditionsFeedEmpty')}`
  so the Safnpuls drawer is always visible at the top even when the feed is empty.
- `filteredConditionsItems`: infers effective provider from `targetType` when
  `item.provider` is null (legacy Veðurstofan rows: `vedurstofan_station` → `vedurstofan`).
- `targetHref`: same inference for null-provider items when building the pulse link.

---

## Commands run

- `npm run type-check` — exit 0, clean
- `npm run test:run -- (3 targeted files)` — exit 0, 80 tests pass
- `git push` ×2 — both pushed successfully

## Post-deploy checklist for Stebbi

### SQL (must happen before or immediately after deploy)

1. Confirm sql/82 is applied in production (saved wind thresholds).
2. Confirm sql/83 is applied (Vegagerðin history table). Rows may be empty until
   a non-skipped cron run -- monitor after deploy.
3. Confirm sql/86 is applied (route-memory tables).
4. **Run sql/87** before or immediately after deploy (`route_caution_ids` column).
   Without sql/87, route-memory writes log an error and `Varasöm leið` never appears.
5. Do not run sql/85.

### Vercel post-deploy

1. Verify Vercel build is green.
2. Confirm `/api/cron/warm-vegagerdin` cron appears in Vercel dashboard at `*/3 * * * *`.
3. After one non-skipped cron run, verify `vegagerdin_measurements_history` has rows.

### Localhost / production smoke tests

1. `/vedrid`: `Fréttir af aðstæðum frá notendum Teskeiðarinnar` drawer is visible
   above the map regardless of whether there are messages.
2. `/vedrid`: change wind threshold, map updates immediately, save button stays visible.
3. `/vedrid`: route pills filter Safnpuls items to the selected station set.
4. After sql/87 + a new route calc with cautions: relevant pill shows `Varasöm leið`.
5. `/vedrid/ferdalagid`: `Frá`/`Til` hydrate correctly from selected route.

## Remaining post-release items (not blocking)

- SQL83 history fallback: needs verification that a cron run writes rows.
- `Varasöm leið` pills: only appear after sql/87 is run and a new route calc
  writes caution IDs into route-memory.
- Near-duplicate generic route pills: exact-subset dominance removes only perfect
  subsets; near-duplicates may still appear if station sets differ by one station.
  Addressed in a future route-quality pass.
