# Handoff: todo-067 v138 - Claude v137 review framkvæmd

**Date:** 2026-07-07 19:30
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Branch:** main (uncommitted)

---

## Hvað var gert

Lagfærðar tvær Low findings úr Codex v137 review.

---

### 1. Test names/comments uppfærðar (2.0 → 5.0)

**Skrá:** `lib/__tests__/weather-travel.test.ts`

- Lína 66: `"below new 2.0 threshold"` → `"below new 5.0 threshold"`
- Línur 636-652: Test uppfærð til að nota `5.0 mm/h` (var `2.0 mm/h`) og commentar uppfærðir:
  - Nafn: `"does not trigger caution for precip exactly at 5.0 mm/h (strict > threshold)"`
  - `atThresholdHours`: `5.0` í stað `2.0`
  - Comment: `"5.0 mm/h is NOT > 5.0 → should not trigger caution"`

---

### 2. Ónotað `WEATHER_THRESHOLDS` import fjarlægt úr `travel.ts`

**Skrá:** `lib/weather/travel.ts`

```ts
// Fyrir:
import { WEATHER_THRESHOLDS, deriveThreshold, resolveThresholds } from './thresholds'

// Eftir:
import { deriveThreshold, resolveThresholds } from './thresholds'
```

`WEATHER_THRESHOLDS` var aldrei notað í `travel.ts` - einungis importað.

---

## Test niðurstöður

```
npm run type-check  -> exit 0
npm run test:run    -> 1770 passed / 27 skipped / 8 todo (54 files)
```

Sama fjöldi og v137 baseline - engar nýjar tests, eingöngu leiðréttingar á description/kóða.

---

## Skrár breyttar

```
lib/weather/travel.ts                   - WEATHER_THRESHOLDS fjarlægt úr import
lib/__tests__/weather-travel.test.ts    - test names/comments uppfærðar (2.0 → 5.0)
```

---

## Staða á öllum uncommitted breytingum

Allt frá v130 bíður commit. Stebbi þarf að samþykkja.

Heildarskrár (v130-v137):

```
app/api/place/search/route.ts
components/weather/PlaceSearch.tsx
components/weather/RouteSelectionStep.tsx
components/weather/TravelAuditMap.tsx
components/teskeid/TeskeidMenu.tsx
lib/weather/thresholds.ts
lib/weather/travel.ts
lib/__tests__/place-search-api.test.ts
lib/__tests__/weather-travel.test.ts
messages/is.json
messages/en.json
app/auth-mvp/vedrid/FerdalagidClient.tsx
```

---

## Localhost checks fyrir Stebbi (óbreyttar frá v137)

1. `/auth-mvp/vedrid` → `Veðurmörk` → úrkoma default er `5 mm/klst`
2. Ferð með úrkomu 2-4 mm/klst → á að vera grænt
3. Innskráður hamburger → `Hugmyndir` er horfið
4. Opinber hamburger → `Hugmyndir` er enn til
5. PlaceSearch óþekkt staður → mild "Enginn staður fannst" texti

---

## Release prerequisites (óbreyttar)

- `GOOGLE_MAPS_SERVER_KEY`: Geocoding API + Routes API, engin browser-referrer restriction
- Vercel: `WEATHER_ENABLED=true`, `WEATHER_FLAG=true`
- Supabase: `sql/68_feature_access_vedrid.sql` keyrð

---

## Næstu fasar

| v139 | Phase B: Route alternatives (computeAlternativeRoutes, text-first picker) |
| v140 | Phase C: Vestmannaeyjar/Herjólfur |
| v141 | Phase D: Saved places |
| v142 | Phase E: Login UI clarity |
