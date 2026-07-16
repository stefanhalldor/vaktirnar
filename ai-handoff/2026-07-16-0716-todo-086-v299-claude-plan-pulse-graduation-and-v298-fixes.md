# 2026-07-16 07:20 - TODO-086 v299 - Claude plan: pulse graduation + v298 fixes

Created: 2026-07-16 07:20
Timezone: Atlantic/Reykjavik
Related TODO: todo-086

Handoff for Codex review before implementation.

## Bakgrunnur

v297 skipaði graduation-mynstri fyrir `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`:
- `=== 'true'` → per-user gátt virk
- fjarverandi/eytt → opið öllum veðurnotendum

Stebbi vill sama mynstur fyrir `WEATHER_PULSE_ACCESS_REQUIRED`. Í dag:
- `=== 'false'` → sleppa per-user gátt (opið)
- fjarverandi/'true' → per-user gátt (lokuð)

Þetta er öfugt við Veðurstofan-myndstrið og þýðir að eyða breytu úr Vercel lokar Veðurpúls (ekki opnar hana).

Stebbi vill: eyða breytu = opið. Setja `=== 'true'` = per-user gátt.

---

## Breytingar fyrirhugaðar

### 1. `WEATHER_PULSE_ACCESS_REQUIRED` graduation flip

**Tvær skrár þurfa breytingu:**

#### `lib/loans/guard.ts` (lína 110-113)

Núverandi:
```ts
// WEATHER_PULSE_ACCESS_REQUIRED=false: skip per-user gate (still requires checkChatAccess).
// Default (unset or 'true'): per-user gate via feature_access row.
if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return true
return checkPerUserAccess(email, 'weather-pulse')
```

Eftir:
```ts
// Graduation pattern: per-user gate active only when var is explicitly 'true'.
// Unset (delete from Vercel) = open to all Veðurstofan-provider users.
// WEATHER_PULSE_ACCESS_REQUIRED=true keeps per-user gate active.
const pulseAccessRequired =
  process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'true'
if (!pulseAccessRequired) return true
return checkPerUserAccess(email, 'weather-pulse')
```

#### `lib/chat/access.server.ts` (lína 39-44)

Núverandi:
```ts
// WEATHER_PULSE_ACCESS_REQUIRED=false graduates Veðurpúls to all Veðurstofan-provider users.
// Default (unset or true) keeps it per-user gated.
if (process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'false') return 'allowed'

const hasPulse = await checkFeatureAccess(user.id, user.email, 'weather-pulse').catch(() => false)
if (!hasPulse) return 'no-pulse'
```

Eftir:
```ts
// Graduation pattern: per-user gate active only when WEATHER_PULSE_ACCESS_REQUIRED=true.
// Unset (delete from Vercel) = open to all Veðurstofan-provider users.
const pulseAccessRequired =
  process.env.WEATHER_PULSE_ACCESS_REQUIRED === 'true'
if (!pulseAccessRequired) return 'allowed'

const hasPulse = await checkFeatureAccess(user.id, user.email, 'weather-pulse').catch(() => false)
if (!hasPulse) return 'no-pulse'
```

**Áhrifaríki breytingarinnar:**

| Staða | Áður | Eftir |
|-------|------|-------|
| `WEATHER_PULSE_ACCESS_REQUIRED` fjarverandi | per-user gátt virk | open to all (graduation) |
| `=== 'false'` | open | virkar ekki / sama og absent |
| `=== 'true'` | per-user gátt virk | per-user gátt virk |

Eftir breytingu: Stebbi getur eytt breytu úr Vercel og redeployað — Veðurpúls opnast öllum innskráðum notendum með Veðurstofan-aðgang.

---

### 2. Fela "Sækja ný gögn" fyrir public notendur (v298 High)

`app/auth-mvp/vedrid/FerdalagidClient.tsx` lín 989-997 reiknar `showVedurstofanRefreshButton` án auth-athugunar. Bakendinn (`/api/teskeid/weather/vedurstofan/refresh/route.ts`) synjar öllum public notendum.

Þarf að finna hvar `isGuest` (eða sambærilegt) er þegar til staðar í `FerdalagidClient` og bæta því við skilyrðið:

```ts
// Leita að: const showVedurstofanRefreshButton = ...
// Bæta við: && !isGuest (eða !user, eftir því hvað er til staðar)
```

Ef `isGuest`/`user` er ekki beint aðgengilegt á þessum stað þarf að kanna hvað er notað til að ákvarða stöðu notanda í þessum íhlut.

---

### 3. RouteSelectionStep map zoom (v298 Medium)

`components/weather/RouteSelectionStep.tsx:126-129` notar `zoom: 6` við frumstillingu. Þarf að nota sömu Iceland-overview stillingar og `/elta-vedrid` notar.

Þarf að kanna:
- Hvað eru nákvæmar stillingar í `/elta-vedrid` kortinu
- Hvort `fitBounds` padding-ið (`{ top: 48, bottom: 48, left: 48, right: 48 }`) sé viðeigandi á mobile

---

## Vercel env-samningur eftir allar breytingar

```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
# WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED absent/eytt = Veðurstofan open
TESKEID_CHAT_ENABLED=true
# WEATHER_PULSE_ACCESS_REQUIRED absent/eytt = Veðurpúls open (eftir breytingu)
```

Public notendur:
- sjá Veðurstofan lag
- sjá pulse preview (ef til eru skilaboð)
- sjá EKKI "Sækja ný gögn" takka (eftir fix #2)
- sjá EKKI tóman Veðurpúls haus (already fixed í v297)
- geta EKKI skrifað í Veðurpúls

Innskráðir notendur:
- sjá Veðurstofan lag
- geta skrifað í Veðurpúls (eftir graduation fix)

---

## Spurningar til Codex

1. Eru báðar staðirnar (`guard.ts` og `access.server.ts`) þær einu þar sem `WEATHER_PULSE_ACCESS_REQUIRED` er lesinn? Eða eru fleiri staðir?

2. Í `FerdalagidClient.tsx`: hvaða auth-state er til staðar á þeim stað þar sem `showVedurstofanRefreshButton` er reiknað? Er `isGuest`, `user`, eða eitthvað annað notað annars staðar í þeim íhlut?

3. Fyrir RouteSelectionStep zoom: hverjar eru nákvæmar Iceland-overview stillingar í kortinu á `/elta-vedrid` (`VedurstofanStationExplorerClient.tsx` eða sambærilegt)? Og er `zoom: 6` með `fitBounds` í RouteSelectionStep að búa til yfir-zoom á mobile þegar báðir punktar eru valdir?

4. Er einhver önnur kóði sem bíður eftir `WEATHER_PULSE_ACCESS_REQUIRED === 'false'` (t.d. í tests eða öðrum route handlers) sem þyrfti líka uppfærslu?

---

## Óvissa

- Ég las `guard.ts`, `access.server.ts` og v298 Codex handoff en las ekki `FerdalagidClient.tsx` á þessum stað.
- Ég las ekki `RouteSelectionStep.tsx` — veit zoom-gildin frá v298 Codex lýsingu en ekki nákvæmar Iceland-overview stillingar.
- Engar breytingar framkvæmdar. Þetta er plan eingöngu.
