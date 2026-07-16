Created: 2026-07-09 23:37
Timezone: Atlantic/Reykjavik

# TODO 075 v047 - Codex Review Of v046 Scrubber Whole-Hours

Reviewed handoff:

- `ai-handoff/2026-07-09-2330-todo-075-v046-claude-v045-scrubber-whole-hours-done.md`

Reviewed diff:

- `lib/weather/travel.ts`
- `components/weather/DepartureHeatmap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-travel.test.ts`

## Findings

### P1 - "Núna" must use the actual run time, not a rounded hour

Screenshot from Stebbi shows first selected slot:

```text
Núna
23:00
```

But Stebbi says the run happened around `23:30-ish`. That is not just a label problem.

In `lib/weather/travel.ts`, `evaluateCandidate(...)` uses `departureIso` as the source of truth for:

- `arrivalIso`,
- ETA for each route point,
- `pointStatuses`,
- worst wind/precip/gust lookup window,
- selected map/detail values.

So if the first timeline candidate is `23:00` while the user actually ran the result at `23:30`, the route forecast is being evaluated roughly 30 minutes too early. That means the weather values on the route may hit the wrong forecast hour/near-hour window.

Current v046 only guarantees this when `earliestDepartureAt` is explicitly provided. The new tests cover:

- explicit `23:37` -> `23:37`, `00:00`, `01:00`,
- explicit `23:00` -> `23:00`, `00:00`,
- explicit `23:56` -> `23:56`, `00:00`.

They do not prove the normal product path where the client submits no `earliestDepartureAt` and `checkTravelWeather(...)` uses server-side `new Date().toISOString()`.

Required next step:

1. Trace the actual request/response in localhost:
   - request body `earliestDepartureAt`,
   - `result.createdAt`,
   - `travelPlan.outbound.earliestDepartureIso`,
   - `travelPlan.outbound.leavingAt.departureIso`,
   - `travelPlan.outbound.timelineCandidates[0].departureIso`.
2. If request body has no `earliestDepartureAt`, first candidate should be very close to server execution time, not top-of-hour.
3. If request body contains a rounded `earliestDepartureAt`, fix the client/upstream sender so the normal "run now" path sends either nothing or the exact current timestamp, not a rounded hour.
4. Add a test for omitted `earliestDepartureAt` using fake timers, e.g. mocked current time `2026-07-09T23:37:42Z`, and assert:
   - `outbound.earliestDepartureIso === mockedNowIso`,
   - `outbound.leavingAt.departureIso === mockedNowIso`,
   - `timelineCandidates[0].departureIso === mockedNowIso`,
   - `timelineCandidates[1].departureIso === 2026-07-10T00:00:00.000Z`.

Do not release v046 until this is understood and fixed or conclusively proven to be stale localhost state in the screenshot.

### P2 - `firstSlotLabel="Núna"` is currently tied to single-departure mode, not to "actual now"

`app/auth-mvp/vedrid/FerdalagidClient.tsx` now passes:

```tsx
firstSlotLabel={!result.travelPlan!.outbound.windowMode ? tf('timelineNowLabel') : undefined}
```

That means any future single-departure result will label slot 0 as `Núna`, even if the first departure becomes an explicit future departure later.

Current visible UI may not send an explicit future departure in this flow, so this is not necessarily a current production bug. But it is fragile and contradicts v045's open question.

Recommended fix:

- only pass `Núna` when slot 0 is actually the implicit current departure,
- otherwise show normal time/date, or add a separate `Valið` label if Stebbi explicitly wants that copy.

Possible implementation options:

- add metadata to the travel result such as `departureMode: 'now' | 'explicit' | 'window'`, or
- infer in the client only if first candidate is close to `result.createdAt`, but explicit metadata is cleaner.

### P3 - Compact labels are present, but the slots are still visually wide

`components/weather/DepartureHeatmap.tsx` renders whole-hour labels as compact values (`00`, `1`, `2`, `17`), which is good.

But the button still uses:

```tsx
min-w-[42px] px-1.5 gap-0.5
```

and each day group uses:

```tsx
flex gap-1.5
```

So the scrubber still takes a lot of horizontal space, as Stebbi's screenshot shows.

This is lower severity than P1 because it does not affect correctness, but it should be tightened before calling the UI done.

Recommended polish:

- keep touch targets close to Design.md's 40 px guidance,
- reduce visual spacing between non-first hour slots, e.g. group gap from `gap-1.5` to `gap-1` or `gap-0.5`,
- consider `min-w-10` / `w-10` for regular slots and let the first `Núna` slot remain slightly wider only if needed,
- keep selected slot border from causing layout shift,
- verify 360-390 px mobile screenshots.

Do not shrink below usable touch targets just to fit more points.

## What Looks Good

- The timeline generation approach in `buildSingleDepartureTimeline(...)` is conceptually right: exact first slot, then next whole UTC hour, then hourly increments.
- The implementation did not touch route provider logic, SQL, Supabase, RLS, auth, secrets, billing, or production data.
- Compact hour labels preserve full `hh:mm` in aria labels.
- Tests were added for explicit timestamps.
- Claude reports:
  - `npm run type-check` clean,
  - `npm run test:run` with 1961 passed.

Codex did not rerun those commands during this review.

## Required Follow-Up For Claude Code

1. Investigate why Stebbi saw `Núna 23:00` when execution was around `23:30-ish`.
2. Treat this as a correctness issue, not just copy/UI.
3. Add/adjust tests for the omitted-`earliestDepartureAt` normal product path.
4. Tighten scrubber spacing slightly after P1 is fixed.
5. Keep the change scoped: no route provider changes, no forecast drawer changes, no threshold changes.

## Localhost Checks For Stebbi

After Claude Code fixes the P1 issue:

1. Open `/auth-mvp/vedrid` on localhost.
2. Wait until the current time is not exactly on the hour, e.g. `23:30`, `23:37`, `08:14`.
3. Run a normal one-way route without choosing any explicit departure time.
4. Expected:
   - first scrubber slot says `Núna`,
   - the time under it is the actual run time to the minute, e.g. `23:37`, not `23:00`,
   - `Brottför` section below shows the same full departure time,
   - subsequent slots are whole hours shown compactly, e.g. `00`, `1`, `2`, `17`.
5. Select a later compact slot, e.g. `1`.
6. Expected:
   - `Brottför` section shows full `kl. 01:00`,
   - map/details/`Á leiðinni` update for that selected slot.
7. Run again a few minutes later.
8. Expected:
   - first `Núna` slot moves to the new actual run time.
9. Mobile 360-390 px:
   - no horizontal page overflow,
   - scrubber still scrolls normally,
   - compact slots feel easier to scan than v046,
   - touch targets remain usable.

No SQL, Supabase, RLS, auth, secrets, billing, deployment, migration, or production data should be touched.

## Óvissa / Þarf Að Staðfesta

The screenshot proves the user-visible output was wrong in that localhost run, but Codex has not yet proven where the rounding/staleness enters:

- stale result state in the browser,
- rounded request body,
- server default time not being used as expected,
- or another upstream normalization.

Claude Code should verify the actual request/response before patching broadly.
