# TODO-067 v062 - Claude Code: Sub-steps 1 + 2 shipped

Created: 2026-07-06 07:22
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Lokið. Engar production-breytingar, engin SQL-keyrsla, ekkert commit, ekkert push, ekkert deploy.

---

## Niðurstaða

Sub-step 1 (analysis layer) og sub-step 2 (API + UI + messages) eru báðar fullkláraðar og staðfestar með type-check, tests og build.

---

## Framkvæmdar breytingar

### Sub-step 1: Analysis layer

#### `lib/weather/types.ts`
Bætt við nýjum týpum:
- `WorstMetric` — value, timeIso, lat/lon/routeIndex/distanceFromOriginM/routeFraction
- `TravelCandidate` — departureIso, arrivalIso, status, reasonCode, worstWind/Gust/Precip
- `TravelWindow` — fromIso, toIso, status, reasonCode
- `TravelIssue` — leg, metric, value, unit, timeIso, lat/lon, distanceFromOriginM, routeFraction, reasonCode
- `TravelPlan` — route, outbound (candidates, bestWindow, badWindows, leavingAt, windowMode), return?, highlightedIssue?
- `TravelPointForecast` — hours, lat, lon, routeIndex, distanceFromOriginM
- `DeterministicResult` stækkuð með `travelPlan?: TravelPlan`

#### `lib/weather/travel.ts` (endurskrifuð)
Nýtt `TravelWeatherInput`:
- `earliestDepartureAt?` (defaults to now)
- `latestArrivalBy?` (triggers candidate-window analysis)
- `latestHomeBy?` (triggers return-window analysis)
- `pointForecasts: TravelPointForecast[]` (með lat/lon/routeIndex/distanceFromOriginM)
- `trailerKind: 'none' | TrailerKind`

Nýtt `checkTravelWeather()` flow:
- Candidate-window greining á 30 mín. millibili milli `earliestDeparture` og `latestArrivalBy - durationS`
- Single-window fallback ef `latestArrivalBy` vantar
- Return-window greining ef `latestHomeBy` sett
- `WorstMetric` með nákvæmri staðsetningu og tíma per candidate
- `highlightedIssue` byggir á versta outbound/return fundi
- `svar` með tíma og staðsetningu á íslensku
- `arrival_too_soon` error ef `latestArrivalBy - durationS < earliestDeparture`
- Lodging/stay greining deferred (ekki útfærð)

#### `lib/__tests__/weather-travel.test.ts` (endurskrifuð)
- `makeForecast()` skilar nú `TravelPointForecast` (með lat/lon/routeIndex/distanceFromOriginM)
- `BASE_INPUT` notar `earliestDepartureAt`, ekki `departureAt`
- Tent/lodging tests: `it.skip` (intent varðveitt)
- Nýjar test groups: candidate window analysis, return windows, WorstMetric tracking
- 113 passed | 5 skipped

### Sub-step 2: API + UI + messages

#### `app/api/teskeid/weather/travel/route.ts`
- Fjarlægt: `LodgingKind` import, `VALID_LODGING_KINDS`, `returnDepartureAt`, `departureAt` (required)
- Bætt við: `haversineM()` helper, Haversine cumulative distance fyrir route points
- `weatherPoints` fær nú `routeIndex` og `distanceFromOriginM` per point
- `pointForecasts: TravelPointForecast[]` með fullum metadata
- Input: `earliestDepartureAt?`, `latestArrivalBy?`, `latestHomeBy?` — allt valfrjálst
- `checkTravelWeather` fær nýja input shape

#### `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Fjarlægt: `lodging` step, `LodgingKindValue`, `lodgingKind` state, `returnDepartureAt` state, `lodgingOptions`
- `STEP_ORDER`: `['origin', 'destination', 'times', 'trailer', 'result']` (5 → 4 steps)
- Bætt við: `latestArrivalBy` state
- Times step: `latestArrivalBy` reitur í stað `returnDepartureAt`, departure valfrjálst (engin `disabled` kondísjón)
- Trailer step: "Áfram" → "Skoða veður" (kallar `handleSubmit` beint)
- `handleSubmit` payload: `earliestDepartureAt`, `latestArrivalBy`, `latestHomeBy`, `trailerKind` — engin `lodgingKind`/`returnDepartureAt`

#### `messages/is.json` + `messages/en.json`
- `statusGraent`: "Gott" → "Ferðaveður lítur vel út" (EN: "Trip weather looks fine")
- `statusGult`: "Meðgótt" → "Varúð" (EN: "Caution")
- `statusRautt`: "Slæmt" → "Ekki mælt með ferð" (EN: "Not recommended")
- `ferdalagid.departureLabel`: uppfært í "Hvenær ertu að spá í að leggja af stað? (valfrjálst)"
- `ferdalagid.returnLabel`: fjarlægt, skipt út fyrir `latestArrivalLabel`
- `ferdalagid.latestArrivalLabel`: "Hvenær viltu vera komin/nn á áfangastað í síðasta lagi? (valfrjálst)"

---

## Prófunarniðurstöður

```
npm run type-check  → clean (0 errors)
npm run test:run    → 51/51 test files, 1638 passed | 27 skipped | 8 todo
npm run build       → clean
```

---

## Localhost prófanir fyrir Stebbi

Eftir `npm run dev` á `/auth-mvp/vedrid`:

1. Veldu uppruna og áfangastað.
2. Staðfestu að lodging-þrep sé HORFIÐ — 4 þrep: uppruni, áfangastaður, tímar, eftirvagn.
3. Á tímaþrepi: sjáðu þrjá reiti — brottfarartími (valfrjálst), síðasti komusími (valfrjálst), heimkoma (valfrjálst).
4. Á eftirvagnaþrepi: "Skoða veður" takki frekar en "Áfram".
5. Smelltu á "Skoða veður" — biðaðu um veðurspá.
6. Athugaðu statusmerki: "Ferðaveður lítur vel út" / "Varúð" / "Ekki mælt með ferð".
7. Settu `latestArrivalBy` og staðfestu að best window birtist í `svar`.
8. Settu `latestHomeBy` og staðfestu að heimferðargreining birtist í `svar`.
9. Veldu hjólhýsi/karavan og sannreyndu vind-næmar skilaboð.
10. Staðfestu að gult/rautt niðurstaða útskýri orsök, tíma og staðsetningu.

---

## Eftir þessa virkni (framtíð)

- Lodging/stay greining (tent/caravan á áfangastað) — deferred
- Result card með structured best-window og return-advice UI (nú er `svar` texti)
- VedridClient status labels: ef þarf að koma aftur, þarf sérsniðnar labels
- `mapAlt` translation key (bætt við í fyrra pass, virkt)

---

## Supabase / production / billing

Engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.
