# Handoff: Road Intelligence RI-0 til RI-3 — implementation plan

Created: 2026-07-20 18:00
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Implementation handoff (plan only — engin kóðabreyting hér)

---

## Samhengi

Þetta handoff lýsir nákvæmlega hvað á að gera í einni session til að koma
Road Intelligence á loft sem flaggaða hliðarleið. Byggt á v245 Codex plan eftir
rýni á núverandi kóða.

Framkvæmdarleyfi þarf sérstaklega frá Stebba.

---

## Núverandi staða í kóðanum

### lib/iceland-routes/ — er þegar til

- `types.ts` — `IcelandRouteSegment`, `IcelandRouteFamily`, `IcelandRouteSafetyFlag` eru til. Vantar `IcelandRouteAlternative`, `IcelandRouteCaution`, `IcelandRoadIntelligenceResult`.
- `segments.ts` — 5 segment stubs: `ring-road-hellisheidi`, `threngsli`, `holmavik-sudurleid`, `oxi-axarvegur`, `ring-road-vik-west`, `ring-road-vik-east`. Allt `verified: false`, engin geometry.
- `routeFamilies.ts` — 4 route families eru þegar til: `capital-south-coast`, `capital-east-iceland`, `capital-north-iceland`, `capital-westfjords`. Þær nota `fromAliases`/`toAliases` (slugified) og corridor waypoints.
- `routePlaceNormalization.ts` — `slugifyPlaceKey()` og `normalizePlaceForMemory()` eru þegar til. Resolver á að nota `slugifyPlaceKey()` beint.
- `lensResolver.ts` — tengist corridor-lens approach (eldra). Nota ekki þessa til Road Intelligence.

### lib/loans/guard.ts — feature access pattern

Núverandi feature keys (úr sql/80):
```
'umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid',
'elta-vedrid', 'weather-provider-vedurstofan', 'weather-pulse',
'weather-provider-vegagerdin'
```

Formið er:
```ts
if (featureKey === 'road-intelligence-v1') {
  if (process.env.ROAD_INTELLIGENCE_V1_ENABLED !== 'true') return false
  return checkPerUserAccess(email, 'road-intelligence-v1')
}
```

### SQL — CHECK constraint pattern

sql/80 er dæmið. Næsta migration verður `sql/89_...`. Constraint þarf að innihalda
**alla** 9 eldri lykla + nýja.

---

## Áætlun: RI-0 + RI-1 + RI-2 + RI-3

### RI-0: Feature flag

**Skrár:**

`sql/89_feature_access_road_intelligence_v1.sql`
- Ber að innihalda CHECK constraint með öllum 10 lyklum (9 eldri + `road-intelligence-v1`)
- Idempotent (DROP IF EXISTS + ADD)
- Rollback neðst
- Stebbi keyrir — Claude Code skrifar skrána einungis

`lib/loans/guard.ts`
- Bæta við blokk eftir `weather-provider-vegagerdin` blokk:
  ```ts
  if (featureKey === 'road-intelligence-v1') {
    if (process.env.ROAD_INTELLIGENCE_V1_ENABLED !== 'true') return false
    return checkPerUserAccess(email, 'road-intelligence-v1')
  }
  ```

`app/api/admin/feature-access/route.ts`
- Skoða hvort ALLOWED_KEYS eða sambærilegt array þarf uppfærslu til að samþykkja `road-intelligence-v1`
- Ef já: bæta við

**Tests (í `lib/__tests__/guard.test.ts`):**
- `road-intelligence-v1` skilar `false` þegar env var er ekki `'true'`
- `road-intelligence-v1` skilar `false` þegar env er `'true'` en engin feature_access röð
- `road-intelligence-v1` skilar `true` þegar env er `'true'` og röð er til

---

### RI-1: Typed static skeleton

**`lib/iceland-routes/types.ts` — bæta við:**

```ts
export type IcelandRouteAlternativeId = string
export type IcelandRouteCautionId = string

export type IcelandRouteAlternativeLabel =
  | 'gegnum-holmavik'
  | 'um-hellisheidi'
  | 'um-threngsli'
  | 'um-firdi'         // um firðina (Austurland)
  | 'sleppa-oxi'       // til að sleppa við Öxi
  | 'hringvegurinn'

export interface IcelandRouteAlternative {
  id: IcelandRouteAlternativeId
  routeFamilyId: IcelandRouteFamilyId
  label: string           // "Gegnum Hólmavík"
  labelEn: string         // "Via Hólmavík"
  segmentIds: readonly IcelandRouteSegmentId[]
  avoids?: readonly IcelandRouteSegmentId[]
  notes?: string
  verified: boolean
}

export type IcelandRouteCautionTag =
  | 'vindnaemt'
  | 'fjallvegur'
  | 'varasamt-eftirvagn'
  | 'vetrarodvissa'
  | 'lokad-kann-ad-vera'

export interface IcelandRouteCaution {
  id: IcelandRouteCautionId
  segmentId: IcelandRouteSegmentId
  tag: IcelandRouteCautionTag
  label: string      // "Vindnæmt"
  labelEn: string    // "Wind-exposed"
  severity: IcelandRouteSafetySeverity
  notes?: string
}

export type IcelandRoadIntelligenceConfidence = 'draft' | 'reviewed' | 'verified'
export type IcelandRoadIntelligenceStatus = 'resolved' | 'unknown'

export interface IcelandRoadIntelligenceResult {
  status: IcelandRoadIntelligenceStatus
  source: 'teskeid_registry'
  confidence: IcelandRoadIntelligenceConfidence
  routeFamilyId?: IcelandRouteFamilyId
  routeFamilyLabel?: string
  alternatives: readonly IcelandRouteAlternative[]
  cautions: readonly IcelandRouteCaution[]
}
```

**`lib/iceland-routes/alternatives.ts` — ný skrá:**

3 route families, manually curated:

| routeFamilyId | id | label |
|---|---|---|
| `capital-westfjords` | `rvk-isafjordur-via-holmavik` | `Gegnum Hólmavík` |
| `capital-east-iceland` | `rvk-east-via-hellisheidi` | `Um Hellisheiði` |
| `capital-east-iceland` | `rvk-east-sleppa-oxi` | `Til að sleppa við Öxi` |
| `capital-east-iceland` | `rvk-east-um-firdi` | `Um firðina` |
| `capital-north-iceland` | `rvk-akureyri-hringvegurinn` | `Hringvegurinn` |

**`lib/iceland-routes/cautions.ts` — ný skrá:**

| segmentId | cautionId | tag | label |
|---|---|---|---|
| `ring-road-hellisheidi` | `hellisheidi-vindnaemt` | `vindnaemt` | `Vindnæmt` |
| `ring-road-hellisheidi` | `hellisheidi-fjallvegur` | `fjallvegur` | `Fjallvegur` |
| `oxi-axarvegur` | `oxi-lokad-kann` | `lokad-kann-ad-vera` | `Getur verið lokað` |
| `oxi-axarvegur` | `oxi-fjallvegur` | `fjallvegur` | `Fjallvegur` |
| `oxi-axarvegur` | `oxi-eftirvagn` | `varasamt-eftirvagn` | `Varasamt með eftirvagn` |
| `holmavik-sudurleid` | `holmavik-vindnaemt` | `vindnaemt` | `Vindnæmt` |
| `threngsli` | `threngsli-fjallvegur` | `fjallvegur` | `Fjallvegur` |

---

### RI-2: Pure resolver

**`lib/iceland-routes/roadIntelligenceResolver.ts` — ný skrá:**

```ts
import { slugifyPlaceKey } from './routePlaceNormalization'
import { ROUTE_FAMILIES } from './routeFamilies'
import { ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES } from './alternatives'
import { ICELAND_ROAD_CAUTIONS } from './cautions'
import type { IcelandRoadIntelligenceResult } from './types'

// Capital area place keys (same set as CAPITAL_ALIASES in routeFamilies.ts)
const CAPITAL_KEYS = new Set([
  'reykjavik', 'rvk', 'keflavik', 'kef', 'hafnarfjordur',
  'kopavogur', 'gardabaer', 'mosfellsbaer', 'reykjanes', 'reykjanesbaer', 'sudurnes',
])

export function resolveRoadIntelligence(
  fromPlaceKey: string,
  toPlaceKey: string,
): IcelandRoadIntelligenceResult {
  // Normalize input
  const fromKey = slugifyPlaceKey(fromPlaceKey)
  const toKey = slugifyPlaceKey(toPlaceKey)

  // Try both directions
  const family = ROUTE_FAMILIES.find(f => {
    const fromMatch = f.fromAliases.includes(fromKey) || CAPITAL_KEYS.has(fromKey) && f.fromAliases.some(a => CAPITAL_KEYS.has(a))
    const toMatch = f.toAliases.includes(toKey)
    const reverseFrom = f.fromAliases.includes(toKey) || CAPITAL_KEYS.has(toKey) && f.fromAliases.some(a => CAPITAL_KEYS.has(a))
    const reverseTo = f.toAliases.includes(fromKey)
    return (fromMatch && toMatch) || (reverseFrom && reverseTo)
  })

  if (!family) {
    return { status: 'unknown', source: 'teskeid_registry', confidence: 'draft', alternatives: [], cautions: [] }
  }

  const alternatives = ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES.filter(a => a.routeFamilyId === family.id)
  const segmentIds = new Set(alternatives.flatMap(a => [...a.segmentIds, ...(a.avoids ?? [])]))
  const cautions = ICELAND_ROAD_CAUTIONS.filter(c => segmentIds.has(c.segmentId))

  return {
    status: 'resolved',
    source: 'teskeid_registry',
    confidence: 'draft',
    routeFamilyId: family.id,
    routeFamilyLabel: family.label,
    alternatives,
    cautions,
  }
}
```

**`lib/iceland-routes/index.ts` — uppfæra exports** til að include-a nýja exports.

**Tests — `lib/__tests__/iceland-routes-road-intelligence.test.ts`:**

- `resolveRoadIntelligence('reykjavik', 'egilsstadir')` → `status: 'resolved'`, 3 alternatives
- `resolveRoadIntelligence('egilsstadir', 'reykjavik')` → sömu niðurstöður (bidirectional)
- `resolveRoadIntelligence('reykjavik', 'isafjordur')` → `status: 'resolved'`, 1 alternative (`Gegnum Hólmavík`)
- `resolveRoadIntelligence('reykjavik', 'akureyri')` → `status: 'resolved'`, 1 alternative (`Hringvegurinn`)
- `resolveRoadIntelligence('akureyri', 'egilsstadir')` → `status: 'unknown'` (óþekkt par)
- `resolveRoadIntelligence('reykjavik', 'þykkvabæjarklaustur')` → `status: 'unknown'`
- Cautions: Egilsstaðir route inniheldur `hellisheidi-vindnaemt` og `oxi-fjallvegur`

---

### RI-3: Read-only flagged UI

**Hvernig flaggið kemur á `/auth-mvp/vedrid`:**

`app/auth-mvp/vedrid/page.tsx` — sækja feature access server-side:
```ts
const hasRoadIntelligence = await checkFeatureAccess(supabaseUser.email ?? '', supabaseUser.email ?? '', 'road-intelligence-v1')
```
Senda sem prop inn í `WeatherOverviewShell` eða `WeatherOverviewClient`.

**Nýr component: `components/weather/RoadIntelligencePreview.tsx`**

Props:
```ts
type Props = {
  fromPlaceKey: string
  toPlaceKey: string
  fromLabel: string
  toLabel: string
}
```

Birtist: undir route variant pillunum, bara þegar báðir staðir eru valdir og flagg er `true`.

UI:
- Titill: `Teskeið þekkir þessar leiðir` + `Tilraun` badge
- Alternative pills: ein pill per alternative (`Gegnum Hólmavík`, `Um Hellisheiði`, o.s.frv.)
- Caution chips: `Vindnæmt`, `Fjallvegur`, `Varasamt með eftirvagn`
- Confidence note: `Uppkast — óstaðfest`
- Enginn map filter, engin routing

**messages/is.json** — bæta við undir `vedrid` namespace:
```json
"roadIntelligenceTitle": "Teskeið þekkir þessar leiðir",
"roadIntelligenceBadge": "Tilraun",
"roadIntelligenceConfidenceDraft": "Uppkast — óstaðfest",
"roadIntelligenceUnknown": "Teskeið þekkir ekki þetta leiðarpar enn"
```

**messages/en.json** — sambærilegar lyklar á ensku.

**`components/weather/WeatherOverviewClient.tsx`** — bæta við render:
```tsx
{hasRoadIntelligence && fromMemoryPlace && toMemoryPlace && (
  <RoadIntelligencePreview
    fromPlaceKey={fromMemoryPlace.key}
    toPlaceKey={toMemoryPlace.key}
    fromLabel={fromMemoryPlace.label}
    toLabel={toMemoryPlace.label}
  />
)}
```

Placement: rétt undir `WeatherWatchersComparison` (eða undir route variant pillum ef Comparison er ekki til).

---

## Skrár sem verða breyttar/bættar við

| Skrá | Aðgerð |
|---|---|
| `sql/89_feature_access_road_intelligence_v1.sql` | Ný |
| `lib/loans/guard.ts` | Breyting |
| `app/api/admin/feature-access/route.ts` | Skoða + hugsanleg breyting |
| `lib/iceland-routes/types.ts` | Breyting — nýjar gerðir |
| `lib/iceland-routes/alternatives.ts` | Ný |
| `lib/iceland-routes/cautions.ts` | Ný |
| `lib/iceland-routes/roadIntelligenceResolver.ts` | Ný |
| `lib/iceland-routes/index.ts` | Breyting — exports |
| `lib/__tests__/guard.test.ts` | Breyting — nýjar tests |
| `lib/__tests__/iceland-routes-road-intelligence.test.ts` | Ný |
| `components/weather/RoadIntelligencePreview.tsx` | Ný |
| `components/weather/WeatherOverviewClient.tsx` | Breyting — render + prop |
| `app/auth-mvp/vedrid/page.tsx` | Breyting — feature access check |
| `messages/is.json` | Breyting |
| `messages/en.json` | Breyting |

---

## Validation eftir framkvæmd

```bash
npm run type-check
npm run test:run
npm run build
```

---

## Hvað er EKKI í þessum slísa

- Engin Station matching (RI-4)
- Engin open/GIS data
- Engin routing engine
- Engin PostGIS
- Engin map filter breyting (Road Intelligence er presentation-only)
- Ekkert fyrir almenna notendur (`road-intelligence-v1` flagg nauðsynlegt)
- SQL keyrð ekki af Claude Code

---

## Localhost checks eftir framkvæmd

1. **Notandi án flaggs** — opna `/auth-mvp/vedrid`, velja Frá + Til — `Teskeið þekkir þessar leiðir` á **ekki** að birtast.
2. **Notandi með flagg** (Stebbi bætir við feature_access röð handvirkt eftir sql/89 er keyrð):
   - Reykjavík → Egilsstaðir: 3 alternatives, cautions um Hellisheiði og Öxi
   - Reykjavík → Ísafjörður: `Gegnum Hólmavík` alternative
   - Reykjavík → Akureyri: `Hringvegurinn`
   - Akureyri → Egilsstaðir: `Teskeið þekkir ekki þetta leiðarpar enn` eða engin panel
3. **Public `/vedrid`** — engar Road Intelligence controls
4. **Mobile 360-430px** — pills wrap, enginn overflow
