# 2026-07-17 10:19 — TODO-086 v408 — Claude B2B prerelease: Öxi south route via Hellisheiði + Höfn

Created: 2026-07-17 10:19
Timezone: Atlantic/Reykjavik

## What was implemented

B2B: new curated route option "Til að sleppa við Öxi suðurleiðina" that fires whenever Google routes a trip through Öxi (Road 939), offering an alternative via Hellisheiði and the south coast through Höfn.

## Files changed

- `lib/weather/routeCautionConstants.ts` — added `HOFN_VIA = { lat: 64.254, lon: -15.208 }` and `HOFN_PROXIMITY_M = 10_000`
- `lib/weather/google.server.ts` — imported HOFN_VIA/HOFN_PROXIMITY_M; added `corridorGuard` optional field to `CuratedRouteRule` type; added new rule `avoid-oxi-via-hofn`; extended `evidenceOnly` to cover the new rule; updated `getCuratedRouteOptions` to use corridorGuard logic for rules that carry it
- `components/weather/RouteSelectionStep.tsx` — added `CURATED_AVOID_OXI_VIA_HOFN` label branch resolving to `routeOptionAvoidOxiViaSouth`, placed before the existing `CURATED_AVOID_OXI` branch
- `messages/is.json` — `"routeOptionAvoidOxiViaSouth": "Til að sleppa við Öxi suðurleiðina"`
- `messages/en.json` — `"routeOptionAvoidOxiViaSouth": "Avoid Öxi via south route"`
- `lib/__tests__/weather-google.test.ts` — 4 new tests for `CURATED_AVOID_OXI_VIA_HOFN`

## Key design decisions

### Destination-independent triggering

The new rule uses `triggerCautionId: 'oxi-axarvegur-939'` with no `origin`/`destination` bounds, identical to the existing `avoid-oxi-via-reydarfjordur` rule. It fires for any trip that goes through Öxi, regardless of where you are going. No destination restriction is needed or wanted.

### corridorGuard replaces anyBaseAvoidsCaution for this rule

`avoid-oxi-via-reydarfjordur` uses the generic "skip if any base route already avoids the caution" logic. That was too aggressive for the Höfn rule: if Google returns a Reyðarfjörður-style alternative, the generic check would suppress the Höfn option too, even though they are distinct alternatives.

The new `corridorGuard` field on `CuratedRouteRule` replaces that check for rules that carry it: the Höfn rule is only skipped when a base route already passes within 10 km of `HOFN_VIA`. This allows both Reyðarfjörður and Höfn alternatives to be shown independently when both are genuinely different from the base routes.

### evidenceOnly applies to both Öxi-avoid rules

`avoid-oxi-via-hofn` uses `evidenceOnly = true` for caution validation, same as `avoid-oxi-via-reydarfjordur`. This prevents the 10 km corridorPoint from falsely flagging a coastal south-route as still having the Öxi caution. Suppression only fires if the curated route actually passes within 1.5 km of the Öxi Veðurstofan station.

### Via-points: Hellisheiði then Höfn

`vias: [HELLISHEIDI_VIA, HOFN_VIA]` — the route is forced through Hellisheiði (Route 1, -21.392, 64.036) and then Höfn (Route 1, -15.208, 64.254). `HELLISHEIDI_VIA` is the existing local constant in google.server.ts, already used by the Hellisheiði curated rules. `HOFN_VIA` is new and exported from routeCautionConstants.ts so it can be shared with caution logic if needed.

## Verification

- `npm run test:run -- lib/__tests__/weather-google.test.ts` → 114 tests passed
- `npm run type-check` → clean

## Localhost checks for Stebbi

These must be verified before release. No production SQL, env, or deploy action is needed for this change.

1. Reykjavík → Egilsstaðir (route that Google sends via Öxi)
   - Expected: route list includes a new distinct "Til að sleppa við Öxi suðurleiðina" card in addition to the existing "Til að sleppa við Öxi" (Reyðarfjörður) card, if Google does not already route via the south coast.
   - Expected: the two Öxi-avoid cards have different labels, not two identical "Til að sleppa við Öxi".
   - Expected: the south route is noticeably longer than the Reyðarfjörður route.

2. Höfn → Egilsstaðir (origin IS near Höfn)
   - Expected: "Til að sleppa við Öxi" (Reyðarfjörður) may appear if Öxi is flagged.
   - Expected: "Til að sleppa við Öxi suðurleiðina" does NOT appear, because the base route already starts near Höfn and corridorGuard fires.

3. Egilsstaðir → Höfn (destination IS near Höfn)
   - Expected: same as above — base route ends near Höfn → corridorGuard fires → south route not added.

4. Route that does not trigger Öxi (e.g. Reykjavík → Akureyri)
   - Expected: neither Öxi-avoid card appears.

5. UI regression
   - Route cards readable on mobile.
   - Labels do not wrap awkwardly.
   - "Nota þessa leið" selects the correct route.
   - Veðurstofan station layer and Púls unaffected.

## Via-point verification note

`HELLISHEIDI_VIA` and `HOFN_VIA` are both pending localhost visual verification. The test confirms the correct coordinates are sent to Google, but Stebbi should confirm on localhost that the returned polyline actually uses the south coast road and not Road 939.

## What was NOT done

- No Vík/Mýrdalur `verified:true` work.
- No route cache or interest heatmap.
- No Iceland overview map.
- No Vegagerðin provider.
- No SQL, migrations, env, or deploy.

## Suggested next steps

1. Stebbi validates on localhost (see checks above).
2. If OK, commit and push.
3. B3 / next phase as discussed in v407.
