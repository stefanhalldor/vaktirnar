# TODO 086 - v054 prerelease handoff: elta-vedrid gate + v048 i18n + migration 73

Created: 2026-07-12 23:02
Timezone: Atlantic/Reykjavik
Author: Claude
Type: Prerelease handoff for Codex review
Inputs: v051, v052, v053 (Codex recommendations followed in full)

## Samantekt

Útfærð öll ráðleggingar Codex v051/v053. Engin commit, push, SQL keyrð.

## Skrár breyttar

### `lib/loans/guard.ts`
Bætt við `elta-vedrid` case á eftir `ferdalagid`:
- Kill-switch: `WEATHER_ENABLED !== 'true'` => false
- Strict flag: `WEATHER_ELTA_VEDRID_FLAG !== 'true'` => false (engin graduation path)
- Per-user: `checkPerUserAccess(email, 'elta-vedrid')`

### `app/api/admin/feature-access/route.ts`
`ALLOWED_FEATURES` uppfært: bætt við `'elta-vedrid'`.

### `app/(admin)/admin/page.tsx`
- `FeatureAccessSectionProps.featureKey` type uppfært: bætt við `'elta-vedrid'`
- Nýr `FeatureAccessSection` hlutir bættur við: `featureKey="elta-vedrid"`,
  `heading="Elta veðrið-aðgangur"`, `flagName="WEATHER_ELTA_VEDRID_FLAG"`

### `.env.example`
Bætt við `WEATHER_ELTA_VEDRID_FLAG` komment (kommentað út, off by default).

### `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
Bætt við öðru guard call eftir `'vedrid'` guard:
```ts
await guardFeatureAccess(user.email!, 'vedrid')
await guardFeatureAccess(user.email!, 'elta-vedrid')
```

### `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- Bætt við `WEATHER_ELTA_VEDRID_FLAG` env check (skilar 404 ef ekki 'true')
- Tvöfaldur feature access check (báðir þurfa að vera true):
```ts
const hasVedrid = await checkFeatureAccess(user.id, user.email, 'vedrid')
const hasEltaVedrid = await checkFeatureAccess(user.id, user.email, 'elta-vedrid')
if (!hasVedrid || !hasEltaVedrid) return 404
```

### `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
v048 i18n fix: töfluhausa og "Parse errors" texti notir nú `t()` í stað hardcoded.

### `messages/is.json` og `messages/en.json`
Bætt við í `eltaVedrid` namespace:
- `colTime`, `colWind`, `colDirection`, `colPrecipitation`, `colTemp`, `colWeather`
- `parseErrors` (með `{count}` parameter)

### `sql/73_feature_access_elta_vedrid.sql` (ný skrá - EKKI keyrð)
Widen constraint til:
```sql
CHECK (feature_key IN ('umonnun', 'tengsl', 'facebook-oauth', 'vedrid', 'ferdalagid', 'elta-vedrid'))
```
Inniheldur `ferdalagid` (lagar eyðunguna frá migration 68) og `elta-vedrid` (nýtt).
Keyrð EKKI - bíður sér Supabase leyfis frá Stebbi.

### `lib/__tests__/guard.test.ts`
Bætt við 3 describe blocks (19 ný próf):
- `checkFeatureAccess — elta-vedrid (kill-switch and strict flag)` (4 próf)
- `checkFeatureAccess — elta-vedrid (per-user FLAG=true)` (4 próf)
- `guardFeatureAccess — elta-vedrid` (4 próf)

### `lib/__tests__/feature-access-api.test.ts`
Bætt við `feature-access API — elta-vedrid key` describe block (4 ný próf).

### `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`
- `WEATHER_ELTA_VEDRID_FLAG = 'true'` bætt við `beforeEach`
- 2 ný próf fyrir flag gate (flag=false, flag missing => 404)
- "no vedrid access" próf uppfært til að nota `mockResolvedValueOnce` pattern
- Bætt við "lacks elta-vedrid access" próf (vedrid=true, elta-vedrid=false => 404)

## Prófaniðurstöður

```
npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/weather-vedurstofan-server.test.ts
```

**4 test files, 140 tests, all passed.**

```
npm.cmd run type-check
```
Engar villur.

```
npm.cmd run lint
```
Engar villur. Einungis þekktar warnings í `app/s/[sessionId]/page.tsx`,
`components/landing/Avatar.tsx`, og `components/weather/TravelAuditMap.tsx`
(óbreyttar, ekki þetta verk).

## Hvað var EKKI gert

- Keyrt SQL migration (bíður sér leyfis)
- Live probe á xmlweather.vedur.is (bíður sér leyfis)
- Commit, push, deploy
- Veðurstofan sett aftur í RouteWeatherPointDetailCard
- Route verdict, heatmap, MET/Yr sampling breytt

## Localhost checks for Stebbi

1. User með `vedrid` eingöngu getur **ekki** opnað `/auth-mvp/vedrid/elta-vedrid`
   (redirect til `/`).
2. User með `elta-vedrid` eingöngu getur **ekki** opnað hana heldur
   (báðir gates þurfa að vera uppfylltir).
3. User með bæði `vedrid` og `elta-vedrid` getur opnað hana.
4. Gestur getur ekki opnað hana.
5. `/api/teskeid/weather/vedurstofan/stations` skilar 404 ef `WEATHER_ELTA_VEDRID_FLAG`
   er ekki 'true' í `.env.local`.
6. API skilar 404 ef notandi hefur `vedrid` en ekki `elta-vedrid` (og öfugt).
7. Foreldrasíðan `/auth-mvp/vedrid` virkar áfram fyrir venjulega `vedrid` notendur.
8. Töfluhausa í stöðvarspá sýna Icelandic texta (Tími, Vindur, Átt o.s.frv.).
9. "Parse errors" text er á Íslensku (ekki hardcoded English).
10. Ef migration 73 hefur **ekki** verið keyrt á þeirri Supabase sem `.env.local`
    vísar á, munu admin grants fyrir `elta-vedrid` mistakast vegna CHECK constraint.
    Þetta er væntanlegt - migration þarf Stebbi's sér leyfi.
11. `.env.local` þarf `WEATHER_ELTA_VEDRID_FLAG=true` til að page/API séu aðgengileg.

## Opnar spurningar sem Codex getur skoðað

- Source discovery (D): má Claude Code gera eitt read-only HTTP köll á
  `xmlweather.vedur.is` til að telja heildarstöðvafjölda? Codex v053 sagði "já
  en fyrst official docs". Claude Code hefur ekki skoðað official docs ennþá.
  Þetta er sér spurning sem Stebbi þarf að svara.

- `ferdalagid` í SQL constraint: migration 73 inniheldur `ferdalagid`. Ef Stebbi
  vill einungis `elta-vedrid` í migration 73, þarf leiðréttingu áður en keyrsla.
