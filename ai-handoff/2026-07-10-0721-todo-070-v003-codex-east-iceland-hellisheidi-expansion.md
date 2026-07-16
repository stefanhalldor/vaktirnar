# TODO #70 - Expand Hellisheiði rule to East Iceland

Created: 2026-07-10 07:21  
Timezone: Atlantic/Reykjavik

Supersedes / extends: `2026-07-10-0705-todo-070-v002-codex-hellisheidi-rule-tightened.md`

## Context

Stebbi released the previous Hellisheiði curated route rule and tested it on production. A production test for:

- `Reykjavík -> Egilsstaðir`

still did not produce the desired Hellisheiði-based suggestion.

This is expected from v002 because Codex intentionally treated Egilsstaðir/Austurland as ambiguous and kept the first matcher constrained to the south/southeast corridor. That avoided accidentally matching Akureyri/north routes, but it is too narrow for the real product need.

Stebbi's new product requirement:

> Extend the rule so East Iceland routes like Reykjavík -> Egilsstaðir can also get one hidden Hellisheiði via suggestion.

Stebbi also asked whether we should simply create one extra Hellisheiði route for almost everything, including Akureyri, because the Akureyri route through Hellisheiði / around the ring road would presumably sort to the bottom anyway.

## Codex recommendation

Do not make a fully broad "always add Hellisheiði for every destination east of Hellisheiði" rule yet.

Instead:

1. Keep the v002 south/southeast rule.
2. Add a separate explicit East Iceland matcher for Egilsstaðir / Austurland.
3. Keep Akureyri/north routes excluded.
4. Reuse the same user-facing label: `Um Hellisheiði`.

This gives Stebbi the route he expects for Egilsstaðir without polluting every north-Iceland route with a likely-useless long option.

## Why not always add Hellisheiði?

The "always one extra Hellisheiði suggestion" idea is tempting, but it has risks:

1. API cost: every matching route adds one extra Google Routes request.
2. UI noise: users going to Akureyri, Borgarnes, Snæfellsnes, Westfjords, etc. may see a strange extra route that is obviously not useful.
3. A single hidden via-point on Hellisheiði does not necessarily force "the full ring road around the south/east" for Akureyri. Google may satisfy the via-point and then route back west/north, depending on its optimizer.
4. If we truly want "Akureyri via the full ring road", that is a different curated route requiring multiple via-points, not the same simple Hellisheiði rule.
5. It would make analytics/admin curated-label counts noisier.

So v003 should expand to confirmed East Iceland needs, not become universal.

## Proposed implementation

Keep the existing/new v002 rule for:

- capital area / west-north capital approach -> Hveragerði/Selfoss/south-coast corridor
- label: `CURATED_VIA_HELLISHEIDI`

Add a second destination matcher/rule for East Iceland:

```ts
const EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS: Bounds = {
  // Starting-point bounds only. Claude Code must verify against real test places.
  minLat: 64.35,
  maxLat: 66.05,
  minLon: -15.90,
  maxLon: -13.00,
}
```

Candidate route rule:

```ts
{
  id: 'capital-corridor-to-east-iceland-via-hellisheidi',
  logName: 'Hellisheiði / Austurland',
  origin: {
    bounds: [
      CAPITAL_AREA_BOUNDS,
      WEST_NORTH_CAPITAL_APPROACH_BOUNDS,
    ],
  },
  destination: {
    bounds: [EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS],
  },
  // Reuse the verified Hellisheiði via-point from v002 implementation.
  via: HELLISHEIDI_VIA,
  labels: ['CURATED_VIA_HELLISHEIDI', 'CURATED_EAST_ICELAND_VIA_HELLISHEIDI'],
}
```

If the current implementation does not have `HELLISHEIDI_VIA` as a shared constant yet, extract it so the south/southeast and East Iceland rules do not duplicate coordinates.

## Label / UI behavior

The route picker should still show:

- `Um Hellisheiði`

for both:

- south/southeast Hellisheiði rules
- East Iceland Hellisheiði rule

Implementation detail:

- UI should check `ro.labels.includes('CURATED_VIA_HELLISHEIDI')`.
- The second label `CURATED_EAST_ICELAND_VIA_HELLISHEIDI` is optional but useful for diagnostics/admin counts.
- Do not expose the more technical second label to users.

If Claude Code prefers not to add a second analytics label, that is acceptable, but then diagnostics should include the rule id somehow, because otherwise all Hellisheiði rules are indistinguishable in logs.

## Matching guardrails

The East Iceland bounds must not catch Akureyri.

Approximate reference:

- Egilsstaðir: east enough, should match.
- Seyðisfjörður/Reyðarfjörður/Eskifjörður/Neskaupstaður/Djúpivogur: likely should match if within bounds.
- Akureyri: must not match.
- Mývatn/Húsavík/North Iceland: should not match unless Stebbi explicitly approves later.

Do not solve this by simply raising `maxLat` on the original `SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS`. That would make the original rule too vague and harder to reason about.

Use separate named bounds/rules so future reviews can see which corridor is being supported.

## Tests Claude Code should add/update

Add tests near existing curated route tests in `lib/__tests__/weather-google.test.ts`.

Required new tests:

1. `Reykjavík/Garðabær -> Egilsstaðir` triggers a curated Hellisheiði request.
2. The resulting route has `CURATED_VIA_HELLISHEIDI`.
3. If using the second diagnostic label, route also has `CURATED_EAST_ICELAND_VIA_HELLISHEIDI`.
4. The curated request uses the shared verified Hellisheiði via coordinate.
5. `Reykjavík/Garðabær -> Akureyri` does not trigger the East Iceland Hellisheiði rule.
6. `Reykjavík/Garðabær -> Mývatn` or another north/northeast route does not trigger unless explicitly included.
7. `Reykjavík/Garðabær -> Hveragerði/Selfoss` still triggers the original south/southeast Hellisheiði rule.
8. `Reykjavík/Garðabær -> Þorlákshöfn` still uses `CURATED_VIA_THRENGSLAVEGUR`, not the generic Hellisheiði rule.
9. Final submit still accepts a selected `CURATED_VIA_HELLISHEIDI` East Iceland route id and uses that geometry for weather sampling.

Also update route-picker label tests if there are any, or add a focused assertion that `CURATED_VIA_HELLISHEIDI` maps to `Um Hellisheiði` even when a second diagnostic label is present.

## Diagnostics expected

For `Reykjavík -> Egilsstaðir`:

```json
{
  "curatedAdded": true,
  "curatedRules": ["CURATED_VIA_HELLISHEIDI"]
}
```

If using the optional second label, diagnostics may include both:

```json
{
  "labels": ["CURATED_VIA_HELLISHEIDI", "CURATED_EAST_ICELAND_VIA_HELLISHEIDI"]
}
```

For `Reykjavík -> Akureyri`:

```json
{
  "curatedAdded": false
}
```

or at least no Hellisheiði curated route.

For `Garðabær -> Þorlákshöfn`:

```json
{
  "curatedRules": ["CURATED_VIA_THRENGSLAVEGUR"]
}
```

## Product decision: broad always-Hellisheiði route

Do not implement the broad "always Hellisheiði" route in this pass.

If Stebbi still wants to explore it later, make it a separate experiment:

- maybe behind a dev-only flag first,
- maybe only when `routeCount < 2`,
- maybe only when the destination is east of a much stricter longitude and not in known north/west buckets,
- and only after measuring API cost and UI clutter.

For now, the safer product move is named corridor rules:

1. Þorlákshöfn via Þrengslavegur.
2. South/southeast via Hellisheiði.
3. East Iceland via Hellisheiði.

## Supabase / privacy / production notes

No SQL migration expected.

No RLS/auth/grants changes expected.

No production data changes expected.

Do not store raw route geometry, origin/destination coordinates, place names, Google responses, or precise route pairs in analytics/admin.

Curated labels are okay as coarse metadata, but if adding `CURATED_EAST_ICELAND_VIA_HELLISHEIDI`, treat it as generic route-category metadata only.

Every matching rule adds a Google Routes request, so keep the matcher constrained.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid`.

Positive checks:

1. `Reykjavík -> Egilsstaðir`
   - Expected: route picker shows `Um Hellisheiði`.
   - Expected: map follows Route 1 over Hellisheiði at the start.
   - Expected: terminal diagnostics show Hellisheiði curated route.
   - Select it and continue to result.
   - Expected: no `selected_route_unavailable`; weather sampling follows selected route geometry.
2. `Garðabær -> Egilsstaðir`
   - Same expected result.

Regression checks:

1. `Reykjavík/Garðabær -> Akureyri`
   - Expected: no `Um Hellisheiði` curated route in this v003 pass.
2. `Reykjavík/Garðabær -> Mývatn` or another north/northeast route if easy to test
   - Expected: no `Um Hellisheiði`.
3. `Garðabær -> Þorlákshöfn`
   - Expected: `Um Þrengslaveg`, not the generic East Iceland Hellisheiði rule.
4. `Garðabær -> Selfoss/Hveragerði`
   - Expected: `Um Hellisheiði` still works from the v002-style corridor.

Do not run broad production sweeps casually; each matching route can add a Google Routes request.

## Suggested next step

Claude Code should implement this as a small follow-up to the existing Hellisheiði registry work:

1. extract/reuse `HELLISHEIDI_VIA`;
2. add `EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS`;
3. add one explicit East Iceland rule;
4. add tests;
5. stop for handoff/review before another release.

## Óvissa / þarf að staðfesta

The exact East Iceland bounds need local verification. The proposed bounds are a starting point, not gospel.

Codex has not verified whether a single Hellisheiði via-point always produces the intended south/east route to Egilsstaðir. Stebbi should visually confirm the route on localhost before release.

If Google satisfies the Hellisheiði via-point and then still creates an odd route, the next step may require a second via-point farther east/south, not a broader matcher.
