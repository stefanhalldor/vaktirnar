# TODO 091 v067 — Áfangi 2-H test-hardening lokið

Created: 2026-07-25 16:50
Timezone: Atlantic/Reykjavik
Agent: Claude Code

## Samantekt

Allar þrjár kröfur v066 uppfylltar. Full release-gátt er græn.

## Hvað var gert

### Krafa 1 — Targeted legacy redirect tests

URL-byggingarrökfræðin var dregin út í prófanlegt helper (þar sem Next.js
`redirect()` er ótestanlegt án heavy mocking):

**`lib/weather/prototypeRedirect.ts`** (ný):
```ts
export function buildPrototypeLegacyRedirectUrl(
  params: Record<string, string | string[]>,
): string
```

**`app/auth-mvp/vedrid/road-map-prototype/page.tsx`** uppfærð:
```tsx
import { buildPrototypeLegacyRedirectUrl } from '@/lib/weather/prototypeRedirect'
export default async function RoadMapPrototypeLegacyPage({ searchParams }) {
  redirect(buildPrototypeLegacyRedirectUrl(await searchParams))
}
```

**`lib/__tests__/prototypeRedirect.test.ts`** (ný) — 10 tests:
- tómt query → `/vedrid`
- einstakur param varðveitist
- route restore state (`context=route&view=map&restoreRoute=1`)
- repeated keys sem array
- mixed single og repeated keys
- spaces URL-encoded
- slashes í gildum URL-encoded
- ampersands í gildum URL-encoded
- target er alltaf `/vedrid` (tvær assertions)

### Krafa 2 — `hasRoadIntelligence` required (fail-closed)

**`components/weather/RoadMapPrototypeMap.tsx`:**
- `hasRoadIntelligence = true` default fjarlægt
- `hasRoadIntelligence?: boolean` → `hasRoadIntelligence: boolean`
- JSDoc uppfærður: "Required — callers must pass an explicit server-derived access result."

Báðir canonical callers senda prop explicit nú þegar:
- `app/vedrid/page.tsx` → `hasRoadIntelligence` (shorthand `true`)
- `app/auth-mvp/vedrid/page.tsx` → `hasRoadIntelligence={hasRoadIntelligence}`

### Krafa 3 — Capability network-silence contract test

MapLibre-mock gerir sjálfvirkt test óhóflegt — engar MapLibre-mocks eru í
test-innviðum og nálgun þyrfti fake-DOM + fake-MapLibre-GL sem er brothætt.

**Skráð sem manual-only**: sjá localhost checklist hér að neðan.

## Keyrðar release-gáttir

1. `npm.cmd run type-check` — exit 0
2. Targeted: `npm.cmd run test:run -- lib/__tests__/prototypeRedirect.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/road-map-navigation.test.ts lib/__tests__/pulseTarget.test.ts`
   - **4 skrár, 64 tests passed**
3. Full: `npm.cmd run test:run`
   - **137 skrár, 3617 tests passed**, 27 skipped, 8 todo
4. `git diff --check` — exit 0 (aðeins CRLF warnings á Windows)

## Allar ócommittaðar breytingar (lokaskrá)

**Nýjar skrár (untracked):**

| Skrá | Áfangi |
|---|---|
| `app/vedrid/layout.tsx` | 1a |
| `app/auth-mvp/vedrid/layout.tsx` | 1a |
| `lib/weather/roadMapNavigation.ts` | 1b |
| `lib/__tests__/road-map-navigation.test.ts` | 1b |
| `lib/weather/prototypeRedirect.ts` | 2-H |
| `lib/__tests__/prototypeRedirect.test.ts` | 2-H |

**Breyttar skrár:**

| Skrá | Áfangi |
|---|---|
| `components/weather/RoadMapPrototypeMap.tsx` | 1b + 2-A + 2-H |
| `components/weather/DriveJourneyPanel.tsx` | 1b |
| `lib/weather/pulseBack.ts` | 2-F |
| `lib/__tests__/pulseBack.test.ts` | 2-G |
| `app/vedrid/page.tsx` | 2-B |
| `app/auth-mvp/vedrid/page.tsx` | 2-C |
| `app/auth-mvp/vedrid/road-map-prototype/page.tsx` | 2-D + 2-H |
| `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` | 2-G cleanup |
| `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx` | 2-G cleanup |

**Eyðar skrár:**

| Skrá | Áfangi |
|---|---|
| `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` | 2-E |

## Localhost checklist for Stebbi (eitt sameinað próf)

### A — Public, signed out (WEATHER_ENABLED=all)
- [ ] `/vedrid` → promoted kort, public menu, grunnkort + Veðurstofan markers
- [ ] Road overlay tiltækt (road-intelligence capability = true á public)
- [ ] `/auth-mvp/vedrid/road-map-prototype` → redirect á `/vedrid`
- [ ] `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1` → `/vedrid?context=route&view=map&restoreRoute=1`, route view endurheimtist

### B — Authenticated með `road-intelligence-v1`
- [ ] `/vedrid` → middleware redirect á `/auth-mvp/vedrid`, query varðveitt
- [ ] Road overlay, vegafærðarkaflar og surface route choices virka
- [ ] `/auth-mvp/vedrid/road-map-prototype?restoreRoute=1` → `/vedrid?restoreRoute=1` → `/auth-mvp/vedrid?restoreRoute=1`, route endurheimtist

### C — Authenticated án `road-intelligence-v1` (WEATHER_ENABLED=authenticated)
- [ ] `/auth-mvp/vedrid` → grunnkort og veður/akstur virkar
- [ ] Engar road-intelligence layers/controls sýnd
- [ ] **Network panel**: engar köll á `/api/teskeid/road-intelligence/map-proxy`, `/road-segments`, `/road-surface`, `/station-markers`
- [ ] Engar console 401/404/403 villur

### D — Veðurpúlsspjöld og back navigation
- [ ] Veðurstofan pulse: returnTo='/vedrid' → "Til baka í akstur" (ekki "spákort")
- [ ] Vegagerðin pulse: sama
- [ ] Same route/view endurheimtist við til-baka-smelli

### E — Ferðalag (regression)
- [ ] `/vedrid/ferdalagid` → FerdalagidClient isGuest, óbreytt
- [ ] `/auth-mvp/vedrid/ferdalagid` → óbreytt

### F — Mobile og viewport
- [ ] Kort fyllir fullskjá (h-screen overflow-hidden)
- [ ] viewport-fit=cover virkar (notch/home indicator)
- [ ] Engin overlap eða overflow á mobile tabs

### G — Loader og navigation
- [ ] TeskeidLoader sést við route transitions á `/vedrid` og `/auth-mvp/vedrid`
- [ ] Browser back/forward virkar rétt
- [ ] sessionStorage route/place state varðveist þvert yfir promotion
