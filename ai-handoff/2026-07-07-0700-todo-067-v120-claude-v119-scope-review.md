# Handoff: v119 scope review — marker chips og filter-sync

**Date:** 2026-07-07 07:00
**From:** Claude
**Ref:** todo-067 v119 → v120 scope decision
**Status:** Rýni á v119 handoff. Engar kóðabreytingar.

---

## Samantekt

v119 handoffinn inniheldur fjóra þræði:

1. ETA + spátímaupplýsingar við route-punkta
2. Timeline-filter sync við map markers
3. Top navigation — fara aftur í Niðurstöður án endurreiknings
4. Dirty threshold tracking

Þræðir 3 og 4 eru hlutlægt einfaldir og hægt er að keyra þá strax. Þræðir 1 og 2 hafa tæknilegar forsendur sem eru ekki uppfylltar í núverandi kóða. Þá þarf að taka ákvörðun á.

---

## P1 — Map-marker tímachipar krefjast infra sem er ekki til

### Vandinn

`TravelAuditMap.tsx:78` og `init()` fallið nota **classic `google.maps.Marker`** án `mapId`.

`AdvancedMarkerElement` — eina leiðin til að festa custom HTML-chipar við map-merkingar — krefst þess að `Map` sé stofnaður með `mapId`:

```ts
new mapsLib.Map(mapDivRef.current, { mapId: 'XXXXX', ... })
```

Núverandi kóði:
```ts
const map = new mapsLib.Map(mapDivRef.current, {
  zoom: 7,
  mapTypeId: 'roadmap',
  gestureHandling: 'cooperative',
  // mapId er ekki til staðar
})
```

Classic Marker `label` property styður aðeins:
- `text: string`
- `color: string`
- `fontSize: string`
- `fontWeight: string`

Það er **ekki hægt** að birta `10:42 (11:00)` með border, bakgrunni og border-radius með þessum tækjum.

### Mögulegar lausnir

**A. Bæta við `mapId` og endurskrifa yfir í `AdvancedMarkerElement`:**
- Krefst nýs Google Maps `mapId` (þarf að stofna í Google Cloud Console)
- Krefst þess að NÆSTA umferð markers sé skrifuð um
- `AdvancedMarkerElement` er öðruvísi API en classic `Marker` — `addListener`, `setMap`, `setIcon` eru öll önnur
- Tímafrekt endurskrif, gæti kynnt villur

**B. SVG data-URI icon með textanum bakaðum inn:**
- Hægt að gera án `mapId`
- En SVG verður að vera latently-generated per marker (ólíklegt að fungera með variable text og stílun)
- Letur og stærðir eru breytileg — flókið að tryggja lesanleika á 360px

**C. Sýna ETA og spátíma í detail-panelinum (neðan maps) en ekki á kortinu:**
- `PointDetailsPanel` er til staðar og þegar sér um valdinn punkt
- Krefst einungis þess að `summaryForWindow` fái `etaIso` og `forecastTimeIso` (server-side)
- Afhent strax við val á punkti
- **Engin map-infra-breyting**

### Tillaga

**Fylgja leið C í v120:** Birta ETA og spátíma í `PointDetailsPanel`, ekki á map-markers.

Markmiðið sem Stebbi setti — "make it clear what time each route point refers to" — er náð í panelinum. Notandinn smellir á punkt og sér strax tímaupplýsingar. Marker-chips á kortinu kæmu í v121+ ef við bætum við `mapId` + AdvancedMarkerElement undirbyggingu.

---

## P2 — Filter-sync þarf state lift-up úr DepartureHeatmap

### Vandinn

`hiddenStatuses` (filter state) er `useState` **inni í `DepartureHeatmap`** (lína 65). Til að `TravelAuditMap` geti tekið sama filter við gönguna þarf stöðuna að vera í foreldri (`FerdalagidClient`).

Þetta þarf:
1. `hiddenStatuses` og `setHiddenStatuses` flutt upp í `FerdalagidClient`
2. `DepartureHeatmap` fær þær sem props
3. `TravelAuditMap` fær `activeFilter` prop
4. Marker-emphasis-rök í `TravelAuditMap` uppfærð

Þetta er tæpur refactor á þremur skrám. Hann kynni líka til sögunnar spurning: á filter-áhrifin kortið að vera **full hide** eða **de-emphasis (opacity)**? Og á origin/destination punktar alltaf vera sýnilegir?

### Tillaga

Keyra þetta í v120 með þessum reglum:
- Lyft `hiddenStatuses` upp í `FerdalagidClient` sem `mapFilter` state
- Senda `mapFilter` sem prop í `TravelAuditMap`
- De-emphasize (opacity-30) markers sem eru utan filters í stað þess að fela þá alveg (svo notandinn glati ekki staðsetningu á leiðinni)
- Origin/destination markers og selected-marker eru alltaf fullir (óháð filter)
- Ef filter er virkt og enginn marker passar: bæta `emptyState` texta við ofan punktadetails-panelinum

Þetta er gagnsæ hegðun sem passar við handoff-leiðbeiningar.

---

## Þræðir sem hægt er að keyra strax án þessara vandamála

### Þráður 3: Top navigation backward/forward

Stebbi mátti fara frá Niðurstöður til Veðurmörk en gat ekki farið til baka í Niðurstöður án endurreiknings.

Breyting:
- `Niðurstöður` í steppernum verður smellanlegt þegar `result !== null`
- Ef notandinn er á `thresholds` step og draftar eru óbreyttir frá síðasta útreikningi: smella á `Niðurstöður` skilar niðurstöðusíðunni
- Ef draftar eru breyttir: `Niðurstöður` verður disable með vísbendingu um að þurfi að endurreikna

### Þráður 4: Dirty threshold tracking

Til að vita hvort draftar eru breyttir:
- Geyma `submittedThresholds: TravelThresholdOverrides | null` state
- Við `handleThresholdSubmit` → `setSubmittedThresholds(overrides)`
- Við `startOver` → `setSubmittedThresholds(null)`
- `thresholdsDirty` = draftar á `thresholds` step eru frábrugðnir `submittedThresholds` (eða `submittedThresholds === null` ef `result` er til)

---

## Tillaga að v120 framkvæmd

### Hluti A — Server-side (travel.ts + types.ts)
Bæta við `summaryForWindow`:
```ts
etaIso?: string          // new Date(etaMs).toISOString()
forecastTimeIso?: string // sama og decisiveTimeIso (alias, decisiveTimeIso haldist)
nextForecast?: {
  timeIso: string
  status: WeatherStatus
  trend: 'better' | 'worse' | 'same'
  windMs: number
  gustMs: number
  precipMmPerHour: number
}
```

Athugaðu að `nextForecast` þarf að sækja næsta klukkustund **eftir** `decisiveTimeIso` úr `pt.hours` (ekki ETA-gluggan, heldur fulla tímarörðina).

### Hluti B — PointDetailsPanel
Bæta við þremur nýjum línum:
- `Áætlað á leið: HH:mm` (úr `summaryForWindow.etaIso`)
- `Spágildi notað: HH:mm` (úr `summaryForWindow.forecastTimeIso`)
- `Næsta spágildi: betra/verra/svipað kl. HH:mm` (úr `summaryForWindow.nextForecast`)

Þessar upplýsingar birtast þegar engin candidate er selected. Þegar candidate er selected er `decisiveTime` úr `highlightedIssue.timeIso` notað (eins og í dag).

**Spurning:** Á ETA í panelinum að uppfærast þegar scrubber-val breytist? Ját — þyrfti `estimatePointEtaIso` helper og `activeCandidate` prop eins og handoffinn lýsir. Þetta er hægt að gera í v120 eða v121. Ef við gerum það ekki í v120 uppfærist ETA-talan í panelinum aðeins þegar `summaryForWindow` er reiknað (server-side, fyrir valinn summary-candidate). Það er nóg fyrir MVP.

### Hluti C — Filter lift-up
Lyft `hiddenStatuses` úr `DepartureHeatmap` upp í `FerdalagidClient`, senda sem `activeFilter` prop í `TravelAuditMap`, de-emphasize markers utan filter.

### Hluti D — Top nav
`Niðurstöður` smellanlegt þegar `result !== null`. Dirty flag á thresholds.

---

## Spurningar til Stebbi

**1. Map marker chips vs. detail panel:**
Núverandi map-infra styður ekki custom HTML-chipar á markers. Vil ég:

- A: Keyra v120 með ETA/spátíma í detail-panelinum (strax leið, enginn mapId)
- B: Bæta við mapId í Google Cloud Console og endurskrifa markers yfir í AdvancedMarkerElement (meira verk, tímafrekt)

**2. Filter-sync:**
Þegar filter á scrubberinum er `Varúð` — á map að:

- A: De-emphasize (opacity-30) græna punkta — leiðin er enn sýnileg
- B: Fela græna punkta alveg — einbeiting á varúðarpunkta

**3. ETA update við scrubber-val:**
Á ETA í panelinum að breytast þegar notandinn velur annan brottfarartíma í scrubberinum?

- A: Já — krefst `activeCandidate` prop í TravelAuditMap (meira verk)
- B: Já — en í v121, ekki v120

---

## Localhost checks for Stebbi

Ekki á við — þetta er scope-rýni, ekki framkvæmd.
