# 2026-07-16 07:23 - TODO-086 v301 - Claude: v300 done, prerelease

Created: 2026-07-16 07:23
Timezone: Atlantic/Reykjavik

Commit: ekki enn (engar kóðabreytingar commitaðar)

## Breytingar

### 1. `WEATHER_PULSE_ACCESS_REQUIRED` graduation flip

**`lib/loans/guard.ts`** (lína 110-114):

Breytti frá opt-in-open (`=== 'false'`) í graduation-mynstur (`=== 'true'`):

```ts
// Áður:
if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return true

// Eftir:
const pulseAccessRequired =
  process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'true'
if (!pulseAccessRequired) return true
```

**`lib/chat/access.server.ts`** (lína 39-41):

```ts
// Áður:
if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return 'allowed'

// Eftir:
if (process.env.WEATHER_PULSE_ACCESS_REQUIRED !== 'true') return 'allowed'
```

JSDoc í sama skrá uppfærður: "unless WEATHER_PULSE_ACCESS_REQUIRED is not 'true'".

**Áhrif:**

| Staða | Áður | Eftir |
|-------|------|-------|
| Breyta fjarverandi/eytt | per-user gátt | open to all (graduation) |
| `=== 'false'` | open | open (non-true) |
| `=== 'true'` | per-user gátt | per-user gátt |

---

### 2. Fela "Sækja ný gögn" fyrir public notendur

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`** (lína 992):

```ts
// Áður:
const showVedurstofanRefreshButton = !isVedurstofanDataFresh

// Eftir:
const showVedurstofanRefreshButton = !isGuest
  && !isVedurstofanDataFresh
```

`isGuest` er þegar til staðar sem prop í `FerdalagidClient` (lína 98). Bakendinn (`/api/teskeid/weather/vedurstofan/refresh`) er enn rétt verndarður — þetta er UI-lagfæring eingöngu.

---

### 3. RouteSelectionStep map zoom

**`components/weather/RouteSelectionStep.tsx`**:

- Upphafszoom: `zoom: 6` → `zoom: 5` (sama og `/elta-vedrid`)
- `fitBounds` padding: `{ top: 48, ... }` → `{ top: 32, ... }` (sama og `/elta-vedrid`)

---

### 4. Stale banner texti

**`messages/is.json`**:
```
"vedurstofanDataStale": "Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega"
```

**`messages/en.json`**:
```
"vedurstofanDataStale": "New data from Veðurstofan should hopefully be available soon"
```

---

### 5. Tests uppfærðar

**`lib/__tests__/chat-access.test.ts`**:

- Uppfært test: "returns allowed when WEATHER_PULSE_ACCESS_REQUIRED=false (graduated)" → split í tvö tests:
  - Eitt fyrir tómt/absent (`''`)
  - Eitt fyrir `'false'` (non-true treated as graduated)
- Uppfærð lýsing og comment á provider-required test til að endurspegla nýtt mynstur

---

## Vercel env-samningur eftir þessar breytingar

Til að opna Veðurpúls öllum innskráðum notendum — eyða báðum breytum úr Vercel:

```
# Eyða:
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
WEATHER_PULSE_ACCESS_REQUIRED

# Bæta við ef ekki til staðar:
TESKEID_CHAT_ENABLED=true
```

Redeploya. Eftir það:

- Public: sér Veðurstofan lag, sér pulse preview, sér EKKI "Sækja ný gögn", sér EKKI tóman Veðurpúls
- Innskráðir: geta skrifað í Veðurpúls

---

## Localhost checks fyrir Stebbi

1. Setja `.env.local`:
   ```
   WEATHER_ENABLED=All
   WEATHER_AUTH_ACCESS_REQUIRED=true
   TESKEID_CHAT_ENABLED=true
   ```
   Eyða/hafa ekki til staðar: `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`, `WEATHER_PULSE_ACCESS_REQUIRED`

2. `/vedrid` sem óinnskráður:
   - Veðurstofan getur birst
   - "Sækja ný gögn" sést EKKI
   - Tómur Veðurpúls haus sést EKKI

3. `/vedrid` sem innskráður:
   - Veðurpúls composer birtist á Veðurstofan-spjöldum
   - Ef stale banner birtist: "Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega"

4. Fyrsta skref `/vedrid` (route-selection):
   - Kort er minna inn-zoomað (Iceland context sýnilegur)
   - Eftir að velja leið: route er lesanlegur, ekki yfir-zoomed

5. Setja `WEATHER_PULSE_ACCESS_REQUIRED=true` og endurræsa:
   - Innskráður notandi án `weather-pulse` row á ekki að fá composer

---

## Pending

- Commit og push þegar Stebbi gefur leyfi
- Stebbi þarf að eyða `WEATHER_PULSE_ACCESS_REQUIRED` úr Vercel (ef til staðar) og redeploya
- Low (v290): unit tests fyrir `/access` endpoint
- Low (v291): extract reusable ChatPreviewWithComposer core (deferred)
- "Sjá fleiri skilaboð" á travel route cards þegar route state er URL-backed (deferred)
- Phase 4B.2: station/weather context á full pulse route (deferred)

## Óvissa

- Tests voru ekki keyrðar — Stebbi keyrir þær
- Ég sá ekki alla kóða í `FerdalagidClient.tsx` — einungis línur kringum `showVedurstofanRefreshButton`. Mögulegt að `isGuest` sé líka notað á fleiri stöðum í skránni sem þyrftu skoðun ef Stebbi breytir prop-heiti eða hegðun.
