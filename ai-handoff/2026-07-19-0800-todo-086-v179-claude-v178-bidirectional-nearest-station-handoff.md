# 2026-07-19 08:10 - TODO 086 v179 - Claude: v178 bidirectional + nearest station - handoff

Created: 2026-07-19 08:10
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

Tvær breytingar gerðar ofan á v176:

**v178 (bidirectional):** Places og destinations endpoint skila nú öllum stöðum
sem koma fyrir í route-memory, hvort sem þeir eru `from` eða `to`. Lookup
endpoint reynir reverse lookup ef forward-lookup gefur miss. Picker sýnir nú
báðar borgir af einni leið strax í fyrsta skrefinu.

**v179 (nearest station):** Þegar notandi velur borg í fyrsta skrefinu,
opnast Veðurstofan stöðin sem er næst þeirri borg sjálfkrafa (detail card).
Jafnframt er "Innan marka" (grænar stöðvar) virkjað aftur ef það var falið.

---

## Hvað var gert

### Bidirectional — endpoints (v178)

**`app/api/teskeid/weather/route-memory/places/route.ts`** — Uppfært:
- Tvær parallel queries: `from_place_key` og `to_place_key`
- Union með dedup og alfabetískar röðun
- Svar: báðar borgir af `Reykjavík → Akureyri` leiðinni koma í listann

**`app/api/teskeid/weather/route-memory/destinations/route.ts`** — Uppfært:
- Tvær parallel queries: `from_place_key = key` og `to_place_key = key`
- Returns counterpart borgir úr báðum áttum, án tilvísunarboryarinnar sjálfrar
- Dæmi: velja `Akureyri` → `Reykjavík` kemur sem valkostur

**`lib/iceland-routes/routeMemory.server.ts`** — Bætt við:
```ts
export async function lookupRouteMemoryBidirectional(
  placeKeyA: string,
  placeKeyB: string,
): Promise<RouteMemoryLookupResult> {
  const forward = await lookupRouteMemory(placeKeyA, placeKeyB)
  if (forward.status === 'resolved') return forward
  return lookupRouteMemory(placeKeyB, placeKeyA)
}
```

**`app/api/teskeid/weather/route-memory/lookup/route.ts`** — Uppfært:
- Notar `lookupRouteMemoryBidirectional` í stað `lookupRouteMemory`
- Ef Akureyri → Reykjavík er valið og aðeins Reykjavík → Akureyri er geymt,
  finnst kortasett rétt

**`components/weather/RouteMemoryPicker.tsx`** — Uppfært:
- Notar nú `allPlaces` (union) í stað `fromPlaces`
- Fyrirsögn `titleLabel` sýnd í `<span className="text-xs font-medium">`
  bæði í loading, empty og normal stöðu
- `selectedFrom!` non-null assertion fjarlægð — `if (!selectedFrom) return` guard
- Kommentinn uppfærður til að lýsa bidirectional hegðun

### Nearest station + Innan marka — WeatherOverviewClient + Shell (v179 addendum)

**`components/weather/WeatherOverviewShell.tsx`** — Bætt við:
- `requestedSelection?: SelectedProviderMarker | null` í `WeatherOverviewShellProps`
- `useEffect` sem keyrir þegar `requestedKey` (`layerId:markerId`) breytist:
  ```ts
  useEffect(() => {
    if (!requestedSelection) return
    setSelectedProvider(requestedSelection)
    const selection = { provider: requestedSelection.layerId, stationId: requestedSelection.markerId }
    const next = overviewSelectionUrl(window.location.href, selection)
    router.replace(next, { scroll: false })
  }, [requestedKey])
  ```
  Gerist ekki þegar `null` — `null` þýðir "engin beiðni", ekki "afvalinn"

**`components/weather/WeatherOverviewClient.tsx`** — Bætt við:
- Import: `SelectedProviderMarker` frá `@/lib/weather/types`
- Import: `findNearestStations` frá `@/lib/weather/nearestStations`
- `nearestStationRequest` state: `SelectedProviderMarker | null`

Tveir nýir `useEffect`:

```ts
// Virkja "Innan marka" þegar from-place er valinn
useEffect(() => {
  if (!fromPlaceDraft) return
  setVisibleStatuses(prev => {
    if (prev.has('innan-marka')) return prev
    return new Set([...prev, 'innan-marka'])
  })
}, [fromPlaceDraft?.lat, fromPlaceDraft?.lon])

// Finna næstu stöð til valda from-place
useEffect(() => {
  if (!fromPlaceDraft || !data) {
    setNearestStationRequest(null)
    return
  }
  const nearest = findNearestStations(
    { lat: fromPlaceDraft.lat, lon: fromPlaceDraft.lon },
    data.stations.map(s => ({ stationId: s.stationId, name: s.stationName, lat: s.lat, lon: s.lon })),
    1,
  )
  if (nearest.length > 0) {
    setNearestStationRequest({ layerId: 'vedurstofan', markerId: nearest[0].stationId })
  }
}, [fromPlaceDraft?.lat, fromPlaceDraft?.lon, data])
```

- `requestedSelection={nearestStationRequest}` sent til WeatherOverviewShell

### Translation + UI (v178 + addendum)

**`messages/is.json` + `messages/en.json`:**
- `routeMemoryPickerTitle`: `"Skoða veðrið á ákveðinni leið"` / `"View weather on a specific route"`
- `routeMemoryPickerEmpty`: `"Engin leið í minni ennþá. Reiknaðu leið á Ferðalaginu til að sjá hana hér."` / `"No route in memory yet. Calculate a route in Ferðalagið to see it here."`
- `routeMemoryPickerLoading`: áður bætt við

---

## Test / type-check staða

```
npx tsc --noEmit        → exit 0
npx vitest run          → 3376 passed, 27 skipped, 8 todo (0 failed)
```

---

## Handvirkt prófunarplan fyrir Stebba

### Forsendur

- SQL86 keyrð, a.m.k. ein leið reiknuð: Reykjavík → Akureyri

---

### Próf 1 — Bidirectional pill-listi

1. Fara á `/vedrid`
2. **Búist við:** bæði `Reykjavík` og `Akureyri` birtast í pill-lista
   (ekki bara `Reykjavík` sem var `from` í ferðalaginu)

---

### Próf 2 — Reverse destinations

1. Smella á `Akureyri` (þótt leiðin sé geymd sem Reykjavík → Akureyri)
2. **Búist við:** `Reykjavík` birtist sem valkostur undir "Til"

---

### Próf 3 — Reverse lookup filterar kortið rétt

1. Smella á `Akureyri` → `Reykjavík`
2. **Búist við:** kortið filterar á sömu stöðvar og þegar `Reykjavík → Akureyri` er valið
3. **Engin 404 / miss** í Network tab

---

### Próf 4 — Nearest station opnast sjálfkrafa

1. Smella á `Reykjavík` (eða `Akureyri`) í pill-listanum
2. **Búist við:** detail card opnast sjálfkrafa fyrir Veðurstofan stöðina
   sem er líklegast næst valda borg (t.d. Reykjavíkurflugvöllur ef Reykjavík er valið)
3. Stöðin er sýnileg á kortinu (ekki falin af filter)

---

### Próf 5 — Innan marka virkjast aftur

1. Fara á `/vedrid` án þess að hafa valið leið
2. Smella á "Sýna allt" eða víxla þannig að "Innan marka" stöðvar séu faldar
3. Smella á `Reykjavík` í pill-listanum
4. **Búist við:** "Innan marka" (grænar) stöðvar eru nú sýnilegar aftur

---

### Próf 6 — Hreinsa leið afveldur næstu stöð

1. Smella á pill, nearest station opnast
2. Smella `Hreinsa leið ×`
3. **Búist við:** pill-listi kemur aftur, stöðvaval (URL param) má haldast
   en engin *ný* sjálfvirk opnun á sér stað

---

### Próf 7 — Fyrirsögn birtist

1. Opna `/vedrid`
2. **Búist við:** texti `Skoða veðrið á ákveðinni leið` er sýnilegur
   fyrir ofan pill-lista (hvort sem listi er tómur, í hlöðningu eða fullur)

---

### Próf 8 — Network: engin Google

1. Opna DevTools Network
2. Velja borgir í RouteMemoryPicker
3. **Búist við:** engin köll til `maps.googleapis.com` eða `places.googleapis.com`
4. Aðeins `/api/teskeid/weather/route-memory/places`,
   `/destinations?from=...`, `/lookup` route-memory köll

---

## Fyrir Codex — rýnimark

### A1 — requestedSelection override ef notandi hefur þegar valið stöð handvirkt

Ef notandi velur stöð á kortinu handvirkt og klikkir svo á aðra borg í
pill-listanum, mun `nearestStationRequest` breytast → `requestedSelection`
useEffect keyrir og skipti yfir á næstu stöð automatískt.

Þetta er æskilegt (notandinn velur nýja borg → við sýnum henni næstu stöð).
En ef notandinn vill sjá ákveðna stöð og klikkar tvisvar á sömu pill-borg
(til að "refresha"), mun engin breyting gerast (requestedKey breytist ekki).
Þetta er eðlilegt.

### A2 — `data` í `nearestStationRequest` useEffect er mutable reference

`data` í deps array er object reference. Ef Veðurstofan gögn eru endursótt
eða endurnýjuð (t.d. með polling), mun `nearestStationRequest` hugsanlega
vera endurreiknaður. Í v1 er `data` sótt eitt sinn á mount og breytist ekki —
þetta er því í lagi. Ef polling bætist við síðar þarf að gera þetta robust.

### A3 — lookupRouteMemoryBidirectional gerir 2 DB queries í worst case

Ef forward lookup er miss, er reverse lookup gert (2 × `lookupRouteMemory` ≈
2 × Supabase queries). Þetta er fínt í v1 — leiðir eru fáar og queries eru
einfaldar. Langtímalausn: single query með OR condition á from/to.

### A4 — "Innan marka" virkjast þótt filteran hafi verið vísvitandi falið

Ef notandinn hefur falin "Innan marka" stöðvar og velur svo borg,
virkjast þær aftur. Þetta er óvart. Mögulegt framhald: virkja bara ef
visibleStatuses er í defaultstöðu (ekki breytt af notanda).
Í v1 er þetta ásæmilegt — markmiðið er að nearest station sé sýnilegt.

### A5 — OverviewRouteLensPanel.tsx er enn á disk (ónotað)

`components/weather/OverviewRouteLensPanel.tsx` er ekki importað neins staðar.
Má eyða þegar RouteMemoryPicker hefur verið staðfest í production.

---

## Skrár sem breyttust (frá v176)

| Skrá | Tegund |
|---|---|
| `app/api/teskeid/weather/route-memory/places/route.ts` | Uppfært (bidirectional) |
| `app/api/teskeid/weather/route-memory/destinations/route.ts` | Uppfært (bidirectional) |
| `lib/iceland-routes/routeMemory.server.ts` | Bætt við `lookupRouteMemoryBidirectional` |
| `app/api/teskeid/weather/route-memory/lookup/route.ts` | Notar bidirectional lookup |
| `components/weather/RouteMemoryPicker.tsx` | Bidirectional + titleLabel + empty fix + non-null assertion |
| `components/weather/WeatherOverviewShell.tsx` | `requestedSelection` prop + useEffect |
| `components/weather/WeatherOverviewClient.tsx` | nearest station state + effects |
| `messages/is.json` | `routeMemoryPickerTitle`, `routeMemoryPickerEmpty` |
| `messages/en.json` | `routeMemoryPickerTitle`, `routeMemoryPickerEmpty` |

---

## Eftirstandandi atriði

- **A5** — eyða `OverviewRouteLensPanel.tsx` eftir localhost staðfestingu
- **A6 frá v176** — mock tests fyrir `/places`, `/destinations` endpoints
- **A4** — fínstilla Innan marka virkjun ef notandi hefur vísvitandi falið það
- **C.3-4** — vista þröskulda sem sjálfgefin (þarf sql/82)
