# TODO 071 - v027 prerelease review

Created: 2026-07-12 09:56  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: prerelease review

## Findings

No blocking findings.

The v027 implementation looks aligned with the requested workflow:

- map marker timestamp chips were removed from `TravelAuditMap`;
- `RouteWeatherPointDetailCard` is now the shared detail renderer for both the map point panel and all route-point rows;
- selected non-worst points can now derive active-candidate-safe weather values from nearest forecast drawer rows instead of falling back to stale `summaryForWindow`;
- worst/highlighted points still prefer server-derived `highlightedIssue` threshold context;
- route-point cards keep their own visual wrapper/background/status badges while sharing the actual detail rows.

## Review notes

The main architecture choice is good: the shared presentation component is below the outer card wrapper. That means:

- "Mest krefjandi á leiðinni" can keep its special label;
- manually selected points can keep plain title treatment;
- all forecast-point rows can keep status-colored card backgrounds and extra badges;
- the detailed rows stay structurally consistent.

This matches Stebbi's requirement: the content should be materially the same, with only wrapper/background/label differences.

## Residual risk

Low.

The one behavior to keep an eye on in localhost is active-candidate selected points with no `forecastRows`. The helper intentionally suppresses stale `summaryForWindow` values and returns no timestamp/weather values in that case. That is safer than showing stale values, but Stebbi should check that the UI feels understandable if a point has insufficient forecast rows.

No SQL, Supabase, auth, RLS, secrets, deployment, or production-data changes are involved in this v027 scope.

## Files reviewed

- `ai-handoff/2026-07-12-0954-todo-071-v027-claude-v025-v026-done-prerelease.md`
- `components/weather/RouteWeatherPointDetailCard.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `lib/__tests__/travelAuditMap.helpers.test.ts`
- `messages/is.json`
- `messages/en.json`

## Commands run by Codex

```bash
npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts
```

Result: pass. 1 test file, 67 tests passed.

```bash
npm run type-check
```

Result: pass. `tsc --noEmit` completed with no errors.

## Release recommendation

If Stebbi's localhost checks pass, this is OK to release unchanged.

I would not require another Claude patch before release.

## Localhost checks for Stebbi

Open `/vedrid` and calculate a route that has at least:

1. one worst/challenging point;
2. one manually selected non-worst point;
3. visible "Allir spápunktarnir á leiðinni" rows.

Check:

- map markers do not show timestamp chips directly on the map;
- clicking a map point opens "Valin veðurspá";
- selected point detail shows the same row structure as the worst point: point number, departure, ETA/distance, forecast point distance, forecast time, wind/precip/temp, threshold excess when applicable, links;
- the worst point still shows "Mest krefjandi á leiðinni" and threshold excess such as `Vindur (x yfir y m/s mörkum)`;
- all route-point cards still have status-colored backgrounds/borders and badges, but the detail rows match the shared structure;
- no stale timestamp appears when switching departure slots in the scrubber;
- "Spá" opens the forecast drawer from both the map panel and route-point rows;
- mobile width does not overflow horizontally.

Do not test SQL, auth, Supabase, or production data for this item; they are outside the change.
