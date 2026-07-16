# TODO 086 v154 - Codex plan: provider selector polish and Veðurstofan freshness

Created: 2026-07-14 15:02
Timezone: Atlantic/Reykjavik

## Context

Stebbi reports that the Veðurstofan route layer now appears to work much better, but two things need to happen before this can be opened more broadly:

1. The provider filter at the top of the travel weather summary needs a polished, public-ready UI.
2. Users must not receive old Veðurstofan forecast cycles as if they were current data.

Stebbi's preferred filter structure:

| Sannreynt | Í prófunum | Væntanlegt |
| --- | --- | --- |
| met.no | Veðurstofan | Vegagerðin |

Important product direction:

- met.no remains the verified baseline.
- Veðurstofan can be shown and used when selected, but it is still in testing.
- Vegagerðin should be visible as coming soon / in progress, but disabled for now.
- The app should become future-proof for more providers, especially Vegagerðin.
- The solution should be good for users even if it requires a bit more code, as long as it does not create direct extra cost to Google, met.no, etc.

## Codex Recommendation

Do this in two phases, in this order:

1. **Fix Veðurstofan freshness and cache invalidation first.**
   This is a correctness issue. A nicer filter is not enough if the provider can still show or calculate from an outdated forecast cycle.

2. **Polish the provider selector UI after the freshness rule exists.**
   The selector should be able to show each provider's status: verified, testing, coming soon, stale, unavailable, or refreshing.

## Current Technical Findings

Codex did a read-only code/context pass before this plan.

Relevant current behavior:

- `vercel.json` schedules `/api/cron/warm-vedurstofan` hourly with `0 * * * *`.
- `app/api/cron/warm-vedurstofan/route.ts` calls `warmVedurstofanForecastCache()`.
- `lib/weather/providers/vedurstofan.server.ts` currently uses a cache TTL model that is too loose for this product requirement.
- The code comments mention a 4-hour TTL, and `TTL_MS` is currently `4 * 60 * 60 * 1000`.
- `buildPayload()` appears to set `expiresAtIso` from `fetchedAtIso + TTL_MS`.
- `fetchVedurstofanForecastsForStations()` is cache-first: if `row.expires_at > now`, it treats the cached row as usable and does not fetch live.
- `warmVedurstofanForecastCache()` therefore can run hourly but still skip live fetches if the cached row has not expired.
- The travel API reads Veðurstofan from product tables, which is good. User requests should not directly call Veðurstofan live.

Why this explains Stebbi's screenshot:

- A forecast cycle can be from `09:00` and fetched at `12:01`.
- Because expiry is based on fetch time plus a loose TTL, it may still be treated as usable/fresh.
- But product-wise, if a newer 3-hour forecast cycle should already exist, users should not see the older cycle as normal data.

## Phase A - Veðurstofan Freshness Rule

Claude Code should implement a cadence-aware freshness policy instead of relying only on `fetched_at + TTL`.

Recommended rule:

- Veðurstofan forecast freshness should be based primarily on forecast cycle time / `atimeIso`.
- Since Veðurstofan forecasts are on a 3-hour cadence, a payload should be considered current only for its cycle window.
- Once the next cycle should exist, cached data from the previous cycle should stop being treated as normal/fresh.
- Use a small grace window only if needed to avoid transient provider delay.

Suggested strict-but-practical policy:

- Define a helper such as `getExpectedVedurstofanAtime(now)` or `getCurrentVedurstofanCycle(now)`.
- Define `isVedurstofanForecastCycleFresh(payload, now)`.
- A payload is fresh if `payload.atimeIso` matches the expected/current cycle, or is within an explicit short grace rule.
- Recommended grace: `10 minutes` maximum unless Stebbi approves a longer window.
- If `now` is clearly past the next cycle plus grace, old `atimeIso` must be marked stale/outdated and not used in public travel calculation.

Concrete behavior:

- Do **not** make normal user travel requests call Veðurstofan live.
- Keep user-facing travel API product-table based.
- Make the background warmer smart enough to force a live fetch when the cached cycle is outdated, even if `expires_at` has not passed under the old TTL.
- If the warmer fetches and Veðurstofan still returns the old cycle, record that state as stale/outdated.
- In public travel calculations, do not let stale/outdated Veðurstofan rows affect worst point, scrubber, map colors, or selected point.
- In validation/debug surfaces such as `elta-vedrid`, stale/outdated data may still be shown, but it must have visible timestamp/status labels.

Implementation direction:

- Move freshness logic into a small shared helper close to `lib/weather/providers/vedurstofan.server.ts`, or into a provider-neutral weather freshness helper if that is cleaner.
- Update `expiresAtIso` so it is tied to `atimeIso + provider cadence + grace`, not simply `fetchedAtIso + 4h`.
- Keep `fetchedAtIso` for observability: it tells when our system fetched data.
- Keep `atimeIso` for data validity: it tells which forecast issue/cycle the data belongs to.
- Make `warmVedurstofanForecastCache()` able to bypass cache when cycle is outdated.
- Update misleading comments, especially if comments still say the cron runs every 6 hours while `vercel.json` is hourly.

Important distinction:

- `fetchedAtIso` answers: "When did Teskeið fetch this?"
- `atimeIso` answers: "Which Veðurstofan forecast cycle is this?"
- Public freshness should be governed by the forecast cycle, not only by fetch time.

## Phase A Tests

Claude Code should add focused tests before or with the implementation.

Recommended test cases:

- A payload with current `atimeIso` is fresh.
- A payload from the previous 3-hour cycle is stale once `now` is past the new cycle plus grace.
- A payload fetched recently but with old `atimeIso` is still stale.
- The warmer forces live fetch when cached payload has stale cycle.
- The travel API excludes stale/outdated Veðurstofan data from public calculation.
- met.no-only behavior remains unchanged.
- met.no + fresh Veðurstofan uses both selected providers in the calculation.
- Veðurstofan-only with stale data produces unavailable/stale provider state rather than silently falling back to old Veðurstofan rows.

## Phase B - Public-Ready Provider Selector UI

After freshness is reliable, replace the current plain toggle block with a more polished provider selector.

Recommended UI structure:

- Section: **Sannreynt**
  - Provider: `met.no`
  - Status: verified / stable
  - Toggle enabled
  - Default on
  - Short copy: stable baseline forecast.

- Section: **Í prófunum**
  - Provider: `Veðurstofan`
  - Status: testing
  - Toggle enabled only when the feature flag and per-user access allow it.
  - If current data is stale/unavailable, show that clearly and prevent it from affecting calculation.
  - Short copy: forecast data from Veðurstofa Íslands, still being verified.

- Section: **Væntanlegt**
  - Provider: `Vegagerðin`
  - Status: in progress / coming soon
  - Toggle disabled by default
  - Short copy: road conditions and gust data coming later.

Design guidance from `Design.md`:

- Mobile-first, app-like, calm, not a landing-page pattern.
- No nested card-in-card layout.
- Use real switches/toggles for provider inclusion.
- Use semantic colors/tokens, not hardcoded one-off colors where avoidable.
- Touch targets should feel native and be easy to tap.
- Avoid horizontal overflow on mobile.
- All user-facing text must go into `messages/is.json` and `messages/en.json`.

Component direction:

- Prefer a reusable component such as `WeatherProviderSelector`.
- Props should be provider-neutral enough for Vegagerðin:
  - provider id
  - label
  - group/status: verified/testing/comingSoon
  - enabled/disabled
  - selected
  - data state: fresh/stale/unavailable/refreshing
  - onToggle
  - optional helper text
- Do not bake in met.no/Veðurstofan-specific behavior in a way that makes Vegagerðin awkward.

Suggested visual behavior:

- On narrow mobile, stack the three sections vertically.
- On wider screens, a compact 3-column layout is okay if it does not become decorative or too wide.
- The provider row should show:
  - provider name
  - status badge
  - short helper text
  - toggle or disabled switch
- If Veðurstofan is stale:
  - show a warning/status like "Uppfærist" or "Gögn eru úrelt"
  - do not let the stale provider be selected into calculation unless Stebbi explicitly chooses a debug-only mode later.

## Phase C - Small Follow-Ups Before Broad Rollout

These are not blockers for the first implementation, but should be kept in view:

- Remove or localize any remaining hardcoded weather UI text.
- Normalize provider point identity as `provider:id` so met.no, Veðurstofan, and Vegagerðin can coexist without key collisions.
- Keep provider-specific source links:
  - met.no cards can have `Yr` / raw met.no links.
  - Veðurstofan cards can link to the relevant vedur.is station page.
  - Vegagerðin later can link to its source if available.
- Make timestamps visible where they matter:
  - `Spá frá kl. HH:mm`
  - `Sótt kl. HH:mm`
  - stale/outdated badge when appropriate.

## Not In Scope For This Step

- Do not run Supabase migrations.
- Do not change production data.
- Do not deploy.
- Do not commit or push.
- Do not make user requests fetch directly from Veðurstofan live.
- Do not add Vegagerðin data ingestion yet, beyond UI structure that is ready for it.

## Open Questions / Decisions For Stebbi

1. How strict should the Veðurstofan grace window be?
   - Codex recommendation: max `10 minutes`, possibly `0-5 minutes` if Stebbi wants strict freshness.

2. What should public users see when Veðurstofan is stale?
   - Codex recommendation: show provider state as stale/unavailable and exclude from calculation. Keep met.no running.

3. Should stale Veðurstofan data remain visible anywhere?
   - Codex recommendation: yes, in `elta-vedrid` / validation views with obvious stale labels and timestamps, but not as normal public route-weather calculation input.

## Risks

- If freshness is too strict, Veðurstofan may temporarily disappear from calculation shortly after a new cycle boundary if the provider publishes late.
- If freshness is too loose, users can again see old data as normal data.
- If the warmer retries too often without a cycle-aware skip, it can create unnecessary calls to Veðurstofan.
- If the selector allows a stale provider to remain toggled on without clear state, users may trust bad data.

Best compromise:

- Run the warmer on a predictable schedule.
- Add cycle-aware skip logic when data is already current.
- Force refresh only when the expected cycle has advanced.
- Exclude stale provider data from public calculations.
- Show clear provider health in the selector.

## Suggested Next Step For Claude Code

Claude Code should start with Phase A only:

1. Inspect the existing Veðurstofan cache/freshness helpers and product-table projection.
2. Add a small, tested cadence freshness helper.
3. Update the warmer to force live fetch when the cached cycle is outdated.
4. Update product/travel reads so stale Veðurstofan rows cannot affect public calculation.
5. Update timestamps/status labels only as needed to make the stale/fresh state visible.
6. Run targeted weather tests, then type-check.
7. Stop and hand off before doing the full provider selector redesign.

Reason: freshness correctness is the blocker. The selector polish should build on the final provider states rather than inventing states before the data layer can produce them reliably.

## Commands / Actions Codex Ran

Read-only only:

- Read `WORKFLOW.md`.
- Read `Design.md` earlier in this planning pass.
- Read `ai-handoff/README.md` earlier in this planning pass.
- Searched relevant weather/Veðurstofan/cron code with `rg`.
- Listed recent `ai-handoff/` files to choose the next version number.
- Ran `Get-Date -Format "yyyy-MM-dd HH:mm"` immediately before creating this file.

No tests were run for this plan.
No code files were changed.
No migrations were written or run.
No Supabase, deploy, commit, or push action was performed.

## Localhost Checks For Stebbi

After Claude Code implements Phase A and Phase B, Stebbi should test:

1. Open the route weather flow on localhost and verify the provider selector shows:
   - `Sannreynt`: met.no
   - `Í prófunum`: Veðurstofan
   - `Væntanlegt`: Vegagerðin disabled

2. On mobile width, verify the selector has no horizontal overflow, no cramped text, and toggles are easy to tap.

3. With met.no only:
   - scrubber, map colors, worst point, selected point, destination summary, and all-points list should use only met.no.

4. With Veðurstofan only and fresh data:
   - map should show only Veðurstofan points near the route.
   - worst point and selected point should use Veðurstofan values.
   - all-points list should show Veðurstofan station cards with vedur.is links and timestamps.

5. With met.no + Veðurstofan and fresh data:
   - calculation should consider both selected providers.
   - the most demanding selected-provider point should win, regardless of provider.

6. When Veðurstofan data is stale/outdated:
   - the selector should show stale/unavailable state.
   - stale Veðurstofan rows should not affect public calculation.
   - met.no should still work normally.
   - validation/debug surfaces may show stale rows with timestamps and stale badges.

7. Confirm visible timestamps make sense:
   - `Spá frá kl. ...` should reflect Veðurstofan `atime`.
   - `Sótt kl. ...` should reflect when Teskeið fetched it.

Do not test production cron, Supabase writes, deploy, or migrations casually. Those require explicit Stebbi approval.
