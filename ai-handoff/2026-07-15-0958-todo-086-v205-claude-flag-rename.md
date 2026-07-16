# Handoff: v205 — flag rename to access-required model

Created: 2026-07-15 10:00
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Hvað var gert

Codex v205 óskaði eftir endurnöfnun á weather flaggum til að nöfnin lýsi hegðuninni betur.

---

## Breytingar á flaggum

### `vedrid` — `WEATHER_FLAG` → `WEATHER_AUTH_ACCESS_REQUIRED`

| Var | Merking |
|-----|---------|
| `WEATHER_AUTH_ACCESS_REQUIRED=true` | per-user gát (krefst `feature_access` row) |
| `WEATHER_AUTH_ACCESS_REQUIRED=false` eða ósett | opið fyrir alla innskráða (graduation path) |
| `WEATHER_FLAG=true` (legacy) | virkar enn, jafngildi `AUTH_ACCESS_REQUIRED=true` |

Kóðinn:
```ts
const weatherAuthAccessRequired =
  process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true' ||
  process.env.WEATHER_FLAG === 'true'
if (!weatherAuthAccessRequired) return true
return checkPerUserAccess(email, 'vedrid')
```

### `weather-provider-vedurstofan` — `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` → `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`

| Var | Merking |
|-----|---------|
| Ósett eða `true` | per-user gát (sjálfgefið restricted) |
| `false` | opið fyrir alla veðurnotendur (graduation path) |
| `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true` (legacy) | virkar enn — jafngildi sjálfgefins restricted |

Kóðinn:
```ts
const vedurstofanAccessRequired =
  process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED !== 'false'
if (!vedurstofanAccessRequired) return true
return checkPerUserAccess(email, 'weather-provider-vedurstofan')
```

**Mikilvægur munur á milli flagganna:**
- `WEATHER_AUTH_ACCESS_REQUIRED`: sjálfgefið OPIÐ (öll innskráð) — þarf `=true` til að loka
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`: sjálfgefið LOKAÐ (per-user) — þarf `=false` til að opna

---

## Skrár breyttar

| Skrá | Breyting |
|------|----------|
| `lib/loans/guard.ts` | `vedrid` og `weather-provider-vedurstofan` blokkar uppfærðar |
| `lib/__tests__/guard.test.ts` | Próf uppfærð og ný próf bætt við (103 passed) |
| `lib/__tests__/weather-travel-api.test.ts` | `delete` fyrir nýtt flagg í `beforeEach` |
| `app/(admin)/admin/page.tsx` | `flagName` props uppfærðar |
| `.env.example` | Ný flagg nöfn með skýringum, legacy skráð |

---

## Typecheck & Próf

```
npx tsc --noEmit        → hreinn
npx vitest run [guard, weather-travel-api] → 103 passed
```

---

## Vercel stillingar eftir þetta

```env
# Krafist
WEATHER_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true          # per-user gát á vedrid
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true  # per-user gát á Veðurstofan
CRON_SECRET=...

# Slökkva / eyða
WEATHER_PUBLIC_ENABLED=false  # eða eyða
WEATHER_AI_ENABLED=false      # eða eyða

# Legacy vars sem hægt er að eyða þegar nýju eru staðfest í Vercel:
# WEATHER_FLAG
# WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
# VEDURSTOFAN_TRAVEL_LAYER_ENABLED  (kóðinn les þetta hvergi)
```

## `.env.local` — þarf handvirka uppfærslu hjá Stebbi

```env
# Skipta út:
WEATHER_FLAG=false  →  WEATHER_AUTH_ACCESS_REQUIRED=false
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true  →  WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
# Eyða:
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
```

---

## Framtíð: Vegagerðin

`.env.example` inniheldur nú placeholder:
```env
# WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true
```
Kóði fyrir Vegagerðin í `guard.ts` er EKKI enn til — það kemur þegar provider kóðinn er útfærður.
