# Handoff: v209 — public API fix plan + env checklist

Created: 2026-07-15 13:00
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Blocker: innskráðir notendur án `vedrid` blocked á public `/vedrid`

Codex v209 fann: routes og final-weather API-in meðhöndla innskráða notendur alltaf í gegnum `vedrid` gát. Ef notandi er innskráður en á ekki `vedrid` row → 404, jafnvel á public `/vedrid` síðunni.

---

## Fix-útlínur (til framkvæmdar eftir localhost staðfestingu)

**Breytingarmynstur á öllum þremur routes er það sama.**

### Núverandi lógík (vandinn):

```ts
if (user?.email) {
  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })  // ← VANDINN
  }
} else {
  // guest path
  if (process.env.WEATHER_PUBLIC_ENABLED !== 'true') { return 401 }
  // rate limit...
}
```

### Lagfærð lógík:

```ts
const hasVedrid = user?.email
  ? await checkFeatureAccess(user.id, user.email, 'vedrid').catch(() => false)
  : false

if (!hasVedrid) {
  // Innskráðir notendur án vedrid, og gestnotendur: fara í public path
  if (process.env.WEATHER_PUBLIC_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Rate limiting á allt public traffic (guest OG authenticated-without-vedrid)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? request.headers.get('x-real-ip')?.trim()
           ?? ''
  const withinLimit = await checkWeatherGuestRateLimit(ip)
  if (!withinLimit) { /* ... rate_limited_guest */ }
}

const actor = hasVedrid ? 'authenticated' : 'public'
const userId = user?.id ?? null
```

**Þetta þýðir:**
- Innskráður með `vedrid` → `authenticated` path, engar takmarkanir
- Innskráður án `vedrid` → `public` path, rate limited
- Óinnskráður → `public` path, rate limited (eins og í dag)

### Skrár sem þarf að breyta:

| Skrá | Breyting |
|------|----------|
| `app/api/teskeid/weather/travel/routes/route.ts` | Línur 39-64: auth check fix |
| `app/api/teskeid/weather/travel/route.ts` | Línur 182-196: auth check fix |
| `app/api/place/search/route.ts` | Línur 33-43: auth check fix (sjá athugasemd) |

**Athugasemd um place search:** `/api/place/search` er server-side fallback þegar Google Browser Places bilnar. Þar er nú þegar rate limiting (30 req/60s per IP). Opna hana fyrir public path með `WEATHER_PUBLIC_ENABLED=true` er rétt — með sömu rate limiting. Google geocoding kostnaður er lágur við þessar takmarkanir.

### Veðurstofan routes — breyta EKKI:
`/api/teskeid/weather/vedurstofan/freshness` og `/api/teskeid/weather/vedurstofan/refresh` eiga að vera áfram á bak við `weather-provider-vedurstofan` gát. Þær routes nota aðra gát og þarf ekki að breyta.

---

## Localhost prófanir — hvað á að gerast

### Env stillingar (staðfest):

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false
```

### Prófanir:

| # | Aðstæður | Síða | Vænt |
|---|----------|------|------|
| 1 | Óinnskráður | `/vedrid` | MET/Yr virkar ✓ |
| 2 | Innskráður **án** `vedrid` | `/vedrid` | **Bilnar í dag** (404 frá API) |
| 2b | Innskráður **án** `vedrid` | `/vedrid` | MET/Yr virkar eftir fix ✓ |
| 3 | Innskráður **án** `vedrid` | `/auth-mvp/vedrid` | Blocked/redirect ✓ |
| 4 | Innskráður með `vedrid` | `/auth-mvp/vedrid` | Opnast með MET/Yr ✓ |
| 5 | Með `vedrid`, án `weather-provider-vedurstofan` | `/auth-mvp/vedrid` | Veðurstofan layer falið ✓ |
| 6 | Með báðar rows | `/auth-mvp/vedrid` | Veðurstofan layer sýnilegt ✓ |

Prófun #2 er lykilstaðfestingin á blocker. Ef hún bilnar eins og búist er við, þá er fix-útlínan hér að ofan rétt plan.

---

## Vercel Production target (staðfest)

```env
AUTH_MVP_ENABLED=true

WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true

WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true

WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false

METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://teskeid.is
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...
```

**Eyða úr Vercel eftir deploy verification:**
```
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

---

## Supabase forsendur (staðfest)

- SQL74, SQL75, SQL76, SQL77 eru búin að keyra
- `feature_access` CHECK constraint inniheldur `weather-provider-vedurstofan` (SQL76)
- `vedurstofan_stations` er seeded
- Stebbi og prófunarnotendur hafa rétt rows

---

## Næstu skref

1. Stebbi keyrir localhost prófanir
2. Staðfestir prófun #2 bilnar (eða virkar ef hegðun er önnur en búist er við)
3. Ef blocker staðfestist: gefur framkvæmdarleyfi til að laga þrjár routes
4. Claude Code framkvæmir fix, keyrir vitest og typecheck
5. Codex rýnir og Stebbi staðfestir á localhost
6. Release

---

## Athugasemd: Provider graduation í framtíð

Þegar `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` er sett í production:
- Veðurstofan layer opnast fyrir alla `vedrid` notendur
- `/api/teskeid/weather/vedurstofan/freshness` og `/refresh` opnast líka → manual refresh verður aðgengilegt öllum `vedrid` notendum, ekki bara testers
- Þarf að ákveða þetta meðvitað áður en það er gert
