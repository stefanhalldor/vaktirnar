# Handoff: v124 — Phase 1 + Phase 2 fixes (Codex v123 items)

**Date:** 2026-07-07 08:20
**From:** Claude
**Ref:** todo-067 v123 (all 9 items)
**Status:** Framkvæmt. Type-check: pass. Tests: 1750/1785 (53 files).

---

## Samantekt

Allt af Codex v123 listanum (9 atriðin) er komið:

1. **P1 - Threshold explanation fix** — `SlotDetail` og `candidateToIssue` nota nú `thresholdsUsed` frá niðurstöðu í stað WEATHER_THRESHOLDS sjálfgefna
2. **P1 - Filter auto-select when no slot selected** — Bætt við svo filter triggers auto-select jafnvel þótt engin slot sé valin
3. **P1 - Hide stale forecast data** — `buildPointSummary` skilar `forecastTimeIso: undefined, nextForecast: undefined` þegar `activeCandidate` er til staðar
4. **P1 - Preserve user-selected map point + `Fara á versta punkt`** — `userSelectedRef` varnar auto-jump; "Fara á versta punkt" takki birtist þegar notandi hefur valið annan punkt
5. **P2 - Draft threshold dirty state** — `thresholdsDirty` skoðar nú draft gildi á thresholds skrefi
6. **P2 - Chip markers clickable** — Chips hafa nú `clickable: true` og toggle-click listener
7. **P2 - Timeline copy** — `heatmapDeparturePickerTitle` + `heatmapDeparturePickerSubtitle` á window-mode heatmap
8. **P2 - Selected marker color** — `markerStyleForStatus` notar nú status-based lit jafnvel þegar `isHighlighted`; rauð tvílit á gulu punkti er horfið
9. **Tests** — 7 nýjar `candidateToIssue` prófanir + uppfærðar `markerStyleForStatus` prófanir

---

## Skrár breyttar

### `components/weather/travelAuditMap.helpers.ts`
- Import: bætt við `ResolvedTravelThresholds`
- `markerStyleForStatus`: lit er nú status-based jafnvel þegar `isHighlighted` (rauð override horfin)
- `candidateToIssue` opts: bætt við `thresholdsUsed?: ResolvedTravelThresholds`; gust threshold og deriveThreshold kalla nota það ef gefið
- `buildPointSummary`: `forecastTimeIso` og `nextForecast` eru `undefined` þegar `activeCandidate` er til staðar (stale data horfin)

### `components/weather/DepartureHeatmap.tsx`
- Import: bætt við `ResolvedTravelThresholds`
- Props: bætt við `thresholdsUsed?` og `subtitle?`
- Subtitle sýnd í UI undir titli
- `SlotDetail` fær `thresholdsUsed`
- `SlotDetail`: `redGustThreshold` notar `thresholdsUsed.redGustMs` ef gefið; `deriveThreshold` fær `thresholdsUsed` sem 3ja arg
- `SlotDetail`: notar nú `aboveThresholdWithExcess` (sýnir excess: "1.3 yfir 10.0 m/s mörkum")

### `components/weather/TravelAuditMap.tsx`
- `selectedIndex`: breytt í `number | null`
- `userSelectedRef = useRef(false)` bætt við
- Marker click handlers (route og forecast): toggle logic (null ef same idx smellt aftur) + `userSelectedRef.current = true`
- Sync effect: sleppir ef `userSelectedRef.current`
- Chip markers: `clickable: true` + toggle click listener
- "Fara á versta punkt" takki: birtist þegar `autoHighlightIdx >= 0 && selectedIndex !== autoHighlightIdx`; click resetar `userSelectedRef` og hoppar á versta punkt

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Import: bætt við `TravelCandidate`
- Auto-select effects (outbound + return): fjarlægt `selectedHeatmapIdx === null` early return; triggerar nú þegar filter er active en engin slot er valin
- `visible` type annotation: breytt frá `typeof sel` (sem var úr scope) í `TravelCandidate`
- `thresholdsDirty`: skoðar nú draft input gildi á thresholds skrefi og ber saman við submitted resolved thresholds
- `thresholdsUsed` variable: `result?.travelPlan?.thresholdsUsed`
- `candidateToIssue` kall: `thresholdsUsed` passed í opts
- Outbound DepartureHeatmap: `title` window-mode → `heatmapDeparturePickerTitle`, `subtitle` → `heatmapDeparturePickerSubtitle`
- Báðar DepartureHeatmap instances: fá `thresholdsUsed`

### `messages/is.json` og `messages/en.json`
- `aboveThresholdWithExcess`: IS `"({excess} yfir {threshold} {unit} mörkum)"`, EN `"({excess} above the {threshold} {unit} limit)"`
- `showWorstPoint`: IS `"Fara á versta punkt"`, EN `"Jump to worst point"`
- `heatmapDeparturePickerTitle`: IS `"Brottfarartíminn í Teskeið"`, EN `"Departure time in Teskeið"`
- `heatmapDeparturePickerSubtitle`: IS `"Prófaðu að smella á brottfarartíma hér að neðan og sjáðu kortið breytast"`, EN `"Try tapping a departure time below and watch the map update"`

### `lib/__tests__/travelAuditMap.helpers.test.ts`
- `markerStyleForStatus` tests uppfærðar: `highlighted` varðveitir nú status lit (graent→graent, ekki rautt)
- 7 nýjar `candidateToIssue` prófanir:
  - Green candidate → undefined
  - Default driving threshold (cautionWindMs=15)
  - Custom cautionWindMs=10
  - Custom redGustMs=12 → gust decisive
  - Default: gust=14 < 28 → NOT decisive
  - Trailer caravan: gust=25 → decisive (default)
  - Trailer + custom redGustMs=18 override

---

## Þekkt takmarkanir

**Stale forecast data (item 3):**
- `forecastTimeIso` og `nextForecast` eru falin þegar `activeCandidate` er til staðar (rétt)
- Hins vegar: þegar `activeCandidate` er til staðar sýnir panel ENGA forecast time
- Fulla lagfæring (per-candidate per-point forecast data) krefst `CandidatePointStatus` extension — ENNÞÁ óframkvæmt
- Í reynd: smelli á punkt án valinnar slot → `summaryForWindow` data sýnt (rétt)

**Auto-select stale closure:**
- `selectedHeatmapIdx` í auto-select effects er stale closure value
- Þetta er OK í þessum samhengi: þegar filter breytist er gildið á þeim tíma nákvæmlega það sem við viljum

---

## Localhost checks for Stebbi

1. **Threshold explanation**: Sía gult → smella á gulann slot → SlotDetail sýnir "Vindur: X.X m/s (Y.Y yfir Z.Z m/s mörkum)" með rétt viðmið (ekki sjálfgefið 15/20)
2. **Custom threshold + dirty**: Fara á Veðurmörk skref → breyta vindviðmiðum → "Niðurstaða" í stepper verður grálækt STRAX (ekki bara eftir submit)
3. **Marker color**: Smella á gult punkt á korti → punkturinn verður stærri en HELDUR GULUM lit (ekki rauður)
4. **User selection preserved**: Velja slot → smella á annan punkt á korti → breyta slot → kortapunkturinn heldur sig á sama stað; "Fara á versta punkt" takki birtist
5. **Jump button**: Smella á "Fara á versta punkt" → kortið hoppar á versta punkt aftur; takki hverfur
6. **Chip clickable**: Smella á SVG time chip ofan við punkt → panel opnast/lokar
7. **Filter auto-select from null**: Í window mode með ósleðum filterum (t.d. `graent` hidden) → Alltaf einhver slot valin ef til staðar (ekki null þegar filter er active)
8. **Timeline title**: Window mode heatmap sýnir "Brottfarartíminn í Teskeið" og subtitle texta

---

## Skipanir keyrðar

```
npm run type-check  → pass
npm run test:run    → 1750 passed | 27 skipped | 8 todo (53 files)
```
