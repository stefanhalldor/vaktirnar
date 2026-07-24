# Handoff — TODO #91 route station card og full detail overlay

Created: 2026-07-24 09:59
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: #91 — Veður: basemap refresh og kortapússun

## Skilningur á samþykki

Stebbi samþykkti að Claude Code:

- fjarlægði MET/Yr circle-punktana sem Codex hafði sett aftur inn;
- breytti dot-smelli á Veðurstofan og Vegagerðin stöðvar þannig að React
  state er sett í stað þess að opna MapLibre DOM popup;
- bætti við compact station card í neðri ræmu þegar stöð er valin;
- bætti við full detail overlay (WeatherChasePanel-mynstur) þegar notandi
  opnar ítarupplýsingarnar.

Samþykkið náði til kóðabreytinga og push. Það fól ekki í sér commit á
`.obsidian/workspace.json`, nýjar þýðingarlyklar, migration, Supabase-,
env-, secrets-, billing- eða production-breytingar.

## Hvað var raunverulega gert

### Commit 36bcc85 (frá fyrra Codex/Claude samtali)

Innihélt:
- TODO #91 Codex UI simplification (sjá v001 handoff)
- Bug fixes #86: `weatherChaseInitialSelectedIds` skilar `null` við loading;
  `overviewActiveMode` auto-set virkar þegar chase panel er opið

### Commit 7c8abc0 (þetta samtal)

**Þrjár state-reset staðsetningar:**

Bætt við `setRouteSelectedStation(null)` og `setRouteStationDetailOpen(false)`
við öll þrjú route-reset tilvik (lína ~2984, ~4453, ~4511 í
`RoadMapPrototypeMap.tsx`).

**MET/Yr circle markers fjarlægðir:**

- `TRAVEL_METNO_LAYER_ID` sett aftur í `false` í
  `updateRouteWeatherLayerVisibility`.
- GeoJSON-heimild hreinsuð og layer falin í stað þess að búa til nýjan layer.

**`openVedurstofanRouteStationPopup`:**

Breytist frá MapLibre DOM popup í React state:
```ts
setRouteSelectedStation({ kind: 'vedurstofan', entry })
setRouteStationDetailOpen(false)
```

**`openVegagerdinRouteStationPopup`:**

Sama mynstur:
```ts
setRouteSelectedStation({ kind: 'vegagerdin', point })
setRouteStationDetailOpen(false)
```

**Compact station card (í neðri ræmu):**

Bætt við á milli Now/Forecast-takka og `routeDepartureForecastExpanded`
hluta þegar `routeSelectedStation != null`:
- stöðvarheiti;
- `WindStatusBadge`;
- lokatakki (`✕`) sem hreinsár val;
- "Sjá nánar" expand-takki ef `routeTravelResult?.travelPlan` er til.

**Full detail overlay:**

Sett á milli Route panel og neðri ræmu þegar `routeStationDetailOpen &&
routeSelectedStation && routeTravelResult && routeBridgeSummary`:
- `absolute inset-0 z-[95]` á mobile (hylja allt);
- `sm:inset-x-3 sm:bottom-28 sm:top-14 sm:z-[45]` á desktop
  (WeatherChasePanel-mynstur);
- Tilbaka-takki (`◀ Loka ferðaupplýsingum`);
- `DepartureHeatmap` ef `displayedRouteCandidates.length > 1`;
- `VedurstofanPointCard` (full variant) fyrir `kind === 'vedurstofan'`;
- `RouteTravelDetails` (sama innihald og gamla FerdalagidClient summary).

## Skrár sem voru skoðaðar

- `ai-handoff/2026-07-24-0859-todo-091-v001-codex-route-map-ui-simplification.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteTravelDetails.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `lib/road-intelligence/vegagerdinRouteLayer.ts`

## Skrár sem Claude breytti

- `components/weather/RoadMapPrototypeMap.tsx`

## Skipanir sem voru keyrðar

1. `npm run type-check`
   - Exit code: 0
2. `git add components/weather/RoadMapPrototypeMap.tsx && git commit ...`
   - Commit: 7c8abc0
3. `git push origin main`
   - Exit code: 0

## Hvað mistókst eða var sleppt

- Engin ný þýðingarlyklar voru bætt við. Compact card og overlay endurnýta
  `roadMapPrototypeTravelDetailsTitle`, `roadMapPrototypeTravelDetailsOpen`
  og `roadMapPrototypeTravelDetailsClose` sem Codex hafði þegar bætt við.
- Dev server var ekki ræstur. Browser-/localhost-próf voru ekki framkvæmd.
- VedurstofanPointCard compact variant er ekki notað; full variant er sýnt
  í detail overlay en compact card í neðri ræmu sýnir aðeins nafn + badge.
- Vegagerðin kind: overlay sýnir engan VedurstofanPointCard (þar sem engar
  Veðurstofan-spár eru tiltækar) — aðeins RouteTravelDetails.

## Áhætta sem er enn til staðar

1. **Browser staðfesting vantar**
   - Smellur á Veðurstofan/Vegagerðin dot, compact card birtist, expand
     opnar overlay — þetta þarf localhost-próf.
2. **VedurstofanPointCard type**
   - `VedurstofanRoutePoint` er `VedurstofanTravelLayer['points'][number] &
     { lat; lon }`. TypeScript samþykkti þetta (type-check pass) en runtime
     hegðun þarf staðfestingu.
3. **z-index lag**
   - Overlay er z-[95] (mobile) / z-[45] (desktop). Route panel er z-[100]
     (mobile) / z-20 (desktop). Á mobile gæti route panel hylt overlayinn ef
     báðir eru opnir samtímis. Þetta þarf sjónræna staðfestingu.
4. **Tvöfaldur scroll í overlay**
   - Overlay er `overflow-y-auto overscroll-contain`. Ef DepartureHeatmap
     hefur innri scroll gæti tvöfaldur scroll komið upp á mobile.
5. **Compact card utan `routeBridgeSummary`**
   - Compact card er sýnt aðeins þegar `routeBridgeSummary` er sett (inni í
     `routeBridgeSummary ? (...)` grein í neðri ræmu). Þetta er rétt hegðun
     en þýðir að card hverfur ef route er hreinsað.

## Localhost checks fyrir Stebbi

### Forsendur

- Innskráður notandi með aðgang að road-map prototype.
- Nota leið sem skilar bæði Veðurstofan og Vegagerðin stöðvum.
- Engin Supabase-, auth-, billing- eða production-breyting er hluti af prófinu.

### Slóð

`/auth-mvp/vedrid/road-map-prototype`

### Próf 1: Vegagerðin dot (Núna mode)

1. Reikna leið. Ganga úr skugga um að `Núna` sé valið (ekki brottfarartími).
2. Smella á Vegagerðin status-punkt á kortinu.
3. Vænt:
   - Compact card birtist í neðri ræmu með stöðvarheiti og wind badge.
   - Engin MapLibre popup birtist.
   - MET/Yr circle-punktar eru ekki sýnilegir.
4. Smella á `✕` á compact card.
5. Vænt: card hverfur.

### Próf 2: Veðurstofan dot (Forecast mode)

1. Velja brottfarartíma í scrubber.
2. Smella á Veðurstofan status-punkt.
3. Vænt:
   - Compact card með stöðvarheiti og wind badge.
   - "Sjá nánar" takki sýnilegur neðst á card.
4. Smella á "Sjá nánar".
5. Vænt:
   - Full overlay opnast.
   - DepartureHeatmap (scrubber) efst.
   - VedurstofanPointCard (3 forecast rows) fyrir neðan.
   - RouteTravelDetails (summary + Á leiðinni) neðst.
6. Smella á `◀ Loka ferðaupplýsingum`.
7. Vænt: overlay lokar, compact card er enn sýnilegur.

### Próf 3: Scrubber breytingar í overlay

1. Opna full overlay (skref 1-4 í Próf 2).
2. Velja annan brottfarartíma í DepartureHeatmap.
3. Vænt:
   - RouteTravelDetails uppfærist m.v. nýjan brottfarartíma.
   - Engin gömul gögn leka.

### Próf 4: Route hreinsuð

1. Smella á stöð → compact card birtist.
2. Hreinsa leiðina (Back/reset).
3. Vænt: card hverfur sjálfkrafa (state hreinsaður við reset).

### Helstu regressions

- Route-lína má ekki hverfa.
- Vegagerðin-stöðvar mega ekki hætta að birtast í `Núna` mode.
- Veðurstofan-stöðvar mega ekki hætta að birtast í `Forecast` mode.
- MET/Yr circle-punktar mega ekki sjást (þeir voru fjarlægðir).
- Mitt veður (WeatherChasePanel) og route station overlay mega ekki opnast
  á sama tíma á óskilgreint hátt.
- Núna/Forecast skipting á kortinu má ekki breytast.

## Supabase / production

- Engin SQL-skrá var skrifuð.
- Engin migration var skrifuð eða keyrð.
- Engin áhrif á gögn, RLS, auth, grants, policies eða functions.
- Engin env-, secrets- eða billing-breyting var gerð.
- Push var gerð á `main` (feature flag: `/auth-mvp/vedrid/road-map-prototype`).
