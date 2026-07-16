# Rýni: TODO #75 v036 - Gust removal review (v035)

Created: 2026-07-09 21:57
Timezone: Atlantic/Reykjavik
Rýnir á: `2026-07-09-2153-todo-075-v035-codex-remove-gusts-data-correction.md`

---

## Heildarmat

Planið er rétt og þetta á að gera. Ef gögnin innihalda ekki raunveruleg hviðsgögn er að villa á notandann að birta hviðsviðvaranir. Þetta er nákvæmni- og trúverðugileikamál í veðurtæki.

Handoffið er vel skrifað og finnur flest. Tvær leiðréttingar og ein áhætta til að kynna til sögunnar áður en Codex hefur framkvæmd.

---

## Atriði 1 -- Mikilvægt: Full cleanup í einum skrefi, ekki tveim

Handoffið leggur til Phase 1 (fjarlægja úr UI) og Phase 2 (hreinsa týpur). **Mælt er með að sameina þetta í einn pass.**

Ástæða: `ForecastDrawerRow.gust` er *required* (ekki optional) í types.ts:

```ts
export type ForecastDrawerRow = {
  timeIso: string
  status: WeatherStatus | 'no_data'
  temperature: ForecastDrawerMetricCell
  wind: ForecastDrawerMetricCell
  gust: ForecastDrawerGustCell     // ← required
  precipitation: ForecastDrawerMetricCell
}
```

Ef gust er fjarlægt úr UI en haldið í týpum verður TypeScript hljóður og gefur til kynna að allt sé í lagi. En kóðinn mun þá halda áfram að reikna gust, geyma það í JSON svari og senda til clients sem nota það aldrei. Þetta er villandi.

Ef gust er fjarlægt úr týpum mun TypeScript sýna nákvæmlega hvaða skrár þurfa uppfærslu. TypeScript er leiðarvísirinn -- nota hann.

**Tillaga:** Hefja med að breyta `HourPoint` (fjarlægja `windGustMs`) og `ResolvedTravelThresholds` (fjarlægja `redGustMs`). TypeScript mun þá sýna allar keðjuvillur og Codex getur unnið í gegnum þær eina í einu.

---

## Atriði 2 -- `facts[]` í travel.ts innihalda líka gust

Handoffið nefnir þetta ekki sérstaklega. Í `checkTravelWeather` (travel.ts, línur 839-846):

```ts
const oGust = outboundWorst.worstGust && outboundWorst.worstGust.value > outboundWorst.worstWind.value
  ? ` (hviður: ${outboundWorst.worstGust.value.toFixed(1)} m/s)` : ''
facts.push(`Mesti vindur á útleið: ${outboundWorst.worstWind.value.toFixed(1)} m/s${oGust}, ...`)
```

Sama mynstur á heimleið. Þetta þarf að fjarlægja (eða einfalda án `oGust`). Þetta er hluti af `travel.ts` -- ekki sér skrá.

---

## Atriði 3 -- `nextForecast.gustMs` í types.ts

`RouteWeatherPoint.summaryForWindow.nextForecast` hefur `gustMs` sem required field:

```ts
nextForecast?: {
  timeIso: string
  status: WeatherStatus
  trend: 'better' | 'worse' | 'same'
  windMs: number
  gustMs: number       // ← required, þarf að fara
  precipMmPerHour: number
}
```

Handoffið nefnir `summaryForWindow.worstGustMs` en gleymist að nefna `nextForecast.gustMs`. Codex þarf að fjarlægja bæði.

---

## Atriði 4 -- API route: ignore `redGustMs` án þess að rejecta

Handoffið leggur til að API `app/api/teskeid/weather/travel/route.ts` ignori `redGustMs`. Þetta er rétt -- má **ekki** rejecta gamlar beiðnir sem senda þennan reit, þar sem það gæti brotið eldri clients.

Best að fjarlægja `redGustMs` úr validation schema en leyfa það sem unknown/ignored field (eða nota `.passthrough()` ef Zod er notað).

---

## Atriði 5 -- `lib/weather/tools.ts` ætti að vera utan scope

Handoffið nefnir golf windows og `maxGustMs` í tools.ts. Þetta snertir aðra virkni (golf, ekki ferðaveður). Mælt er með að fara EKKI inni í tools.ts í þessum pass -- búa frekar til sérstakt TODO og nefna það skýrt í handoff. Þetta kemur í veg fyrir scope creep og of stóra PR.

Þetta er EKKI blocking -- þetta er bara framkvæmdartillaga.

---

## Atriði 6 -- Uncommitted changes í weather skrám

Samkvæmt git stöðu í upphafi þessa session eru þessar skrár með ócommittaðar breytingar:

```
M  app/auth-mvp/vedrid/FerdalagidClient.tsx
 M components/weather/DepartureHeatmap.tsx
 M components/weather/TravelAuditMap.tsx
 M components/weather/travelAuditMap.helpers.ts
 M lib/__tests__/weather-travel.test.ts
 M lib/weather/travel.ts
 M lib/weather/types.ts
 M messages/en.json
 M messages/is.json
```

Þessar breytingar eru frá v033/v034 weather comparison work (hiti/vindur/hviður/úrkoma röðun) og eru **ekki enn commitaðar** (eða eru hluti af þessum session). Codex þarf að vera meðvitaður um þetta.

**Tillaga:** Codex ætti að gera `git diff` fyrst til að skilja hvað er þegar til staðar í skránum áður en hviðsframkvæmd hefst. Annars gæti Codex skriðið yfir breytingar sem þegar eru gerðar.

---

## Atriði 7 -- Taktu út gust-samanburð úr comparison strip

Handoffið nefnir þetta en er ekki nákvæmt um `FerdalagidClient.tsx`. Í comparison strip/drawer eru þrír límar í dag: Hiti, Vindur, Hviður, Úrkoma. Hviðurinn á að hverfa. Þetta mun breyta fjölda raða.

Þarf að ganga úr skugga um að fjarlæging hviðs ráðar skilji ekki eftir tóm pláss eða skekkt grid layout.

---

## Samantekt á blocking vs. non-blocking

| # | Atriði | Blocking? |
|---|--------|-----------|
| 1 | Sameina Phase 1 og Phase 2 -- full cleanup í einum skrefi | Já (mælt með) |
| 2 | `facts[]` í travel.ts innihalda gust | Já (þarf að laga) |
| 3 | `nextForecast.gustMs` vantar í handoff | Já (þarf að laga) |
| 4 | API ignore `redGustMs` án reject | Já (þarf að passa) |
| 5 | tools.ts utan scope | Nei (framkvæmdartillaga) |
| 6 | Skoða git diff áður en framkvæmd hefst | Já (áhætta) |
| 7 | Comparison strip layout eftir fjarlægingu | Já (þarf að sannreyna) |

---

## Framkvæmdarröð sem Claude Code mælist til

1. `git diff` á öllum 8 ócommittuðum skrám til að skilja núverandi stöðu.
2. Byrja í `lib/weather/types.ts` -- fjarlægja `windGustMs` úr `HourPoint`, `redGustMs` úr `ResolvedTravelThresholds` og `TravelThresholdOverrides`, `GustSeverity`, `ForecastDrawerGustCell`, `gust` úr `ForecastDrawerRow`, `gustMs` úr `CandidateDisplayPoint` og `CandidateArrivalWeather`, `worstGustMs` og `nextForecast.gustMs` úr `RouteWeatherPoint`, `worstGust` úr `TravelCandidate`, `'gust'` úr `TravelIssue.metric` og `decisiveMetric`.
3. Leyfa TypeScript að sýna allar keðjuvillur og vinna í gegnum þær skrá í skrá.
4. `lib/weather/travel.ts` -- fjarlægja gust úr `evalDrivingLeg`, `buildHighlightedIssue`, `candidateSeverity`, `buildRouteWeatherPoints`, `deriveGustSeverity`, `buildForecastRows`, `facts[]`.
5. `lib/weather/thresholds.ts` -- fjarlægja `redGustMs` úr presets og `resolveThresholds`.
6. `app/api/teskeid/weather/travel/route.ts` -- fjarlægja `redGustMs` úr validation (eða gera optional/ignored).
7. `app/auth-mvp/vedrid/FerdalagidClient.tsx` -- fjarlægja gust input, gust threshold summary, gust í comparison strip.
8. `components/weather/ForecastDrawer.tsx` -- fjarlægja gust column/subline.
9. `components/weather/DepartureHeatmap.tsx`, `TravelAuditMap.tsx`, `travelAuditMap.helpers.ts` -- fjarlægja gust references.
10. `messages/is.json` og `messages/en.json` -- uppfæra copy, fjarlægja gust keys.
11. Tests -- uppfæra/fjarlægja gust-related tests.
12. `npm run type-check && npm run test:run && npm run build`

---

## Ekki hluti af þessum pass

- `lib/weather/tools.ts` (golf, caravan gust) -- sérstakt TODO.
- SQL, Supabase, RLS, auth, secrets, deploy.
- Commit eða push -- það samþykkir Stebbi sérstaklega.

---

## Óvissa / þarf að staðfesta

- **Óvissa:** Stada ócommittaðra breytinga í weather skrám (v033/v034 vs. þessi session). `git diff` er nauðsynlegur áður en framkvæmd.
- **Óvissa:** Hvort `ForecastDrawer.tsx` er þegar uppfærður (var ekki á lista ócommittaðra skrána) eða hvort það er algjörlega ósnert.
- **Staðfest:** `windGustMs` er sett sem `d.wind_speed_of_gust ?? d.wind_speed ?? 0` í `lib/weather/forecast.ts` (samkvæmt handoff) -- þannig að kóðinn les reitinn ef hann kemur en fall back-ar á wind. Þetta staðfestir nákvæmlega þá staðhæfingu handoffsins að gögnin innihaldi ekki gust.
