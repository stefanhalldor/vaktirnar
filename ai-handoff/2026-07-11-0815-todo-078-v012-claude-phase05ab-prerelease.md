# TODO 078 - Claude Code: Phase 0.5A/0.5B prerelease handoff

Created: 2026-07-11 08:15
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Prerelease handoff
Related TODO: #78 Ferðalagið / shared route-weather core
Implements: v011 approved scope (Phase 0.5A + 0.5B only)

Status: Framkvæmd lokið. Ekkert commitað enn.

---

## Hvað var gert

### Phase 0.5A — Unit tests

Ný skrá: `lib/__tests__/weather-assessment.test.ts` (35 próf)

Covered:
- `assessDrivingConditions`: öll threshold-tilfelli (graent/gult/rautt, no/horse trailer, wind/gust/precip priority)
- `getForecastHoursNearEta`: ±1h window, custom windowMs, tómt array, nákvæmur jaðar
- `assessRouteLeg — status`: calm/caution/danger/no-data
- `assessRouteLeg — worst metric`: worst er hæsta gildi, ekki fyrsta; worstWind/Gust/Precip populated
- `assessRouteLeg — ETA weighting`: outbound 50% point, return leg ETA inversion (point near origin reached late)
- `assessRouteLeg — per-point statuses`: delta encoding (aðeins non-green stored), no_data for empty hours
- `assessRouteLeg — displayPoint`: set for rautt/gult/graent; metric = gust/wind/precipitation; undefined for no_data
- `assessRouteLeg — passthrough`: departureIso + arrivalIso preserved

### Phase 0.5B — Shared seam extraction

Ný skrá: `lib/weather/assessment.ts`

Exports:
- `getForecastHoursNearEta` — supporting utility (was `getHoursNearEta`)
- `assessDrivingConditions` — supporting utility (was `evalDrivingLeg`)
- `RouteLegInput` — named input type for domain function
- `RouteLegAssessment = TravelCandidate` — future-facing alias
- `assessRouteLeg(input: RouteLegInput): RouteLegAssessment` — main domain seam

Private (inside assessment.ts, not exported):
- `findWorstRouteMetric` — was `findWorstMetric` in travel.ts

Uppfærsla `lib/weather/travel.ts`:
- Fjarlægð: `ETA_WINDOW_MS`, `getHoursNearEta`, `findWorstMetric`, `evalDrivingLeg`, `evaluateCandidate`
- Bætt við import frá `./assessment`
- Öll call sites uppfærð: 8 staðir í `generateCandidates`, `buildRouteWeatherPoints`, `buildSingleDepartureTimeline`, `enrichWithArrivalWeather`, `buildForecastRows`, `checkTravelWeather`
- `CandidatePointStatus`, `CandidateDisplayPoint` fjarlægt úr type imports (aðeins notað í hreyfðu kóðanum)
- `checkTravelWeather()` signature, input type og output type ÓBREYTT

---

## Prófarniðurstöður

```
Test Files  66 passed (66)
Tests  2095 passed | 27 skipped | 8 todo (2130)
```

(2060 → 2095: +35 ný próf í weather-assessment.test.ts)

TypeScript: `tsc --noEmit`: engar villur.

---

## Hvað var EKKI gert (per v011)

- Engin `lib/camping/*`
- Engin `/api/teskeid/camping/*`
- Engin `CAMPING_ENABLED`
- Engin `WEATHER_TRIP_ENABLED` wiring
- Engin UI breyting
- Engin SQL
- Engar RLS/grant breytingar
- Engin public nav

---

## Localhost checks fyrir Stebbi

Þetta á að líta nákvæmlega eins út og fyrir refactor.

1. Opna `/auth-mvp/vedrid` sem innskráður notandi
2. Velja leið (t.d. Reykjavík → Akureyri eða Garðabær → Akranes)
3. Bíða eftir route options
4. **Vænt**: route options birtast eins og áður
5. Velja leið og klára veðurútreikning
6. **Vænt**: niðurstaða — status litur, svar texti, highlighted issue staðsetning, departure scrubber, route weather points á korti — lítur eins út og áður
7. Prófa eina leið á window mode (velja `Hvenær get ég farið` ef við á)
8. **Vænt**: window mode hegðar sér eins og áður
9. Opna `/vedrid` sem óinnskráður notandi ef `WEATHER_PUBLIC_ENABLED=true`
10. **Vænt**: public flow virkar eins og áður

Engin ný UI, engin Ferðalagið mode, engin camping controls eiga að sjást.

Engin SQL migration þarf að keyra.

---

## Skrár sem breyttust

```
lib/weather/assessment.ts          (ný)
lib/__tests__/weather-assessment.test.ts  (ný)
lib/weather/travel.ts              (refactored — public API óbreytt)
```
