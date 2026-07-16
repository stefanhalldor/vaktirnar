# Handoff: v204 flag review - Vercel env vars staðfesting

Created: 2026-07-15 09:30
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Tilgangur

Codex v204 óskaði eftir staðfestingu á því hvort flögg-lýsingarnar í handoffinum séu nákvæmar svo Stebbi geti stillt Vercel rétt. Claude las kóðann og ber saman við v204-lýsingar.

Engrar kóðabreytingar var þörf. Þetta er eingöngu rýni.

---

## Niðurstaða: Codex v204 er nákvæmt

Allar flögg-lýsingar í Codex v204 standast samanburð við `lib/loans/guard.ts`, `app/auth-mvp/vedrid/page.tsx`, `app/vedrid/page.tsx` og `app/api/teskeid/weather/travel/route.ts`.

---

## Einn mikilvægur munur sem Codex nefndi ekki sérstaklega

### `vedrid` hefur "graduation path" - hin tvö hafa það ekki

`vedrid` (guard.ts:70-74):
```ts
if (process.env.WEATHER_ENABLED !== 'true') return false
if (process.env.WEATHER_FLAG !== 'true') return true   // ← opið ef FLAG vantar
return checkPerUserAccess(email, 'vedrid')
```

`ferdalagid` (guard.ts:75-79) og `elta-vedrid` (guard.ts:80-84):
```ts
if (process.env.WEATHER_ENABLED !== 'true') return false
if (process.env.WEATHER_TRIP_FLAG !== 'true') return false   // ← lokað ef FLAG vantar
return checkPerUserAccess(email, 'ferdalagid')
```

`weather-provider-vedurstofan` (guard.ts:85-89):
```ts
if (process.env.WEATHER_ENABLED !== 'true') return false
if (process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED !== 'true') return false   // ← lokað
return checkPerUserAccess(email, 'weather-provider-vedurstofan')
```

| Flagg | Ef vantar/false | Ef = true |
|-------|-----------------|-----------|
| `WEATHER_FLAG` | Allir innskráðir fá `vedrid` | Per-user gát |
| `WEATHER_TRIP_FLAG` | Enginn fær `ferdalagid` | Per-user gát |
| `WEATHER_ELTA_VEDRID_FLAG` | Enginn fær `elta-vedrid` | Per-user gát |
| `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED` | Enginn fær vedurstofan | Per-user gát |

Hegðun `ferdalagid`, `elta-vedrid` og `weather-provider-vedurstofan` er öruggari - enginn kemst inn nema flaggið sé sett og per-user row til staðar.

---

## Vercel stillingar sem þarf - staðfest

### Krafist

```env
WEATHER_ENABLED=true
WEATHER_FLAG=true
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
CRON_SECRET=...
```

### Slökkva eða eyða

```env
WEATHER_PUBLIC_ENABLED=false        # eða eyða - lokar /vedrid og guest API path
WEATHER_AI_ENABLED=false            # eða eyða
# VEDURSTOFAN_TRAVEL_LAYER_ENABLED  # EYÐA - kóðinn notar þetta flagg hvergi
```

### Optional - aðeins ef Stebbi vill virkt

```env
WEATHER_TRIP_FLAG=true              # opnar ferdalagid (krefst feature_access row)
WEATHER_ELTA_VEDRID_FLAG=true       # opnar elta-vedrid (krefst feature_access row)
```

---

## Public/guest staðfest

`app/vedrid/page.tsx` athugar þrjú skilyrði:
```ts
if (AUTH_MVP_ENABLED !== 'true' || WEATHER_ENABLED !== 'true' || WEATHER_PUBLIC_ENABLED !== 'true') redirect('/')
```

`travel/route.ts` API athugar:
```ts
if (process.env.WEATHER_PUBLIC_ENABLED !== 'true') return 401
```

Bæði lokuð þegar `WEATHER_PUBLIC_ENABLED` er ósett eða `false`. Engin leið fyrir gestir inn.

---

## `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` staðfest - eyða

Codex sagði að engar kóðatilvísanir séu til. Claude staðfestir: hvorki `travel/route.ts` né `guard.ts` notar þetta flagg. Hægt að eyða úr Vercel án áhættu.

---

## Supabase feature_access rows

Til að Stebbi/prófunarnotendur sjái allt:

```
vedrid                        -- krafist fyrir grunnveður
weather-provider-vedurstofan  -- krafist fyrir Veðurstofan layer
elta-vedrid                   -- optional, fyrir validation view
ferdalagid                    -- optional, fyrir trip affordance
```

---

## Engar kóðabreytingar

Þetta handoff er eingöngu staðfesting. Engar skrár voru breyttar.
