# Handoff: TODO #75 v039 - Claude hviðuhreinsun stöðvuð mid-execution

Created: 2026-07-09 23:20
Timezone: Atlantic/Reykjavik
Status: Stöðvuð mid-execution — Stebbi óskar eftir endurskoðun áður en haldið er áfram

---

## Hvað gerðist

Claude Code framkvæmdi fulla hviðuhreinsun samkvæmt v035-v038 handoff. Stebbi stöðvaði verkið mid-execution með nýrri ákvörðun:

> "Við ætlum ekki að fjarlægja allt hviðutengt í bili. MET/Yr gögnin virðast innihalda `wind_speed_of_gust`, en við viljum ekki treysta þeim of sterkt í UX/ákvörðun fyrr en við skiljum betur gæði og forecast horizon."

Ekkert er committað. Allar breytingar eru uncommitted local changes.

---

## Git staða

Branch: `main`

Þær skrár sem hafa breytingar (`git diff --name-only`):

```
app/auth-mvp/vedrid/FerdalagidClient.tsx
components/weather/DepartureHeatmap.tsx
components/weather/TravelAuditMap.tsx
components/weather/travelAuditMap.helpers.ts
components/weather/ForecastDrawer.tsx       ← breytt í þessari lotu
lib/weather/forecast.ts                     ← breytt í þessari lotu
lib/weather/thresholds.ts                   ← breytt í þessari lotu
lib/weather/tools.ts                        ← breytt í þessari lotu
lib/weather/travel.ts                       ← breytt í þessari lotu
lib/weather/types.ts                        ← breytt í þessari lotu
lib/weather/route.ts (API route)            ← breytt í þessari lotu
messages/en.json                            ← breytt í þessari lotu
messages/is.json                            ← breytt í þessari lotu
lib/__tests__/weather-travel.test.ts        ← hluta breytt í þessari lotu
lib/__tests__/weather-forecast.test.ts      ← hluta breytt, stöðvuð
```

Þessar test skrár eru ÓBREYTTAR og hafa TypeScript villur:
```
lib/__tests__/travelAuditMap.helpers.test.ts  ← ekki snert
lib/__tests__/weather-tools.test.ts           ← ekki snert
```

---

## Hvað er inni í breytingunum

### Core logic (lib/weather/)

**`types.ts`:** Fjarlægt:
- `windGustMs` úr `HourPoint`
- `maxGustMs` úr `GolfWindow`
- `worstGustMs` og `'gust'` úr `summaryForWindow.decisiveMetric`
- `gustMs` úr `nextForecast`, `CandidateDisplayPoint`, `CandidateArrivalWeather`
- `GustSeverity` type
- `ForecastDrawerGustCell` type og `gust` field úr `ForecastDrawerRow`
- `gustMs` og `'gust'` úr `PointSummary` og `CandidateDisplayPoint`
- `worstGust` úr `TravelCandidate`
- `'gust'` úr `TravelIssue.metric`
- `redGustMs` úr `TravelThresholdOverrides` og `ResolvedTravelThresholds`

**`forecast.ts`:** Fjarlægt `wind_speed_of_gust` parsing og `windGustMs: d.wind_speed_of_gust ?? d.wind_speed ?? 0` úr HourPoint return. **Fallback er horfið.**

**`thresholds.ts`:** Fjarlægt `redGustMs` úr öllum presets (driving, heavyTrailer, caravan), úr `resolveThresholds` return og `'gust'` branch úr `deriveThreshold`.

**`travel.ts`:** Fjarlægt gust úr `evalDrivingLeg`, `evaluateCandidate`, `candidateSeverity`, `worstCandidateOf`, `buildHighlightedIssue`, `buildRouteWeatherPoints`, `buildForecastRows`, `enrichWithArrivalWeather`. `deriveGustSeverity` export fjarlægt.

**`tools.ts`:** Fjarlægt `maxGustMs` úr Slot og GolfWindow, `worstGustMs` úr checkRouteWeather, gust úr red condition, `redGustMs` úr caravan destructure, hviður úr grill facts.

### API

**`app/api/teskeid/weather/travel/route.ts`:** `redGustMs` er ekki lengur validated, silently discarded. Legacy clients fá ekki 400.

### UI

**`FerdalagidClient.tsx`:** Fjarlægt gust threshold input, gust comparison rows (inline og drawer), gust úr nav threshold summary, `draftRedGust` state.

**`ForecastDrawer.tsx`:** Fjarlægt gust subline úr wind column.

**`DepartureHeatmap.tsx`, `TravelAuditMap.tsx`, `travelAuditMap.helpers.ts`:** Fjarlægt öll gust references.

### Messages

**`messages/is.json`:** Uppfært:
- `resultLoadingStepWeather`: "Ber saman vind og úrkomu"
- `betaBannerBody`: hviður fjarlægt
- `howAssessedShort`: hviður fjarlægt
- `thresholdsCustom`: "vindur {caution}/{red} m/s, úrkoma {precip} mm/klst"
- `thresholdSummaryLine`: "Veðurmörk: vindur {caution}/{red} m/s · úrkoma {precip} mm/klst"
- `stepNavThresholdSummaryAria`: "Veðurmörk: vindur {caution}/{red} m/s, úrkoma {precip} mm/klst"
- `weatherDisclaimer`: **NÝTT** "Athugaðu sérstaklega hviður og færð á <link>vef Vegagerðarinnar</link>. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga."
- Fjarlægt: `metricGust`, `forecastGustAbbr`, `forecastGustNearLimit`, `forecastGustOverLimit`, `thresholdRedGust`

**`messages/en.json`:** Sama pattern.

### Tests

**`weather-travel.test.ts`:** Hluta uppfært - `makeHour`/`makeForecast` signatures breytt, gust-specific tests fjarlægt, gust assertions fjarlægt. **TypeScript villur eru horfnar** úr þessari skrá.

**`weather-forecast.test.ts`:** Hluta breytt - `windGustMs` assertion fjarlægt, gust fallback test fjarlægt. Stöðvuð mid-edit, en líklega kleið.

---

## Hvað er eftir (ef halda á áfram)

Til að ljúka fullri hreinsun:

1. `lib/__tests__/weather-forecast.test.ts` - yfirfara, líklega klár
2. `lib/__tests__/travelAuditMap.helpers.test.ts` - fjarlægja `worstGustMs`, `gustMs`, `worstGust`, `redGustMs` references
3. `lib/__tests__/weather-tools.test.ts` - fjarlægja `windGustMs` úr `makeHour` og annarstaðar
4. `npm run type-check && npm run test:run && npm run build`

---

## Hvað er ekki inni (sem Stebbi nefndi)

### Disclaimer í "Á leiðinni" box
`weatherDisclaimer` lykillinn **er uppfærður** í messages með nýja textanum. En hvort þessi texti birtist í "Á leiðinni" box vs. annars staðar fer eftir því hvar `FerdalagidClient.tsx` notar hann. Textinn var áður tengdur `<link>` sem fór á Vegagerðina (`umferdin.is`). Hann er enn notaður með `tf.rich()` þar sem `<link>` er render-að sem anchor tag til `https://umferdin.is/`.

**Ef Stebbi vill sjá þennan disclaimer í "Á leiðinni" boxinu sérstaklega** - þarf að sannreyna í localhost að hann birtist þar. Þetta var hluti af upprunalegri v037 kröfu.

### `wind_speed_of_gust ?? wind_speed` fallback
**Fallbackið er horfið.** `forecast.ts` les ekki `wind_speed_of_gust` lengur. Ef Stebbi vill halda parsing-inu inni en bara merkja það sem "óviss" eða "limited" - þarf að gera sér TODO og endurinnleiða með varúðarmerki.

---

## Mögulegar leiðir framhaldið

### Leið A: Halda öllum breytingunum og klára
Ljúka við test files, keyra type-check + build + commit.
- Kosti: Fullkomin hreinsun, engin villandi gust UI
- Gallar: Stór breyting, `wind_speed_of_gust` parsing horfin alveg

### Leið B: Bakka út og gera minni breytingu
`git checkout` á öllum skrám og gera aðeins:
1. Uppfæra `weatherDisclaimer` texta í messages
2. Fjarlægja gust úr UI-display (ForecastDrawer, comparison strip)
3. Halda gust í types/logic sem ónotaðar/deprecated fields
- Kosti: Minni áhætta, auðveldara að bakka
- Gallar: Gust er enn í types og logic (þó ekki í UI)

### Leið C: Sameina - halda disclaimer, bakka core logic
`git checkout lib/weather/` en halda messages og UI breytingunum.
- Kosti: Disclaimer er inni, UI-birting er hreinsað, core logic (types, thresholds, travel) er óbreytt
- Gallar: Ósamræmi milli UI og logic, meiri tæknileg skuld

### Leið D: TODO-only
Bakka út allt nema `weatherDisclaimer` textabreytingu og skrifa TODO um:
- Að hætta að fallback-a `wind_speed_of_gust ?? wind_speed`
- Að merkja hviðugögn sem óviss/limited ef þau verða notuð síðar
- Kosti: Öruggt, engin hætta
- Gallar: Gust er enn villandi í UI þar til TODO er leyst

---

## Ráðlegging

Ef gæðavandinn er að `wind_speed_of_gust` er til staðar en óáreiðanlegur, þá er **Leið A** (halda öllum breytingunum) ennþá rétt - við erum að fjarlægja hlutverk sem við höfum ekki trú á. Leið B eða C eru hlutabúnar lausnir.

En þetta er Stebbi og Codex til að ákveða.
