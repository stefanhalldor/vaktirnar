# TODO 086 - v052 handoff: v051 done, 4 ákvarðanir bíða Stebbi

Created: 2026-07-12 22:52
Timezone: Atlantic/Reykjavik
Author: Claude
Type: Session handoff
Inputs reviewed: v046, v047, v049, v050, v051

## Staða

Phase 2B0 kóðinn er skrifaður og keyrir en er **ekki** commitaður eða pushað.

Útgáfa bíður þess að 4 ákvarðanir fáist frá Stebbi (sjá neðar) og að migration
og feature flag séu útfærð rétt.

## Hvað er komið

Þessar skrár eru til en hafa ekki verið commitaðar:

```
app/auth-mvp/vedrid/elta-vedrid/page.tsx              (guard: 'vedrid' -- þarf að breyta)
app/auth-mvp/vedrid/elta-vedrid/loading.tsx           (lokið)
app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx  (lokið, þó v048 i18n fix vantar)
app/api/teskeid/weather/vedurstofan/stations/route.ts  (guard: 'vedrid' -- þarf að breyta)
lib/weather/providers/vedurstofanStationExplorer.ts   (lokið)
lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts  (14 próf, öll grænin)
messages/is.json                                      (eltaVedrid namespace bætt við)
messages/en.json                                      (eltaVedrid namespace bætt við)
```

60/60 próf grænin. Type-check: hreinn. Lint: hreinn (einungis for-existing warnings).

Slóð: `/auth-mvp/vedrid/elta-vedrid`

## Hvað vantar áður en hægt er að committa

### 1. Ákvarðanir frá Stebbi

Codex v051 greinir 4 ákvarðanir sem þarf svör við:

**A. Aðgangslíkan**
Á `elta-vedrid` að krefjast bæði `vedrid` og `elta-vedrid` aðgangs?
Codex mælir með já: maður sem getur opnað lab-síðuna á líka að geta opnað
foreldrasíðuna `/auth-mvp/vedrid`.

**B. Migration heimild (skrifa)**
Má Claude Code skrifa `sql/73_feature_access_elta_vedrid.sql`?
(Næsta tiltæka migration númer er 73 - 70/71/72 eru þegar til.)
Þetta er aðskilin heimild frá því að keyra migration.

**C. ferdalagid í migration 73**
Dirty worktree hefur þegar `ferdalagid` í guard og admin API en það er
**ekki** í SQL CHECK constraint (migration 68 þekkir það ekki).
Á migration 73 að laga þessa eyðungu samtímis (`ferdalagid` + `elta-vedrid`),
eða einungis `elta-vedrid` í bili?

**D. Live probe**
Má Claude Code gera eitt read-only HTTP köll á `xmlweather.vedur.is` (án
`ids=` parametra) til að finna út hversu margar stöðvar eru tiltækar?

### 2. Kóðabreytingar sem fylgja ákvarðanasvörum

Þegar Stebbi gefur svör þarf Claude Code að:

- `lib/loans/guard.ts`: bæta við `elta-vedrid` case (með `WEATHER_ELTA_VEDRID_FLAG`)
- `app/api/admin/feature-access/route.ts`: bæta `'elta-vedrid'` við `ALLOWED_FEATURES`
- `app/(admin)/admin/page.tsx`: bæta `elta-vedrid` við feature selector
- `.env.example`: skrá `WEATHER_ELTA_VEDRID_FLAG` (kommentað út, off by default)
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`: skipta `'vedrid'` → `'elta-vedrid'`
  (og bæta við `'vedrid'` check ef A er já)
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`: skipta `'vedrid'` →
  `'elta-vedrid'`, bæta við `WEATHER_ELTA_VEDRID_FLAG` check
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`:
  laga v048 i18n (forecast table headers og "Parse errors" texti í messages)
- `messages/is.json` + `messages/en.json`: bæta við i18n lyklum fyrir töfluhaus
- `sql/73_feature_access_elta_vedrid.sql`: skrifa (ef B samþykkt), keyra EKKI
- `lib/__tests__/guard.test.ts`: bæta við `elta-vedrid` próf
- `lib/__tests__/feature-access-api.test.ts`: bæta við `elta-vedrid` próf
- `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`:
  uppfæra mock frá `'vedrid'` → `'elta-vedrid'`, bæta við flag-próf
- `lib/__tests__/sql-migration.test.ts`: bæta við static próf fyrir migration 73

## Hvað Codex / Claude Code má ekki gera

- Keyra SQL migration nema Stebbi gefi sér leyfi
- Pushar eða committa án leyfis
- Kalla á live Veðurstofan/Vegagerðin þjónustu án leyfis (D)
- Setja Veðurstofan hlutina aftur í RouteWeatherPointDetailCard
- Breyta route verdict, heatmap, eða MET/Yr sampling

## Localhost checks for Stebbi (þegar útfærsla er lokið)

1. User með `vedrid` eingöngu getur **ekki** opnað `/auth-mvp/vedrid/elta-vedrid`.
2. User með `vedrid` + `elta-vedrid` getur opnað síðuna.
3. Gestur getur ekki opnað síðuna.
4. `/api/teskeid/weather/vedurstofan/stations` skilar 404 án `elta-vedrid` aðgangs.
5. Foreldrasíðan `/auth-mvp/vedrid` virkar áfram fyrir venjulega veðurnotendur.
6. UI-texti segir skýrt "curated/validation" - gefur ekki til kynna að þetta séu
   allar stöðvar eða live núverandi veður.
7. Ef migration hefur ekki verið keyrt á þeirri Supabase sem `.env.local` vísar á,
   munu admin grants fyrir `elta-vedrid` mistakast vegna CHECK constraint. Það er
   ekki frontend villa.
