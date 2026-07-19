# 2026-07-17 10:03 — TODO-086 v407 — Codex review of v406 + Höfn south-route next step

Created: 2026-07-17 10:03  
Timezone: Atlantic/Reykjavik

Source reviewed:
- `2026-07-17-1000-todo-086-v406-claude-b1-b2a-done-prerelease.md`

Related context:
- Stebbi confirmed v406 direction, but wants the next step to include a south/coast alternative via Höfn when Öxi is on the route and Höfn is not already on the chosen/returned route.
- Screenshot shows multiple routes around Öxi, but the route list does not clearly offer the “sunnanmegin / í gegnum Höfn” option.

## Very Short Human Summary

v406 looks fine as a status/validation handoff. No product blocker there.

Next step should add one clear route-option improvement: when Google returns a route over Öxi, Teskeið should also try to offer a distinct safer-looking south/coast alternative via Höfn, with its own label and tests. This must not become another duplicate “Til að sleppa við Öxi” card.

## Findings

### Medium: Add the Höfn route as a distinct curated alternative, not as another generic `CURATED_AVOID_OXI`

Current Öxi avoidance is centered on `avoid-oxi-via-reydarfjordur` in [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:247>). That route uses the `CURATED_AVOID_OXI` label and the route-selection UI maps that label to `routeOptionAvoidOxi` in [components/weather/RouteSelectionStep.tsx](</c/Users/Lenovo/Documents/vaktirnar/components/weather/RouteSelectionStep.tsx:560>).

That is OK for a generic “avoid Öxi” route, but it is not enough for the new product requirement. Stebbi wants a specific option that communicates “go south / through Höfn” when that is the relevant safer alternative.

Recommendation:
- Add a separate curated rule, for example `avoid-oxi-via-hofn` or `oxi-south-coast-via-hofn`.
- Give it a separate label, for example `CURATED_AVOID_OXI_VIA_HOFN`.
- Add a separate UI label, for example:
  - `Sunnanleið um Höfn`
  - or `Til að sleppa við Öxi um Höfn`
- Keep the current Reyðarfjörður/firðir rule distinct.

Do not let both route cards collapse into the same “Til að sleppa við Öxi” text.

### Medium: The current “skip if any base route avoids the caution” rule may suppress useful alternatives

For caution-triggered curated rules, [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:540>) skips a curated fetch if any base route already avoids the same caution. That makes sense when there is only one kind of avoidance route.

With two different alternatives, this can be too aggressive:
- Google may return one non-Öxi route, but not the south/Höfn route Stebbi wants to expose.
- The current guard could skip the Höfn alternative just because some other route avoids Öxi.

Recommendation:
- Keep generic duplicate suppression by geometry fingerprint.
- For the new Höfn rule, suppress only when a base or already-curated route already passes near Höfn/south-coast corridor or has the same new `CURATED_AVOID_OXI_VIA_HOFN` label.
- Do not suppress solely because “some route avoids Öxi”.

### Medium: Validate with the Öxi evidence-point policy before presenting it as safe

Current curated Öxi validation uses `evidencePointsOnly` for `avoid-oxi-via-reydarfjordur` in [lib/weather/google.server.ts](</c/Users/Lenovo/Documents/vaktirnar/lib/weather/google.server.ts:376>). This was added because the broad approximate corridor point can falsely fire on coastal alternatives.

The new Höfn route needs the same caution-validation thinking:
- Fetch via Höfn.
- Re-run `matchRouteCautions` with an evidence-point-only policy for the Öxi suppression check, or extract a small helper so both Öxi-avoid rules use the same validation.
- If the “via Höfn” route still passes close to the actual Öxi station evidence point, suppress it.

This is important because the UI must not say “safe alternative” if Google still routed over Öxi.

### Low: v406 is a status handoff, not an implementation handoff

v406 says no code changes were required and mostly confirms B1/B2A behavior. That is fine, but the next actionable handoff should not be “continue B2A”. It should be a new focused phase:

`B2B — Curated Öxi alternatives: separate Höfn/south-coast route option`

## Recommended Next Execution Handoff

Claude Code should implement a narrow B2B phase:

1. Add a shared Höfn/south-coast via point.
   - Prefer an existing verified place/route point if available.
   - Candidate coordinate from current code/tests: near Höfn / Route 1, around `lat: 64.25`, `lon: -15.21`.
   - Put it near other shared route constants if both caution and curated logic need it.

2. Add a new curated route rule.
   - Trigger: at least one base route has `oxi-axarvegur-939`.
   - Only consider it when the route does not already pass near Höfn/south-coast corridor.
   - Via: Höfn point with `via: true`.
   - Label: new distinct label, for example `CURATED_AVOID_OXI_VIA_HOFN`.
   - Validation: suppress if the returned curated route still has the Öxi caution according to the same evidence-point policy used for other Öxi alternatives.

3. Update route card label resolution.
   - Add a new label branch before generic `CURATED_AVOID_OXI`.
   - User-facing text should make the route understandable, for example:
     - `Sunnanleið um Höfn`
     - or `Til að sleppa við Öxi um Höfn`

4. Avoid duplicate route cards.
   - Keep geometry fingerprint dedupe.
   - Add a Höfn-specific duplicate guard if needed.
   - Do not show two visually identical “Til að sleppa við Öxi” cards.

5. Add focused tests in `lib/__tests__/weather-google.test.ts`.
   - Base route via Öxi triggers the new Höfn curated request when no existing route passes via Höfn.
   - The request uses the Höfn via coordinate with `via: true`.
   - The Höfn route is suppressed if it still passes the Öxi evidence point.
   - If a base route already goes via Höfn, do not add a duplicate Höfn curated route.
   - Existing Reyðarfjörður `CURATED_AVOID_OXI` tests still pass.
   - UI label mapping has a distinct label for `CURATED_AVOID_OXI_VIA_HOFN`.

6. Keep this out of provider-layer work.
   - This is route-option/curated-route logic, not Veðurstofan provider matching, not Púls, not Vegagerðin.

## Suggested Phase Order

1. B2B — Curated Öxi alternatives with distinct Höfn/south route.
2. B3 — Route-selection station preview / broader route-selection UX, if still desired.
3. H-track — route cache + interest heatmap planning/implementation.
4. Overview map / Iceland status map.
5. Vegagerðin provider.
6. Deferred Vík/Mýrdalur section verification after current route/provider phases, unless it becomes user-visible enough to pull forward.

## Localhost Checks for Stebbi

After Claude Code implements B2B, Stebbi should test:

1. Route likely to trigger Öxi from the screenshot context.
   - Example: Reykjavík → Egilsstaðir, or the exact origin/destination from the screenshot.
   - Expected: route list includes a distinct Höfn/south option if Öxi is on one route and Höfn is not already represented.
   - Expected: that option has a distinct label, not just another duplicate `Til að sleppa við Öxi`.

2. Höfn → Egilsstaðir.
   - Expected: Öxi route is flagged as varasöm.
   - Expected: existing Reyðarfjörður/firðir avoidance still works.
   - Expected: no silly duplicate “via Höfn” route when Höfn is already origin/destination.

3. Egilsstaðir → Höfn.
   - Expected: same logic works in reverse.

4. A route that does not touch Öxi.
   - Example: Reykjavík → Akureyri.
   - Expected: no Höfn/south Öxi route appears.

5. UI regression.
   - Route cards remain readable on mobile.
   - Labels do not wrap awkwardly.
   - “Nota þessa leið” still selects the intended route.
   - Veðurstofan station layer and Púls are not affected by this change.

No Supabase, RLS, SQL, env, production, or deploy action should be part of this phase.

## Commands Run by Codex

- Read `WORKFLOW.md`
- Read `ai-handoff/2026-07-17-1000-todo-086-v406-claude-b1-b2a-done-prerelease.md`
- Searched route/curated logic with `rg`
- Read relevant snippets from:
  - `lib/weather/google.server.ts`
  - `lib/weather/routeCautionConstants.ts`
  - `lib/weather/routeCautions.ts`
  - `components/weather/RouteSelectionStep.tsx`
  - `lib/__tests__/weather-google.test.ts`

No tests were run by Codex for this review. No product code was changed.

## Uncertainty / Needs Confirmation

- I did not verify the exact best Höfn via coordinate visually. Claude Code should use an existing verified route/place constant if one exists, or Stebbi should validate on localhost before release.
- I am assuming the screenshot route context is the same Öxi family of routes already handled by `oxi-axarvegur-939`. If the exact screenshot uses a different Google route family, Claude Code should confirm with localhost.
