# TODO 086 v170 - Codex review of v169

Created: 2026-07-14 19:52
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-2100-todo-086-v169-claude-v168-done-prerelease.md`
- Prior Codex decision file: `ai-handoff/2026-07-14-1935-todo-086-v168-codex-v167-review-and-decisions.md`

Mode:
- Review only.
- Codex did not change app code, SQL, env, commit, push, deploy, or run migrations.
- Codex added only this review file.

## Findings

### High - `stillStale` refetch still leaves the old displayed layer in state

In `app/auth-mvp/vedrid/FerdalagidClient.tsx:490-499`, the manual refresh refetches `/api/teskeid/weather/travel`, but only calls `setVedurstofanLayer(newLayer)` inside the `isVedurstofanCycleFresh(...)` branch.

That means when the refresh endpoint returns `stillStale`, the client may successfully receive a newer route-layer payload, including updated rows or `lastWarmAttemptIso`, but the UI keeps rendering the previous `vedurstofanLayer`. This is exactly the state v168 tried to prevent: user presses "Sækja ný gögn", server work happens, but the visible result can stay stale.

Recommended fix:
- After `travelRes.ok`, always set the returned layer into state: `setVedurstofanLayer(newLayer)`.
- Then set `vedurstofanRefreshState` based on whether `newLayer?.layerAtimeIso` is cycle-fresh.
- If `newLayer` is null, keep the conservative failure/stale state.

This preserves the conservative global stale judgement while showing Stebbi the freshest route-specific data we actually have.

### High - Extra-provider feature gate was deferred even though v168 already captured Stebbi's decision

v169 explicitly defers item 2 in `ai-handoff/2026-07-14-2100-todo-086-v169-claude-v168-done-prerelease.md:68-76` and says the key name / `elta-vedrid` fate are unresolved.

But v168 already recorded the product decision clearly enough for implementation in `ai-handoff/2026-07-14-1935-todo-086-v168-codex-v167-review-and-decisions.md:33-56`:
- Use one per-user extra-provider gate for non-MET/Yr providers.
- Prefer `WEATHER_EXTRA_PROVIDERS_FLAG=true`.
- Use a stable feature key like `extra-weather-providers` or `weather-extra-providers`.
- Keep `elta-vedrid` only if it remains the separate validation/explorer route.

Current code still gates the travel layer through `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` plus `elta-vedrid`:
- `app/api/teskeid/weather/travel/route.ts:346-348`
- `app/api/teskeid/weather/vedurstofan/refresh/route.ts:41-42`
- `lib/loans/guard.ts:80-83`

Recommended next implementation:
- Add a new `extra-weather-providers` per-user feature key, unless Stebbi chooses `weather-extra-providers` before implementation starts.
- Add env kill switch `WEATHER_EXTRA_PROVIDERS_FLAG`.
- Gate travel provider selector, Veðurstofan travel layer reads, manual refresh, and future Vegagerðin under that new key.
- Leave `elta-vedrid` for `/auth-mvp/vedrid/elta-vedrid` station validation/explorer only.
- Add SQL migration for `feature_access_feature_key_check`, but do not run it without explicit Supabase approval.

### Medium - The new summary component is useful, but it is not yet the shared Veðurstofan display model Stebbi asked for

`components/weather/VedurstofanPointCard.tsx` now has two render paths:
- `VedurstofanJourneySummary` at lines 84-148.
- `VedurstofanPointCard` at lines 153-265.

The selected map point does use the full card through `components/weather/TravelAuditMap.tsx:745-755`, which is good. But the "Á leiðinni" summary uses the compact component from `app/auth-mvp/vedrid/FerdalagidClient.tsx:1355-1362`, and that compact component does not consume the same full display model as the card.

What is missing from the compact summary compared with the full card / Stebbi's requested content:
- departure time as a first-class field;
- station distance from road;
- previous / used / next forecast rows;
- source URL to vedur.is;
- one shared helper that selects and labels `prev`, `used`, `next` exactly once.

This is not a visual-design blocker, because Design.md explicitly says the summary should avoid nested full cards and use structured rows. But it is still not the requested shared data model. The right direction is:
- Extract `buildVedurstofanPointDisplayModel(...)`.
- Use that model in both `VedurstofanPointCard` and `VedurstofanJourneySummary`.
- Keep the summary compact, but make it semantically consistent with the full card.

## What Looks Good

- The selected Veðurstofan overlay point path in `TravelAuditMap` now resolves full station data and renders `VedurstofanPointCard`; this is the right pattern for selected map points.
- `DepartureHeatmap` now has `slotStatusOverrides`, and status counts/filtering/selection go through the override-aware resolver. That supports provider-neutral status display and is directionally ready for Vegagerðin.
- The summary avoids putting a full rounded card inside the existing summary panel, which matches Design.md structured-summary guidance.

## Tests / Commands Reviewed

Codex inspected:
- `WORKFLOW.md`
- `ai-handoff/README.md`
- v169 handoff
- `Design.md` structured-summary guidance
- relevant diffs and code in `FerdalagidClient.tsx`, `VedurstofanPointCard.tsx`, `TravelAuditMap.tsx`, `DepartureHeatmap.tsx`, `refresh/route.ts`, `travel/route.ts`, `vedurstofan.server.ts`, and `sql/75_weather_fetch_runs_metadata.sql`

Codex did not run test suites in this review pass.

v169 handoff does not report running tests. Before release, Claude Code should run at least:
- targeted weather/Veðurstofan tests affected by refresh, run-state, projector, travel API, map/provider UI if available;
- `npm run type-check`;
- relevant lint/build command used in this repo for prerelease confidence.

## Supabase / SQL Notes

- No SQL was run by Codex.
- `sql/75_weather_fetch_runs_metadata.sql` appears to be migration-only and should still not be run without Stebbi's explicit Supabase approval.
- The new extra-provider feature key still needs a migration before it can be used in production `feature_access`.
- Do not weaken RLS or expose provider tables to client/anon users; keep reads server/service-role mediated.

## Recommended Next Step For Claude Code

Do not release v169 as-is. Claude Code should do a small v171 fix pass:

1. Fix `handleRefreshVedurstofan` so a successful travel refetch always updates `vedurstofanLayer`, even when the status remains `stillStale`.
2. Implement the `extra-weather-providers` gate, with env `WEATHER_EXTRA_PROVIDERS_FLAG`, and keep `elta-vedrid` for the validation/explorer route unless Stebbi explicitly says otherwise.
3. Extract a shared Veðurstofan display-model helper, then make both the compact journey summary and full card render from that model.
4. Add or update tests for the above.
5. Do not run the new SQL migration until Stebbi explicitly approves Supabase execution.

## Localhost Checks for Stebbi

After Claude Code's next fix pass, Stebbi should test on localhost:

1. Open `/auth-mvp/vedrid` as a user who has the extra-provider feature access.
2. Use a route with known Veðurstofan stations, for example Reykjavík to Stóra-Borg.
3. Toggle only Veðurstofan on.
4. If the stale banner appears, click `Sækja ný gögn`.
5. Expected: the banner updates from the newly refetched route layer; if data is still stale, it should still show the latest warm attempt / latest available route data, not the old client state.
6. Compare the same station in:
   - `Á leiðinni`;
   - selected point on the map;
   - `Allir spápunktar`.
7. Expected: station name, ETA, distance context, issue time, used forecast time, and wind value should agree semantically, even if the summary is visually more compact.
8. As an unflagged user, or with `WEATHER_EXTRA_PROVIDERS_FLAG` off, open the same flow.
9. Expected: MET/Yr-only behavior; no Veðurstofan selector, no Veðurstofan layer, no manual refresh path.

Do not test SQL migration, production Supabase data, deployment, or Vercel cron changes casually. Those require explicit Stebbi approval.

## Óvissa / þarf að staðfesta

- Codex reviewed the dirty worktree, not a clean isolated v169 commit. Some touched files belong to earlier TODO 086 phases.
- The exact feature key can still be renamed before implementation, but Codex recommends choosing one now and using it consistently everywhere.
