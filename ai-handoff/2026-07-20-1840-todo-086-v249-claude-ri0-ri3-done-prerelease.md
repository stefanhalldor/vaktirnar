# Handoff: RI-0 + RI-3 útfært — prerelease rýni fyrir Codex

Created: 2026-07-20 18:40
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Pre-release review handoff for Codex

---

## Rýni á v248 Codex core (RI-1 + RI-2)

### Kóðarýni — niðurstaðan

**Allt lítur vel út.** Engin blocker.

**`types.ts`** — nýjar gerðir eru réttar og vel afmarkaðar. `IcelandRouteAlternativeLabel` sem union type gefur type safety á `labelKey`. `IcelandRoadIntelligenceResult` contract er clean.

**`alternatives.ts`** — `rvk-east-sleppa-oxi` og `rvk-east-um-firdi` eru structurally identical (sömu `segmentIds`, sömu `avoids`). Þetta er rétt sem draft — þær eru semantically ólíkar (önnur forðast Öxi, hin sækir firðina). Þær munu aðgreina sig þegar austurlands-segment registry er byggð. **Ekki blocker.**

**`cautions.ts`** — `oxi-fjallvegur` er `severity: 'caution'` en `hellisheidi-fjallvegur` er `severity: 'info'`. Munurinn virðist meðvitaður (Öxi er alvarlegri). Rétt.

**`roadIntelligenceResolver.ts`** — `matchesAlias()` normaliserar **bæði** input og hvern alias með `slugifyPlaceKey()`. Þetta er betri nálgun en v247 plan mér nærri sem notaði beint `includes`. Gengur upp: `slugifyPlaceKey('Vík í Mýrdal')` → `'vikimyrdal'` og `slugifyPlaceKey('vik i myrdal')` → `'vikimyrdal'`. Bidirectional matching virkar rétt.

**Opnar spurningar Codex svara:**
1. Type contract: passlegt. Ekki of stórt.
2. `resolved` með tómar alternatives (South Coast): UI fela panel þegar `alternatives.length === 0`. Rétt nálgun — resolver breytist ekki.
3. Cautions frá `avoids`: merged approach (ein "things to know" listi) er nógu gott í v1. Aðgreining `activeCautions`/`avoidedCautions` seinna.
4. Tómt `segmentIds` á `rvk-akureyri-hringvegurinn`: ásættanlegt sem draft. Næsta skref: bæta norðurleiðar backbone segments.
5. `IcelandRoadmap.md`: við skulum uppfæra þegar við gefum út, ekki blocker.

---

## Hvað var framkvæmt í þessum skammti

### RI-0: Feature flag

**`sql/89_feature_access_road_intelligence_v1.sql`** — ný skrá.
- Bætir `road-intelligence-v1` við CHECK constraint á `feature_access`.
- Inniheldur öll 9 eldri lykla + nýja.
- Idempotent, rollback neðst.
- **Stebbi keyrir — Claude Code skrifar einungis.**

**`lib/loans/guard.ts`**:
- Bætti við blokk eftir `weather-provider-vegagerdin`:
  ```ts
  if (featureKey === 'road-intelligence-v1') {
    if (process.env.ROAD_INTELLIGENCE_V1_ENABLED !== 'true') return false
    return checkPerUserAccess(email, 'road-intelligence-v1')
  }
  ```
- Engin graduation path — per-user flagg alltaf nauðsynlegt.

**`app/api/admin/feature-access/route.ts`**:
- `'road-intelligence-v1'` bætt við `ALLOWED_FEATURES` array.

**`lib/__tests__/guard.test.ts`**:
- Nýr `describe` blokk: 5 tests fyrir `road-intelligence-v1`.
- Env var off → false (án DB kalls).
- Env var on, engin röð → false.
- Env var on, röð til → true.
- Ógilt email → false.

### RI-3: Read-only flagged UI

**`components/weather/RoadIntelligencePreview.tsx`** — ný skrá.
- Prentar `resolveRoadIntelligence(fromPlaceKey, toPlaceKey)` (pure function, engin network).
- Skilar `null` þegar `status === 'unknown'` eða `alternatives.length === 0`.
- Sýnir: titill + `Tilraun` badge, alternative pills (flex-wrap), caution chips (litaðar eftir severity).
- Cautions deduplicated eftir tag (hindrar endurtekningu á sömu varúð).
- Nota `useTranslations('teskeid.vedrid.overview')`.

**`components/weather/WeatherOverviewClient.tsx`**:
- Import `RoadIntelligencePreview`.
- Bætti `hasRoadIntelligence?: boolean` við prop type (default `false`).
- Render undir `WeatherWatchersComparison`:
  ```tsx
  {hasRoadIntelligence && fromMemoryPlace && toMemoryPlace && (
    <RoadIntelligencePreview
      fromPlaceKey={fromMemoryPlace.key}
      toPlaceKey={toMemoryPlace.key}
      fromLabel={fromMemoryPlace.label}
      toLabel={toMemoryPlace.label}
    />
  )}
  ```

**`app/auth-mvp/vedrid/page.tsx`**:
- Import `checkFeatureAccess`.
- Köllum `checkFeatureAccess('', user.email ?? '', 'road-intelligence-v1')` server-side.
- Pass sem `hasRoadIntelligence={hasRoadIntelligence}` á `WeatherOverviewClient`.
- Public `/vedrid` (og allar aðrar síður sem nota `WeatherOverviewClient`) fá `hasRoadIntelligence=false` (default).

**`messages/is.json` + `messages/en.json`**:
- 5 nýjar lyklar undir `teskeid.vedrid.overview`:
  - `roadIntelligenceTitle`, `roadIntelligenceBadge`, `roadIntelligenceConfidenceDraft`, `roadIntelligenceAlternativesLabel`, `roadIntelligenceCautionsLabel`

---

## Skrár breyttar

| Skrá | Aðgerð |
|---|---|
| `sql/89_feature_access_road_intelligence_v1.sql` | Ný (Stebbi keyrir) |
| `lib/loans/guard.ts` | Breyting |
| `app/api/admin/feature-access/route.ts` | Breyting |
| `lib/__tests__/guard.test.ts` | Breyting (5 nýjar tests) |
| `components/weather/RoadIntelligencePreview.tsx` | Ný |
| `components/weather/WeatherOverviewClient.tsx` | Breyting (import + prop + render) |
| `app/auth-mvp/vedrid/page.tsx` | Breyting (feature check + prop) |
| `messages/is.json` | Breyting (5 lyklar) |
| `messages/en.json` | Breyting (5 lyklar) |

---

## Validation

- `npm run type-check` — exit code `0`
- `npm run test:run` — exit code `0`; 119 test files (var 118), 3441 tests (var 3428), 13 nýjar tests

---

## Hvað var EKKI gert

- Engin SQL keyrð.
- Enginn commit, push eða deploy.
- `IcelandRoadmap.md` ekki uppfært — gera í commit-i.
- `ROAD_INTELLIGENCE_V1_ENABLED` env var ekki sett á Vercel — Stebbi þarf að gera þetta í Vercel dashboard eftir release.
- Engin feature_access röð búin til — Stebbi gerir þetta eftir að SQL89 er keyrð.

---

## Áhætta eftir rýni

1. **SQL89 þarf að keyra áður en panel getur virkað í production.** Án hennar skrifar `feature_access` insert með `road-intelligence-v1` yfir CHECK constraint og kastar villu. Guard-ið kemur í veg fyrir að notendur sjái panelinn, en admin API gæti kastað villu við granting.
2. **`ROAD_INTELLIGENCE_V1_ENABLED` þarf að vera `true` á Vercel.** Þar til þetta er sett, skilar guard alltaf `false` jafnvel með feature_access röð. Þetta er meðvitaður kill-switch.
3. **`resolveRoadIntelligence()` keyrir client-side á hverjum render** þar sem `fromMemoryPlace`/`toMemoryPlace` breytast. Þetta er pure function og O(n) yfir lítinn registry — engin performance áhætta í v1.
4. **South Coast (Reykjavík → Vík) birtir ekkert panel** þótt family sé resolved, vegna `alternatives: []`. Þetta er rétt hegðun.

---

## Spurningar til Codex rýni

1. Er `checkFeatureAccess('', user.email ?? '', 'road-intelligence-v1')` rétt kallmynstur samkvæmt öðrum callsites? (Guard signature er `_userId, email, featureKey` — fyrsti stigi er unused `_userId`.)
2. Er placement `RoadIntelligencePreview` undir `WeatherWatchersComparison` rétt á mobile? Eða á það að vera ofar (milli variant pills og comparison)?
3. Á `RoadIntelligencePreview` að deduplicera cautions eftir `tag` (núverandi nálgun) eða eftir `id` (öll unique)?
4. Er `'road-intelligence-v1'` key rétt í `ALLOWED_FEATURES` eða þarf það að vera `as const` extended type?

---

## Localhost checks eftir SQL89 + env var

1. **Notandi án flaggs** (eða án `ROAD_INTELLIGENCE_V1_ENABLED=true`):
   - Opna `/auth-mvp/vedrid`, velja Reykjavík → Egilsstaðir.
   - `Teskeið þekkir þessar leiðir` á **ekki** að birtast.

2. **Notandi með flagg** (eftir SQL89, `ROAD_INTELLIGENCE_V1_ENABLED=true`, og feature_access röð):
   - Reykjavík → Egilsstaðir: 3 alternative pills + Hellisheiði/Öxi cautions.
   - Reykjavík → Ísafjörður: `Gegnum Hólmavík` + `Vindnæmt`.
   - Reykjavík → Akureyri: `Hringvegurinn`, engar cautions.
   - Reykjavík → Vík: **ekkert panel** (engar alternatives ennþá).
   - Akureyri → Egilsstaðir: ekkert panel (`unknown`).

3. **Public `/vedrid`**: engar Road Intelligence controls (prop er ekki pass-að).

4. **Mobile 360px**: alternative pills wrapa, enginn horizontal overflow.

---

## Næsta skref sem Codex ætti að taka

Þetta er release-ready slísa að mati Claude eftir type-check og test-run.

Codex ætti að:
1. Rýna þennan diff.
2. Svara spurningum að ofan (sérstaklega #1 um callsite og #2 um placement).
3. Ef allt lítur vel út: mæla með release og laga hvað sem er þarf.
4. Búa til commit proposal með skýru commit message.
5. Minna á að SQL89 og env var þarf sérstakt Stebbi leyfi.

Commit ætti að innihalda:
- Allar RI-0 + RI-3 skrár hér að ofan
- v248 Codex core (RI-1 + RI-2) skrár sem eru ennþá untracked:
  - `lib/iceland-routes/alternatives.ts`
  - `lib/iceland-routes/cautions.ts`
  - `lib/iceland-routes/roadIntelligenceResolver.ts`
  - `lib/__tests__/iceland-routes-road-intelligence.test.ts`
  - Breytingar á `lib/iceland-routes/types.ts`, `lib/iceland-routes/index.ts`, `IcelandRoadmap.md`, `lib/iceland-routes/README.md`
- Handoff skrár
- **Ekki** `.obsidian/workspace.json`
