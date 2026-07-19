# 2026-07-19 0015 - Codex review of v529 + IcelandRoadmap update

## Scope

Reviewed `2026-07-19-0010-todo-086-v529-claude-v527v528-done-prerelease`.

Also updated `IcelandRoadmap.md` so the new route-system thinking is not lost:

- Google Routes is a provider/fallback, not the canonical Teskeið road system.
- Teskeið should store provider-neutral derived route knowledge, not raw Google route content, unless terms/privacy are reviewed separately.
- Curated routes and hazardous road sections belong in the IcelandRoadmap model as first-class concepts.
- Route-related work should now answer a `Route Intelligence Check`.

## Findings

1. **High: Fresh `/vedrid` route draft can lose to stale `/ferdalagid` restore state**

   `app/auth-mvp/vedrid/FerdalagidClient.tsx:229` explicitly gives `ROUTE_RESTORE_KEY` priority over the overview route draft, and `app/auth-mvp/vedrid/FerdalagidClient.tsx:284` returns before reading the draft if an old full route result exists.

   That means this flow can still show the wrong trip:

   1. User previously calculated Reykjavík -> Akureyri in `/ferdalagid`.
   2. Same tab later opens `/vedrid`.
   3. User enters Reykjavík -> Ísafjörður in the new Frá/Til fields.
   4. User clicks `Ferðalagið`.
   5. `/ferdalagid` restores the old full result and ignores the fresh draft.

   This directly conflicts with v529's own localhost check saying the user should not see a stale previous result.

   Recommended fix: make the CTA explicit, for example `/auth-mvp/vedrid/ferdalagid?routeDraft=1`, and when that marker exists let the draft win over `ROUTE_RESTORE_KEY`. Also clear `ROUTE_RESTORE_KEY` before consuming the draft, or when writing the draft, so old route results cannot override the user's current intent.

2. **Medium: `routeDraft` validation accepts missing longitude as real coordinate `0`**

   `lib/iceland-routes/routeDraft.ts:61` validates `from.name` and `from.lat`, but not `from.lon`. Then `lib/iceland-routes/routeDraft.ts:68` silently uses `0` if longitude is missing. Same issue exists for destination at `lib/iceland-routes/routeDraft.ts:72` and `lib/iceland-routes/routeDraft.ts:75`.

   A corrupt or partial draft could become a real route from/to longitude `0`, which is far outside Iceland and could trigger strange Google route requests or confusing UI.

   Recommended fix: require finite numeric `lat` and `lon` for both `from` and `to`. Add tests for missing `from.lon`, missing `to.lon`, non-number lon, and optionally out-of-range lat/lon.

3. **Medium: URL still carries typed place names even though session draft exists**

   `components/weather/WeatherOverviewClient.tsx:545` says the CTA carries route context through the URL, and `components/weather/WeatherOverviewClient.tsx:550` to `components/weather/WeatherOverviewClient.tsx:554` appends `?from=...&to=...`.

   This is less sensitive than coordinates or place IDs, but it can still expose home/place text in URL history, screenshots, copied links, logs, or analytics. Since v529 already introduced a sessionStorage draft, the query string should probably become only a non-sensitive marker like `?routeDraft=1`, or be removed entirely if the route can be inferred from sessionStorage.

   This also helps finding #1 because it gives `/ferdalagid` a clear signal that the user intentionally came from the overview draft flow.

4. **Medium: Tests do not cover the real restore-priority contract**

   `lib/__tests__/overview-route-draft.test.ts:39` to `lib/__tests__/overview-route-draft.test.ts:101` tests the helper well, but there is no test proving that `/ferdalagid` prefers the fresh overview draft over stale route restore when the CTA is used.

   `lib/__tests__/overview-route-draft.test.ts:119` to `lib/__tests__/overview-route-draft.test.ts:130` only simulates query-string construction. It does not exercise `FerdalagidClient` or the sessionStorage priority behavior.

   Recommended fix: add a focused test or extracted helper test for restore decision order:

   - stale `ROUTE_RESTORE_KEY` + fresh draft + `routeDraft=1` => draft wins
   - stale `ROUTE_RESTORE_KEY` + no draft marker => existing restore can still win
   - invalid/corrupt draft => falls back safely

5. **Low/UX: Selected station detail can break the numbered layout order**

   `components/weather/WeatherOverviewShell.tsx:293` puts status pills directly under the map, but `components/weather/WeatherOverviewShell.tsx:300` to `components/weather/WeatherOverviewShell.tsx:305` renders selected station detail before the source/time selector at `components/weather/WeatherOverviewShell.tsx:314`.

   That may be intentional as contextual marker detail. But if Stebbi's annotated order is meant literally, selected station detail should either be an overlay/drawer or move lower so the main order stays:

   conditions -> map -> status pills -> source/time -> thresholds -> route inputs -> CTA.

## IcelandRoadmap notes

The roadmap now preserves the key product direction:

- Google Routes may be used to compute/validate routes, but not as the long-term owned route model.
- IcelandRoadmap should grow through canonical segments, route families, cautions, alternatives, station matching, and aggregate route-interest.
- Curated alternatives like `Gegnum Hólmavík` and `Til að sleppa við Öxi` should be segment-driven, not origin/destination hacks.
- Every route-related handoff should include a short `Route Intelligence Check`.

## Commands run

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/weather-travel.test.ts`
  - Exit code: 0
  - Result: 3 test files passed, 143 passed, 5 skipped

I did not run the full test suite, localhost, SQL, migrations, commits, pushes, or deployment.

## Recommended next Claude step

Fix v529 before release:

1. Replace route-name query params with a minimal `routeDraft=1` marker, or equivalent non-sensitive signal.
2. In `/ferdalagid`, if that marker is present, consume the overview route draft before stale `ROUTE_RESTORE_KEY`.
3. Clear stale route restore when draft flow wins.
4. Harden `readOverviewRouteDraft()` so missing or invalid longitude rejects the draft instead of defaulting to `0`.
5. Add tests for draft-vs-restore priority and missing longitude.
6. Re-run type-check and targeted tests.
7. Return a handoff. Do not release.

## Localhost checks for Stebbi

After Claude fixes the findings, test this on localhost:

1. Calculate any trip in `/auth-mvp/vedrid/ferdalagid` so a full route result is stored.
2. Go back to `/vedrid`.
3. Enter a different `Frá` and `Til` in the lightweight route fields.
4. Click `Ferðalagið`.
5. Expected: `/ferdalagid` opens on the route-selection step for the new route, not the old stored result.
6. Refresh `/ferdalagid`.
7. Expected: refresh behavior still preserves an already selected/calculated trip when you are not explicitly coming from `/vedrid` draft flow.
8. Check the address bar.
9. Expected: it should not expose coordinates, place IDs, or ideally typed place names; a harmless marker like `routeDraft=1` is fine.

No SQL or production data should be touched for these checks.
