# TODO 086 v168 - Codex review of v167 plus Stebbi decisions

Created: 2026-07-14 19:35:51 +00:00
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-1950-todo-086-v167-claude-v166-done-prerelease.md`

Mode:
- Review / decision handoff only.
- No application code, SQL, env, migration, commit, push, deploy or Supabase action was performed by Codex.

## Findings

### High - v167 fixed the conservative freshness core, but the client should refetch after `stillStale` too

v167 changes `result_atime` to the minimum projected `atimeIso` and uses `isVedurstofanCycleFresh(warmResult.resultAtimeIso, now)` in the manual refresh endpoint. That fixes the specific v166 problem where one fresh station could make the whole warm look fresh.

However, the client currently refetches `/api/teskeid/weather/travel` only when the refresh endpoint returns `fresh` or `alreadyFresh`:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:473-506`

Because the refresh endpoint is now intentionally global/conservative across projected stations, it can return `stillStale` because an unrelated station elsewhere is stale, even if the stations on the current route got updated.

User-facing behavior should be route-layer-first:
- Always refetch the displayed travel layer after a completed warm attempt, including `stillStale`.
- Then judge what the user sees from the new `vedurstofanLayer.layerAtimeIso`.
- If the current route layer is fresh, show fresh for the visible result.
- If the current route layer is still stale, keep the stale banner.

This keeps the global anti-stampede conservative while still giving the user the freshest route data we have.

### High - Stebbi decision: replace/clarify the two-flag contract with one per-user extra-provider gate

Stebbi clarified the intended direction:

> Réttast væri að hafa bara “Extra_provider” flag sem væri þá núna Veðurstofan en næst Vegagerðin og svo í framtíðinni nýtt í eitthvað annað ef við ætlum að bæta við. Það þyrfti að vera per user eins og annað sem er undir flaggi.

Codex recommendation:
- Use one experimental “extra weather providers” gate for all non-MET/Yr providers in the travel-weather product.
- Keep it per-user, like the other flagged features.
- Prefer a stable kebab-case feature key and an env var that makes the scope obvious:
  - feature key: `extra-weather-providers` or `weather-extra-providers`
  - env var: `WEATHER_EXTRA_PROVIDERS_FLAG=true`
- Avoid long-term split-brain between:
  - `WEATHER_ELTA_VEDRID_FLAG`
  - `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`

Implementation implications for Claude Code:
- Add the new feature key to guard logic.
- Add/adjust SQL migration for `feature_access_feature_key_check`.
- Gate the provider selector, Veðurstofan travel-layer reads, manual refresh endpoint, and later Vegagerðin under this same extra-provider access.
- Keep `elta-vedrid` only if it remains a separate validation/explorer route, not as the long-term travel-provider gate.
- Add tests proving unflagged users get MET/Yr-only behavior even if client input or UI state tries to enable extra providers.

Do not run the migration until Stebbi explicitly approves Supabase execution.

### High - Stebbi decision: implement the shared Veðurstofan card/display model now

Stebbi also clarified:

> Varðandi shared spjaldið þá skulum við útfæra það.

So the deferred v167 item is no longer waiting for product decision. Claude Code should implement it next.

Recommended implementation shape:
- Extract a shared Veðurstofan display model helper for:
  - station name;
  - status;
  - departure time;
  - ETA / distance from origin;
  - distance from road;
  - forecast issue time;
  - previous / used / next forecast rows;
  - source URL.
- Keep one source of truth for selecting `prev`, `used`, `next` relative to ETA.
- Render that model with two presentation variants:
  - full card for selected map point and “Allir spápunktar”;
  - compact structured-summary variant for “Á leiðinni”.
- Do not put a full nested card inside the summary. Follow `Design.md` structured-summary guidance: use rows/dividers inside the summary panel.
- Keep all user-facing strings in `messages/is.json` and `messages/en.json`.

The goal is not identical visual layout everywhere. The goal is identical weather meaning and shared data selection everywhere.

## What Looks Good In v167

- `result_atime` is now conservative/min rather than max.
- Manual refresh endpoint no longer treats one fresh station as enough.
- Run-state query regression test now asserts `result_atime`, not `finished_at`.
- The two-phase refresh direction is correct; it just needs to refetch after `stillStale` as well.

## Recommended Next Step For Claude Code

Implement a v169 patch with three focused parts:

1. **Route-layer refetch after manual warm**
   - Refetch `/api/teskeid/weather/travel` after any completed warm response (`fresh`, `alreadyFresh`, `stillStale`).
   - Judge final UI state from the newly displayed `vedurstofanLayer.layerAtimeIso`.
   - Keep `recentlyAttempted` / `running` as no-refetch unless Claude Code has a clear reason to refresh.

2. **Extra provider gate**
   - Introduce one per-user extra-provider feature gate for Veðurstofan now and Vegagerðin next.
   - Decide exact key name before coding; Codex prefers `extra-weather-providers` or `weather-extra-providers`.
   - Add SQL migration only as a file; do not run it.
   - Keep unflagged users MET/Yr-only at server level.

3. **Shared Veðurstofan display model**
   - Extract shared model/selector.
   - Use compact variant in “Á leiðinni”.
   - Use full variant in selected map point and all-points list.
   - Add tests for selector/model and a minimal UI regression if practical.

## Localhost Checks For Stebbi

After Claude Code's next patch:

1. Open `/auth-mvp/vedrid` with a user who has `vedrid`, `ferdalagid`, and the new extra-provider access.
2. Choose a route with Veðurstofan stations, for example Reykjavík to Stóra-Borg.
3. Toggle `met.no` off and Veðurstofan on.
4. If the stale banner appears, click “Sækja ný gögn”.
5. Expected:
   - the button enters a visible refreshing/pending state;
   - the route layer is refetched even if the global warm response is `stillStale`;
   - if the route stations are fresh, the visible stale state clears;
   - if the route stations are still stale, the stale state remains.
6. Compare the same Veðurstofan station in:
   - “Á leiðinni”;
   - selected point on the map;
   - “Allir spápunktar”.
7. Expected:
   - same station;
   - same used forecast time;
   - same forecast issue time;
   - same previous/used/next values where shown;
   - compact summary may be visually shorter, but must not contradict the full card.
8. Test unflagged access:
   - with the extra-provider flag/user access off, the provider selector should not expose Veðurstofan/Vegagerðin;
   - travel API should return MET/Yr-only data;
   - manual refresh endpoint should not be usable for that user.

Supabase caution:
- Any new feature key requires a migration or SQL update to `feature_access` constraints.
- Do not run any SQL on Supabase until Stebbi explicitly approves it.
- Do not test manual refresh casually against production unless Stebbi intends to trigger all-station Veðurstofan warm and product-table/cache writes.

## Óvissa / þarf að staðfesta

- Exact feature key name is not final. Stebbi used “Extra_provider”; Codex recommends a kebab-case feature key for consistency with existing keys.
- Need decide whether `elta-vedrid` remains as a separate validation/explorer route gate or is replaced by the new extra-provider gate in all places.
