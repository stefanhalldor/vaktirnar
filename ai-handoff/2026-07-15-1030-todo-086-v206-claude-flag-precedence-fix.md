# Handoff: v206 — flag precedence fix og rétt Vercel markmið

Created: 2026-07-15 10:30
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Hvað var lagað (Codex v206 findings)

### 1. Precedence fix: `WEATHER_AUTH_ACCESS_REQUIRED` vinnur yfir legacy `WEATHER_FLAG`

**Vandinn:** Eldra `WEATHER_FLAG=true` í Vercel gat þvingað per-user gát jafnvel þótt Stebbi setti `WEATHER_AUTH_ACCESS_REQUIRED=false` með ráðnum hætti.

**Lagfæring** (`lib/loans/guard.ts`):
```ts
// Áður:
const weatherAuthAccessRequired =
  process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true' ||
  process.env.WEATHER_FLAG === 'true'

// Eftir (nýtt flagg vinnur þegar til staðar):
const weatherAuthAccessRequired =
  process.env.WEATHER_AUTH_ACCESS_REQUIRED !== undefined
    ? process.env.WEATHER_AUTH_ACCESS_REQUIRED === 'true'
    : process.env.WEATHER_FLAG === 'true'
```

Tvö ný próf bætt við:
- `WEATHER_AUTH_ACCESS_REQUIRED=false` + stale `WEATHER_FLAG=true` → opið
- `WEATHER_AUTH_ACCESS_REQUIRED=true` + `WEATHER_FLAG=false` → per-user krafist

### 2. `.env.example` orðalag uppfært

Legacy `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` er **ekki lengur lesið af kóðanum**. Orðalagið lagað til að endurspegla þetta: "remove from Vercel after deploy verification".

### 3. Handoff v205 hafði rangan Vercel target (`WEATHER_PUBLIC_ENABLED=false`)

Stebbi clarified: public/guest users á að sjá MET/Yr. Rétt gildi er `WEATHER_PUBLIC_ENABLED=true` (sjá Vercel checklist hér að neðan).

---

## Skrár breyttar

| Skrá | Breyting |
|------|----------|
| `lib/loans/guard.ts` | Precedence fix: nýtt flagg vinnur yfir legacy þegar sett |
| `lib/__tests__/guard.test.ts` | 2 ný precedence próf |
| `.env.example` | Legacy provider var orðalag lagað |

---

## Typecheck & Próf

```
npx tsc --noEmit        → hreinn
npx vitest run [guard, weather-travel-api] → 105 passed
```

---

## Rétt Vercel Production target

```env
AUTH_MVP_ENABLED=true

WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true               # ← opið fyrir gestnotendur (MET/Yr)
WEATHER_AUTH_ACCESS_REQUIRED=true         # ← per-user gát á /auth-mvp/vedrid

WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true

WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false

METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://teskeid.is
```

**Eyða úr Vercel eftir að deploy er staðfestur:**
```
WEATHER_FLAG                          (superseded af WEATHER_AUTH_ACCESS_REQUIRED)
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED  (lesið ekki af kóðanum lengur)
VEDURSTOFAN_TRAVEL_LAYER_ENABLED      (var aldrei lesið af kóðanum)
```

---

## `.env.local` — handvirkt hjá Stebbi

```env
# Skipta út:
WEATHER_FLAG=false                        →  WEATHER_AUTH_ACCESS_REQUIRED=false
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true →  WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
# Bæta við:
WEATHER_PUBLIC_ENABLED=true
# Eyða:
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
```
