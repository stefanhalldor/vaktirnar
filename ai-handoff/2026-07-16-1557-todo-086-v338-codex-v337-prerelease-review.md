# TODO 086 v338 - Codex review of v337 prerelease

Created: 2026-07-16 15:57  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-16-1553-todo-086-v337-claude-v334-v335-v336-done-prerelease.md`

## Findings

1. **Medium: Route Safnpuls placement still does not match the v335 product request**

   In `app/auth-mvp/vedrid/FerdalagidClient.tsx`, the route Safnpuls block is rendered after the `Áfangastaður` section:

   - `Á leiðinni` section starts around `FerdalagidClient.tsx:1610`
   - `Áfangastaður` section starts around `FerdalagidClient.tsx:1688`
   - `VedurstofanRoutePulseSummary` renders at `FerdalagidClient.tsx:1727`

   The v335 request was specifically to make this a collapsed drawer at the bottom of `Á leiðinni`, before destination/supporting context. Claude’s handoff says it was moved "after the Áfangastaður section", which is exactly the placement Stebbi was trying to get away from.

   Recommendation: move the collapsed `VedurstofanRoutePulseSummary` into the bottom of the `Á leiðinni` content, before `Áfangastaður`. If the summary grid makes that awkward, use a small full-width row immediately after the on-route/worst-point content and before destination. Keep it collapsed by default.

2. **Medium: Route-caution matching uses sampled route points, which can produce false trailer warnings**

   `lib/weather/google.server.ts:609-613` applies `matchRouteCautions(route.points, to)` after `route.points` has already been downsampled to `MAX_ROUTE_POINTS`. `lib/weather/routeCautions.ts:119-124` then decides whether a route passes near Hólmavík using only those sampled points.

   For the current Hólmavík radius of 8 km and 80 sampled points this is probably okay for many routes, but it is still safety-adjacent. A sampled route can miss the key corridor point and incorrectly label a route as `Varasamt með eftirvagna`, or future smaller caution corridors such as Öxi can be even easier to miss.

   Recommendation: evaluate route cautions against the full Google polyline points before `samplePoints(...)`, or carry a separate `cautionPoints`/`fullPointsForCautions` internally. Keep the public `RouteOption.points` sampled for API/cost/performance, but do not base safety-ish annotations on sparse sampled geometry if full geometry is already available at fetch time.

3. **Low/Medium: Hólmavík bounds and via constants are duplicated in two modules**

   `lib/weather/google.server.ts:150-157` defines `WESTFJORDS_NORTH_BOUNDS` and `HOLMAVIK_VIA`. `lib/weather/routeCautions.ts:63-71` duplicates those values and relies on comments saying they are kept in sync.

   This is the kind of drift that quietly breaks product behavior later: one module might add an alternate route while the other still labels the same route as risky, or the warning bounds might diverge from the curated-route bounds.

   Recommendation: extract shared constants to one small module, for example `lib/weather/routeCautionConstants.ts` or `lib/weather/curatedRouteConstants.ts`, and import them from both places. This is especially worth doing before adding Öxi and Vegagerðin-driven cautions.

4. **Low: Route caution translation key is runtime-dynamic and type-cast**

   `components/weather/RouteSelectionStep.tsx:492-499` renders:

   ```tsx
   {tf(caution.labelKey as Parameters<typeof tf>[0])}
   ```

   This works for the current key, but the type cast hides future mistakes. If a future caution registry typo ships, the UI could fail at runtime or show a missing translation.

   Recommendation: constrain `labelKey` to a known union for route selection translation keys, or map caution IDs to labels in the UI adapter. Not urgent for v1, but worth tightening before more caution rules are added.

5. **Low: Icelandic count text may read awkwardly for one station**

   `messages/is.json:973` uses:

   ```json
   "{count} stöðvar með nýleg skilaboð"
   ```

   For `count = 1`, this becomes `1 stöðvar...`. Not blocking, but visible polish.

   Recommendation: either use an ICU plural message if current i18n setup supports it, or avoid the singular/plural problem with copy such as `Nýleg skilaboð frá stöðvum á leiðinni`.

## Positive notes

- The route-caution model is directionally right: `RouteOption.cautions` is separate from curated route labels, which keeps route identity and warning metadata from becoming one tangled concept.
- Öxi was not implemented without verified coordinates. Good restraint.
- The route Safnpuls drawer is now collapsed by default and hidden when empty in `components/weather/VedurstofanRoutePulseSummary.tsx:92-95`.
- The old route-preview 40-station 400-risk from v334 is mitigated by capping client station IDs at `components/weather/VedurstofanRoutePulseSummary.tsx:27-29` and `:66`.
- No obvious auth/RLS/Supabase leak found in this pass. The public route-preview endpoint remains read-only, validates station IDs, caps station count and limit, and returns preview messages only.

## Commands run

- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
  - exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-16-1553-todo-086-v337-claude-v334-v335-v336-done-prerelease.md'`
  - exit code: 0
- `git status --short`
  - exit code: 0
  - note: command printed Git config permission warnings for `C:\Users\Lenovo/.config/git/ignore`; not related to this code.
- `git diff --stat`
  - exit code: 0
- Targeted file reads for:
  - `components/weather/VedurstofanRoutePulseSummary.tsx`
  - `components/weather/RouteSelectionStep.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `lib/weather/routeCautions.ts`
  - `lib/weather/google.server.ts`
  - `lib/weather/provider.types.ts`
  - `lib/__tests__/weather-route-cautions.test.ts`
  - `lib/__tests__/weather-google.test.ts`
  - `messages/is.json`
  - `messages/en.json`
- `npm run type-check`
  - exit code: 0
- `npm run test:run -- lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts`
  - exit code: 0
  - result: 2 files passed, 104 tests passed

## Localhost checks for Stebbi

Use `http://localhost:3004/vedrid`.

### Route options / trailer caution

1. Reykjavík -> Ísafjörður
   - Expect fastest/default route to show `Varasamt með eftirvagna`.
   - Expect `Gegnum Hólmavík` not to show that warning unless it truly crosses another caution segment.
   - Confirm the badge fits on mobile width and does not push duration out of view.

2. Reykjavík -> Akureyri
   - Expect no Westfjords trailer warning.

3. Optional visual sanity check
   - Compare the route map to the warning label. If the route visually goes through Hólmavík but still gets the caution, that confirms the sampled-point issue.

### Route Safnpuls drawer

1. Use a route with several Veðurstofan stations and existing pulse messages.
2. Confirm the drawer is collapsed by default.
3. Confirm expanded station groups are clearer than before.
4. Confirm the drawer appears where Stebbi expects:
   - current code likely places it after `Áfangastaður`
   - desired placement is bottom of `Á leiðinni`, before `Áfangastaður`
5. Add a station pulse message and confirm the route drawer updates via refresh/realtime fallback.

## Recommendation

Do not treat v337 as fully aligned with v335 yet.

The code is technically clean and tests pass, but I would ask Claude Code to do a small v339 follow-up before broader release/testing:

1. Move route Safnpuls to the bottom of `Á leiðinni`, before `Áfangastaður`.
2. Either evaluate caution matching on full route geometry or explicitly document why sampled geometry is acceptable for Hólmavík v1.
3. Preferably centralize the Hólmavík/Westfjords constants before adding Öxi.

No need to redesign the whole approach. This is close; it just needs the product placement and geometry-risk tightened.
