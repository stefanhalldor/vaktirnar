# 2026-07-15 07:32 | todo-086 | v198 | codex | v197 freshness + labels review

Created: 2026-07-15 07:32  
Timezone: Atlantic/Reykjavik  
Related handoff reviewed: `2026-07-15-0130-todo-086-v197-claude-v196-done-prerelease.md`  
Mode: Review / handoff only. No code changes, no SQL, no migration, no commit, no push, no deploy.

## Findings

### High: freshness banner calculates the wrong "next expected" time

The banner currently calculates:

- `layerAtimeIso = 03:00`
- current time around `07:16`
- display next expected as `09:00`

That is wrong for stale data. The user-facing message should explain the first missing forecast cycle after the data we have:

> Veðurstofugögnin eru frá kl. 03:00 · ný spá var væntanleg kl. 06:00 · síðast reynt kl. 06:02

Root cause:

- [app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) line 935 uses `getNextVedurstofanCycleIso(new Date())`.
- That helper returns the next future cycle after now. At 07:16 it returns 09:00.
- For stale data, the UI needs the next cycle after the displayed `atime`, not after now.

Recommended fix:

- Add or use a helper that derives `nextExpectedAfterDataIso = layerAtimeIso + VEDURSTOFAN_CADENCE_MS`.
- Compare `nextExpectedAfterDataIso` to `now`:
  - if it is in the past, text should be "ný spá var væntanleg kl. {time}"
  - if it is in the future, text can be "ný spá væntanleg kl. {time}"
- Update copy from "ný gögn" to "ný spá".
- Keep the freshness decision based on `isVedurstofanCycleFresh(layerAtimeIso, now)`.

Relevant copy:

- [messages/is.json](../messages/is.json) line 881 currently says `"ný gögn væntanleg kl. {time}"`.
- Add separate keys for future vs overdue wording, instead of trying to reuse one phrase.

### High: manual refresh button ignores existing server-side cooldown on page load

Stebbi saw "Sækja ný gögn" at 07:19 even though data had been manually fetched at 07:17. The button should not be visible during the 10-minute cooldown window.

Root cause:

- [app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) lines 937-940 only check local `vedurstofanRefreshState`.
- That local state becomes `recentlyAttempted` only after this client clicks the refresh endpoint and receives that response.
- If the page loads after a recent manual attempt, the UI does not know the server-side run state yet.
- The server already has the right concept in [lib/weather/providers/vedurstofan.server.ts](../lib/weather/providers/vedurstofan.server.ts) lines 891-948, including `recentlyAttempted` for a manual run within 10 minutes.

Recommended fix:

- Include refresh availability in the data the UI already reads, or extend the lightweight freshness endpoint.
- Minimal durable shape:
  - `atimeIso`
  - `expectedCycleIso`
  - `nextExpectedAfterDataIso`
  - `runState: 'alreadyFresh' | 'running' | 'recentlyAttempted' | 'available'`
  - `lastAttemptIso`
  - `nextManualRefreshIso` when cooldown applies
- Hide or disable "Sækja ný gögn" when run state is `running`, `alreadyFresh`, or `recentlyAttempted`.
- Show a short cooldown/status line instead, e.g. "Nýlega var reynt að sækja gögn · hægt að reyna aftur kl. 07:27".

Do not rely only on `lastWarmAttemptIso` from the route layer unless the product decision is to block after both cron and manual attempts. The existing server rule is specifically manual cooldown.

### Medium: cron is still hourly, so it cannot satisfy "try every 10 minutes after expected forecast time"

[vercel.json](../vercel.json) lines 8-9 still schedule `/api/cron/warm-vedurstofan` as hourly:

```json
"schedule": "0 * * * *"
```

That means if Veðurstofan has not published the 06:00 cycle at 06:02, Teskeið will not automatically try again until 07:00.

Recommended approach:

- Use a 10-minute cron cadence for `/api/cron/warm-vedurstofan`, but make the route fast-skip when the expected cycle is already fresh or another run is in progress.
- This is the best fit for Stebbi's requirement: "keyri á 10 mín fresti þegar við erum komin fram yfir væntanlegan spágagnatíma".
- Vercel cron itself is not conditional, so the conditional logic should live in the route/run-state layer.
- Keep anti-stampede protection: if a previous run is still `running`, the next cron tick must skip.
- This is a deploy/Vercel behavior change and needs explicit approval before rollout.

### Medium: WindStatusBadge exists, but variants are still not aligned with the desired chip style

The new shared component is a good direction, but the current variants still produce different visual languages:

- [components/weather/WindStatusBadge.tsx](../components/weather/WindStatusBadge.tsx) lines 37-42: `badge` is a small rounded label with icon, no border and no dot.
- Lines 45-50: `chip` is the pill with dot and border.
- [app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) line 2268 uses `variant="badge"` in route point cards.

Stebbi's screenshot shows the expected visual as a status chip/pill, not the current square-ish badge. So "component exists" is not enough: the correct variant must be used in every context where the user expects the same status label.

Recommended fix:

- Use one status label style for weather cards unless there is a strong reason not to.
- Either:
  - use `variant="chip"` in worst, selected, all-points, met.no and Veðurstofan cards, or
  - add a `compactChip` variant that keeps the pill/dot/border semantics but is tighter for headers.
- Avoid using `badge` for the status severity if the desired look is the orange/red/green pill shown in Stebbi's screenshots.

This also follows `Design.md`: status colors must not be the only signal, and repeated card/status components should be consistent.

### Medium: worst and selected met.no cards still miss the severity chip

Stebbi reports that worst and selected met.no cards no longer show the label, while the detail/list card path does.

Likely cause from code structure:

- The all-points list uses `RoutePointCard` and passes `headerExtra` to `RouteWeatherPointDetailCard` at [app/auth-mvp/vedrid/FerdalagidClient.tsx](../app/auth-mvp/vedrid/FerdalagidClient.tsx) lines 2258-2272.
- The summary/selected contexts appear to use separate rendering paths and do not consistently pass the same `WindStatusBadge` into the shared detail card.
- The "Á leiðinni" summary currently uses `variant="line"` at line 1446, which is fine for that row, but it does not replace the card-header chip that Stebbi expects on worst/selected cards.

Recommended fix:

- Audit all three display contexts:
  - worst point
  - selected point
  - all forecast points
- Ensure all of them go through the same shared detail/card component or at least pass the same `headerExtra` status chip.
- Do this for both met.no and Veðurstofan.

### Low: freshness polling endpoint is useful, but too narrow for the current UI needs

The new endpoint [app/api/teskeid/weather/vedurstofan/freshness/route.ts](../app/api/teskeid/weather/vedurstofan/freshness/route.ts) returns only `{ atimeIso }`.

That is fine for "new data exists" polling, but it cannot solve:

- whether the current expected cycle is overdue
- whether the refresh button should be hidden due to cooldown
- whether another refresh is already running
- what text should be shown for "last attempted" and "next manual retry"

Recommended fix:

- Expand this endpoint or add a separate lightweight state endpoint.
- Keep it read-only and service-role backed.
- Do not expose secrets or raw run rows to the client.

## What Claude v197 did well

- `WindStatusBadge` is the right general direction.
- Polling for newer Veðurstofan data is product-correct, as long as the endpoint remains lightweight and feature-gated.
- The route uses auth + `weather-provider-vedurstofan` feature access, which is the right security posture.
- No client-side provider fetches were introduced.

## What needs to happen next

Claude Code should treat this as a focused v198 bugfix/pass, not a broad refactor.

Suggested implementation order:

1. Fix freshness display semantics.
   - Add helper for "next forecast cycle after this atime".
   - Use "ný spá var væntanleg" when overdue.
   - Use "ný spá væntanleg" only when it is actually future-facing.
   - Update IS/EN messages.

2. Fix refresh button availability.
   - Surface server-side run state to the result UI.
   - Hide or disable manual refresh while `recentlyAttempted` or `running`.
   - Show next retry time if available.
   - Keep the server-side 10-minute guard as source of truth.

3. Prepare cron cadence change safely.
   - Change cron to a 10-minute cadence only if Stebbi explicitly approves the Vercel/deploy behavior change.
   - Before that, make sure `/api/cron/warm-vedurstofan` fast-skips when fresh/running/recently attempted as appropriate.

4. Fix status chips consistently.
   - Use the same `WindStatusBadge` variant/style across worst, selected, and all-points cards.
   - Prefer `chip` or add a `compactChip`.
   - Do not use the current `badge` variant where Stebbi expects the pill status label.

5. Verify with localhost before handoff.
   - Especially at stale-cycle times and immediately after manual refresh attempts.

## Design.md notes

Relevant `Design.md` principles:

- Mobile-first app experience: no awkward layout shifts, controls should be clear and tappable.
- Status colors cannot be the only meaning; labels/icons must carry meaning too.
- Reusable cards/components should be visually consistent across repeated contexts.
- Compact status badges are appropriate inside structured summary/card rows, but they should not drift into separate visual languages.

## Commands run by Codex

Read-only commands only:

- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-0130-todo-086-v197-claude-v196-done-prerelease.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'Design.md' | Select-Object -First 240`
- `Get-Content -Encoding UTF8 'WORKFLOW.md' | Select-Object -First 220`
- `Select-String` / `Get-Content` snippets for:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `components/weather/WindStatusBadge.tsx`
  - `components/weather/VedurstofanPointCard.tsx`
  - `components/weather/RouteWeatherPointDetailCard.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `messages/is.json`
  - `messages/en.json`
  - `lib/weather/vedurstofanFreshness.ts`
  - `app/api/teskeid/weather/vedurstofan/freshness/route.ts`
  - `app/api/teskeid/weather/vedurstofan/refresh/route.ts`
  - `lib/weather/providers/vedurstofan.server.ts`
  - `vercel.json`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No tests were run. No files were modified except this review/handoff file.

## Localhost checks for Stebbi

After Claude Code implements the next pass, Stebbi should test:

1. Stale-cycle banner wording.
   - Create/open a state where Veðurstofan layer is from `03:00` and current expected cycle is `06:00`.
   - Expected text: `Veðurstofugögnin eru frá kl. 03:00 · ný spá var væntanleg kl. 06:00 · síðast reynt kl. ...`
   - It must not say `09:00` in this case.

2. Manual refresh cooldown.
   - Click "Sækja ný gögn".
   - If Veðurstofan still returns the older cycle, keep the page open or reload within 10 minutes.
   - Expected: the refresh button is hidden or disabled, with a short cooldown/status line.
   - Expected: the button does not allow repeated immediate attempts.

3. Fresh/new-cycle state.
   - After Veðurstofan returns the current expected cycle, banner should stop looking stale.
   - "Sækja ný gögn" should not be shown when data is fresh.

4. met.no labels.
   - Run a route where met.no produces `Óþægilegt`.
   - Check worst point card, selected point card, and all-points card.
   - Expected: all show the same status chip style with icon/emoji/text, not only colored map dots.

5. Veðurstofan labels.
   - Toggle met.no off and Veðurstofan on.
   - Check worst point card, selected Veðurstofan point, and all Veðurstofan point cards.
   - Expected: status chip style matches the met.no chip semantics.

6. Provider filter + mobile.
   - Test at mobile width around 390px.
   - Expected: no horizontal overflow, no clipped chips, refresh button/cooldown line remains tappable/readable.

Do not test production cron/deploy behavior casually. Changing `vercel.json` schedule affects production once deployed and needs explicit Stebbi approval.

## Open questions / decisions for Stebbi

1. Should the 10-minute cooldown hide manual refresh after any warm attempt, or only after manual attempts?
   - Current backend logic applies only to manual attempts.
   - Product wording "síðast reynt" could reasonably mean any attempt, but that is a product decision.

2. Should the cron run every 10 minutes all day with fast-skip, or only at specific windows after 3-hour cycle boundaries?
   - Vercel cron cannot easily express "only after stale boundary until fresh" without route-side logic.
   - Fast-skip every 10 minutes is simpler and likely safer if the route checks run state before touching Veðurstofan.
