# 2026-07-18 09:48 - TODO 086 v475 - Codex follow-up on Vegagerdin pulse UI and loading

Created: 2026-07-18 09:48
Timezone: Atlantic/Reykjavik

Sources reviewed:
- `ai-handoff/2026-07-18-0920-todo-086-v473-claude-v472-done-prerelease.md`
- `ai-handoff/2026-07-18-0944-todo-086-v474-codex-v473-review-and-next-step.md`
- Stebbi's localhost screenshots and notes from 2026-07-18 around 09:43

## Short human summary

The next step should not be a tiny copy tweak. We need one larger hardening pass that makes Vegagerdin feel like a first-class provider on `/vedrid`: visible even when its measurements are old, usable for pulse without Veðurstofan access leakage, and progressively loaded so the page does not sit in a stale "Hleð..." state.

The v474 blocker still stands: Vegagerdin pulse read/read-state/report/access must not default to Veðurstofan access checks.

## Findings / product corrections

1. **High / blocking: Vegagerdin pulse is still entangled with Veðurstofan access and errors**

   On the Vegagerdin pulse page, Stebbi is seeing:

   > Náði ekki að sækja Veðurstofugögn. Reyndu aftur.

   This error is shown while he is trying to open/write pulse for a Vegagerdin station. That is the wrong mental model. Nearby Veðurstofan forecast context is useful on a Vegagerdin station page, but it must be secondary context and must not make the Vegagerdin pulse feel broken.

   Required behavior:

   - The pulse thread and compose area for `vegagerdin_station` must be driven by Vegagerdin chat access, not Veðurstofan provider access.
   - Failure to load nearby Veðurstofan forecast context must not block or visually dominate the Vegagerdin pulse.
   - If forecast context fails, show a small scoped message inside the forecast context area, e.g. "Náði ekki að sækja nálægar Veðurstofuspár." Do not say the whole page/pulse failed.
   - If the chat itself fails, the error should explicitly mention Veðurpúls/skilaboð, not Veðurstofugögn.

2. **High / UX: Vegagerdin provider pill should stay active even when measurements are old**

   Stebbi wants the Vegagerdin pill to be available/active even if measurements are old. Old measurements are still useful as a layer and as a pulse anchor.

   Required behavior:

   - `Vegagerðin` pill should not be disabled merely because `freshness='old'`.
   - Old/stale state should be communicated in the selected station detail or provider status text, not by making the provider unavailable.
   - Only no-cache/no-data/auth/config failure should make the provider unavailable.
   - If the provider has old data, show markers in an old-data style if we have one, or ordinary provider markers with detail text saying measurements are old.

3. **Medium / forecast context: nearby Veðurstofan forecast rows should show weather around now, not only future rows**

   At 09:43, with Veðurstofan forecast issued at 03:00, Stebbi expects the nearby forecast context on the Vegagerdin pulse page to show the trend around the current time:

   - 06:00
   - 09:00
   - 12:00
   - 15:00

   Current UI shows 12:00, 15:00, 18:00, which only tells where the forecast is going and loses the immediate past/current context.

   Required behavior:

   - For each nearby Veðurstofan station shown on a Vegagerdin pulse page, display two forecast slots before/at current time and two after current time when available.
   - Anchor should be current local time by default. If later we introduce selected/scrubbed time, make this helper accept an anchor time parameter.
   - Reuse the same forecast-window helper where possible for Veðurstofan cards and Vegagerdin-nearby-forecast context so we do not create another one-off date slicing rule.
   - Show Icelandic date/time formatting consistently with the shared weather-card date formatting.

4. **Medium / loading: `/vedrid` should progressively render instead of staying too long in stale "Hleð..."**

   Stebbi sees `/vedrid` sitting too long in a stale "Hleð..." state. Since both providers should mostly come from cache, the page should feel alive quickly.

   Required behavior:

   - Use canonical Teskeið loader until the first useful provider layer is ready.
   - As soon as either Veðurstofan or Vegagerdin has usable cached data, render the map and provider shell.
   - Continue loading the other provider silently in the background.
   - Provider pills should communicate their own loading state, e.g. "Sæki Veðurstofugögn..." or "Sæki Vegagerðargögn..." with a small inline loading indicator/dots.
   - Do not block the whole overview map on one slow provider if the other provider is ready.
   - Avoid layout jump: reserve stable space for the provider pill row and map.

5. **Medium / architecture: keep this provider-neutral and reusable**

   This pass should continue the reusable component direction, not introduce one-off Vegagerdin branches everywhere.

   Required direction:

   - Keep `WeatherOverviewShell`, `IcelandOverviewMap`, provider configs, station preview cards, and chat core provider-neutral.
   - Use provider-specific adapters only at the boundary where provider data shape differs.
   - Keep chat core as reusable Teskeiðarspjall; "Veðurpúls" is the weather product label, not the core domain.
   - Forecast context on Vegagerdin pages should be a reusable "nearby forecast context" component/helper, not embedded ad hoc inside the page.

## Recommended next large step for Claude Code

Claude Code should implement one bounded but meaningful pass:

1. Fix v474's provider-aware chat access blocker:
   - Add server-side repository helpers that resolve provider/target from `threadId` and `messageId`.
   - Use those helpers in messages GET, read, report, and access routes.
   - Keep 404/no-leak behavior for out-of-scope IDs.

2. Decouple Vegagerdin pulse UI from Veðurstofan forecast failures:
   - Pulse can load and compose even if nearby Veðurstofan forecast context fails.
   - Forecast error is scoped to the forecast context only.
   - Error copy must not say Veðurstofugögn when the failed action is chat/pulse.

3. Make Vegagerdin provider visible/toggleable when measurements are old:
   - Old measurements should still produce markers and station cards.
   - The pill should stay active unless there is genuinely no usable Vegagerdin cache/data.

4. Improve nearby Veðurstofan forecast window on Vegagerdin station pages:
   - Show two previous/current and two next forecast rows around now.
   - Reuse/extract a helper so the same window logic can later be shared with route cards and station pages.

5. Improve `/vedrid` provider loading:
   - First useful provider unlocks the map.
   - Other provider gets inline loading in its pill.
   - Use the canonical Teskeið loader only while no useful provider is ready.

6. Tests:
   - Add/extend tests for Vegagerdin chat without Veðurstofan access.
   - Add tests for old Vegagerdin provider data still being visible/toggleable.
   - Add tests for forecast window selection around current time.
   - Keep existing Veðurstofan overview and public overview behavior covered.

## Suggested test focus

- `vegagerdin_station` thread:
  - GET messages succeeds without `weather-provider-vedurstofan`.
  - POST read succeeds without `weather-provider-vedurstofan`.
  - POST report succeeds without `weather-provider-vedurstofan`.
  - POST message succeeds after SQL 81/check constraint is in place.

- Nearby forecasts:
  - At 09:43 with rows 06/09/12/15/18, preview returns 06/09/12/15.
  - At beginning/end of available rows, helper degrades gracefully.

- Provider shell:
  - Vegagerdin provider with old measurements is not treated as unavailable.
  - No usable Vegagerdin cache shows "Engin gögn" or unavailable state.
  - One provider loading does not block map if the other is ready.

## Localhost checks for Stebbi

After Claude implements this:

1. Open `http://localhost:3004/vedrid` as public.
2. Confirm the page shows the Teskeið loader only until one provider is ready.
3. Confirm the map appears even if the other provider is still loading.
4. Confirm provider pills show loading/status independently.
5. Confirm `Vegagerðin` can be active/clickable even when measurements are old.
6. Click a Vegagerdin station with old measurements; it should open and show the measurements with clear stale/old context, not disappear.
7. Open the full pulse URL for that Vegagerdin station.
8. Confirm the pulse/chat area opens without a Veðurstofan error taking over the page.
9. If nearby Veðurstofan forecast context fails, confirm the error is small and scoped to that forecast section.
10. Around a real current time like 09:43, confirm nearby forecast rows show two previous/current and two next slots, e.g. 06:00, 09:00, 12:00, 15:00.
11. Sign in as a user without Veðurstofan provider access but with base weather access and confirm Vegagerdin pulse still loads.

Do not run SQL 81, production cron, Vercel changes, or production deploy unless Stebbi explicitly asks for that. If SQL 81 has not been run locally/prod, compose may still fail at the database constraint; separate that from UI/pulse read behavior.

## Óvissa / þarf að staðfesta

- I did not inspect the current v472/v473 code again beyond v474 context in this follow-up, so Claude should verify exact line numbers before editing.
- I assume the product decision is now: road-condition pulse belongs primarily on Vegagerdin stations; Veðurstofan forecast data is context, not the pulse anchor.
- I assume old Vegagerdin measurements are still useful enough to show because Stebbi explicitly asked for the provider pill to remain active when measurements are old.
