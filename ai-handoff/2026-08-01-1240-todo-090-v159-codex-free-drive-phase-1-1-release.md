# TODO-090 — Phase 1.1 sameiginlegur live-akstur

**Staða:** Útgáfuhæft eftir fulla prófun. Beint production-rollout var sérstaklega samþykkt af Stebba.

## Plan áfangans

1. Fjarlægja sérsmíðaða free-drive stöðvalistann.
2. Láta route-live og free-drive nota sama Vegagerðar-presentation model, sama stöðvaspjald og sama update-in-place ferli.
3. Láta báða hamina nota sama neðra live-stjórnborð og áfram eitt GPS watch/lifecycle.
4. Setja vindmarkastaðfestingu fyrir framan GPS-beiðni og nota núverandi threshold API/persistence.
5. Varðveita route-specific gögn eingöngu í route-live og landsstöðvar/density eingöngu í free-drive.

## Orsök fyrri tvítekningar

Phase 1 free-drive var lagt ofan á almenna kortayfirlitið og fékk sér `freeDriveNearbyStations` lista og sér neðri skúffu. Route-live notaði á sama tíma ítarleg Vegagerðarspjöld, update-in-place og annað neðra viðmót. Því þurfti sama UI- og öryggisbreyting að vera útfærð tvisvar.

## Hvað var gert

- Bætt var við sameiginlegu `LiveVegagerdinStation` presentation model-i og tveimur adapterum:
  - route-matched `VegagerdinRouteLayerPoint`
  - nationwide `VegagerdinCurrentStationDto`
- Báðir aksturshamir nota nú sama `createLiveVegagerdinStationLabel` renderer fyrir stöðvaspjöld, vindör, vind/hviðu, liti, hitasíu, provider, mælitíma, freshness og aria-texta.
- Sama `updateLiveVegagerdinStationLabelInPlace` uppfærir spjöld í báðum hömum án þess að fjarlægja MapLibre marker eða valda reglulegu blikki.
- Free-drive heldur nationwide density/clustering og velur alltaf versta status sem fulltrúa clusters; route-live heldur öllum route-matched stöðvum og leiðarlínu.
- Sameiginlegur `LiveDriveMapControls` íhlutur á sameiginlegt mobile/safe-area stjórnborð, collapse/expand, „Á ferðinni núna“ og „Skipuleggja“.
- `Stöðva` helst aðgengilegt þótt stillingahlutinn sé minnkaður.
- Sérsmíðaður nearby-stöðvalisti/skúffa var fjarlægð.
- „Af stað“ opnar nú threshold-milliskref áður en GPS er ræst. Vistuð mörk og filter-mode eru sótt úr núverandi threshold preference API-i; gild mörk eru vistuð með sama API-i.
- „Hefja akstur“ er óvirkur þar til mörkin eru gild og óþægindamörk eru lægri en hættumörk.
- GPS er aðeins ræst eftir skýrt click á „Hefja akstur“; sign-in return opnar milliskrefið en biður ekki um location á mount.
- Free-drive og route-live halda sjálfstæðum status-filter Set-um; tómt Set merkir áfram „sýna allt“ í hvorum ham fyrir sig.
- Hitastig yfir 2 °C er falið í báðum live-hömum, líka úr aria-texta.
- Gömul, framtíðardagsett eða ógild current gögn fara áfram fail-closed í `no_data`.

## Sameiginleg eign

- Station model/adapters: `lib/weather/liveVegagerdinStation.ts`
- Station DOM/MapLibre presentation: `createLiveVegagerdinStationLabel` og `updateLiveVegagerdinStationLabelInPlace` í `RoadMapPrototypeMap.tsx`
- Live controls: `components/weather/LiveDriveMapControls.tsx`
- Threshold fields: `components/weather/LiveDriveThresholdFields.tsx`
- GPS watch, follow/recenter, compass og cleanup: núverandi sameiginlegi kjarninn í `RoadMapPrototypeMap.tsx`

## Það sem er enn mode-specific

- Route-live: route line, route-matching, route-filtered stöðvar, ETA/route index, brottfararspá og route assessment.
- Free-drive: allar núverandi Vegagerðarstöðvar á landinu og nationwide density/clustering.

Þessi aðskilnaður er viljandi; free-drive býr ekki til falska leið, ETA eða Google-/route-gögn.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/LiveDriveMapControls.tsx` (ný)
- `components/weather/LiveDriveThresholdFields.tsx` (ný)
- `lib/weather/liveVegagerdinStation.ts` (ný)
- `lib/__tests__/live-vegagerdin-station.test.ts` (ný)
- `lib/__tests__/road-map-free-drive-ui.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `messages/is.json`
- `messages/en.json`

## Prófanir og exit codes

- Afmörkuð Vitest keyrsla, 6 skrár / 104 próf: **PASS**, exit 0.
- `npm run type-check`: **PASS**, exit 0.
- `git diff --check`: **PASS**, exit 0.
- `npm run test:run`: **PASS**, exit 0 — 228 test files passed, 1 skipped; 4.750 próf passed, 28 skipped, 8 todo.
- Fyrsta `npm run lint` tilraun ræstist ekki vegna Windows PowerShell execution-policy: exit 1, engin lint keyrsla eða kóðavilla.
- `npm.cmd run lint`: **PASS**, exit 0, með fyrirliggjandi warnings en engum errors.
- `npm.cmd run build`: **PASS**, exit 0.

## Sleppingar og áhætta

- Engin browser automation var keyrð; Stebbi óskaði eftir beinu production-rollouti og ætlar að prófa í síma þar.
- Lint heldur áfram að sýna fyrirliggjandi React Hook og image warnings í repo-inu. Þau stöðva ekki build og voru ekki víkkuð út í þessari afmörkuðu breytingu.
- Nationwide density er áfram viljandi frábrugðin route-live collision-reglum vegna þess að free-drive vinnur með hundruð landsstöðva en route-live sýnir afmarkað route-matched mengi. Sjálft spjaldið, status-forgangur og update-in-place eru sameiginleg.

## Supabase, migrations og production gögn

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin migration, schema-, RLS-, grant-, auth- eða Supabase-breyting var gerð.
- Núverandi `/api/teskeid/weather/preferences/thresholds` er endurnýtt óbreytt fyrir vistuð vindmörk.
- Engin location gögn eru vistuð eða send með þessari breytingu.
- Dev server var hvorki ræstur né endurræstur.

## Localhost checks for Stebbi

Þó þessi útgáfa fari samkvæmt fyrirmælum beint í production má nota sömu skref á `/auth-mvp/vedrid` á localhost eða production:

1. Skráðu þig inn og ýttu á „Af stað“.
   - Vænt: vindmarkamilliskref birtist með vistuðum mörkum; engin GPS-beiðni kemur enn.
2. Settu óþægindamörk jafnhá eða hærri en hættumörk.
   - Vænt: validation birtist og „Hefja akstur“ er óvirkur.
3. Settu gild mörk, ýttu á „Hefja akstur“ og leyfðu staðsetningu.
   - Vænt: live-kort opnast með sömu Vegagerðarspjöldum og route-live, en án leiðarlínu, ETA eða áfangastaðar.
4. Zoom-aðu út og inn.
   - Vænt: density heldur kortinu læsilegu og cluster sýnir aldrei mildari lit en versti undirliggjandi punktur.
5. Prófaðu filtera, follow/recenter og minnka/stækka neðra stjórnborðið.
   - Vænt: controls virka eins og í route-live; „Stöðva“ er aðgengilegt og filter-state lekur ekki milli aksturshama.
6. Athugaðu ferska, gamla og no-data stöð og stöð með hita yfir 2 °C.
   - Vænt: freshness/no-data er fail-closed og hitinn yfir 2 °C birtist hvorki sjónrænt né í skjálesaratexta.
7. Veldu „Skipuleggja“.
   - Vænt: free-drive GPS/polling stöðvast og ferðaskipulagning opnast.
8. Reiknaðu leið og ræstu route-live.
   - Vænt: leiðarlína og route-matched stöðvar sjást, með sömu stöðvaspjöldum og stjórnborði og í free-drive.
9. Prófaðu í iPhone-stærð.
   - Vænt: enginn láréttur overflow, input veldur ekki zoom-i og Stop/stjórnborð fer ekki undir browser chrome eða safe-area.
