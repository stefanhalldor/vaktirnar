# 2026-07-18 10:32 - TODO 086 v480 - Codex localhost follow-up after v479

Created: 2026-07-18 10:32
Timezone: Atlantic/Reykjavik

Relevant previous file:
- `ai-handoff/2026-07-18-1030-todo-086-v479-codex-v478-review-and-next-pulse-map-polish.md`

User localhost findings added after v479:
- Vegagerðin pill was ready before Veðurstofan but appeared disabled/inactive. Stebbi had already asked that the Vegagerðin pill must never become disabled merely because measurements are old.
- After loading Vegagerðin data in Windows PowerShell, opening a Vegagerðin pulse showed: "Náði ekki að opna skilaboðaþráðinn. Reyndu aftur."
- Stebbi still wants station names visible on the pulse map, not just marker dots.

Mode:
- Follow-up handoff only.
- Codex did not change product code, SQL, env, Supabase, commits, pushes, deploys, or migrations.

## Short human summary

Keep v479, but treat these localhost findings as required acceptance criteria for the next Claude Code step.

The next step is no longer just "extract the reusable context map". It must also:
1. ensure Vegagerðin provider pill is toggleable whenever cached Vegagerðin data exists, even if measurements are stale/old
2. root-cause and fix the Vegagerðin pulse thread failure
3. show station names visibly on the pulse map

## Findings / required fixes

### High: Vegagerðin pulse cannot open/create chat thread

On the full Vegagerðin pulse page, Stebbi sees:

> Náði ekki að opna skilaboðaþráðinn. Reyndu aftur.

Code path:
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx:42` POSTs `/api/auth-mvp/vedurpuls/thread` with `{ provider: 'vegagerdin', targetId: stationId }`.
- Non-ok responses set `threadError` and render `pulseThreadError` at `VegagerdinPulsClient.tsx:122`.
- `app/api/auth-mvp/vedurpuls/thread/route.ts` returns 500 `thread unavailable` if `getOrCreateThread(target)` throws.

Most likely causes to verify, in order:
1. SQL 81 has not been run in the current database, so `target_type='vegagerdin_station'` fails the DB CHECK constraint.
2. `buildWeatherPulseTarget('vegagerdin', targetId)` cannot find the station from cache/registry and returns 400 `unknown station`.
3. `TESKEID_CHAT_ENABLED` or `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` access path is blocking, though the current visible message suggests a thread route failure rather than a clean 401/403/503.

Required action:
- Claude Code must inspect the actual response status/body in localhost or add temporary safe diagnostics only if needed.
- Do not run SQL 81 unless Stebbi explicitly approves migration execution.
- If SQL 81 is missing, the handoff back to Stebbi must say plainly: "Púlsinn getur ekki búið til Vegagerðin thread fyrr en SQL 81 er keyrt."
- Client copy must remain provider-neutral. The current "Náði ekki að opna skilaboðaþráðinn" is better than the old Veðurstofan-specific error, but if possible make it more actionable without exposing DB internals.

Acceptance:
- Existing Vegagerðin station with cache data opens a thread successfully when SQL 81 is applied.
- Missing SQL 81 is called out clearly in the handoff and localhost checks, not silently treated as a UI-only bug.

### High/UX: Vegagerðin pill must never be disabled merely because data is old

Current shell logic:
- `components/weather/WeatherOverviewShell.tsx:256` marks a provider unavailable when `providerRestricted || unavailableReason != null`.
- `WeatherOverviewShell.tsx:257` sets `canInteract = p.canToggle && !isUnavailable && !p.loading`.
- `WeatherOverviewShell.tsx:265` disables the button when `!canInteract`.

This is okay for true unavailable states, but Stebbi's product rule is:

> Vegagerðin may have old/stale measurements, but the Vegagerðin pill should still be active/toggleable and the station layer should still be visible if cached stations exist.

Required action:
- Verify whether Vegagerðin stale/old measurements are being translated into `unavailableReason` anywhere. They must not be.
- Stale/old/current quality should affect marker tone/copy only, not provider availability.
- If the screenshot is only an inactive pill state (`isVisible=false`) rather than disabled, adjust visual language so inactive/toggleable is not confused with disabled. For example, inactive can remain outlined but should not use a disabled-looking muted opacity.
- If Vegagerðin is still loading, disabled is acceptable only until its own fetch settles; it must not wait for Veðurstofan.

Acceptance:
- With cached Vegagerðin data present and measurementFreshness=`stale`, the Vegagerðin pill is clickable/toggleable.
- The Vegagerðin map markers appear when the pill is active, even if they are styled as old/stale.
- Stale/old Vegagerðin data does not make the provider disappear.

### Medium: Station names must be visible on the pulse map

v479 already called this out, but Stebbi confirmed it again from localhost.

Current issue:
- `VegagerdinPulsClient.tsx:172` passes marker labels.
- `IcelandOverviewMap.tsx` uses marker label as `title`, not visible text.
- On mobile, hover/title is not enough.

Required action:
- Extract reusable context map as described in v479.
- Add visible station names in the pulse context map.
- Prefer a compact legend below the map if always-visible map labels would overlap Google controls or markers.
- The legend must identify:
  - selected Vegagerðin station
  - nearby Veðurstofan stations
  - provider label and distance where useful

Acceptance:
- On mobile width, Stebbi can see the station names without hovering.
- Names do not overlap Google controls or force horizontal scrolling.
- This is reusable, not a one-off inside the Vegagerðin pulse page.

## Updated next execution handoff for Claude Code

Claude Code, if Stebbi sends this with `Workflow`, review it critically first. If no blocking questions remain, execute the scoped implementation below. Do not commit, push, deploy, run SQL, or change env/Vercel.

### Step 1 - Diagnose Vegagerðin thread failure first

- Confirm what `/api/auth-mvp/vedurpuls/thread` returns for the failing station:
  - status code
  - safe response body
  - whether server logs point to CHECK constraint / SQL 81 / unknown station / access
- Do not expose raw DB internals to the client.
- If the failure is missing SQL 81, do not workaround it in code; document it clearly.
- If the failure is code-side despite SQL 81 being applied, fix the route/adapter/repository issue.

### Step 2 - Fix Vegagerðin pill stale-data semantics

- Ensure `measurementFreshness` only affects marker tone/status copy.
- Ensure provider availability is based on:
  - restricted access
  - no cache/no stations
  - fetch/API route error
  - not measurement age
- Make inactive-but-toggleable pills visually distinct from truly disabled pills.
- Add/adjust tests if a pure helper/provider-config layer exists. If the state is only in React component state and hard to test, document manual checks.

### Step 3 - Extract reusable station context map

- Create provider-neutral component in `components/weather/`, e.g. `ProviderStationContextMap.tsx`.
- Reuse `IcelandOverviewMap` internally.
- Accept provider-neutral marker data.
- Render visible station names via compact legend by default.
- Keep it mobile-first and aligned with `Design.md`.

### Step 4 - Apply the reusable map to Vegagerðin pulse page

- Replace local `StationContextMap` in `VegagerdinPulsClient.tsx`.
- Put context map below chat messages and above nearby Veðurstofan forecast cards.
- Show selected Vegagerðin station and the 3 nearby Veðurstofan stations.
- Nearby forecast ordering can remain `sortStationsForContext` for now, with comment that this is spatial order in a standalone station context.

### Step 5 - Verify

Run at minimum:

```bash
npm run type-check
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/spatialOrder.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts
```

Add any targeted component/helper tests if the extraction creates testable pure behavior.

## Localhost checks for Stebbi

After Claude Code implements the next step:

1. Open `http://localhost:3004/vedrid`.
2. Confirm Vegagerðin pill is clickable/toggleable when Vegagerðin data exists, even if measurements are old/stale.
3. Toggle Vegagerðin off/on and confirm markers hide/show.
4. Open a Vegagerðin station pulse.
5. If SQL 81 has not been run, expect thread creation to fail; Claude Code must state that clearly in handoff.
6. If SQL 81 has been run, expect the pulse thread/chat panel to open normally.
7. Confirm the pulse map shows visible station names, not just dots.
8. Confirm nearby Veðurstofan forecast cards remain below the map and show the 2 back/current + 2 forward forecast window.
9. Check mobile width around 390-460 px:
   - no horizontal overflow
   - station names remain readable
   - map controls are not covered by labels
   - compose box does not zoom or jump

## SQL / Supabase

- No SQL was run by Codex.
- SQL 81 may be the likely blocker for creating Vegagerðin chat threads, but Claude Code must not run it without explicit Stebbi approval.
- Do not change RLS, grants, policies or production data in this step.

## Out of scope

- Running SQL 81.
- Commit/push/deploy.
- Vercel/env changes.
- Moving all Veðurpúls content fully off Veðurstofan in one sweep.
- Big national overview/favorites/route heatmap.
- New external calls.

## Óvissa / þarf að staðfesta

- Codex did not reproduce the browser failure directly.
- The thread error is likely SQL 81/check-constraint, but Claude Code must verify response/status/logs before fixing.
- The pill may be truly disabled or only visually inactive; Claude Code must verify DOM/state and fix the product outcome either way.
