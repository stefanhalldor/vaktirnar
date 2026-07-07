# todo-067 v097 - Claude Code Phase A: Route timeline audit map plan

Created: 2026-07-06 20:15
Timezone: Atlantic/Reykjavik
Implements Phase A of: `2026-07-06-1958-todo-067-v096-codex-v095-route-timeline-map-handoff`
Author: Claude Code

## 1. Er route timeline first rétt?

**Já, samþykkt.** Route timeline kemur á undan Iceland-wide map.

Rökin eru sterk:
- Timeline + map er þegar að mestu til staðar — heildaruppbygging þarf ekki að skrifa frá grunni.
- Iceland-wide map þarf sama evaluation primitives sem route timeline þarf að sanna fyrst.
- Uncommitted v089-v094 breytingar þurfa að komast í git áður en ný milestone byrjar (sjá kafla 7).

---

## 2. Hvað styður timeline með núverandi gögnum

### Tímaskilríki (candidates)

`travelPlan.outbound.candidates[]` og `travelPlan.return.candidates[]` eru **þegar í payload** til clients.

Hver `TravelCandidate` inniheldur:
- `departureIso` / `arrivalIso` — tími
- `status: 'graent' | 'gult' | 'rautt'`
- `reasonCode`
- `worstWind`, `worstGust`, `worstPrecip`: `WorstMetric` með `lat`, `lon`, `timeIso`, `distanceFromOriginM`, `forecastLat/Lon`, `metnoUrl`, `yrnoUrl`

**Þetta er nóg fyrir heatmap/timeline strip og "worst point per slot" highlight.**

### Route geometry + weather points

`travelPlan.route.auditPolylinePoints[]` — sampled polyline (max 80 punktar) er í payload.

`travelPlan.routeWeatherPoints[]` — 15 veðurpunktar með `lat`, `lon`, `forecastLat/Lon`, `distanceFromOriginM`, `routeFraction`, `isHighlightedIssue`, `summaryForWindow`, `metnoUrl`, `yrnoUrl`, `googleMapsUrl`.

**Þetta er nóg til að teikna alla punkta á kortið.**

### Núverandi TravelAuditMap — er þegar interactive

`TravelAuditMap` notar Google Maps JavaScript API (ekki static image). Kortið er þegar interactive, sýnir polyline, weather points, selected point + `PointDetailsPanel`.

**Þetta þýðir að "interactive route map" er þegar til staðar.**

### Heatmap — er þegar time scrubber

`DepartureHeatmap` sýnir þegar:
- Litaðar takkabólur per slot (graent/gult/rautt)
- Dagaskiltir (v091/v094)
- Valinn slot highlightar punkt á korti (v089 sync effect í TravelAuditMap)
- Útleiðar- og heimleiðar-heatmapar sérstaklega (v091)

**Heatmap er þegar "time scrubber" í þeim skilningi sem v096 lýsir.**

### Next caution

`travelPlan.outbound.nextCaution` er þegar reiknað (single-departure mode, þegar outbound er græn). Inniheldur `departureIso`, `arrivalIso`, `status`, `reasonCode`, `issue: TravelIssue`.

**"Næsta varasama brottför" lína er þegar gagnastudd.**

---

## 3. Hvað vantar (gagnaskipan og UI)

### Gap A — Per-point status per selected slot

**Þetta er stærsta gapið.**

Þegar notandinn velur slot í heatmap, `candidateToIssue()` gefur okkur **worst point** fyrir þann slot. Við getum highlighted þann punkt á kortinu.

En v096 vill: "recolor **all** route weather points for that selected time." Þ.e. veðurpunktar sem eru góðir í þeim slot → grænt; aðrir → gult/rautt.

**Þetta er ekki í payload.** `summaryForWindow` í `routeWeatherPoints[]` er fast (einn candidate = summaryCandidate). Engin per-candidate, per-point status.

**Þrjár leiðir:**

| Leið | Lýsing | Kostnaður | MVP? |
|------|---------|-----------|------|
| A) MVP: default grár, worst highlight | Sýna alla punkta sem gráa/hlutlæga markers; highlighted punkt er worst í valinn slot. Engin payload breyting. | Enginn | Já |
| B) Per-candidate per-point compact array | BFF skilar `pointStatusesByCandidate[candidateIdx][pointIdx] = status`. 48 × 15 = 720 gildi. ~few KB extra. | Miðlungs | Seinna |
| C) Client-side recompute | Senda `pointForecasts.hours` til client. Þá getur client reiknað sjálfur. 15 × ~60h × 6 gildi = ~5400 tölur, ~100KB raw. | Mikill | Nei |

**Tillaga: byrja með leið A (MVP)**. Notandinn sér worst point highlighted og `PointDetailsPanel` með nákvæmar upplýsingar. Það er nóg til að svara "hvar á leiðinni verður það varasamt og hvenær." Leið B kemur í Phase C+ ef Stebbi vill.

### Gap B — "Næsta varasama brottför" UI

`nextCaution` er í payload en ekki birt í UI. Þarf að bæta við textalínu undir eða yfir heatmap.

**Þetta er lítið gap — data er til, UI línan vantar.**

### Gap C — Arrival time í heatmap SlotDetail

SlotDetail sýnir `heatmapSlotArrival: kl. {formatKlTime(candidate.arrivalIso)}` en `arrivalIso` er í kandidatanum. Þetta er þegar til. Ekkert gap.

### Gap D — Gust conditional í RouteWeatherPoint

`summaryForWindow.worstGustMs` vs `worstWindMs` — `FerdalagidClient` sýnir þegar gust aðeins þegar `worstGustMs > worstWindMs` (v091). Ekkert gap.

### Gap E — Fallback ef Google Maps key vantar

`TravelAuditMap` hefur þegar fallback til `RoutePointRow` lista ef kart er ekki til (`auditMapUrl`/`auditPolylinePoints` null). En ef Google Maps JS API key vantar í interactive map, þarf að skoða hvort fallback virki. **Þetta þarf að staðfesta í Phase C QA.**

---

## 4. Tillaga að skráarstigsskipulagi

### Phase B — Shared evaluation helper (ef þörf er)

Ef við viljum leið B (per-point per-slot), þarf `evaluateCandidatePerPoint()` helper í `lib/weather/travel.ts`:

```typescript
// Útfærsla: gefa til baka per-point summary fyrir eitthvert tiltekið departure
export function evaluateCandidatePerPoint(
  departureIso: string,
  arrivalIso: string,
  pointForecasts: TravelPointForecast[],
  trailerKind: 'none' | TrailerKind,
  totalDistanceM: number,
  leg: 'outbound' | 'return',
): Array<{ routeIndex: number; status: WeatherStatus; decisiveMetric?: string; value?: number }> { ... }
```

Þetta breytir ekki núverandi API, bara bætir við nýrri útfærslu.

Fyrir MVP (leið A): **engin breyting á `travel.ts` þörf**.

### Phase C — TravelAuditMap viðbætur

**`components/weather/TravelAuditMap.tsx`** — eina skráin sem þarf breytingar:

- Taka `selectedCandidatePointStatuses?: Array<{routeIndex: number; status: WeatherStatus}>` prop (til framtíðar — leið B)
- Fyrir MVP (leið A): engin ný prop þörf — `highlightedIssue` er þegar notað

### Phase C — FerdalagidClient viðbætur

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`:**

1. **"Næsta varasama brottför" lína:**
   ```tsx
   {result.travelPlan?.outbound.nextCaution?.departureIso && (
     <p className="text-xs text-muted-foreground">
       {tf('nextCautionLine', {
         time: formatKlTime(result.travelPlan.outbound.nextCaution.departureIso),
         ...
       })}
     </p>
   )}
   ```

2. **"Engin varasöm brottför" lína:**
   ```tsx
   {result.travelPlan?.outbound.nextCaution?.scannedHours > 0 &&
    !result.travelPlan.outbound.nextCaution.departureIso && (
     <p>{tf('nextCautionNone', { hours: nextCaution.scannedHours })}</p>
   )}
   ```

3. **i18n lyklar** í `messages/is.json` og `messages/en.json`.

### Phase C — DepartureHeatmap

Núverandi DepartureHeatmap er í grundvallaratriðum fullbúinn sem time scrubber. Mögulegar viðbætur:

- `aria-live` á SlotDetail þannig að screen readers fái uppfærslu við slot-skipti — accessibility gain, lítið scope.

### Phase D — RouteSelectionStep / staðarval

`app/auth-mvp/vedrid/RouteSelectionStep.tsx` (eða sambærileg skrá) — Phase D, ekki Phase C. **Snertir ekki sömu skrár og route timeline.**

---

## 5. Próf sem þarf að bæta við / uppfæra

```
lib/__tests__/weather-travel.test.ts
```

### Ný próf:

1. **`nextCaution` birtast í payload þegar outbound er grænt og single-departure mode** (er þegar reiknað, en hefur það verið prófað?).
2. **`nextCaution` er `undefined` þegar windowMode = true** (by design, single-departure only).
3. **`nextCaution.departureIso` er `undefined` þegar allt er grænt í 48h** — `scannedHours` fyllt.
4. **Per-candidate `worstWind.lat`/`lon` stemma við route point** — regression test á candidate → map point link.

### Próf sem eru þegar til (v089):

- Trailer-aware gust threshold decisiveness (4 tests).
- Green slot fallback (þarf að staðfesta að þetta sé prófað í `weather-tools.test.ts` eða `guard.test.ts`).

---

## 6. Localhost checks fyrir Stebbi

### Phase A (planning only)

1. Engar UI breytingar búist við í Phase A.
2. `/auth-mvp/vedrid` á að hleypa í gegnum eins og áður.
3. Þarf EKKI að endurræsa dev server.

### Phase C (þegar framkvæmdarleyfi er gefið)

1. Opna `/auth-mvp/vedrid`.
2. Velja leið: **Reykjavík → Selfoss** eða **Garðabær → Akranes** (nógu löng leið með merkjanlegri fjarlægð).
3. Setja `latestArrivalBy` til að fá window mode og margar candidates.
4. Staðfesta að kortið sé interactive (zoom, drag), ekki static image.
5. Scroll heatmap og staðfesta að dag/dagsetning sé sýnilegt á meðan er scrollað.
6. Smella á rauðan/gulan slot → kort flytur yfir á versta veðurpunktinn á þessum slot.
7. Smella á grænan slot → kort fer á sjálfgefna highlighted issue punkt (EKKI á fyrri rauðan).
8. Staðfesta SlotDetail: vindur/hviður/úrkoma/þröskuldur, fjarlægð frá réttum stað (útleið frá uppruna, heimferð frá áfangastað).
9. Setja **engan** `latestArrivalBy` (single-departure mode), fá græna útleið:
   - Búist við: textalína "Næsta varasama brottför: ..." ef `nextCaution` finnst.
   - Búist við: textalína "Engin varasöm brottför i næstu XX klukkustundum" ef engin caution.
10. Setja `latestHomeBy` → staðfesta að heimleiðar-heatmap sé sér frá útleiðar-heatmap.
11. Prófa á 360px, 390px, 430px mobile width — engin horizontal overflow.
12. Prófa á ensku locale — engin `kl.` (harf) í heatmap SlotDetail.
13. Ganga úr skugga um fallback: ef Google Maps API key vantar/fail → einhver nothæf non-blank útskýring kemur fram.

---

## 7. Ástæður til að bíða með Phase B+

### Uncommitted v089-v094 breytingar

Allar breytingar frá þessari lotu eru enn unstaged/uncommitted:
- `components/weather/TravelAuditMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/place/reverse-geocode/route.ts`
- `lib/__tests__/weather-travel.test.ts` (trailer-aware gust tests)
- `messages/is.json`, `messages/en.json`

**Sterk mæling:** Commit + push v089-v094 áður en Phase B/C kóðabreytingar hefjast, til að:
- Vera með hreint baseline ef eitthvað fer úrskeiðis.
- Forðast merge conflicts á sömu skrám (FerdalagidClient, DepartureHeatmap eru bæði í scope beggja lotna).
- Geta séð skýrar diffs í Phase C review.

Phase A (planning/rannsókn, engin kóðabreyting) getur farið fram samhliða.

---

## 8. Samantekt: hvað þarf Codex review?

| Spurning | Svar |
|----------|------|
| Route timeline first? | Já, samþykkt |
| Þarf nýjar met.no calls? | Nei — timeline notar þegar fetchaðar candidates |
| Er interactive map þegar til? | Já — TravelAuditMap er þegar interactive |
| Er heatmap þegar time scrubber? | Já — DepartureHeatmap sér þegar um þetta |
| Er "color all points per time" studd? | Nei — þarf payload extension (Phase C+) |
| MVP án payload extension? | Já — worst point per slot er nóg til að byrja |
| Er nextCaution í payload? | Já — þarf bara UI línu í FerdalagidClient |
| Þarf commit fyrst? | Já — strongly recommended |

**Næstu skref sem þarf Codex samþykki á:**

1. Er leið A (MVP: worst point only, no per-point coloring) acceptable fyrir Phase C?
2. Er "næsta varasama brottför" lína nægilegt fyrir Phase C scope, eða á full per-point coloring (leið B) einnig inn?
3. Samþykki á Phase B/C kóðaframkvæmd (aðskilið framkvæmdarleyfi frá Stebbi).

## Engar breytingar gerðar á kóða
