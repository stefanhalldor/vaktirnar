# 2026-07-16 05:30 - TODO-086 v287 - Claude: Veðurpúls inline á Veðurstofuspjöld leiðanna

Created: 2026-07-16 05:30
Timezone: Atlantic/Reykjavik

## Hvað var gert

Veðurpúls preview + inline composer bætt við öll Veðurstofuspjöld sem birtast í ferðalagsamhengi:

- **Versti punktur** (`VedurstofanPointCard` í `TravelAuditMap`)
- **Valinn punktur** (sama íhlutur, valinn handvirkt á korti)
- **Undir öllum spápunktum** í ferðalagspanelnum (`VedurstofanJourneySummary` í `FerdalagidClient`)

## Nýr íhlutur: `VedurstofanPulseInline`

**Skrá:** `components/weather/VedurstofanPulseInline.tsx`

Props: `{ stationId: string }`

Hegðun:
- Preview sótt úr public endpoint `/api/teskeid/weather/vedurpuls/stations/[stationId]/preview` við mount — engin auth krafist
- `ChatPreviewList` sýnd alltaf, jafnvel tóm (empty state sýnir `pulseEmpty` texta eftir load)
- Composer (input + send takki) alltaf sýnilegur
- **Lazy thread init:** þráður ekki búinn til fyrr en notandi sendir — sama mynstur og í `elta-vedrid`
- **Ef 401 við send:** `needsLogin` state → link á `/innskraning` (`pulseNeedsLogin` lykill)
- **Ef 403/503:** `accessDenied` state → íhluturinn felur sig
- **Ef send tekst:** `composeBody` hreinsuð, preview endurhlaðið

## Breytingar á `VedurstofanPointCard.tsx`

```tsx
import { VedurstofanPulseInline } from './VedurstofanPulseInline'
```

**`VedurstofanJourneySummary`:** `<VedurstofanPulseInline stationId={station.stationId} />` bætt við eftir disclaimer-kassann, inni í `space-y-1` div (grid 2. dálkur).

**`VedurstofanPointCard`:** `<VedurstofanPulseInline stationId={station.stationId} />` bætt við eftir source link, neðst á kortinu.

## Þýðingar

`messages/is.json` og `messages/en.json` — bætti við `pulseNeedsLogin` í `teskeid.vedrid.eltaVedrid` namespace:

- `is`: `"Skráðu þig inn til að skrifa í Veðurpúls"`
- `en`: `"Sign in to write in Veðurpúls"`

Aðrar þýðingarlyklar eru þegar til (`pulseEmpty`, `pulseDeleted`, `pulseSend`, `pulseSendError`, `pulseInputPlaceholder`, `pulseKindField`, `pulseKindMeasurement`).

## Skrár breyttar

- `components/weather/VedurstofanPulseInline.tsx` — NÝ
- `components/weather/VedurstofanPointCard.tsx` — breytt (import + 2 staðir)
- `messages/is.json` — bætti við `pulseNeedsLogin`
- `messages/en.json` — bætti við `pulseNeedsLogin`

## Type-check

```
npm run type-check: exit 0, no errors
```

## Localhost checks fyrir Stebbi

### Grunn ferð

1. Opna `/vedrid`, stilla ferð með Veðurstofustöð á leiðinni
2. Smella á versta punkt á korti → `VedurstofanPointCard` birtist
3. **Búist við:** Veðurpúls preview sést neðst á kortinu (tómt state: "Engar umferðarfréttir...")
4. Opna ferðalagspanel → `VedurstofanJourneySummary` sést
5. **Búist við:** Veðurpúls preview sést einnig þar, neðst undir disclaimer

### Send án innskráningar

6. Skrá sig út (eða nota private glugga)
7. Slá inn texta í input og smella Senda
8. **Búist við:** "Skráðu þig inn til að skrifa í Veðurpúls" link birtist (link → `/innskraning`)
9. Engar villur í console, engin server error

### Send sem innskráður notandi

10. Skrá sig inn
11. Fara á `/vedrid` með ferð
12. Slá inn texta á Veðurstofuspjald og senda
13. **Búist við:** Skilaboð birtast í preview án þess að opna fulla púlsinn

### `/auth-mvp/vedrid` samhengi

14. Fara á `/auth-mvp/vedrid/elta-vedrid`
15. Velja stöð
16. **Búist við:** `WeatherPulseSummary` í `StationDetail` virkar óbreytt (sérstakur íhlutur, ekki `VedurstofanPulseInline`)

## Pending

- Stebbi gerir localhost checks
- Stebbi gefur commit-leyfi
- **v286 findingar (óframkvæmdar):**
  - Medium: `returnTo` stale URL fix í `elta-vedrid` (buildStationReturnTo helper)
  - Low: unit tests fyrir `resolveBackHref`
- Deferred (Phase 4B.2): station/weather context á full pulse route
