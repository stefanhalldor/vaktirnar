# 2026-07-16 08:04 - TODO-086 v309 - Claude: v308 done, prerelease

Created: 2026-07-16 08:04
Timezone: Atlantic/Reykjavik

Commit: ekki enn — Stebbi prófar localhost fyrst.

## Breytingar

### 1. Full pulse page — fjarlægðar gamlar per-user varnir

**`app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`**:

- Fjarlægt: `guardFeatureAccess(user.email!, 'vedrid')` og `guardFeatureAccess(user.email!, 'elta-vedrid')`
- Fjarlægt: `import { guardFeatureAccess } from '@/lib/loans/guard'`
- Eina aðgangstakmörkun: `checkChatAccess(user)` (session + chat enabled + weather shell + provider + pulse)
- Redirect við access denied: `/auth-mvp/vedrid` (var `/auth-mvp/vedrid/elta-vedrid`)

**Áhrif:** Notendur sem hafa Veðurstofan provider aðgang (graduated) geta nú opnað full pulse síðu beint, án `vedrid` eða `elta-vedrid` feature rows.

---

### 2. Route-result persist og restore — endurskoðað

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**:

**Nýtt við constants:**
```ts
const ROUTE_RESTORE_SCHEMA_VERSION = 1
const ROUTE_RESTORE_TTL_MS = 30 * 60 * 1000 // 30 mínútur

function isValidRouteRestorePayload(data: unknown): boolean { ... }
```

Validator krefst: `schemaVersion === 1`, `step === 'result'`, gilt `result`/`origin`/`destination`, `savedAtIso` sem er < 30 mín gamall.

**Restore effect (mount only):**
- Triggar **alltaf** á mount — ekki lengur bundið við `?restore=1`
- Staðfestir og TTL-skoðar payload áður en state er sett
- Corrupt/stale payload: fjarlægt úr sessionStorage, fresh wizard
- Viðbótar fields endurheimtar: `selectedReturnHeatmapIdx`, `outboundVisibleStatuses` (Array → Set), `returnVisibleStatuses` (Array → Set), `submittedThresholds`, `ferrySelection`, `userExplicitSlot`, `routeFallback`
- Hreinsar `?restore=1` úr URL ef til staðar (pulse-login flow)
- **Eyðir EKKI** sessionStorage eftir restore — save effect uppfærir `savedAtIso` áfram

**Save effect:**
- Bætti við `schemaVersion` og `savedAtIso: new Date().toISOString()`
- Viðbótar fields: `selectedReturnHeatmapIdx`, `outboundVisibleStatuses` (Set → Array), `returnVisibleStatuses` (Set → Array), `submittedThresholds`, `ferrySelection`, `userExplicitSlot`, `routeFallback`
- Uppfærir sessionStorage stöðugt á meðan result er sýnt (dep array uppfærður)

**`vedurstofanReturnTo`:**
- Breytt úr `/auth-mvp/vedrid?restore=1` í `/auth-mvp/vedrid` (restore er sjálfvirkt)

---

### 3. `resolveSafeLoginNext` — nákvæmari `/vedrid` stigi

**`lib/auth/loginNext.ts`**:

Breytt frá lausum `startsWith('/vedrid')` yfir í nákvæmt markgrensafall:
- `/vedrid` nákvæmlega → leyft
- `/vedrid/`, `/vedrid?`, `/vedrid#` → leyft
- `/vedrid-anything`, `/vedridar`, `/vedridX` → hafnað

---

### 4. Tests

**`lib/__tests__/loginNext.test.ts`** — 3 nýjum boundary tests bætt við:
- `/vedrid-fake` → null
- `/vedridar` → null
- `/vedridX` → null
- `/vedrid/` → leyft

**149 tests passing. Type-check clean.**

---

## Localhost checks fyrir Stebbi

Env:
```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
```
(WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED og WEATHER_PULSE_ACCESS_REQUIRED fjarverandi)

1. `/vedrid` óinnskráður — reikna leið með Veðurstofan sýnilegan
2. Á Veðurstofan spjaldi: smella á "Sjá fleiri skilaboð eða segja frá aðstæðum" → ætti að opna `/innskraning?next=/auth-mvp/vedrid/puls/stod/...`
3. Klára login → ætti að landa á full pulse stöðina
4. Smella "Til baka" → opnar `/auth-mvp/vedrid` → niðurstöður endurheimt sjálfkrafa (án `?restore=1`)
5. Þegar á result screen: endurhlaða síðuna (F5/Cmd+R) → **sömu niðurstöður eiga að vera til staðar** (origin, destination, Veðurstofan spjöld, valið brottfarartímahlot, fílterstaða)
6. Starta nýja leið → reikna → sessionStorage uppfærist með nýjum niðurstöðum → endurhlaða → nýjar niðurstöður sést
7. `/innskraning?next=/vedrid-fake` sem innskráður → á að redirecta á `/auth-mvp/heim` (ekki `/vedrid-fake`)
8. `/innskraning?next=https://evil.example` → á að redirecta á `/auth-mvp/heim`

---

## Þekktar takmarkanir

- First-time notendur (incomplete profile) fara í `/auth-mvp/minn-profill` og `nextHref` er ekki varðveitt þangað. Þeir lenda á `/auth-mvp/heim` eftir profile-skil. Fylgt verður eftir þegar nauðsynlegt.
- `routeOptions` (leiðarval) eru ekki geymdar — notandi sér enn niðurstöður en gæti ekki skipt um leið án þess að endurreikna.
- Draw/detail drawer staða er ekki geymd (compare drawer o.fl.) — drawers byrja lokuð eftir restore.

## Pending

- Commit og push þegar Stebbi staðfestir localhost
- Low (v290): unit tests fyrir `/access` endpoint
- Phase 4B.2: station/weather context á full pulse route
