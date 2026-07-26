# TODO 091 v065 — Áfangi 2 lokið: atomic page promotion

Created: 2026-07-25 16:00
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Samantekt

Áfangi 2 (atomic promotion) er framkvæmdur og staðfestur. Allt ócommittað — þær breytingar bíða Stebbis samþykkis.

## Hvað var gert

### 2-A — capability prop (Codex, í v064)
- `components/weather/RoadMapPrototypeMap.tsx` — `hasRoadIntelligence?: boolean` (default `true` til baksamhæfni)

### 2-B — Public canonical page
- `app/vedrid/page.tsx` — replace `WeatherOverviewClient` með `RoadMapPrototypeMap`
  - `isAuthenticated={false}`, `hasRoadIntelligence` (alltaf `true` — mode===all er skilyrði)
  - `navigation={{ canonicalPath: '/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}`

### 2-C — Auth canonical page
- `app/auth-mvp/vedrid/page.tsx` — replace `WeatherOverviewClient` með `RoadMapPrototypeMap`
  - `hasRoadIntelligence = getWeatherEnabledMode() === 'all' || checkFeatureAccess(..., 'road-intelligence-v1')`
  - `navigation={{ canonicalPath: '/auth-mvp/vedrid', authenticatedPath: '/auth-mvp/vedrid' }}`

### 2-D — Query-preserving legacy redirect
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx` — `async` server component
  - `searchParams: Promise<Record<string, string | string[]>>` (Next.js 15 pattern)
  - redirectar á `/vedrid` með query varðveittum
  - Auth-middleware canonicalize-ar svo `/vedrid` → `/auth-mvp/vedrid` með query varðveittum

### 2-E — Eyða redundant nested layout
- `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` — **eytt**
  - Parent `app/auth-mvp/vedrid/layout.tsx` (1a) sér um MapLibre CSS og viewport

### 2-F — Atomic pulseBack reclassification
- `lib/weather/pulseBack.ts`:
  - `overview` kind fjarlægt úr `PulseBackDestination` union
  - `/vedrid`, `/auth-mvp/vedrid`, `/auth-mvp/vedrid/road-map-prototype` — allt `drive`

### 2-G — Tests
- `lib/__tests__/pulseBack.test.ts`:
  - `overview (auth)` → `drive (auth canonical)` — 4 tests, kind: 'drive'
  - `overview (public)` → `drive (public canonical)` — 4 tests, kind: 'drive'
  - `drive` block → `drive (legacy prototype)` — 3 tests
  - Samtals 54 tests, 3 skrár

### Viðbótarbreytingar (leiddu af type-check)
- `VedurstofanPulsClient.tsx` — dauðan `overview`-branch fjarlægður úr ternary
- `VegagerdinPulsClient.tsx` — dauðan `overview`-branch fjarlægður úr ternary

## Keyrðar skipanir

1. `npm.cmd run type-check` — exit 0
2. `npm.cmd run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/road-map-navigation.test.ts lib/__tests__/pulseTarget.test.ts`
   - 3 skrár, 54 tests passed, exit 0
3. `git diff --check` — exit 0 (aðeins CRLF warnings á Windows, eðlilegar)

## Allar ócommittaðar breytingar

| Skrá | Áfangi |
|---|---|
| `app/vedrid/layout.tsx` (**ný**) | 1a |
| `app/auth-mvp/vedrid/layout.tsx` (**ný**) | 1a |
| `lib/weather/roadMapNavigation.ts` (**ný**) | 1b |
| `lib/__tests__/road-map-navigation.test.ts` (**ný**) | 1b |
| `components/weather/RoadMapPrototypeMap.tsx` | 1b + 2-A |
| `components/weather/DriveJourneyPanel.tsx` | 1b |
| `lib/weather/pulseBack.ts` | 1c/2-F |
| `lib/__tests__/pulseBack.test.ts` | 1c/2-G |
| `app/vedrid/page.tsx` | 2-B |
| `app/auth-mvp/vedrid/page.tsx` | 2-C |
| `app/auth-mvp/vedrid/road-map-prototype/page.tsx` | 2-D |
| `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` (**eytt**) | 2-E |
| `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` | 2-G cleanup |
| `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx` | 2-G cleanup |

## Redirect-keðja (staðfest)

```
/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1
  → (page redirect) /vedrid?context=route&view=map&restoreRoute=1
  → (middleware, ef innskráður) /auth-mvp/vedrid?context=route&view=map&restoreRoute=1
```

Unauthenticated user: middleware lætur `/vedrid` liðast (PUBLIC_PATHS). ✓
Authenticated user: `if (user && pathname === '/vedrid')` → `.clone()` + pathname skipti. Query varðveist. ✓

## Localhost verification (Stebbi)

1. **Public, signed out, WEATHER_ENABLED=all:**
   - `/vedrid` → promoted kort, road layers tiltæk, public menu
   - `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1` → `/vedrid` með query, route view endurheimtist

2. **Authenticated með `road-intelligence-v1`:**
   - `/vedrid` → redirect til `/auth-mvp/vedrid` (middleware), query varðveitt
   - Road layers og controls tiltæk

3. **Authenticated án `road-intelligence-v1` (WEATHER_ENABLED=authenticated):**
   - `/auth-mvp/vedrid` → grunnkort og veður/akstur virkar
   - Engar road-intelligence layers/controls sýnd
   - Engar console 401/404 villur

4. **Veðurpúlsspjald (Veðurstofan + Vegagerðin):**
   - returnTo='/vedrid' eða '/auth-mvp/vedrid' → "Til baka í akstur" (ekki "spákort")
   - Sama route/view endurheimtist við til-baka-smelli

5. **`/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid`:**
   - Óbreyttar — standalone flow virkar eins og áður

6. **MapLibre CSS / viewport:**
   - Kort fyllir fullskjá, engin overflow, viewport-fit=cover á mobile

## Eftir staðfestingu

Ef Stebbi staðfestir localhost: commit og push á raun.

Ráðlagt commit-message (ein commit):
```
feat: promote RoadMapPrototypeMap to canonical /vedrid + /auth-mvp/vedrid (#91)
```

## Framkvæmdarstaða

Ekkert commit, push, deploy, migration, Supabase- eða production-inngrip var gert.
