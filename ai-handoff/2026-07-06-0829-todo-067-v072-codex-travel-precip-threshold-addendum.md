# 2026-07-06-0829-todo-067-v072-codex-travel-precip-threshold-addendum

Created: 2026-07-06 08:29  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Addendum for TODO-067 Ferðalagið. Based on Stebbi's localhost observation that light rain around 0.7 mm/klst with calm wind is being flagged as `Varúð / Mikil úrkoma`, even though the trip should be green.

## Product Decision

For Ferðalagið / driving route weather:

- Light rain is not automatically a problem.
- Rain should not downgrade the trip to yellow unless precipitation is **more than 1.0 mm/klst**.
- `0.7 mm/klst` with very low wind should be **green**, not yellow.
- It is acceptable to mention light rain later in the day, but it should not be framed as a problem and probably does not need to be mentioned in the main result when wind is calm.
- The phrase `Mikil úrkoma` should not be used for `0.7 mm/klst`.

Stebbi's concrete example:

- Route result shows `Varúð`
- Reason says `Mikil úrkoma um kl. 17:00`
- Audit card shows `Úrkoma: 0.7 mm/klst`
- Wind is around `2 m/s`
- This should be green.

## Current Code Problem

Current threshold:

```ts
WEATHER_THRESHOLDS.dry.maxPrecipMmPerHour = 0.1
```

Files:

- `lib/weather/thresholds.ts:19-21`
- `lib/weather/travel.ts:87-95`
- `lib/weather/travel.ts:351-360`
- `lib/__tests__/weather-travel.test.ts:65-69`
- `lib/__tests__/weather-travel.test.ts:91-95`

This `0.1` threshold makes almost any measurable rain produce `gult` in Ferðalagið. That may make sense for some "dry activity" concepts, but it is too sensitive for driving.

## Required Fix

Do not change the shared `dry.maxPrecipMmPerHour` globally unless Claude Code confirms all consumers should change.

Recommended approach:

1. Add travel-specific precipitation thresholds, e.g.

```ts
travel: {
  cautionPrecipMmPerHour: 1.0,
  heavyPrecipMmPerHour: 3.0,
}
```

2. In `lib/weather/travel.ts`, use `WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour` for driving/trailer travel precipitation status.

3. Keep status green when:

```ts
precip <= 1.0
```

assuming wind/gust thresholds are also green.

4. Only set `reasonCode = 'precipitation'` when:

```ts
precip > 1.0
```

5. Change `reasonToText('precipitation')` so it does not always say `Mikil úrkoma`.

Recommended wording:

- For `> 1.0`: `Rigning á leiðinni`
- For much higher values, e.g. `>= 3.0`: `Mikil úrkoma`

This can be implemented by either:

- making reason text metric-aware, or
- using distinct reason codes such as `rain_on_route` and `heavy_precipitation`.

Keep it simple for now: `precipitation` can map to `Rigning á leiðinni`, and the measured value in the audit card shows severity.

## Important Parsing Check

File:

- `lib/weather/forecast.ts:41-52`

Current code:

```ts
const precipitation = next1?.details?.precipitation_amount ?? next6?.details?.precipitation_amount ?? 0
...
precipitationMmPerHour: precipitation
```

If `next_1_hours` is missing and `next_6_hours` is used, met.no `precipitation_amount` is for the whole next-6-hour period, not necessarily per hour. The field is being stored as `precipitationMmPerHour`.

Required check:

- If using `next_1_hours`, keep as mm/hour.
- If falling back to `next_6_hours`, divide by 6 or rename/store it clearly as period precipitation.

Otherwise Ferðalagið can still overstate rain intensity even after the threshold is fixed.

## Test Updates

Update travel tests:

1. Change old expectation:

```ts
returns gult with precipitation (> 0.1 mm/h)
```

to:

```ts
returns graent with light rain at 0.7 mm/h and calm wind
```

2. Add:

```ts
returns gult when precipitation is > 1.0 mm/h
```

3. Add trailer variant:

```ts
returns graent with caravan and light rain at 0.7 mm/h if wind/gust are calm
```

4. Add:

```ts
reason text does not say "Mikil úrkoma" for 0.7 mm/h
```

5. If forecast parser is changed:

- `next_1_hours.precipitation_amount = 0.7` should parse as `0.7`.
- `next_6_hours.precipitation_amount = 6.0` should parse as `1.0` mm/klst if stored as hourly intensity.

## UI / Copy Guidance

For light rain under or equal to 1.0 mm/klst:

- Do not show `Varúð`.
- Do not show `Mikil úrkoma`.
- Do not make it the highlighted issue.
- The expanded audit table can still show the measured precipitation value.

Optional low-key copy if needed:

- `Lítil rigning gæti verið seinnipartinn.`

But for the main result, prefer:

- `Ferðaveður lítur vel út.`

## Localhost Checks For Stebbi

After Claude Code implements this:

1. Open `/auth-mvp/vedrid`.
2. Test the same route/time that produced `Úrkoma: 0.7 mm/klst`.
3. Expected:
   - status is green
   - no `Varúð`
   - no `Mikil úrkoma`
   - no highlighted precipitation issue for `0.7 mm/klst`
   - audit details may still show `Úrkoma: 0.7 mm/klst`
4. Test a scenario or fixture where precipitation is above `1.0 mm/klst`.
5. Expected:
   - status can become yellow
   - wording should say `Rigning á leiðinni` or similar
   - measured value should be visible in details
6. Confirm wind-only warnings still work.
7. Confirm caravan wind thresholds still work.
8. No SQL, Supabase, env, production, commit, push, or deploy changes.

## Suggested Message To Claude Code

```txt
Claude Code, taktu líka inn ai-handoff/2026-07-06-0829-todo-067-v072-codex-travel-precip-threshold-addendum.md í næsta litla follow-up pass.

Stebbi staðfesti að 0.7 mm/klst með logni eigi að vera grænt í Ferðalagið, ekki Varúð/Mikil úrkoma. Ferðalagið á ekki að flagga úrkomu sem vandamál nema hún sé > 1.0 mm/klst. Passaðu að þetta sé travel-specific threshold en ekki óvart global breyting fyrir golf/grill nema það sé sérstaklega ákveðið.

Skoðaðu líka parseMetnoForecast fallback: next_6_hours precipitation_amount má ekki vera geymt sem mm/klst án þess að deila niður á klst eða merkja það rétt.
```
