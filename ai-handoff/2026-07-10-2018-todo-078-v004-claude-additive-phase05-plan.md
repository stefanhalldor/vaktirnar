# Claude Code: Tjaldferð Phase 0.5 — additive-only plan

Created: 2026-07-10 20:18
Timezone: Atlantic/Reykjavik
Tengist: TODO #078
Byggt á: v003 Codex review

Engar kóðabreytingar í þessari handoff. Þetta er plan til Codex-rýni.

---

## Meginmunur frá v003 Codex-tillögu

v003 lagði til að `checkTravelWeather()` yrði refactoraður þannig að Ferðaveðrið kalli inn í nýtt shared core. Stebbi hafnaði þessari nálgun vegna einnar ástæðu:

> "Ég er bara að hugsa um að við séum ekki að festa okkur í þessari stóru breytingu og getum þá ekki lagfært neitt í núverandi ferðaveðri á meðan við erum að vinna í þessari stóru breytingu."

Þessi plan er byggður á öðrri nálgun: **additive-only**. `checkTravelWeather()` er **aldrei snert**. Ferðaveðrið er óbreytt í production. Tjaldferð fær aðgang að innri logíc með `export` á nokkrum einkaföllu — ekki með refactor.

---

## Hvað yrði gert í Phase 0.5

### Skref 1 — Export á innri föll í `lib/weather/travel.ts`

Þrjú föll sem eru þegar til sem private fá `export` lykilorðið:

```ts
// Áður: function evalDrivingLeg(...)
export function evalDrivingLeg(...)

// Áður: function findWorstMetric(...)
export function findWorstMetric(...)

// Áður: function getHoursNearEta(...)
export function getHoursNearEta(...)
```

**Engin hegðunarbreyting.** Þetta eru þrjár línubreytingar (bæta `export` fyrir `function`). `checkTravelWeather()` er **óbreytt**. Öll núverandi próf standast óbreytt.

### Skref 2 — Ný skrá: `lib/camping/assessment.ts`

Ný skrá sem skrifar **frá grunni** þá virkni sem Tjaldferð þarf og Ferðaveðrið hefur ekki:

```ts
// lib/camping/assessment.ts

import { evalDrivingLeg, findWorstMetric, getHoursNearEta } from '@/lib/weather/travel'
import { resolveThresholds } from '@/lib/weather/thresholds'
import { buildForecastRows } from '@/lib/weather/travel'
import type { HourPoint, WeatherStatus } from '@/lib/weather/types'

export type CampingEquipment = 'tent' | 'camper' | 'caravan'

export type StayWindowKind = 'night' | 'day' | 'full'

export type StayAssessment = {
  windowKind: StayWindowKind
  status: WeatherStatus
  worstWindMs: number
  worstGustMs: number
  worstPrecipMmPerHour: number
  minTempC?: number        // tent-specific: frost risk
  reasonCode?: string
  forecastRows: ForecastDrawerRow[]
}

export type RouteLegAssessment = {
  status: WeatherStatus
  reasonCode?: string
  worstWindMs?: number
  worstGustMs?: number
  worstPrecipMmPerHour?: number
  durationMinutes: number
  distanceKm: number
}

export type TripAssessment = {
  overallStatus: WeatherStatus
  worstSegment: 'leg' | 'stay'
  worstSegmentIndex: number
  legs: RouteLegAssessment[]
  stays: StayAssessment[]
}

export function assessStayWindow(
  hours: HourPoint[],
  windowKind: StayWindowKind,
  equipment: CampingEquipment,
): StayAssessment

export function aggregateTripAssessment(
  legs: RouteLegAssessment[],
  stays: StayAssessment[],
): TripAssessment
```

Þessi skrá notar **engar nýjar útreikningsreglur** — hún kallar í sömu `evalDrivingLeg`, `findWorstMetric` og `getHoursNearEta` og Ferðaveðrið. Eini munurinn er:
- `StayWindowKind`: filter á klukkustundir eftir nótt (22:00–06:00) vs. dag
- `minTempC`: hitastigsmat sem Ferðaveðrið þarf ekki
- `aggregateTripAssessment`: `overallStatus = max(legs ∪ stays)`

### Skref 3 — Ný skrá: `lib/camping/campsites.ts`

Statísk listi, ~10-15 tjaldsvæði til að byrja:

```ts
export type Campsite = {
  id: string
  name: string
  lat: number
  lon: number
  region: string
  openMonths?: number[]
  exposed: boolean
}

export const CAMPSITES: Campsite[] = [
  { id: 'landmannalaugar', name: 'Landmannalaugar', lat: 63.979, lon: -19.067, region: 'Suðurland', openMonths: [6,7,8], exposed: true },
  { id: 'thorsmork', name: 'Þórsmörk', lat: 63.682, lon: -19.521, region: 'Suðurland', openMonths: [5,6,7,8,9], exposed: false },
  // ... fleiri
]
```

### Skref 4 — Ný API route: `app/api/teskeid/camping/assess-trip/route.ts`

Læst á `CAMPING_ENABLED !== 'true'` → 404.
Krefst innskráningar (ekkert guest mode í Phase 0.5).
Tekur við: `{ stops, equipment, departureIso }`.
Kallar Google Routes per legg + Met.no per sample-punkti.
Skilar `TripAssessment`.

### Skref 5 — Nýr route: `app/auth-mvp/tjaldferd/page.tsx`

Einfaldur shell:
- `CAMPING_ENABLED !== 'true'` → `redirect('/auth-mvp/heim')`
- Einfalt form: origin, eitt tjaldsvæði (dropdown), dagsetning, búnaður
- Reikna-takki → sýnir scorecard niðurstaða
- Engin vistun, engin saved trips

**Ekki í navigation** (`TeskeidMenu` fær ekki nýjan link). Aðeins aðgengilegt í gegnum beina URL.

### Skref 6 — Middleware

Bæta `/auth-mvp/tjaldferd` og `/api/teskeid/camping` við vernduðu slóðirnar í `middleware.ts` (þar sem þær krefjast innskráningar).

---

## Hvað er ALDREI snert í þessum Phase

| Skrá | Staða |
|---|---|
| `lib/weather/travel.ts` | Aðeins `export` bætt við 3 föll — engin önnur breyting |
| `checkTravelWeather()` | **Óbreytt** |
| `app/auth-mvp/vedrid/` | Óbreytt |
| `app/vedrid/` | Óbreytt |
| `components/weather/` | Óbreytt |
| `middleware.ts` | Einungis nýjar línur bætt við |
| `TeskeidMenu` | Óbreytt — enginn nýr link |
| SQL / Supabase | **Ekkert** |

---

## Próf

Tvær prófskrár:

1. **`lib/__tests__/camping-assessment.test.ts`** — einingapróf fyrir `assessStayWindow()` og `aggregateTripAssessment()`:
   - nóttargluggi einangrar rétt (22:00–06:00)
   - aggregate: rautt legg = rautt heildarskor jafnvel þótt allt annað sé grænt
   - hitastigsmat: tent + -2°C = rautt
   - camper + -2°C = óbreytt stöðumat

2. **`lib/__tests__/camping-campsites.test.ts`** — sanity checks:
   - allir staðir hafa gild lat/lon
   - openMonths ef til staðar eru gild (1-12)

Núverandi Ferðaveðrið-próf (`weather-travel.test.ts`, `weather-routes-api.test.ts` o.fl.) keyra **óbreyttir** og eiga að standast án breytinga.

---

## Release til production

Phase 0.5 má fara í production þegar:
1. Öll núverandi próf standast
2. Ný próf standast
3. TypeScript hrein
4. `CAMPING_ENABLED` er **ekki** sett á Vercel → Tjaldferð er algerlega falin

Ferðaveðrið í production: **identískt með núverandi**. Notendur sjá ekkert nýtt.

Hotfix á Ferðaveðrið meðan Tjaldferð er í þróun: **engin hindrun**. `checkTravelWeather()` er óbreytt, hægt að laga og senda.

---

## Spurningar til Codex

1. Er additive-only nálgunin (export á einkaföllu í stað refactor) samþykkt sem Phase 0.5?
2. Er `CampingEquipment = 'tent' | 'camper' | 'caravan'` nóg fyrir Phase 0.5 eða þarf fleiri flokka?
3. Á `assessStayWindow()` að vera kallað per nótt í dvölinni (ef 3 nætur = 3 köll) eða eitt köll yfir alla dvölina? Áhrif á API-complexity.
4. Er rétt að krefjast innskráningar í Phase 0.5 eða á gestur að geta prófað?
5. Einhverjar aðrar áhyggjur?

---

## Localhost checks fyrir Stebbi

Engar kóðabreytingar í þessari handoff.

Þegar Phase 0.5 er útfært og `CAMPING_ENABLED=true` á localhost:
1. Opna `/auth-mvp/tjaldferd` — á að hlaðast (ekki 404, ekki redirect)
2. Opna `/vedrid` — á að virka **nákvæmlega eins og áður**
3. Opna `/auth-mvp/vedrid` — á að virka **nákvæmlega eins og áður**
4. `CAMPING_ENABLED=false` (eða env var vantar): `/auth-mvp/tjaldferd` → redirect, API → 404
5. Engin ny linka í `TeskeidMenu` — Tjaldferð er falin

---

## Óvissa / þarf að staðfesta

- **Confidence high**: `export` á 3 einkaföllu í `travel.ts` breyti ekki hegðun.
- **Confidence medium**: `evalDrivingLeg` dugar beint fyrir route leg assessment í Tjaldferð — sama logic, sama thresholds. Ef campsite-specific thresholds þarf í framtíðinni er það viðbót, ekki refactor.
- **Confidence medium**: Met.no API er gáfugt nóg fyrir campsite-spá (statísk lat/lon). Þarf að staðfesta að Met.no gefur nógu langan spátíma (9 dagar).
- **Forsenda**: Google Routes API kostar ~$0.015 per ferðamat (3 legar). Þarf að staðfesta að rate limit og billing alert sé til staðar áður en opnað er út fyrir Stebba.
