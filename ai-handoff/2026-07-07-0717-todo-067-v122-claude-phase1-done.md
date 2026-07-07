# Handoff: v122 — Phase 1 implementation done

**Date:** 2026-07-07 07:17
**From:** Claude
**Ref:** todo-067 v121 Phase 1 all items
**Status:** Framkvæmt. Type-check: pass. Tests: 1743/1778 (53 files).

---

## Samantekt

Allt af Phase 1 listanum úr Codex v121 er komið:

1. Server data: `etaIso`, `forecastTimeIso`, `nextForecast` í `summaryForWindow`
2. Dynamic ETA via `activeCandidate` + `activeLeg` í `PointDetailsPanel`
3. Map time chips (SVG data-URI) á selected og warning-punktum
4. Filter de-emphasis: opacity 0.2 á filtered-out markers
5. Filter state lifted upp í `FerdalagidClient` (outbound + return aðskilin)
6. Auto-selection þegar filter felur selected slot
7. `Niðurstöður` smellanlegt þegar `result !== null && !thresholdsDirty`
8. `submittedThresholds` tracking — dirty flag þegar thresholds breytast

---

## Skrár breyttar

### `lib/weather/types.ts`
`summaryForWindow` fékk þrjá nýja reiti:
- `etaIso?: string` — ETA á leið (ISO)
- `forecastTimeIso?: string` — alias af `decisiveTimeIso`
- `nextForecast?: { timeIso, status, trend: 'better'|'worse'|'same', windMs, gustMs, precipMmPerHour }`

### `lib/weather/travel.ts`
`buildRouteWeatherPoints`: eftir `summaryForWindow` útreikninginn:
- `etaIso = new Date(etaMs).toISOString()`
- `forecastTimeIso = decisiveTimeIso`
- `nextForecast`: finnur næstu klukkustund eftir `decisiveTimeIso` í `pt.hours`, reiknar trend

Trend logic:
- Severity hærri → worse, lægri → better
- Sama severity: if `max(wind, gust)` > 1.1x → worse, < 0.9x → better, annars same

### `components/weather/travelAuditMap.helpers.ts`
- Nýtt `estimatePointEtaIso(candidate, pt, leg)` helper — reiknar ETA út frá routeFraction og candidate departure/arrival
- `PointSummary` fékk `etaIso?`, `forecastTimeIso?`, `nextForecast?`
- `buildPointSummary` tekur nú `activeCandidate?` og `activeLeg?` — dynamic ETA ef supplied

### `components/weather/DepartureHeatmap.tsx`
- `SlotStatus` exported (var inni type, er nú `export type SlotStatus`)
- Fjarlægðar internal `useState`/`useEffect` fyrir `hiddenStatuses`
- Nýjar props: `hiddenStatuses: Set<SlotStatus>`, `onHiddenStatusesChange: (next: Set<SlotStatus>) => void`
- `useState`/`useEffect` imports fjarlægðar (ekki lengur notaðar)

### `components/weather/TravelAuditMap.tsx`
- Nýjar props: `activeCandidate?`, `activeLeg?`, `hiddenStatuses?`
- Nýr SVG helper `makeTimeLabelSvg(time)` — compact 48x18px chip með HH:mm texta
- Nýir refs: `chipMarkersRef`, `mapRef`, `markerLibRef`, `coreLibRef`
- Marker icon/opacity useEffect sameinaður með chip marker útreikningi:
  - Filter de-emphasis: `marker.setOpacity(isFiltered ? 0.2 : 1.0)` (endpoints alltaf full)
  - Chip markers: selected + warning non-filtered punktar fá SVG chip
  - Dynamic ETA í chip: `estimatePointEtaIso` ef `activeCandidate` til staðar
- `buildPointSummary` kallar nú með `activeCandidate, activeLeg`
- `PointDetailsPanel` sýnir:
  - `pointEtaLabel`: HH:mm (dynamic ef activeCandidate)
  - `pointForecastTimeLabel`: HH:mm (ef frábrugðinn ETA)
  - `pointNextForecastLabel`: Betri/Verri/Svipað kl. HH:mm

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Import: `type SlotStatus` frá DepartureHeatmap
- Nýjar states: `outboundHiddenStatuses`, `returnHiddenStatuses`, `submittedThresholds`
- `useEffect` reset filters þegar `result?.id` breytist
- `useEffect` auto-select þegar `outboundHiddenStatuses` felur selected slot (same for return)
- `handleSubmit`: `setSubmittedThresholds(overridesToSend)` þegar result kemur
- `startOver`: `setSubmittedThresholds(null)`
- Derived values: `activeOutboundCandidate`, `activeReturnCandidate`, `activeCandidate`, `activeLeg`
- `mapHiddenStatuses`: outbound eða return eftir active leg
- `thresholdsDirty`: `result !== null && submittedThresholds !== null && JSON.stringify mismatch`
- Stepper: `canReturn = s.step === 'result' && result !== null && !thresholdsDirty`
  - `disabled={!canNavigate}` (isCompleted || canReturn)
  - `title={...thresholdsDirtyNavHint...}` ef dirty
- TravelAuditMap: fær `activeCandidate`, `activeLeg`, `hiddenStatuses`
- DepartureHeatmap (outbound + return): fær `hiddenStatuses` og `onHiddenStatusesChange`

### `messages/is.json` og `messages/en.json`
Bætt við:
- `pointEtaLabel`, `pointForecastTimeLabel`, `pointNextForecastLabel`
- `forecastTrendBetter`, `forecastTrendWorse`, `forecastTrendSame`
- `thresholdsDirtyNavHint`

### `lib/__tests__/weather-travel.test.ts`
5 nýjar prófanir í `describe('summaryForWindow.nextForecast')`:
- graent → gult = worse
- gult → graent = better
- same gult + wind +>10% = worse
- same gult + wind ~same = same
- etaIso og forecastTimeIso eru defined

---

## Þekkt takmarkanir

**SVG chip markers:**
- Nota `coreLibRef.current.Size` og `coreLibRef.current.Point` (frá CoreLibrary)
- Chips eru ekki clickable — click fer í gegnum til route marker undir
- Chips birtast aðeins eftir að `mapLoaded` er `true`
- OverlayView var skoðað sem annar möguleiki — SVG chips virka án mapId og eru einfaldari

**Filter auto-selection:**
- Auto-selects á: fyrsta rauðu → fyrsta gula → fyrsta sýnilega → null
- Þetta gerist aðeins þegar selected slot er falinn; annars er val óbreytt

**ETA í panel:**
- Sýnir `forecastTimeIso` aðeins ef það er frábrugðið `etaIso` (til að forðast tvítekið "kl. X")
- Þegar engin `activeCandidate` er (engin slot valin og enginn leavingAt): etaIso/forecastTimeIso er frá server-computed summaryForWindow

---

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid`
2. Velja langar leiðar, t.d. `Garðabær → Akureyri`
3. Halda áfram í niðurstöður
4. Smella á map punkt — pönnelinn sýnir nú:
   - **Áætlað á leið:** HH:mm (ETA)
   - **Spágildi notað:** HH:mm (ef frábrugðið ETA)
   - **Næsta spá:** Betri/Verri/Svipað kl. HH:mm
5. Velja brottfarartíma í scrubber — staðfesta að ETA í paneli breytist
6. Velja gula eða rauða slot — staðfesta að SVG time chips birtast á kortinu ofan við warning punkta og selected punkt
7. Sía timeline til `Óþægilegt` — staðfesta að grænir punktar fara í opacity 0.2 (daufir)
8. Sía til `Allt` — staðfesta að allir punktar fara aftur í full opacity
9. Með völdum gulum slot: sía þannig að valinn slot hverfi — staðfesta auto-select á næsta warning slot
10. Í niðurstöðusíðu: smella á `Veðurmörk` í stepper — breyta einu gildi — `Niðurstaða` tab verður grálækt (dirty)
11. Endurstilla gildi (Reset-takki) — `Niðurstaða` verður smellanlegt aftur — smella → engin API-köll, bara flutningur
12. Preyfa breiddir 360px, 390px, 460px:
    - Engin horizontal overflow
    - Chips þekja ekki Google lögrétt attribution eða map controls
    - Labels lesanlegir
13. Engin Supabase, SQL migration, eða production-breyting þarf

---

## Skipanir keyrðar

```
npm run type-check  → pass
npm run test:run    → 1743 passed | 27 skipped | 8 todo (53 files)
```
