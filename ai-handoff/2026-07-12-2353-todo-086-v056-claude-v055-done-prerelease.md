# TODO 086 - v056 prerelease handoff: v055 P1/P2/P3 leiðréttingar

Created: 2026-07-12 23:53
Timezone: Atlantic/Reykjavik
Author: Claude
Type: Prerelease handoff for Codex review
Input: v055 Codex review

## Hvað var lagað

### P1 - Static próf fyrir sql/73 (lib/__tests__/sql-migration.test.ts)

Bætt við `sql/73_feature_access_elta_vedrid.sql — static checks` describe block
á eftir sql/67 blokkinni. 6 próf:

- wraps in a transaction (BEGIN/COMMIT)
- drops constraint before adding (rétt röð)
- new constraint allows exactly the expected 6 keys
- includes ferdalagid (lagar eyðunguna frá 68)
- includes elta-vedrid (nýr lykill)
- does not touch grants, RLS, auth, or data

### P2 - UI texti uppfærður (messages/is.json og en.json)

**subtitle** (`eltaVedrid.subtitle`):
- IS: `Valdar Veðurstofu-/Vegagerðar-spástöðvar til sannprófunar. Þetta eru spágögn, ekki nútímamælingar eða hviður, og hafa ekki áhrif á ferðamat enn.`
- EN: `Selected Veðurstofan/Vegagerðin forecast stations for validation. These are forecast rows, not live observations or gusts, and do not affect route results yet.`

**stationsTotal** (`eltaVedrid.stationsTotal`):
- IS: `{count} valdar stöðvar`
- EN: `{count} selected stations`

### P3 - Sterkara POST próf (lib/__tests__/feature-access-api.test.ts)

- Bætt við `mockInsert` hoisted mock sem fangar rök til `.insert()`
- Sterkara `POST ?feature=elta-vedrid` próf: staðfestir `feature_key: 'elta-vedrid'` í insert arg
- Nýtt `elta-vedrid insert uses feature_key elta-vedrid, not vedrid` próf

## Prófaniðurstöður

```
npm.cmd run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/guard.test.ts lib/__tests__/feature-access-api.test.ts
```

**4 test files, 274 tests, all passed.**

```
npm.cmd run type-check
```
Engar villur.

```
npm.cmd run lint
```
Engar villur (einungis þekktar warnings í óbreyttum skrám).

```
npm.cmd run build
```
Build tókst. Nýjar routes í build output:
- `/auth-mvp/vedrid/elta-vedrid`
- `/api/teskeid/weather/vedurstofan/stations`

## sql/73 staða

Skrifað, **EKKI keyrt**. Bíður sér Supabase leyfis frá Stebbi.

## Localhost checks for Stebbi

Prereqs:
- `.env.local` með `AUTH_MVP_ENABLED=true`, `WEATHER_ENABLED=true`, `WEATHER_ELTA_VEDRID_FLAG=true`
- Ef `WEATHER_FLAG=true` þarf notandinn `vedrid` í feature_access
- Notandinn þarf líka `elta-vedrid` í feature_access (krefst migration 73 í DB)

1. User með `vedrid` eingöngu: redirect frá `/auth-mvp/vedrid/elta-vedrid`
2. User með `elta-vedrid` eingöngu: redirect (báðir gates þarf)
3. User með bæði: síðan hleðst
4. `WEATHER_ELTA_VEDRID_FLAG=false` í .env.local: 404 á API, redirect á page
5. UI texti segir skýrt "valdar spástöðvar" - ekki "allar stöðvar" og ekki "live veður"
6. `/auth-mvp/vedrid` virkar áfram fyrir venjulega `vedrid` notendur
7. Admin grant/revoke fyrir `elta-vedrid` mun mistakast þar til migration 73 er keyrt
