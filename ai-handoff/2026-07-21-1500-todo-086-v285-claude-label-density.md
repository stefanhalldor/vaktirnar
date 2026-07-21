# 2026-07-21 15:00 - todo-086 v285 - Claude: Veðurstofan label density rules

Created: 2026-07-21 15:00
Timezone: Atlantic/Reykjavik

## Samþykki / Umfang

Stebbi gaf framkvæmdaleyfi til að rýna v284 og fara beint í næsta framkvæmdaskref.

Enginn commit, push, deploy, SQL keyrsla eða production aðgerð var gerð.

## Rýni á v284

Engin blockerar fundust. Allt sem v284 lýsti var rétt útfært:

- `RouteVedurstofanLabelMarker` type og `routeVedurstofanLabelMarkersRef` fylgja nákvæmlega sama mynstri og `RouteVegagerdinLabelMarker`.
- `createVedurstofanRouteLabel` býr til DOM button með vindgildi, lit frá `WIND_STATUS_MARKER_COLOR`, og `aria-label`.
- `openVedurstofanRouteStationPopup` er slot-aware (notar `entry.selectedRow` sem er reiknaður út frá `departureMsOverride`).
- `updateVedurstofanLabelMarkerState` er kallað þegar filter eða mode breytist.
- `clearRouteVedurstofanLabelMarkers` er kallað bæði í `handleClearRoute` og unmount cleanup.
- Circle click handler nær í `entry` frá `routeVedurstofanLabelMarkersRef` og opnar popup.
- `selectedRouteCandidate` og `displayedRouteSlotLabel` gefa "Skoðar: Núna" / "Skoðar brottför: {time}".
- "Núna" takki í summary kallar `handleSelectCandidateIdx(null)`.
- Þrjár nýjar i18n lyklar í bæði `is.json` og `en.json`.
- `npm run build` var keyrð af Codex og fór í gegn.

Aðalvandinn sem v284 flaggaði:

> Label density on routes with many Veðurstofan stations may get noisy. Current implementation labels all valid Veðurstofan route stations.

## Hvað var gert

### Label density reglur

Tveir nýir fastar í `components/weather/RoadMapPrototypeMap.tsx`, rétt fyrir neðan `WIND_DISPLAY_STATUS_SET`:

```ts
const VEDURSTOFAN_LABEL_ALWAYS_STATUSES = new Set<WindDisplayStatus>([
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
])
const VEDURSTOFAN_LABEL_DENSITY_THRESHOLD = 6
```

Í label-creation loopunni í `renderVedurstofanStations` er `entriesToLabel` nú reiknað með þessum reglum:

- Ef `statusEntries.length <= 6`: allar stöðvar fá label.
- Ef `statusEntries.length > 6`:
  - Alltaf label: `haettulegt`, `nalgast-haettumork`, `othaegilegt` stöðvar.
  - Sekundær (grænar, no-data): aðeins fyrsta og síðasta sem "anchor" labels.

### Rök

- Rauðar/appelsínugular stöðvar eru nákvæmlega þær sem notandinn þarf að sjá án þess að smella.
- Á löngum leiðum þar sem allt er grænt sér notandinn "byrjun" og "enda" sem staðfestingu á að leið sé greiðfær.
- Á stuttum leiðum (≤ 6 stöðvar) koma allar labels — engin ástæða til að fela þær.
- Reglurnar gilda um label-stofnun, ekki um filter; filter pills og circle markers virka áfram á öllum stöðvum.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`

## Skipanir keyrðar

- `npm run type-check`
  - Exit code: 0

## Localhost checks for Stebbi

Slóð: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

**Próf 1: Stór leið — density filter**

1. Reikna Reykjavík -> Akureyri (eða aðra langa leið með 8+ Veðurstofan stöðvar).
2. Skoða hversu margar label-punklar birtast á kortinu.

Vænt:
- Rauðar og gullinrauðar stöðvar sýna allar label.
- Þar sem allt er grænt: bara fyrsta og síðasta stöð fær label.
- Kortið er ekki þakið labels.

**Próf 2: Stutt leið — allar labels**

1. Reikna leið með fáar Veðurstofan stöðvar (≤ 6), t.d. styttri landsbyggðarleið.

Vænt:
- Allar stöðvar fá label.

**Próf 3: V284 regression — slot label og "Núna" takki**

1. Smella á slot í scrubber.
2. Staðfesta "Skoðar brottför: ..." og badge breytist.
3. Smella "Núna" takka.
4. Staðfesta "Skoðar: Núna" og badge fer aftur.

**Próf 4: Filter regression**

1. Smella á filter pills (Hættulegt, Óþægilegt, Innan marka).
2. Staðfesta að labels og circle markers fara saman.

## Ákvarðanir

- Threshold = 6: passar við flesta stutte leiðir án rugligs á löngum.
- Sekundær anchors eru fyrsta+síðasta í `secondary` array (raðað eftir route fraction frá `validPoints.filter()`). Þetta þýðir fyrsta og síðasta stöð með gult/grænt status — ekki endilega landfræðilega fyrsta/síðasta stöð leiðarinnar. Þetta virkar þar sem `validPoints` er í sömu röð og punktarnir koma frá Veðurstofan layer.
- `nalgast-haettumork` er í "alltaf" flokki þótt það mappe í `gult` í simple mode. Ástæðan: notandinn þarf að sjá "approaching danger" þótt simple mode sýni það sem gult.

## Supabase / SQL / Auth / Production

Engar Supabase breytingar. Engin SQL. Engin auth/deploy breyting.

## Tillaga að næsta skrefi

Eftirfarandi þrír valkostir í forgangsröð:

1. **Provider-neutral label helper** — `createVedurstofanRouteLabel` og hliðstætt Vegagerðin fall deila sama CSS-mynstri. Ef þeir eru sameina í eitt `createRouteWindLabel(value, unit, color, stationName)` fall verður auðveldara að breyta letrinu/stæðinu á báðum í einu. Einfalt refactor, lágmarksbetri lesgjörð.

2. **Slot-selected time badge nær kortinu** — Þegar notandinn velur slot í scrubber, birtist "brottfararmerki" bæði í summary og í mögulega legend svæðið neðst til vinstri á kortinu. Þetta gerir tímasamhengi sýnilegra á sjálfum kortinum.

3. **Stöðvamerkjaskipti (round-trip)** — Þegar Vegagerðin og Veðurstofan eru báðar til, líta merkin aðeins öðruvísi út. Hugsanlega litaður border eða lítill provider-dot til að aðgreina þær. Lágt forgangur — labels sýna nú þegar mismunandi gildi (mælt vs. spá).
