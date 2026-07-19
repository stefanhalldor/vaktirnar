# 2026-07-19 08:00 - TODO 086 v176 - Claude: RouteMemoryPicker - handoff og prófunarplan

Created: 2026-07-19 08:00
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

Map-picker er tilbúinn. Google PlaceSearch-input á `/vedrid` er skipt út fyrir
RouteMemoryPicker sem sýnir pill-lista af borgunum sem eru þegar í route-memory grunni.
Tvö ný API endpoint, ein ný component, ein canonical coords skrá. Log-safety villa
í travel route leiðrétt. Allt grænir.

---

## Hvað var gert

### 1. `lib/iceland-routes/routePlaces.ts` (ný skrá)

Canonical coordinates (lat/lon) fyrir allar 25 íslenskar borgir sem eru í
`routePlaceNormalization.ts`. Notað til að búa til `RouteDraftPlace` hluti
þegar notandi velur borg úr RouteMemoryPicker — engin Google-kall þörf.

```ts
export type CanonicalPlace = { key: string; label: string; lat: number; lon: number }
export function getCanonicalPlace(key: string): CanonicalPlace | undefined
```

### 2. `app/api/teskeid/weather/route-memory/places/route.ts` (nýr endpoint)

`GET /api/teskeid/weather/route-memory/places`

Skilar distinct `from_place_key` / `from_place_label` úr `weather_route_memory_routes`.
Enginn auth — borgarnöfn eru ekki viðkvæm. Bætt við `EXACT_PUBLIC_PATHS`.

Svar: `{ places: Array<{ key: string; label: string }> }`

### 3. `app/api/teskeid/weather/route-memory/destinations/route.ts` (nýr endpoint)

`GET /api/teskeid/weather/route-memory/destinations?from={fromPlaceKey}`

Skilar distinct `to_place_key` / `to_place_label` þar sem `from_place_key = ?from`.
Enginn auth. Bætt við `EXACT_PUBLIC_PATHS`.

Svar: `{ destinations: Array<{ key: string; label: string }> }`

### 4. `components/weather/RouteMemoryPicker.tsx` (ný component)

Tvíþrepa pill-picker sem kemur í stað `OverviewRouteLensPanel` / `PlaceSearch`.

Flow:
1. Sækir `/route-memory/places` á mount
2. Sýnir "Frá" pill-lista yfir borgir sem eru í minni
3. Notandi velur borg → sækir `/route-memory/destinations?from=...`
4. Sýnir "Til" pill-lista
5. Notandi velur → kallar `onPlacesChange(from, to)` með `RouteDraftPlace` hlutum
6. Foreldri (WeatherOverviewClient) keyrir route-memory lookup og filterar kort

Tómur grunnur: sýnir `routeLensCacheMiss` texta (sama og cache-miss áður).
Hleður: sýnir `routeMemoryPickerLoading` texta.
Clear takki: birtist þegar eitthvað er valið.

### 5. `components/weather/WeatherOverviewClient.tsx` (breytt)

- Import skipti: `OverviewRouteLensPanel` → `RouteMemoryPicker`
- Fjarlægt: `routeLensResult` state, `setRouteLensResult`, `routeMemoryLabel`,
  og `useEffect` sem sync-aði route-memory niðurstöðu yfir í `routeLensResult`
  (RouteMemoryPicker þarf ekki þetta — sýnir ekki "Bráðabirgðaniðurstöður" badge)
- Fjarlægt: `type OverviewRouteLensResult` import
- `onPlacesChange` cast fjarlægður (var: `from as RouteDraftPlace | null`) —
  RouteMemoryPicker er already typed rétt
- `routeMemory` state, route-draft `useEffect`, og map-filtering er óbreytt

### 6. `middleware.ts` (breytt)

Bætt við `EXACT_PUBLIC_PATHS`:
```ts
'/api/teskeid/weather/route-memory/places',
'/api/teskeid/weather/route-memory/destinations',
```

### 7. `messages/is.json` + `messages/en.json` (breytt)

Bætt við í `teskeid.vedrid.overview`:
```json
"routeMemoryPickerLoading": "Sæki leiðir..."
"routeMemoryPickerLoading": "Loading routes..."
```

(Tómur-grunnur texti notar `routeLensCacheMiss` sem þegar er til.)

### 8. `app/api/teskeid/weather/travel/route.ts` (leiðrétt)

Log-safety villa leiðrétt á línu 491. Var:
```ts
console.error('[route-memory] write failed in travel route:', err instanceof Error ? err.message : 'unknown')
```
Eftir (static string, engin dynamic gildi):
```ts
console.error('[route-memory] write failed in travel route')
```

---

## Test / type-check staða

```
npx tsc --noEmit        → exit 0
npx vitest run          → 3375 passed, 27 skipped, 8 todo (0 failed)
log-safety test         → 89 passed (0 failed, villa leiðrétt)
```

---

## Handvirkt prófunarplan fyrir Stebba

### Forsendur

- SQL86 hefur verið keyrð (route-memory töflur eru til)
- Þú hefur reiknað a.m.k. eina leið á `/ferdalagid` (t.d. Reykjavík → Akureyri)
  svo eitthvað sé í route-memory grunni

---

### Próf 1 — Tómur grunnur (ef engar leiðir eru í minni)

**Ætti aðeins við ef þú hefur ALDREI reiknað leið á /ferdalagid.**

1. Fara á `/vedrid`
2. Opna leiðarsíu (renderRouteLens svæði)
3. **Búist við:** texti sem segir "Þessi leið er ekki í hraðskjánum enn.
   Notaðu Ferðalagið til að reikna hana nákvæmlega." (eða enska þýðing)
4. Ekkert Google-input, engar pills

---

### Próf 2 — Frá-listi birtist eftir ferðalag

1. Fara á `/ferdalagid`
2. Reikna leið, t.d. Reykjavík → Akureyri. Klára útreikning.
3. Fara á `/vedrid`
4. **Búist við:** Undir "Frá" eru pill-takkar með borgarnöfnum (a.m.k. "Reykjavík")
5. Engin Google autocomplete input sýnileg

---

### Próf 3 — Til-listi birtist eftir From-val

1. (Forsenda: Próf 2 er gert)
2. Á `/vedrid`, smella á "Reykjavík" pill undir "Frá"
3. **Búist við:**
   - "Frá" sýnir stóran takka með "Reykjavík" (selected state)
   - "Til" birtist með pill-lista (a.m.k. "Akureyri" ef leið var reiknuð)
4. Engin loading-hring eða villa

---

### Próf 4 — Kortið filterar eftir To-val

1. (Forsenda: Próf 3 er gert)
2. Smella á "Akureyri" pill undir "Til"
3. **Búist við:**
   - "Til" sýnir stóran takka með "Akureyri" (selected state)
   - Kortið filterar niður — sýnir aðeins stöðvar sem /ferdalagid vistaði
     fyrir Reykjavík → Akureyri (ekki allt landið)
   - Stöðu-pillur efst á kortasíðu telja bara route-filteraðar stöðvar
4. "Hreinsa leið ×" takki birtist neðst

---

### Próf 5 — Clear virkar

1. (Forsenda: Próf 4 er gert, bæði Frá og Til eru valin)
2. Smella á "Hreinsa leið ×"
3. **Búist við:**
   - Frá og Til hverfa, pill-listi kemur aftur undir "Frá"
   - Kortið sýnir allar stöðvar aftur (engin leið-sía)
   - "Hreinsa leið" hverfur

---

### Próf 6 — Breyta Frá-val

1. (Forsenda: Próf 3 er gert, Frá er valið en Til ekki)
2. Smella á stóra "Reykjavík" takkann undir "Frá"
3. **Búist við:**
   - Frá fer aftur í pill-lista
   - Til hverfur
   - Kortið sýnir allar stöðvar (sía hreinsast)

---

### Próf 7 — Ferðalagið CTA virkar eftir val

1. (Forsenda: Báðar borgir eru valdar og route-memory er resolved)
2. Smella á "Ferðalagið" takkann (ef hann er sýnilegur í viðmótinu)
3. **Búist við:** /ferdalagid opnar með Reykjavík og Akureyri forútfyllt
   (sessionStorage draft var skrifaður þegar borgirnar voru valdar)

---

### Próf 8 — Margar leiðir í minni

1. Reikna a.m.k. 2-3 mismunandi leiðir á /ferdalagid,
   t.d. Reykjavík → Akureyri, Reykjavík → Höfn, Akureyri → Egilsstaðir
2. Fara á `/vedrid`
3. **Búist við:** Frá-listi sýnir "Reykjavík" og "Akureyri"
4. Velja "Reykjavík" → Til-listi sýnir "Akureyri" og "Höfn"
5. Velja "Akureyri" → Frá-listi → Til sýnir "Egilsstaðir"

---

### Próf 9 — API endpoints beinlínis (optional)

Opna Developer Tools → Network eða nota browser URL:

```
/api/teskeid/weather/route-memory/places
→ { "places": [{ "key": "reykjavik", "label": "Reykjavík" }, ...] }

/api/teskeid/weather/route-memory/destinations?from=reykjavik
→ { "destinations": [{ "key": "akureyri", "label": "Akureyri" }, ...] }
```

Báðar eru public (engin 401 þótt notandi sé ekki innskráður).

---

## Fyrir Codex — kóðarýni atriði

### A1 — RouteMemoryPicker: `selectedFrom!` non-null assertion

`components/weather/RouteMemoryPicker.tsx:83`

```ts
function handleToSelect(place: RouteMemoryPlace) {
  setSelectedTo(place)
  if (selectedFrom) {
    onPlacesChange(
      toRouteDraftPlace(selectedFrom!),  // ← non-null assertion
      toRouteDraftPlace(place),
    )
  }
}
```

`selectedFrom!` er rétt hér vegna `if (selectedFrom)` guard á sömu línu.
TypeScript þekkir ekki `!` sem óþarfan fyrir `if` guard á function scope.
Kannski betra að skrifa `toRouteDraftPlace(selectedFrom)` inni í `if` blockina
til að forðast assertion?

### A2 — `destinations` state við from-breytingu

Þegar `selectedFrom` er smellt aftur til að breyta (`onClick` á selected-state takka):
```ts
setSelectedFrom(null)
setSelectedTo(null)
setDestinations(null)
onPlacesChange(null, null)
```

`destinations` state er null-að en `useEffect` sem sækir destinations keyrir
aðeins þegar `selectedFrom?.key` breytist. Þetta virkar rétt.
En: ef notandi velur sömu Frá-borg tvisvar, keyrir `useEffect` ekki aftur
(key er það sama). Í dag er þetta ekki vandamál vegna `setSelectedFrom(null)`
á milli, en þess þarf að gæta ef hegðun breytist.

### A3 — Fallback coords í `toRouteDraftPlace`

```ts
function toRouteDraftPlace(place: RouteMemoryPlace): RouteDraftPlace {
  const canonical = getCanonicalPlace(place.key)
  return {
    name: place.label,
    formattedAddress: place.label,
    lat: canonical?.lat ?? 64.1355,   // Reykjavík fallback
    lon: canonical?.lon ?? -21.8954,  // Reykjavík fallback
  }
}
```

Fallbackið er Reykjavík coordinates. Ætti aldrei að koma í framkvæmd vegna
að öll `place.key` gildi sem koma úr `/places` endpoint eru úr
`routePlaceNormalization.ts` sem passar við `routePlaces.ts`.
En: ef ný borg er bætt við normalization án þess að bæta við routePlaces,
fær hún Reykjavík coords. Þetta er viðunanlegt í v1 — FerðalagidClient
re-geocodes í gegnum Google áður en leið er reiknuð.

### A4 — `useEffect` eslint-disable comment

```ts
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedFrom?.key])
```

Þetta er rétt vegna að við viljum EKKI re-fetch þegar `selectedFrom` object
reference breytist, aðeins þegar `key` breytist. Sama mynstur og í
WeatherOverviewClient (þar eru primitive string deps notaðar til sömu ástæðu).

### A5 — `places` endpoint: duplicate handling

```ts
const seen = new Set<string>()
const places: { key: string; label: string }[] = []
for (const row of data) {
  const key = row.from_place_key as string
  if (!seen.has(key)) {
    seen.add(key)
    places.push({ key, label: row.from_place_label as string })
  }
}
```

Supabase hefur ekki native DISTINCT á `.select()` á þennan hátt.
App-level dedup er þess vegna rétt lausn. Athugaðu: `.order('from_place_label')`
raðar rétt en duplicate dedup tryggir aðeins fyrsta label-gildið fyrir hvert key.
Ef sama `from_place_key` hefur mismunandi `from_place_label` í mismunandi
rows (ætti ekki að gerast vegna normalization contract), fengi alltaf
fyrsta gildið. Þetta er acceptable.

### A6 — Gamla OverviewRouteLensPanel er enn til

`components/weather/OverviewRouteLensPanel.tsx` er enn á disk.
Það er ekki lengur importað af neinum.
Codex: ætti að eyða? Eða halda sem fallback-möguleika?
Mæli með að eyða ef RouteMemoryPicker virkar í production.

### A7 — routeLensCacheMiss texti sem "empty state" skilaboð

```ts
emptyText: tOv('routeLensCacheMiss'),
```

Gamli `routeLensCacheMiss` texti: "Þessi leið er ekki í hraðskjánum enn.
Notaðu Ferðalagið til að reikna hana nákvæmlega."

Þetta er aðeins "þessi leið" miðað við leið-miss, en nú er það notað sem
"engar leiðir yfirleitt" skilaboð. Innihaldið passar nógu vel í v1 en er
ekki fullkomlega nákvæmt. Mögulegt framhald: bæta við sérstökum
`routeMemoryPickerEmpty` lykli með: "Engin leið í minni ennþá.
Reiknaðu leið á Ferðalaginu til að sjá hana hér."

---

## Skrár sem breyttust í þessari lotu (frá v175)

| Skrá | Tegund |
|---|---|
| `lib/iceland-routes/routePlaces.ts` | Ný |
| `app/api/teskeid/weather/route-memory/places/route.ts` | Nýr endpoint |
| `app/api/teskeid/weather/route-memory/destinations/route.ts` | Nýr endpoint |
| `components/weather/RouteMemoryPicker.tsx` | Ný component |
| `components/weather/WeatherOverviewClient.tsx` | Breytt |
| `middleware.ts` | Breytt |
| `messages/is.json` | Breytt |
| `messages/en.json` | Breytt |
| `app/api/teskeid/weather/travel/route.ts` | Leiðrétt (log-safety) |

---

## Eftirstandandi atriði (ekki gert í þessari lotu)

### Líklegt næsta skref — Empty state skilaboð (A7)

Bæta við `routeMemoryPickerEmpty` translation key í stað þess að endurnýta
`routeLensCacheMiss`. Smá en skiptir máli fyrir UX þegar grunnurinn er tómur.

### Possible next step — Eyða OverviewRouteLensPanel

Þegar RouteMemoryPicker hefur verið staðfest í production:
- Eyða `components/weather/OverviewRouteLensPanel.tsx`
- Eyða `PlaceSearch` import þaðan (athugaðu hvort PlaceSearch sé notað annars staðar)

### A6 writer/lookup mock tests (frá v543)

Supabase mock-próf fyrir `routeMemory.server.ts` og `/route-memory/lookup`
eru enn óskrifuð. Stærsta eftirstandandi tæknilega skuldin á þessum feature.

### C.3-4 Vista þröskulda sem sjálfgefin

"Vista sem sjálfgefin vindmörk" takki + API endpoints. Þarf sql/82.

---

## Localhost prófun — ráðlögð röð

1. `npm run dev`
2. Fara á `/ferdalagid`, reikna Reykjavík → Akureyri (ef ekki þegar gert)
3. Fara á `/vedrid`
4. Staðfesta að pill-listi birtist undir "Frá" (ekkert Google input)
5. Velja Reykjavík → Akureyri → staðfesta að kortið filterar
6. Hreinsa → staðfesta að allt land kemur aftur
7. Reikna aðra leið á /ferdalagid (t.d. Akureyri → Egilsstaðir)
8. Fara aftur á /vedrid → staðfesta að báðar borgir eru nú í Frá-lista
