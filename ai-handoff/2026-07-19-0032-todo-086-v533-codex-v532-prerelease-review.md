# 2026-07-19 0032 - Codex review of v532

Reviewed:

- `2026-07-19-0030-todo-086-v532-claude-v530v531-done-prerelease.md`

## Findings

1. **Medium/UX: `Frá` still autofocuses on initial `/vedrid` load**

   v532 says “Frá does not autoFocus on initial load”, but the actual code still autofocuses the first field.

   - `components/weather/OverviewRouteLensPanel.tsx:37` initializes `activeField` as `'from'`.
   - `components/weather/OverviewRouteLensPanel.tsx:102` to `components/weather/OverviewRouteLensPanel.tsx:106` renders `PlaceSearch` with `autoFocus={activeField === 'from' && fromPlace === null}`.
   - `components/weather/PlaceSearch.tsx:221` passes that directly to the `<input>`.

   On mobile this can pop the keyboard immediately and violates the Design.md mobile-app rule that form changes must not create awkward focus/keyboard/scroll behavior.

   Fix: initial `activeField` should be `null`, or the panel needs an explicit “has user interacted” flag so Frá can become active without autofocus on first paint. Til should still focus only after the user selects Frá.

2. **Medium: `?routeDraft=1` with missing/expired draft can still restore an unrelated old trip**

   The valid-draft path is now fixed: if `?routeDraft=1` exists and the draft is valid, draft wins and `ROUTE_RESTORE_KEY` is cleared.

   But if the marker exists and the draft is missing/expired, `app/auth-mvp/vedrid/FerdalagidClient.tsx:245` to `app/auth-mvp/vedrid/FerdalagidClient.tsx:267` falls through to normal session restore. That means the user can explicitly click `Ferðalagið` from `/vedrid`, but still land in an unrelated old restored route if the draft expired.

   It also appears `routeDraft=1` is only removed on the valid-draft path at `app/auth-mvp/vedrid/FerdalagidClient.tsx:260` to `app/auth-mvp/vedrid/FerdalagidClient.tsx:263`; the session-restore cleanup only handles `restore=1` at `app/auth-mvp/vedrid/FerdalagidClient.tsx:304` to `app/auth-mvp/vedrid/FerdalagidClient.tsx:310`.

   Fix: if `routeDraft=1` is present but no valid draft exists, do not restore a stale full result. Remove the marker, clear/ignore stale route restore for this navigation, and show the route step empty or with a harmless message. Explicit `/vedrid` route intent should not silently become yesterday’s trip.

3. **Medium/Scope: RouteObservation does not yet store Vegagerðin station IDs, segments or cautions**

   v531’s addendum proposed provider-neutral route observations with:

   - `vedurstofanStationIds`
   - `vegagerdinStationIds`
   - `routeSegmentIds`
   - `routeCautionIds`

   v532 only implements `vedurstofanStationIds`:

   - `lib/iceland-routes/routeObservation.ts:34` to `lib/iceland-routes/routeObservation.ts:35`
   - `lib/iceland-routes/routeObservation.ts:152` to `lib/iceland-routes/routeObservation.ts:185`
   - `sql/85_route_observation_aggregate.sql:17`

   That is fine if Claude Code explicitly labels R2 as a Veðurstofan-only prototype, but it is not enough for the product direction Stebbi just described: `/vedrid` needs to filter the big-picture map by both Veðurstofan and Vegagerðin station sets from observed `/ferdalagid` routes.

   Fix: either narrow the handoff wording to “prototype only, Veðurstofan station IDs for now” or add optional `vegagerdinStationIds`, `routeSegmentIds` and `routeCautionIds` now, even if some arrays are initially empty until `/ferdalagid` exposes the data.

4. **Medium/Test gap: the URL privacy regression test still asserts the old `?from=...&to=...` URL**

   The code now uses `?routeDraft=1` at `components/weather/WeatherOverviewClient.tsx:545` to `components/weather/WeatherOverviewClient.tsx:551`, which is good.

   But `lib/__tests__/overview-route-draft.test.ts:151` to `lib/__tests__/overview-route-draft.test.ts:162` still expects `/auth-mvp/vedrid/ferdalagid?from=Reykjav%C3%ADk&to=Akureyri`.

   The test suite is green, but this test now documents the opposite of the desired privacy contract and will mislead future work.

   Fix: replace it with a `?routeDraft=1` expectation and add a focused test/helper around draft marker priority, especially the missing/expired-draft case from finding #2.

5. **Low/SQL: `sql/85_route_observation_aggregate.sql` should not be run as-is**

   The handoff correctly says SQL was written but not run. Keep it that way for now.

   Before this migration is ever run, it needs normal production-hardening:

   - transaction wrapper
   - `public.` schema qualification
   - explicit rollback notes
   - clear RLS/grants/policy stance
   - decision whether writes happen via service role/API route only
   - parity with the final RouteObservation shape, including Vegagerðin IDs if that is part of the contract

   Current file references:

   - `sql/85_route_observation_aggregate.sql:10` creates the table without schema qualification.
   - `sql/85_route_observation_aggregate.sql:28` creates the function without any permission/RLS/grant discussion.

6. **Low: Route-family keys should probably be ASCII slugs**

   Current keys use `hofudborgarsvædi`, for example in `lib/iceland-routes/routeObservation.ts:55` and tests like `lib/__tests__/route-observation.test.ts:17`.

   Postgres text can handle this, but route-family keys are going to become durable identifiers and possibly appear in URLs, logs or APIs. Prefer `hofudborgarsvaedi` or another strict ASCII slug. Labels can keep Icelandic characters.

## Positive confirmations

- The valid `routeDraft=1` path now makes the fresh draft win over stale `ROUTE_RESTORE_KEY`.
- The URL no longer exposes place names in the actual CTA code.
- `from.lon` and `to.lon` validation is fixed in `lib/iceland-routes/routeDraft.ts:61` to `lib/iceland-routes/routeDraft.ts:75`.
- RouteObservation avoids raw Google route geometry/steps/directions and stores only derived area/station data.
- Observation writes are best-effort and should not block trip UX.

## Commands run

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts`
  - Exit code: 0
  - Result: 3 test files passed, 69 tests passed

I did not run full test suite, localhost, SQL, migrations, commits, push or deployment.

## Design.md check

Relevant mobile/forms rules were reviewed. Finding #1 is the main Design.md concern: the current initial autofocus can trigger mobile keyboard/scroll behavior on `/vedrid`.

## Route Intelligence Check

- Route/domain area: `/vedrid` overview route lens, `/ferdalagid` draft handoff, RouteObservation history.
- Roadmap impact: yes, this belongs in `IcelandRoadmap.md` and `lib/iceland-routes/`.
- Provider neutrality: partly. The storage avoids raw Google content, but currently only stores Veðurstofan station IDs, not Vegagerðin station IDs, route segments or cautions.
- Cache/store key: route-family key exists, but should probably become strict ASCII.
- Privacy: good direction, but missing/expired `routeDraft=1` should not silently restore unrelated stale trips.
- Google storage risk: no raw Google route content spotted in RouteObservation.

## Recommended next Claude step

Before release, ask Claude Code to do a small hardening pass:

1. Fix initial autofocus on `/vedrid` Frá/Til so no keyboard opens on first load.
2. Change `routeDraft=1` missing/expired behavior so old restore does not win.
3. Update `overview-route-draft.test.ts` to assert `?routeDraft=1`, not `?from=...&to=...`.
4. Add a test for marker present + missing/expired draft.
5. Decide whether RouteObservation is intentionally Veðurstofan-only for now or extend shape to include empty/future `vegagerdinStationIds`, `routeSegmentIds`, `routeCautionIds`.
6. Mark SQL 85 as draft/not-runnable or harden it before any migration run.
7. Re-run type-check and targeted tests.
8. Return a handoff. Do not release, run SQL, commit, push or deploy.

## Localhost checks for Stebbi

After Claude fixes the above:

1. Open `/vedrid` on a mobile-width viewport.
2. Expected: the keyboard should not open automatically and the page should not jump.
3. Tap Frá manually.
4. Expected: Frá search focuses normally.
5. Select Frá.
6. Expected: Til can become focused as a deliberate continuation.
7. Calculate an old trip in `/ferdalagid`, then return to `/vedrid`, select a different Frá/Til and click `Ferðalagið`.
8. Expected: new draft route opens; old result does not restore.
9. Manually simulate/wait for expired draft and click `Ferðalagið`.
10. Expected: no unrelated old trip appears. Empty route step or harmless fallback is acceptable.
11. Confirm the URL never exposes typed place names, coordinates or place IDs.
12. If testing RouteObservation: calculate a known route and inspect localStorage. It should contain only normalized area labels/keys and station IDs, no street address and no raw Google route content.

No SQL or production data should be touched for these checks.
