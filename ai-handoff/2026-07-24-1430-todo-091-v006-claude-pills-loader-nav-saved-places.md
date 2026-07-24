# Handoff — TODO #91 Filter-pillur, loader, nav active-state, vistaðir staðir

Created: 2026-07-24 14:30
Timezone: Atlantic/Reykjavik
Agent: Claude
Relevant TODO: #91 — Veður: basemap refresh og kortapússun

## Skilningur á samþykki

Stebbi samþykkti þrjár lotu af breytingum:

**Lota 1 — fjórir hlutir í einu:**

- sýndi loading-state inni í Akstur-panel meðan leið reiknar;
- bætti við `hasMoreCandidates`/`onLoadMore` props á `DriveJourneyPanel` og "Sækja fleiri spátíma" takka;
- fjarlægði "Nánar" toggle af Kort; `WindStatusFilterPills` sýnir alltaf í detailed-ham þegar leið er virk;
- bætti við compact Vegagerðin-spjaldi í bottom strip á Kort þegar Vegagerðin-punktur er smellt; spjaldið er hlekkur á pulse-síðu.

**Lota 2 — lagfæringar eftir sjónræna skoðun:**

- falin map-level `TeskeidLoader` þegar Akstur-panel er opinn (panel er gegnsær svo loader blæs í gegn);
- "Mitt veður" og "Akstur" nav-pillur sýna eingöngu active þegar tilsvarandi panel er opinn; "Kort" er sjálfgefinn hámur;
- innskráðir notendur: valdir staðir vistast í saved-places API; "Nýlegir staðir" dropdown birtist þegar input er tómt og fókusað.

Samþykki fól í sér kóða-, prófa- og handoff-breytingar. Það fól ekki í sér commit, push, deploy, migration, Supabase-, env-, secrets-, billing- eða production-breytingar á öðru en þessum skrám.

## Hvað var gert

### Loader í Akstur-panel

- Þegar `routeBridgeStatus === 'loading'` og `routeBridgeSummary === null` sýnir panel-body nú einfalt centered loading-texta (`t('roadMapPrototypeRouteLoading')`) í stað forms.
- Map-level `TeskeidLoader` (sem var áður `absolute inset-0 z-50` inni í map-area) er nú falinn þegar `isPanelOpen === true`. Þar sem panel er `z-[100]` og bakgrunnur hans er `bg-background/90 backdrop-blur-sm` (gegnsær) blæddi loader í gegn. Nú sér hann ekki til.
- Submit-takkinn í forminu þarfnast ekki lengur `disabled={routeBridgeStatus === 'loading'}` þar sem formið sýnist aldrei meðan loading. Þetta var einnig TS-villa vegna type-narrowing í ternary.

### Fleiri spátímar í Akstur scrubber

- `DriveJourneyPanel` fær nýjar optional props: `hasMoreCandidates?: boolean` og `onLoadMore?: () => void`.
- "Sækja fleiri spátíma" takki birtist neðan við `DepartureHeatmap` þegar `hasMoreCandidates === true`.
- `RoadMapPrototypeMap` passar `hasMoreCandidates` og `onLoadMore={() => setVisibleCandidateLimit(prev => prev + 24)}`.
- Þýðingarlykill `roadMapPrototypeLoadMoreCandidates` var þegar til í `teskeid.vedrid.overview`.

### Filter-pillur alltaf sýnilegir á Kort

- "Nánar" toggle-takkinn fjarlægður úr Kort bottom strip.
- `WindStatusFilterPills` sýnist nú alltaf í route-virkan ham (áður aðeins þegar `routeStatusFilterMode === 'detailed'`).
- `mode="detailed"` er fest; `alwaysShowWithinLimits` prop er óbreytt.

### Vegagerðin compact spjald á Kort

- Þegar `routeSelectedStation?.kind === 'vegagerdin'` birtist compact spjald í bottom strip (neðan við pillur og filter-pillur).
- Spjaldið er `<a href={vegagerdinPulseHref(...)}>` sem vísar á pulse-síðu stöðvarinnar.
- Efri helmingur: stöðvanafn, `formatVegagerdinRouteWindValue(point)` m/s, `WindStatusBadge`.
- Neðri helmingur: `point.airTemperatureC` °C (sýnist aðeins ef gildi eru til).
- Sér til: lokað þegar `isPanelOpen === true` (bottom strip er þá falinn).

### Nav active-state lagfæring

Vandinn: "Mitt veður" var active þegar `!isPanelOpen && !isChatOpen && lastMapContext === 'weather'`. "Akstur" var active þegar `!isWeatherChaseOpen && !isChatOpen && lastMapContext === 'route'`. "Kort" er active þegar `!isWeatherChaseOpen && !isPanelOpen && !isChatOpen`. Þegar farið var úr Mitt veður í Kort voru báðar pillur active.

Lagfæring:
- "Mitt veður": active aðeins þegar `isWeatherChaseOpen`.
- "Akstur": active aðeins þegar `isPanelOpen`.
- "Kort": active þegar ekkert er opið (óbreytt).
- `lastMapContext` er áfram notað í öðrum effects (til dæmis `weatherMapIsVisible`); aðeins nav `aria-pressed` og className voru uppfærð.

### Vistaðir staðir

- `SavedWeatherPlace` type importuð úr `@/lib/weather/savedPlaces`.
- `tPlace = useTranslations('teskeid.vedrid.placeSearch')` bætt við.
- `savedPlaces: SavedWeatherPlace[]` state bætt við.
- `useEffect` sækir `/api/teskeid/weather/saved-places` við mount ef `isAuthenticated`. Sama endpoint og `/ferdalagid`.
- `savePlaceBestEffort(place)` — async function sem POSTar stað og endurnýjar lista. Keyrir ekki ef `!isAuthenticated`.
- Kallað á `savePlaceBestEffort` í:
  - `selectRoutePlace()` — þegar notandi velur stað úr dropdown;
  - `handleRouteBridgeSubmit()` — eftir að `resolveBridgePlace` skilar origin og destination.
- `renderPlaceSuggestionList` breytt: þegar `suggestions.length === 0` og `fieldValue.trim().length < 2` og `savedPlaces.length > 0` birtist "Nýlegir staðir" dropdown með × takka til að eyða stöðum. Eyðing er optimistic (state uppfærist strax) + DELETE á API.
- Enginn nýr þýðingarlykill þurfti; `placeSearch.savedPlacesTitle` og `placeSearch.savedPlaceDelete` voru þegar til.

## Skrár sem Claude breytti

- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-1430-todo-091-v006-claude-pills-loader-nav-saved-places.md`

## Commits

- `ad53a69` — feat: loader í Akstur, fleiri spátímar, alltaf filter-pillur, Vegagerðin spjald (#91)
- `7c82ee6` — fix: loader í panel, nav active-state, og vistaðir staðir (#91)

## Prófanir og skipanir

1. `npm.cmd run type-check`
   - Exit code: 0 (eftir báðar lotur)
2. `npm.cmd run build`
   - Exit code: 0 (eftir báðar lotur)
3. `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts`
   - Exit code: 0
   - 149 tests passed, 5 skipped

Engar nýjar prófaskrár voru skrifaðar í þessari lotu.

## Hvað var ekki gert

- Dev server var ekki ræstur.
- Browser-/localhost-prófun var ekki framkvæmd.
- Engar nýjar Supabase-migrations.
- Engar breytingar á public `/ferdalagid`.
- Enginn nýr API-endapunktur; saved-places API er óbreyttur.

## Design.md samræmi

- Loading-state í panel notar sama texta og submit-takki.
- Saved-places dropdown notar sama mynstur og PlaceSearch componentinn.
- Vegagerðin spjald er `<a>` með focus-ring og hover-state.
- Filter-pillur eru alltaf sýnilegir; engin falinn mode.

## Route intelligence check

- Engin routing-lógík breyttist.
- `IcelandRoadmap.md` þarf ekki uppfærslu.
- Engin ný canonical segment- eða provider-binding þekking.

## Áhætta / þarf að staðfesta

1. **Loader á desktop**
   - Á desktop er panel hlið-við-hlið við kortið (ekki `absolute inset-0`). Þegar `isPanelOpen` og `!isPanelOpen` loader sýnist á kortasvæðinu en ekki undir panelinum. Þetta er rétt hegðun á desktop en þarf sjónræna staðfestingu.
2. **Nav context tap**
   - "Mitt veður" og "Akstur" eru ekki lengur highlighted þegar þú ferð í Kort og aftur. Þetta er viljanlegt en Stebbi þarf að staðfesta að þetta sé ásættanlegt.
3. **Saved places og guest-notendur**
   - `isAuthenticated = false` → engin fetch, engin save, enginn dropdown. Þarf staðfestingu að þetta sé rétt.
4. **savePlaceBestEffort kallað tvisvar við route-submit**
   - Ef notandi velur stað úr dropdown OG sendir form: saved-places API er kallað tvisvar. Þetta er sama mynstur og `/ferdalagid` og API er idempotent (upsert á koordinatum).
5. **Vegagerðin spjald og routeSelectedStation**
   - Ef notandi smellir á Veðurstofan-punkt á kortinu: `routeSelectedStation` breytist í `vedurstofan` og Vegagerðin spjaldið hverfur. Þetta er rétt hegðun.

## Localhost checks for Stebbi

### Loader

1. Reikna leið.
2. Meðan leið reiknar:
   - Vænt (mobile): Akstur-panel sýnir loading-texta; enginn stór loader blæs í gegn.
   - Vænt (desktop): loader á kortasvæðinu; panel sýnir loading-texta í sinni dálk.

### Fleiri spátímar

1. Reikna leið.
2. Opna Akstur.
3. Skruna niður að scrubber.
4. Vænt: "Sækja fleiri spátíma" takki birtist ef > 8 tímar eru í boði.
5. Smella á takkann.
6. Vænt: fleiri spátímar birtast í heatmap.

### Filter-pillur

1. Fara í Kort.
2. Reikna leið.
3. Vænt: filter-pillur (status colors) sýnast strax í bottom strip; enginn "Nánar" takki.

### Vegagerðin spjald

1. Fara í Kort.
2. Ganga úr skugga um að "Vegagerðin" ham sé virkur.
3. Smella á Vegagerðin-punkt (dökkgrænn/gulur/rauður dot).
4. Vænt:
   - compact spjald birtist í bottom strip;
   - stöðvanafn, vindur m/s, WindStatusBadge og hiti sjást;
   - smella á spjaldið opnar pulse-síðu í nýjum flipa.
5. Smella á Veðurstofan-punkt.
6. Vænt: Vegagerðin spjaldið hverfur.

### Nav pills

1. Fara í "Mitt veður".
2. Fara í "Kort".
3. Vænt: eingöngu "Kort" er highlighted; "Mitt veður" er ekki highlighted.
4. Fara í "Akstur".
5. Fara í "Kort".
6. Vænt: eingöngu "Kort" er highlighted; "Akstur" er ekki highlighted.

### Vistaðir staðir (innskráður notandi)

1. Reikna leið Reykjavík → Akureyri.
2. Hreinsa leið.
3. Fókusa á "Frá" input (tómt).
4. Vænt: "Nýlegir staðir" dropdown birtist með Reykjavík og Akureyri.
5. Velja stað.
6. Vænt: staðurinn fyllist inn.
7. Smella á × við stað.
8. Vænt: hann hverfur úr lista.
9. Endurnýja síðu.
10. Vænt: staðurinn er ennþá horfinn (eyðing var send á server).

### Guest-notandi

1. Skrá út og opna síðuna.
2. Fókusa á "Frá" input.
3. Vænt: enginn "Nýlegir staðir" dropdown.

## Supabase / production

- Engin SQL-skrá var skrifuð.
- Engin migration var skrifuð eða keyrð.
- Engin áhrif á gögn, RLS, auth, grants, policies eða functions.
- Engin env-, secrets-, billing-, deploy- eða production-breyting var gerð.
