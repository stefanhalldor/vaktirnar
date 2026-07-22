# TODO 086 / Road Intelligence v1 - Codex Hotfix Handoff

Created: 2026-07-22 09:22  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: prerelease handoff for Claude Code review

## Skilningur á samþykki

Stebbi gaf skýrt framkvæmdarleyfi til að laga eftirfarandi í `/auth-mvp/vedrid/road-map-prototype`:

- Kortið opnaðist enn án þess að “Núna” væri raunverulega virkt.
- Fyrsta route-state/pillutalning gat enn fallið í gamla 80 MET/Yr punkta fallbackið.
- Engin greinileg hourly forecast vinna birtist í scrubbernum ef provider-spáslot voru ekki tilbúin.
- Stöðvarheiti klesstust yfir vindtölur.
- Kortið virtist frjósa meðan “Leita að fleiri leiðum…” var í gangi.
- Það vantaði skýra Frá/Til endpoint-labela á route.

Þetta fól í sér kóðabreytingar og handoff-skrá. Þetta fól ekki í sér commit, push, deploy, SQL keyrslu, migration, env-breytingu eða production breytingu.

## Plan áfangans

1. Gera `Núna` state öruggara með React-state, ekki aðeins refs.
2. Taka gamla 80-punkta fallbackið úr route-station talningu í nýja kortinu.
3. Gera hourly scrubber stöðuna sýnilega: loading þegar provider-spáslot eru reiknuð, error ef þau fást ekki.
4. Laga route-station labels þannig að vindtalan sé alltaf primary og station-name labelar víki ef þeir rekast á.
5. Gera “leita að fleiri leiðum” minna blocking fyrir MapLibre.
6. Sýna Frá/Til route endpoint labels.

## Hvað var gert

- Bætti við `routeWeatherMode` React-state samhliða `routeWeatherModeRef`, svo UI rerenderist þegar kortið er í `now` eða `forecast`.
- Bætti við `routeNowStatusCounts`, sérstöku state fyrir Núna-talningu.
- Breytti route-talningu þannig að `Núna` notar provider station counts, ekki `mapData.statusCounts` úr MET/Yr fallbackinu.
- Ef hvorki Vegagerðin né Veðurstofan skilar route-provider stöðvum er nú tómt count `{}` frekar en 80 sampled weather-points.
- Þegar `Núna` er valið eða route opnast er `routeWeatherMode` stillt á `now` ef Vegagerðin er til staðar.
- Þegar forecast slot er valið er `routeWeatherMode` stillt á `forecast`.
- Ef Veðurstofu route-layer eða full hourly candidates vantar er `routeForecastBuildStatus` nú sett í `error`, svo scrubber sýnir skilaboð í stað þess að þegja.
- Surface-route leit er sett í `setTimeout(..., 75)` eftir að kortið fer í success-state, og `fetchRouteSurfaceChoices()` gefur browsernum yield milli route/surface-summary skrefa.
- Route-station labelar fengu placement-helper:
  - Ef næsti punktur er aðallega norður/suður fer label til hliðar.
  - Ef næsti punktur er aðallega austur/vestur fer vindlabel fyrir ofan punkt og heiti fyrir neðan.
- Bætti collision pass sem felur station-name labela ef þeir rekast á vindtölur eða önnur station-name label.
- Vindtölur eru ekki faldar af collision passinu.
- Collision pass keyrir eftir render/filter/mode breytingar og við `moveend`/`zoomend`.
- Endpoint-labelar eru nú renderaðir sem `bottom` anchored labels með einföldu nafni úr resolved Frá/Til stað.
- Vegagerðar route-label sýnir áfram bara meðalvind `m/s`, ekki hviður.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx` (óbreytt frá fyrri Codex pass í þessari lotu, en enn í diffi)
- `messages/is.json` (óbreytt frá fyrri Codex pass í þessari lotu, en enn í diffi)
- `messages/en.json` (óbreytt frá fyrri Codex pass í þessari lotu, en enn í diffi)
- `ai-handoff/2026-07-22-0922-todo-086-v312-codex-now-label-scrubber-hotfix-prerelease.md`

## Skipanir keyrðar

- `Get-Content -Encoding UTF8 WORKFLOW.md`
  - Exit code: 0
- `Get-Content -Encoding UTF8 Design.md`
  - Exit code: 0
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
  - Exit code: 0
- Ýmsar `rg` og `Get-Content` skoðanir á route-kóða
  - Exit code: 0
- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: 0
  - 1 test file passed, 25 tests passed
- `git diff --check`
  - Exit code: 0
  - Aðeins CRLF warnings, engar whitespace villur
- `git status --short`
  - Exit code: 0
  - Sýnir einnig `.obsidian/workspace.json` dirty, sem Codex snerti ekki

## Ekki gert

- Ekki keyrt localhost browser-próf, því Stebbi keyrir dev server og browser sjálfur.
- Ekki commit, push eða deploy.
- Ekki SQL/migration/env breytingar.
- Ekki breytt API timeout fyrir Veðurstofu route-layer.
- Ekki byggður sér background endpoint fyrir hourly Veðurstofu-layer. Ef layerinn vantar úr `/api/teskeid/weather/travel`, þá sýnir client nú error í scrubber í stað þess að falla þögult í MET/Yr.

## Ákvarðanir

- Nýja MapLibre route-kortið á ekki að nota gamla 80 MET/Yr weather-point count sem route-station count. Þetta var helsti ruglingsvaldurinn.
- Station-name labelar eru secondary. Vindtalan er primary og má ekki hverfa vegna collision.
- Surface-route/slitlagsleit má ekki halda route map upplifun hostage. Hún fer í bakgrunn með yield milli skrefa.
- Frá/Til labelar þurfa ekki format-address eða extra metadata. Nafnið eitt er nóg í prototype.

## Áhætta / hvað Claude Code þarf að rýna

- **Hourly scrubber:** Ef Stebbi sér enn bara `Núna` og error-message, þá er líkleg næsta rót að `vedurstofanLayer` vantar úr `/api/teskeid/weather/travel`, líklega vegna timeout eða data gating. Client notar nú ekki MET/Yr fallback til að falsa provider-spáslot.
- **Collision:** Þetta er einföld DOM collision-lógík, ekki full label engine. Hún ætti að minnka klessu, en Claude Code ætti að rýna hvort station-name hiding sé of agressive.
- **Endpoint labels:** Þau eru DOM markers og ættu að sjást ef start/end eru innan viewport. Ef þau sjást ekki þarf að athuga z-index eða hvort map fitBounds skilur endpoint utan sýnilegs svæðis.
- **Surface-search freeze:** Yield + delayed start ætti að hjálpa. Ef kortið frýs enn er næsti grunaði `summarizeRouteRoadSurface()` CPU-kostnaður á main thread.
- **RouteWeatherMode state:** Nýtt state og ref þurfa að haldast sync. Allar breytingar fara nú í gegnum `setRouteWeatherModeState()`.

## Route intelligence check

- Snertir leiðartengt Road Intelligence flæði í `/auth-mvp/vedrid/road-map-prototype`.
- Ekki bætt við nýjum route-gögnum, SQL, Supabase geymslu eða provider route provider breytingu.
- Breytingin heldur provider-neutral skilum að mestu: `now` notar Vegagerðina, `forecast` notar Veðurstofu-layer þegar hann er til.
- Gamla MET/Yr point sampling er ekki lengur notað sem route-station talning í prototype UI.
- `IcelandRoadmap.md` var ekki uppfært í þessum hotfix, því þetta var client/UI state og label-lagfæring, ekki canonical route-domain breyting.

## Design.md check

- Mobile-first kortaupplifun var varðveitt; engin ný stór card/landing UI.
- Vindtala er primary compact label, station-name er secondary label.
- Label collision reynir að forðast overlap og texta yfir mikilvægustu upplýsingum.
- Loading feedback er áfram til staðar: full Teskeið-loader fyrir initial route, scrubber texti fyrir hourly state.
- Engir nýir notendatextar voru hardcode-aðir í þessum pass; fyrri error-texti er í `messages/is.json` og `messages/en.json`.

## Localhost checks for Stebbi

Opna:

- `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Setup:

- `ROAD_INTELLIGENCE_V1_ENABLED=true`
- Innskráður notandi með `road-intelligence-v1` feature access.
- Velja route sem hefur nokkrar Vegagerðarstöðvar, t.d. Ísafjörður -> Reykjavík eða Akureyri -> Egilsstaðir.

Prófa:

1. Slá inn Frá/Til og ýta á `Reikna`.
2. Staðfesta að full-screen loader hverfi þegar `Núna` er tilbúið.
3. Staðfesta að scrubber opnist á `Núna`, ekki forecast sloti.
4. Staðfesta að pillutalning undir kortinu telji sýnilegar route-stöðvar, ekki 80 MET/Yr punkta.
5. Staðfesta að Vegagerðarstöðvar í `Núna` sýni vindtölu við alla route-station punkta sem eru sýnilegir samkvæmt filter.
6. Staðfesta að station-name labelar klessist síður yfir vindtölur; vindtölur mega ekki hverfa þótt station-name feli sig.
7. Pan/zoom-a kortið og athuga hvort station-name labelar raðist/hverfi betur eftir plássi.
8. Staðfesta að Frá/Til staðarheiti sjáist við upphaf/lok route ef þau eru innan viewport.
9. Á meðan `Leita að fleiri leiðum…` birtist, prófa að pan/zoom-a kortinu. Kortið á ekki að frjósa.
10. Bíða eftir hourly scrubber:
    - Ef Veðurstofu route-layer er til staðar á að birtast fleiri departure slots eftir background calculation.
    - Ef layer vantar á að birtast error texti í scrubber, en `Núna` á samt að virka.

Regressions að passa:

- `/auth-mvp/vedrid` gamla kortið á ekki að breytast.
- Overview `Núna`/Veðurstofan mode toggle á nýja kortinu á ekki að sýna route markers þegar route er ekki virk.
- Status pill filters eiga að fela/sýna bæði circle layer og DOM labels samræmt.
- Ekki prófa production deploy eða SQL án sér leyfis.

## Næsta skref

Claude Code ætti að rýna sérstaklega hvort `vedurstofanLayer` sé að koma með `/api/teskeid/weather/travel` í þeim routes sem Stebbi prófar. Ef ekki, þá er næsta stóra skref líklega API/data-layer vinna: að gera provider forecast layer að raunverulegu background step eða hækka/endurhanna timeout þannig að hourly scrubber fái Veðurstofugögn án þess að lengja initial `Núna` bið of mikið.

## Óvissa / þarf að staðfesta

- Confidence: medium-high fyrir að 80-punkta count ruglið sé lagað í client state.
- Confidence: medium fyrir label collision, því þetta þarf raunverulegt browser/mobility próf á þéttum routes.
- Confidence: medium-low fyrir hourly scrubber fulla virkni ef API skilar ekki `vedurstofanLayer`; client sýnir nú error frekar en þögn, en full lausn gæti þurft API/background provider vinnu.
