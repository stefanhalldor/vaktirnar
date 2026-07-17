# 2026-07-17 08:15 - TODO-086 v390 - Claude: Öxi curated route fixed + evidencePointsOnly

Created: 2026-07-17 08:15
Timezone: Atlantic/Reykjavik

## Stutt niðurstaða

"Til að sleppa við Öxi" curated route birtist nú rétt. Rót vandans var staðfest með server logs: kúrerta leiðin (255 km, Hringvegur/Leið 1 um Reyðarfjörður) var sótt og distinct, en suppressed vegna corridorPoint með 10 km radius sem náði bæði yfir Öxi-leið OG kústalforðunarleiðina.

Fix: `evidencePointsOnly: true` í curated route validation — notar aðeins stöðvarhnit (1.5 km radius) til að ákveða hvort kúrerta leiðin fari enn um Öxi, ekki gróft corridorPoint (10 km).

## Hvað var gert

### 1. Root cause greining með server logs

```
curated Öxi / Reyðarfjörður: distinct route added { distanceMeters: 255465, description: 'Hringvegur/Leið 1' }
curated Öxi / Reyðarfjörður: suppressed — still has caution oxi-axarvegur-939
```

Staðfesti H2: corridorPoint `(64.860, -14.365, r=10_000)` triggerar á kústalleið um fjörðina.

### 2. Upphafsleg röng fix (`skipEvidencePoints`) var leiðrétt

Fyrsta tilraun: `skipEvidencePoints: true` — skippti evidence points, hélt corridorPoints. Rangt. Vandinn var í corridorPoints, ekki evidence points.

### 3. `evidencePointsOnly` valkostur bætt við `matchRouteCautions`

**`lib/weather/routeCautions.ts`:**
- `options?: { evidencePointsOnly?: boolean }` parameter á `matchRouteCautions`
- Þegar `evidencePointsOnly: true`: corridorPoints slepptar, aðeins evidencePoints tékkaðar
- Ef segment hefur engar evidencePoints og `evidencePointsOnly: true`: segment ekki flagguð — rétt safe default

**`lib/weather/google.server.ts`:**
- `fetchCuratedRoute` notar `matchRouteCautions(allPoints, from, to, { evidencePointsOnly: true })`
- CorridorPoints (10 km, gróf) slepptar við curated route validation
- EvidencePoints (1.5 km, stöðvarhnit) notuð — kústalleið fer ekki nálægt Öxi stöðinni

### 4. Diagnostic logs bætt við silent failure paths

**`lib/weather/google.server.ts`** `getCuratedRouteOptions`:
- `anyBaseHasCaution = false` → `curated Öxi / Reyðarfjörður: skipped — no base route has caution ...`
- `anyBaseAvoidsCaution = true` → `curated Öxi / Reyðarfjörður: skipped — base route already avoids caution ... (CURATED_AVOID_OXI label applied to non-caution routes)`

### 5. Prófaðar allar curated route reglur

Aðeins `avoid-oxi-via-reydarfjordur` þarf `evidencePointsOnly` — það er eina caution-triggered reglan sem notar `present-near-corridor` detection með broad corridorPoints. Hin reglan (`safe-westfjords-via-holmavik`) notar `missing-via` sem hefur engar corridorPoints og er ekki snert af þessum valkosti.

### 6. Prófin uppfærð

**`lib/__tests__/weather-route-cautions.test.ts`:**
- Nýtt próf: `evidencePointsOnly: corridorPoint-only route does not fire, evidence-point route still fires`
- Sannar báðar hliðar: corridorPoint-leið sleppir (svo kústalleið suppressed ekki), station-leið triggerar enn (svo raunveruleg Öxi-leið er enn suppressed)

**`lib/__tests__/weather-google.test.ts`:**
- `COORDS_VIA_OXI_STATION` bætt við: coords nálægt raunverulegri Öxi stöð `(64.8257, -14.6573)`
- Suppression test uppfært: curated route notar `COORDS_VIA_OXI_STATION` (near station) frekar en `COORDS_VIA_OXI` (near approximate corridorPoint only) — þannig að `evidencePointsOnly` suppression virkar rétt í test

## Skrár sem breyttust

- `lib/weather/routeCautions.ts` — `evidencePointsOnly` option, passesNearCorridor conditional
- `lib/weather/google.server.ts` — `evidencePointsOnly: true` í fetchCuratedRoute, diagnostic logs
- `lib/__tests__/weather-route-cautions.test.ts` — evidencePointsOnly próf
- `lib/__tests__/weather-google.test.ts` — `COORDS_VIA_OXI_STATION`, uppfært suppression test

## Eftirstandandi findings frá v389 Codex review

Þessar eru ÓLAGAR og þurfa fix áður en production release:

### Finding 1 (High): Vertex proximity í stað segment proximity

`routePassesNear()` mælir fjarlægð að decoded route vertices, EKKI fjarlægð að polyline segment milli vertexa. Ef Google setur ekki vertex nálægt evidencePoint eða corridorPoint getur detection dottið niður.

Fix: Exporta `distanceToPolylineM(point, polyline)` helper úr `providerRouteMatching.ts` (projection lógík er þegar til) og nota hana í `routeCautions.ts` og `routeControlPoints.ts`.

### Finding 2 (Medium): Route-control gates nota einnig vertex proximity

`augmentProviderMatchingPoints` gate matching hefur sama vanda — segment getur farið í gegnum gate radius án þess að vertex sé innan.

Fix: Sama helper og Finding 1.

### Finding 3 (Medium): Reversed route injectar anchors í ranga röð

Þegar leið er east-to-west, eru anchors settir inn í registry röð (west-to-east), sem bjagar `distanceFromOriginM` og röð veðurstöðva.

Fix: Ef `startIdx > endIdx` (reversed), nota `section.anchors.slice().reverse()`.

### Finding 4 (Medium): `verified: false` control section virk í runtime

`ring-road-vik-skeidflotur` er merktur `verified: false` en `augmentProviderMatchingPoints` sleppur öllum sections óháð `verified` flag.

Fix: Annaðhvort sleppa `verified: false` sections í production, eða gera `verified: false` dev-only opt-in.

## Localhost checks

1. Höfn → Egilsstaðir: vænta "Varasamt" chip OG "Til að sleppa við Öxi" alternative leið
2. Egilsstaðir → Höfn (reverse): sama caution og sama alternative
3. Reykjavík → Egilsstaðir: Vík/Skeiðflötur Veðurstofustöðvar á leið (B0.6 fix)
4. Selfoss → Þorlákshöfn: engin Vík control section false positive

## Prerelease staða

v389 findings 1-4 eru enn ólagar. Mæli með að laga Finding 1 (segment projection) og Finding 3 (reversed anchors) áður en út er gefið — þau hafa áhrif á gæði og réttleika Veðurstofustöðva á leiðum.
