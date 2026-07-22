# 2026-07-22 09:00 — TODO-086 v305 — Claude post-release handoff (v304 done)

Created: 2026-07-22 09:00
Timezone: Atlantic/Reykjavik
Agent: Claude
Commit: 7261252
Related TODO: TODO-086 / Road Intelligence prototype

## Hvað var gert í þessum áfanga

Rýndi v304 Codex plan-skjal og framkvæmdi allar breytingar.

## Breytingar framkvæmdar

### A. Núna-first route submit

`handleRouteBridgeSubmit` reiknar nú sjálfgefna leið beint — bíður ekki eftir leiðavalkostum
og slitlagsgögnum áður en kortið opnast. Þegar leið er tilbúin eru slitlagsval sótt í bakgrunni:

```
Fyrr: resolve places → fetch route options → 6x surface queries → calculate route → render
Nú:   resolve places → calculate route → render Núna → background: surface choices
```

### B. `routeSurfaceChoicesStatus` state

Nýtt state: `'idle' | 'loading' | 'ready' | 'error'`.

- `renderRouteSurfaceChoices()` sýnir "Leita að fleiri leiðum…" á meðan status er `'loading'`.
- Þegar `'ready'`: sér um leiðavalkosti eins og áður.
- `'idle'` eða `'error'`: sýnir ekkert í loading state (en errors eru þögnuð í prototype).

### C. 24h slice + Sækja fleiri spátíma

`visibleCandidateLimit` state (default 24). Derived values:
- `displayedRouteCandidates = routeCandidates.slice(0, 24)`
- `displayedSlotStatusOverrides = routeSlotStatusOverrides.slice(0, 24)`

`DepartureHeatmap` fær sliced candidates. "Sækja fleiri spátíma" hnappur birtist
ef `routeCandidates.length > visibleCandidateLimit`. Hnappur eykur limit um 24.

### D. `countsOverride` prop á DepartureHeatmap

Nýtt opt-in prop. Þegar sett, nota þessar tölur í `WindStatusFilterPills` í stað
departure-slot counts.

Í Road Intelligence prototype: `countsOverride={routeBridgeSummary.statusCounts}`.
Þetta þýðir: pillurnar sýna stöðvarnar sem eru sýnilegar á kortinu (Vegagerðin/Veðurstofan),
ekki fjölda brottfararslota.

Önnur callers (TravelAuditMap, /vedrid ferðalag) eru ósnert — `countsOverride` er optional.

### E. `routeVegagerdinPointsRef` — popup lookup fix

Nýtt ref `routeVegagerdinPointsRef` geymir öll gild Vegagerðinstöðvar í leiðinni.
MapLibre click handler notar þetta ref í stað `routeVegagerdinLabelMarkersRef` til að finna stöð.

Áður: ef label-marker var falinn (vegna filter), click gat ekki fundið stöðina.
Nú: click virkar alltaf óháð filter-state.

### F. Filter reset á nýrri leið

`handleRouteStatusFilterChange(new Set())` kallað í `calculateResolvedRoute` þegar leið er
tekin. Þetta þýðir að ef notandi hafði filtrað í fyrri leið, er filterinn hreinsaður þegar
ný leið opnast — allir stöðvar sýnilegir að sjálfgefnu.

### G. Loader titles

`roadMapPrototypeScrubberCalculatingHourly` fjarlægt úr full-screen loader titles-fylki.
Loader sýnir nú þrjá titla (forecast, distance, now). Hourly-texti er notaður einungis í
bottom strip þegar `routeBridgeStatus === 'loading'` (þetta er á bak við loaderinn hvort
eð er, en þarf ekki að vera í rotation).

### H. Messages

Bætt við tveimur nýjum lyklum:
- `roadMapPrototypeSurfaceChoicesSearching`: "Leita að fleiri leiðum…"
- `roadMapPrototypeLoadMoreCandidates`: "Sækja fleiri spátíma"

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`

## Type-check

`npm run type-check` PASS.

## Þekktar takmarkanir og opnar spurningar

### 1. Pill counts eftir slot-val

`countsOverride` gefur stöðvarnar frá Núna-render. Þegar notandi velur framtíðarspátíma
(departure slot > 0), uppfærast Veðurstofanstöðvar á kortinu en pillurnar sýna enn Núna-tölur.
Þetta er acceptable í prototype. Fix: dynamic counts per selected slot þarf stærra uppgjör.

### 2. Slitlags-val eftir bakgrunns-fetch

Þegar surface choices eru fundnar í bakgrunni eru þær sýndar en `routeBridgeSummary.selectedRouteId`
er enn null (sjálfgefin leið). Þetta þýðir að `selected` state í renderRouteSurfaceChoices
punktar á fyrsta val sem "virkt" — sem er rétt, það er leiðin sem var reiknuð.

### 3. Race condition: tvær leiðar

Ef notandi smellir á "Reikna" tvívegis hratt: `routeBridgeRequestRef.current?.abort()` stoppar
fyrri request. Background surface fetch er bundinn við sama controller. Þetta er rétt.

### 4. `routeVegagerdinPointsRef` og re-render

Points ref er settur í `renderVegagerdinStations`. Þetta er kallað í `calculateResolvedRoute`
(við render). Ref er hreinsaður í `clearRouteVegagerdinLabelMarkers`. Lifecycle er rétt.

### 5. Station counts bug ("shows 1 instead of 8")

Codex plan nefnir þennan bug. Með `countsOverride` fær DepartureHeatmap stöðvarnar frá
`routeBridgeSummary.statusCounts` (= `providerStatusCounts`). Ef þessir counts sýna enn "1"
er vandinn annarsstaðar — líklega í `vegagerdinRender.statusCounts` sem kemur frá
`renderVegagerdinStations` → `countWindDisplayStatuses(validPoints)`. Ef `validPoints` hefur
bara 1 stöð þá er count = 1. Þetta er data-vandamál (vegagerðin-leið matchar bara 1 stöð),
ekki UI-vandamál. Þarf að skoða með raunverulegum localhost-test.

## Localhost checks fyrir Stebbi

Opna: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

**Test 1 — Núna birtist hratt:**
1. Opna panel, slá inn Reykjavík → Akureyri, smella Reikna.
2. Loader á að birtast stutt (aðeins meðan `/travel` API er að svara).
3. Leið á að opnast á kortinu án þess að bíða eftir "Leita að fleiri leiðum".
4. Á meðan kortið er opið á `renderRouteSurfaceChoices` að sýna "Leita að fleiri leiðum…" í botni.
5. Þegar search lýkur: "Leita…" hverfur og leiðavalkostir birtast (ef fundnir).

**Test 2 — Pill counts:**
1. Skoða pillurnar í bottom strip eftir að leið er reiknuð.
2. Telja Vegagerðinstöðvar á kortinu.
3. Ef t.d. 5 stöðvar eru sýnilegar á kortinu og allar eru "Innan marka" → pilla á að sýna (5).
4. Ef count er enn "1": vandinn er í vegagerdin route matching, ekki í UI — skoða Network/terminal
   að sjá hve margar stöðvar koma í vegagerdinLayer frá /travel API.

**Test 3 — 24h slice og Sækja meira:**
1. Eftir route reikn: scrubber á að sýna fyrstu 24 tímana.
2. Ef fleiri en 24 eru til á "Sækja fleiri spátíma" að birtast neðst til hægri.
3. Smella á það: næstu 24 tímar bætast við.

**Test 4 — Filter reset:**
1. Reikna leið A, filtra á "Hættulegt".
2. Reikna leið B (ný leið).
3. Filter á að vera hreinsaður — allir stöðvar sýnilegir að sjálfgefnu á leið B.

**Test 5 — Vegagerðin popup click:**
1. Í Núna-view: smella á Vegagerðin-stöð á kortinu (lítill hringur).
2. Popup á að opnast með stöðvarupplýsingum.
3. Filtra á "Hættulegt" (ef engin stöð er hættuleg verða þær faldar).
4. Smella á falinn hring: popup á enn að virka þó label sé falinn.

## Næstu skref

- `2026-07-22-0806-todo-086-v307-codex-road-intelligence-mannamal-status.md` — ólesnin Codex skrá
  er til staðar í ai-handoff. Lesa hana og meta næsta skref.
- Þegar localhost-tests ganga: meta hvort þetta er release-candidate.
