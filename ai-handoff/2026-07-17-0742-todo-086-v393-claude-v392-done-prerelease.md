# 2026-07-17 07:42 - TODO-086 v393 - Claude: v392 findings done, prerelease

Created: 2026-07-17 07:42
Timezone: Atlantic/Reykjavik

Source: `2026-07-17-0737-todo-086-v392-codex-v390-v391-prerelease-review`

## Samþykki

Stebbi samþykkti framkvæmd allra 4 findings úr v392. Engar breytingatillögur frá Claude Code — Codex review var rétt.

## Hvað var gert

### Finding 1 (High): TypeScript type-check villa leiðrétt

`lib/__tests__/routeControlPoints.test.ts` — `anchorLons` var literal union type af `as const` section, `includes()` féll á type mismatch:

- Breytt `anchorLons.includes(p.lon)` → `anchorLonSet.has(p.lon)` með `Set<number>`
- `findLastIndex` (möguleg compatibility vandamál) skipt út fyrir handskrifað reverse loop

### Finding 2 (High): Of þröng test assertion leiðrétt

`lib/__tests__/providerRouteMatching.test.ts:323` — vertex fjarlægð ~49 km var meðalgilt of nálægt 50 km assertion:

- `> 50_000` → `> 40_000` með skýringum um raunfjarlægð

### Finding 3 (Medium): Display vs validation cautions aðskilin

`lib/weather/google.server.ts` `fetchCuratedRoute()` — `evidencePointsOnly` átti við um bæði validation OG display cautions, þannig að UI gat misst að sjá broad corridor warnings á curated route.

Nýtt skipulag:
- `displayCautions = matchRouteCautions(allPoints, from, to)` — full detection, fer á route card
- `validationCautions` sér um suppression check, með per-rule policy:
  - `avoid-oxi-via-reydarfjordur`: `evidencePointsOnly: true` (forðast false suppression af 10 km corridorPoint)
  - allar aðrar reglur: `displayCautions` beint (full detection)
- Suppression check (+ log) er nú inni í `fetchCuratedRoute`, ekki í `getCuratedRouteOptions`
- `getCuratedRouteOptions` fjarlægði redundant suppression check

### Finding 4 (Medium): Production guard fyrir `verified: false` sections

`lib/weather/routeControlPoints.ts` `augmentProviderMatchingPoints()`:

```ts
if (process.env.NODE_ENV === 'production' && !section.verified) continue
```

- Production: `ring-road-vik-skeidflotur` (verified: false) er slegin út — approximate anchors hafa ekki áhrif á Veðurstofustöðvar í production
- Dev/test: öll sections virkar svo Stebbi getur staðfest section sjónrænt á localhost

## Niðurstöður

```
npm run type-check  → pass
npm run test:run -- [6 test files]  → 6/6 pass, 205/205 tests
```

## Skrár sem breyttust

- `lib/__tests__/routeControlPoints.test.ts` — Set<number>, reverse loop, minor comment
- `lib/__tests__/providerRouteMatching.test.ts` — > 40_000 assertion
- `lib/weather/google.server.ts` — display vs validation cautions split, suppression moved into fetchCuratedRoute
- `lib/weather/routeControlPoints.ts` — production guard

## Eftirstandandi

### Finding 4 lokun: Staðfesting á `ring-road-vik-skeidflotur`

Þessi control section er enn `verified: false` og slegin út í production. Til að virkja hana:

1. Stebbi opnar localhost og keyrir `Reykjavík → Egilsstaðir`
2. Skoðar hvort Veðurstofustöðvar í Vík/Skeiðflötur/Vatnsskarðshólar kafla birtast rétt
3. Kannar hvort anchor punktar fylgi raunverulegu Route 1 (ekki yfir fjörðinn)
4. Keyrir `Selfoss → Þorlákshöfn` — á ekki að triggera Vík section
5. Ef allt lítur rétt út: Claude Code setur `verified: true` og uppfærir comment

Þar til staðfesting er búin: section er active á localhost (dev) en slegin út í production.

## Localhost checks fyrir Stebbi

1. `Höfn → Egilsstaðir`: "Varasamt" caution chip + "Til að sleppa við Öxi" birtist
2. `Egilsstaðir → Höfn`: sama í reverse
3. `Reykjavík → Egilsstaðir`: Vík/Skeiðflötur Veðurstofustöðvar á leiðinni (dev-only, unverified section)
4. `Egilsstaðir → Reykjavík`: sömu stöðvar í réttri ferðastefnu (reversed anchor order fix)
5. `Selfoss → Þorlákshöfn`: engin false positive

## Ekki gert

- Engin commit, push, deploy eða migration
- `ring-road-vik-skeidflotur` er enn `verified: false` — þarf localhost staðfestingu
