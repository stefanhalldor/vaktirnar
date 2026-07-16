# Codex Handoff — Hólmavík curated route must be caution-triggered, not destination-only

Created: 2026-07-16 21:32  
Timezone: Atlantic/Reykjavik  
TODO: 086  
Context: Stebbi tested Ísafjörður → Akureyri. The base route is correctly labeled `Varasamt með eftirvagna`, but no curated `Gegnum Hólmavík` route is offered.

## Problem

The UI correctly warns that the selected/default route is risky for trailers, but it does not offer the safer Hólmavík alternative.

Screenshot case:

- From: `Ísafjörður`
- To: `Akureyri`
- Base route: `Vestfjarðavegur/Leið 60 og Hringvegur/Þjóðvegur`
- Route warning: `Varasamt með eftirvagna`
- Missing route option: `Gegnum Hólmavík`

This is exactly the kind of case where Hólmavík should be offered. The fact that the user starts in Ísafjörður must not suppress the safe-corridor alternative.

## Root Cause

Current Hólmavík curated route rule in `lib/weather/google.server.ts` is destination-bound and excludes Westfjords origins:

```ts
{
  id: 'any-iceland-to-westfjords-north-via-holmavik',
  origin: { bounds: [ICELAND_BOUNDS] },
  excludedOrigin: { bounds: [WESTFJORDS_NORTH_BOUNDS] },
  destination: { bounds: [WESTFJORDS_NORTH_BOUNDS] },
  minFastestRouteDistanceM: 180_000,
  vias: [HOLMAVIK_VIA],
  labels: ['CURATED_VIA_HOLMAVIK'],
}
```

So the rule only runs when:

- origin is in Iceland
- origin is **not** in northern/western Westfjords
- destination **is** in northern/western Westfjords

For `Ísafjörður → Akureyri`:

- origin is in `WESTFJORDS_NORTH_BOUNDS`
- destination is not in `WESTFJORDS_NORTH_BOUNDS`

Therefore the curated rule is never evaluated.

This conflicts with the caution model, where `westfjords-south-route60` already uses `anyPartyBounds` and correctly applies when either origin or destination is in the Westfjords area and the route avoids Hólmavík.

## Product Rule

Hólmavík curated route should be offered whenever:

1. At least one Google base route receives the `westfjords-south-route60` caution.
2. No Google base route already avoids that caution.
3. The fastest route is long enough to justify adding a curated alternative, keeping the existing `180_000m` distance guard unless Stebbi decides otherwise.
4. The curated route via `HOLMAVIK_VIA` actually clears the `westfjords-south-route60` caution after fetch.

This is the same high-level model as Öxi:

- detect risky segment/corridor from returned route geometry
- if all base routes are risky, fetch a curated route through a safe via point
- validate that the curated route is actually safe before showing it

## Recommended Implementation

### 1. Convert Hólmavík rule to `triggerCautionId`

Change the Hólmavík rule in `CURATED_ROUTE_RULES` from origin/destination match to:

```ts
{
  id: 'safe-westfjords-via-holmavik',
  logName: 'Vestfirðir / Hólmavík',
  triggerCautionId: 'westfjords-south-route60',
  minFastestRouteDistanceM: 180_000,
  vias: [HOLMAVIK_VIA],
  labels: ['CURATED_VIA_HOLMAVIK'],
}
```

Important:

- Remove `excludedOrigin`.
- Remove `origin`.
- Remove `destination`.
- Update comments to say the rule is caution-triggered and works both directions.

The existing `getCuratedRouteOptions` trigger-caution flow should then:

- run when any base route has `westfjords-south-route60`
- skip when any base route already avoids that caution
- fetch a route via Hólmavík
- suppress the curated route if it still has the same caution

This is the safest way to avoid special-casing origin/destination direction.

### 2. Keep duplicate suppression

Keep `shouldSkipCuratedHolmavik` as an extra belt-and-suspenders guard. It should still be useful when a route passes near Hólmavík but somehow the caution logic and duplicate logic disagree.

### 3. Update tests

In `lib/__tests__/weather-google.test.ts`:

- Replace or rewrite the current test:

```ts
it('Westfjords origin does NOT trigger CURATED_VIA_HOLMAVIK (excludedOrigin guard)', ...)
```

This test is now wrong product behavior.

Add tests:

1. `Ísafjörður → Akureyri` with a base route that avoids Hólmavík and receives `westfjords-south-route60` should trigger `CURATED_VIA_HOLMAVIK`.
2. `Ísafjörður → Akureyri` curated request uses `HOLMAVIK_VIA` as a `via: true` intermediate.
3. If Google base routes include a non-caution route via Hólmavík, no extra curated Hólmavík fetch is made.
4. If the curated route via Hólmavík still receives `westfjords-south-route60`, it is suppressed.
5. A non-Westfjords route, e.g. Reykjavík → Akureyri, still does not trigger Hólmavík.

Also check `lib/__tests__/weather-route-cautions.test.ts`. It already asserts reverse-direction caution logic:

```ts
Ísafjörður → Höfn ... gets trailer caution when avoiding Hólmavík
```

Add or adapt a direct `Ísafjörður → Akureyri` caution test if helpful.

### 4. UI copy can stay as-is

Existing user-facing label is good:

- `routeOptionViaHolmavik`: `Gegnum Hólmavík`
- `routeCautionWestfjordsSummary`: says the Hólmavík route is often simpler.

No new copy is required for this specific fix.

## Acceptance Criteria

For `Ísafjörður → Akureyri`:

- Base route still shows `Varasamt með eftirvagna` when it avoids Hólmavík.
- A second option appears:
  - label: `Gegnum Hólmavík`
  - route should pass near `HOLMAVIK_VIA`
  - route should not show the `Varasamt með eftirvagna` warning for `westfjords-south-route60`
- If Google already returns a route via Hólmavík, do not add a duplicate curated route.

For existing cases:

- Reykjavík/Garðabær → Ísafjörður still offers `Gegnum Hólmavík`.
- Höfn → Ísafjörður still offers `Gegnum Hólmavík`.
- Reykjavík/Garðabær → Akureyri still does not offer `Gegnum Hólmavík`.
- Öxi curated logic remains unchanged.

## Suggested Commands

Run at least:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts
```

If Claude touches route option rendering:

```bash
npm run test:run -- lib/__tests__/weather-routes-api.test.ts
```

## Localhost Checks for Stebbi

1. Open `/vedrid`.
2. Search route:
   - From: `Ísafjörður`
   - To: `Akureyri`
3. Expected:
   - Default/fastest route may be labeled `Varasamt með eftirvagna`.
   - A separate route option `Gegnum Hólmavík` appears.
   - The Hólmavík route visually bends through/near Hólmavík and avoids the risky Westfjords south Route 60 warning.
4. Also test:
   - `Reykjavík → Ísafjörður`: `Gegnum Hólmavík` still appears.
   - `Höfn → Ísafjörður`: `Gegnum Hólmavík` still appears.
   - `Reykjavík → Akureyri`: `Gegnum Hólmavík` does not appear.
5. Confirm no extra duplicate Hólmavík route appears if Google already shows a route via Hólmavík.

No Supabase, SQL, auth, RLS, env, secrets, migration, Vercel, commit, push, or deploy work is required for this fix.

## Notes for Claude Code

This should be a small targeted change. Do not redesign the full curated route registry. The intended model is simply:

> Hólmavík should behave like Öxi: if the caution says the base route is risky and no safe base option exists, ask Google for a curated safe-corridor alternative and validate it before showing.

## Óvissa / þarf að staðfesta

The exact Google output for Ísafjörður → Akureyri via `HOLMAVIK_VIA` must be visually checked on localhost. The code-level logic is clear, but Google may shape the route in a surprising way; if the curated route still receives the same caution, it must be suppressed rather than shown.
