# TODO-086 v519 - Codex review of v518 prerelease

Reviewed handoff:
`ai-handoff/2026-07-18-1815-todo-086-v518-claude-v517-done-prerelease.md`

Related:

- `IcelandRoadmap.md`
- `lib/iceland-routes/`
- TODO #90 - Veður: eigið Íslandsleiðarkerfi og vegkaflagrunnur

## Findings

1. **Medium: `holmavik-sudurleið` segment ID is not actually the ID in code**

   In `lib/iceland-routes/segments.ts:54`, the Hólmavík segment id is:

   ```ts
   id: 'holmavik-sudurleید'
   ```

   This appears to contain non-Icelandic/non-ASCII characters in the ending, while the handoff says the ID is `holmavik-sudurleið`. Stable IDs should be boring ASCII slugs, especially because this registry is meant to become a route-domain foundation.

   Fix before building on this: rename it to a stable ASCII id, e.g. `holmavik-sudurleid`, and document the display name/aliases with Icelandic spelling instead. Add a tiny test that `getIcelandSegment('holmavik-sudurleid')` works.

2. **Low: `WeatherSourceTimeSelector` duplicated `ForecastTimeScrubber` grouping logic**

   `components/weather/WeatherSourceTimeSelector.tsx:158` now has its own `groupSlotsByDay`, while `components/weather/ForecastTimeScrubber.tsx:80` has the same logic. This is small today, but it pushes against the reusable-component principle we just tightened.

   Fix soon: extract a tiny shared helper, for example `components/weather/forecastTimeSlots.ts` or `lib/weather/forecastTimeSlots.ts`, used by both components. Keep it UI-safe and dependency-light.

3. **Low/Test gap: the auto-fallback behavior is not covered by a focused unit/component test**

   v518 added the right fallback shape in `WeatherOverviewClient.tsx:396-413`, but I only see existing status/route tests referenced in the handoff. Because this behavior depends on async provider settling order, it deserves a small test or at least a dedicated hook extraction later.

   Minimum acceptable for now: explicit localhost check with Vegagerðin empty/restricted and Veðurstofan available. Better: extract the fallback decision into a pure helper so it is easy to test without rendering the whole overview.

4. **Low/Design: day labels are very small at `text-[9px]`**

   `WeatherSourceTimeSelector.tsx:115` uses `text-[9px]`. It may be okay visually in the cramped selector, but Design.md emphasizes legibility and no cramped mobile controls. This needs a 360/390/460 px visual check. If it feels tiny, prefer `text-[10px]` like `ForecastTimeScrubber` uses.

## What looks good

- The v517 medium fallback risk was addressed without changing provider architecture.
- `userHasSelectedMode` is a sensible guard against overriding explicit user choice.
- Raw ISO metadata was replaced with localized formatting.
- R1 registry skeleton is the right scope: no runtime migration, no provider rewrite, no Supabase persistence.
- Route intelligence check was included in the handoff, which is exactly the new workflow habit we want.

## Route Intelligence Check

- Route/segment touched: initial Hólmavík, Öxi, Vík, Hellisheiði, Þrengsli segment stubs.
- Should update registry: yes, and v518 did that.
- Registry correctness: not quite, because one stable ID has a Unicode typo and should be fixed before it becomes a dependency.
- Provider-neutrality: good. The new registry is not tied to Google, Veðurstofan or Vegagerðin.
- Privacy/cost: no user data, no persistence, no network calls, no new billing surface.
- Roadmap update needed: not structurally, but after the ID fix it would be reasonable to mark R1 skeleton as started in `IcelandRoadmap.md` if Stebbi wants the roadmap to track status.

## Recommended next large Claude step

Do one cleanup-and-forward pass:

1. Fix the Hólmavík segment ID to `holmavik-sudurleid`.
2. Add a tiny `lib/__tests__/iceland-routes-segments.test.ts` covering:
   - all segment IDs are ASCII slug-safe
   - IDs are unique
   - `getIcelandSegment('holmavik-sudurleid')` returns the Hólmavík segment
   - every segment has `verified: false` while geometry is empty
3. Extract shared day-grouping logic used by `ForecastTimeScrubber` and `WeatherSourceTimeSelector`.
4. Add or plan a small fallback-decision test for the `activeMode === 'now'` behavior.
5. Continue toward the next product-visible slice only after the above is clean:
   - either start filling verified geometry for one segment,
   - or wire the registry only as non-runtime diagnostics in route-related handoffs/tests.

Do not move `routeControlPoints.ts` or `routeCautions.ts` into `lib/iceland-routes/` yet unless the move is purely mechanical and covered by existing tests. We are laying tracks, not yanking the train onto new rails mid-turn.

## Files reviewed

- `ai-handoff/2026-07-18-1815-todo-086-v518-claude-v517-done-prerelease.md`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/ForecastTimeScrubber.tsx`
- `lib/iceland-routes/index.ts`
- `lib/iceland-routes/segments.ts`
- `Design.md`

## Validation run by Codex

- `npm run type-check` - pass, exit code 0

I did not run the full test suite.
I did not run localhost/browser tests.
No SQL, migration, Supabase, Vercel, commit, push or deploy was run.

## Localhost checks for Stebbi

Before release:

1. Open `/vedrid` at 360, 390, 460 px widths.
2. Confirm the new source/time selector does not create horizontal page overflow.
3. Confirm the day labels above forecast slots are readable enough and not visually noisy.
4. Test Vegagerðin has data:
   - expected: `Núna` remains selected by default and Vegagerðin markers show.
5. Test Vegagerðin empty/restricted if possible:
   - expected: the UI falls back to first Veðurstofan forecast slot and does not show an empty page.
6. Click a forecast slot, then click `Núna`:
   - expected: user choice sticks and the fallback does not fight the click.
7. Click a Veðurstofan station:
   - expected: metadata timestamps are localized, not raw ISO strings.

No data-destructive checks apply to v518.

## Bottom line

Directionally good, but I would fix the Hólmavík ID before anyone builds on `lib/iceland-routes/segments.ts`. That is cheap now and annoying later.

