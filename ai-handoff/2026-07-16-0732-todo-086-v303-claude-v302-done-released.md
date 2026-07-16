# 2026-07-16 07:32 - TODO-086 v303 - Claude: v302 done, released

Created: 2026-07-16 07:32
Timezone: Atlantic/Reykjavik

Commit: `e4a8831` (pushed to main, Vercel build Ready 49s)

## Breytingar

### 1. `WEATHER_PULSE_ACCESS_REQUIRED` graduation flip

**`lib/loans/guard.ts`**:
```ts
// Áður: if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return true
// Eftir:
const pulseAccessRequired = process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'true'
if (!pulseAccessRequired) return true
```

**`lib/chat/access.server.ts`**:
```ts
// Áður: if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return 'allowed'
// Eftir:
if (process.env.WEATHER_PULSE_ACCESS_REQUIRED !== 'true') return 'allowed'
```

### 2. Fela "Sækja ný gögn" fyrir public notendur

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**:
```ts
const showVedurstofanRefreshButton = !isGuest
  && !isVedurstofanDataFresh
  && ...
```

### 3. RouteSelectionStep map zoom

**`components/weather/RouteSelectionStep.tsx`**:
- `zoom: 6` → `zoom: 5`
- `fitBounds` padding: `48` → `32`

### 4. Stale banner texti

**`messages/is.json`**: `"vedurstofanDataStale": "Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega"`
**`messages/en.json`**: `"vedurstofanDataStale": "New data from Veðurstofan should hopefully be available soon"`

### 5. Tests

**`lib/__tests__/guard.test.ts`**:
- Lagfærðar 5 gamlar Veðurstofan provider tests sem gáfu sér `absent = restricted` (rangt eftir v297)
- Bætti við nýjum `describe` blokk: 9 tests fyrir `weather-pulse` í `checkFeatureAccess`

**`lib/__tests__/chat-access.test.ts`**:
- Uppfært tests til að endurspegla `!== 'true'` graduation: absent/`false`/eitthvað annað = open

Allar 116 tests passing. Type-check clean.

---

## Vercel env-samningur (gildandi)

Til að opna Veðurstofan og Veðurpúls öllum innskráðum notendum:

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
```

Eyða/hafa ekki til staðar:
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`
- `WEATHER_PULSE_ACCESS_REQUIRED`

Þá redeploya.

---

## Localhost checks fyrir Stebbi

1. Env: sjá ofan. Eyða báðum access vars.
2. `/vedrid` óinnskráður: Veðurstofan getur birst, "Sækja ný gögn" sést EKKI, tómur púlshaus sést EKKI.
3. `/auth-mvp/vedrid` innskráður: Veðurpúls composer á Veðurstofan spjöldum. Stale banner: "Ný gögn frá Veðurstofunni verða vonandi aðgengileg fljótlega".
4. Fyrsta skref `/vedrid`: kort sýnir Island context (minna inn-zoomað).
5. Setja `WEATHER_PULSE_ACCESS_REQUIRED=true`: innskráður notandi án `weather-pulse` row fær ekki composer.

---

## Pending

- Low (v290): unit tests fyrir `/access` endpoint
- Low (v291): extract reusable ChatPreviewWithComposer core (deferred)
- "Sjá fleiri skilaboð" á travel route cards þegar route state er URL-backed (deferred)
- Phase 4B.2: station/weather context á full pulse route (deferred)
