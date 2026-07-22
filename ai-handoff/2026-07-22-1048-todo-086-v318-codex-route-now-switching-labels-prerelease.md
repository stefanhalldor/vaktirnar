# 2026-07-22 10:48 - todo-086 v318 - Codex route now/switching/labels prerelease handoff

## Plan áfangans

1. Herða það að nýja Road Intelligence kortið opnist alltaf á `Núna`.
2. Losa kortið undan óþarfa main-thread vinnu eftir að fyrsta leiðin birtist.
3. Skipta gráum "future" scrubber-punktum út fyrir raunverulegt loading-state meðan fyrstu 24 klst. eru reiknaðar.
4. Láta vindlabel, stöðvarheiti og punkt fylgjast að þegar þysjað er.
5. Sýna brottfararstað og áfangastað sem route endpoint-labela.
6. Fjarlægja óæskilega skilaboðið um að ekki hafi tekist að reikna alla spátíma.
7. Gera leiðarval milli valkosta án full-screen Teskeið-loader.

## Hvað var raunverulega gert

- `Núna` er nú með raunverulegan index `0` í route-scrubber í stað þess að treysta á `null` sem sértilvik.
- `RoadMapPrototypeMap` reiknar `effectiveSelectedCandidateIdx`, þannig UI notar `0` þegar leið er til en state er enn tímabundið `null`.
- Fyrsti route-render sýnir aðeins `Núna` strax og setur svo background-status í scrubber á meðan forecast-tímar eru reiknaðir.
- Gráu `no_data` fallback-punktarnir fyrir næstu 24 klst. voru teknir út. Ef provider forecast-statusar fást ekki birtast þeir ekki sem tilbúnir gráir tímar.
- Fyrsta sýnilega slot-magn er nú `ROUTE_TIMELINE_INITIAL_SLOT_COUNT`, sem er `Núna + næstu 24 heilu tímar`.
- Route-valkostir eru nú sóttir eftir að kortið hefur fengið að painta, og slitlagsgreining fyrir hvern valkost er hydratuð í litlum skömmtum á eftir.
- `fetchRouteSurfaceChoices()` skilar route-valkostunum strax með `surfaceSummary: null`; `hydrateRouteSurfaceChoiceSummaries()` fyllir inn slitlagsupplýsingar síðar.
- Þegar notandi velur annan route-valkost er gamla kortið látið standa, `routeBridgeStatus` er ekki sett í `loading`, og aðeins viðkomandi route-pilla fær textann `Sæki leið...`.
- `routeSwitchingChoiceId` er hreinsað í nýrri route-leit og clear-flow svo það geti ekki setið fast.
- Vindlabelar eru nú DOM-markerar með innbyggðum punkti, vindtölu og stöðvarheiti í sama marker. Þetta ætti að koma í veg fyrir að label færist frá punktinum við zoom.
- Endpoint-labelar fyrir Frá/Til eru nú líka zero-size DOM-markerar með innbyggðum punkti og nafni.
- `roadMapPrototypeScrubberSourceFallback` er ekki lengur sýnt þegar fallback er notað; fallið skilar tóma strengnum fyrir fallback.
- Óæskilega error-skilaboðið `Náði ekki að reikna alla spátímana. Núna-staðan er samt tilbúin.` er ekki lengur notað í UI. Error state fer í `idle` í stað sýnilegs error texta.

## Tilraunir sem voru prófaðar eða hertar í þessum hring

- Fyrri tilraun v316: `DepartureHeatmap` lét `Núna` smella á `0` og birti selected-state fyrir `null + firstSlotLabel`.
- Fyrri tilraun v316: Surface-choice fetch var seinkað um 1200 ms til að láta kortið painta fyrst.
- Fyrri tilraun v316: Station label placement var einfaldað í vertical marker.
- Þessi umferð: ekki nóg að stilla `selectedCandidateIdx` á `0`; UI þarf líka `effectiveSelectedCandidateIdx` þannig selected-state lifir React batching/race.
- Þessi umferð: ekki nóg að seinka surface-choice fetch; slitlagsgreiningin sjálf þarf að vera progressive hydration í stað sequential blokks áður en route-valkostir sjást.
- Þessi umferð: ekki nóg að færa texta með offset; marker þarf að innihalda bæði punkt og labels svo allt hreyfist saman með MapLibre projection.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
  - `Núna` selection fallback (`effectiveSelectedCandidateIdx`)
  - route forecast loading/ready/idle state
  - surface route choices progressive loading
  - route switching without full-screen loader
  - route station DOM labels with co-located dot/value/name
  - origin/destination endpoint labels
  - hidden MET/Yr sampled route points remain hidden
- `components/weather/DepartureHeatmap.tsx`
  - simple/detailed-aware slot filtering
  - `Núna` slot uses real index `0`
  - arrows navigate actual filtered slots
- `messages/is.json`
  - added `roadMapPrototypeSurfaceRouteSwitching`
- `messages/en.json`
  - added `roadMapPrototypeSurfaceRouteSwitching`

## Skipanir sem voru keyrðar

- `rg ... components/weather/RoadMapPrototypeMap.tsx components/weather/DepartureHeatmap.tsx messages/is.json messages/en.json`
  - Exit code: 0
  - Notað til að finna route/scrubber/label/error texta.
- `git diff -- components/weather/RoadMapPrototypeMap.tsx components/weather/DepartureHeatmap.tsx messages/is.json messages/en.json`
  - Exit code: 0
  - Output var langur og truncaðist í terminal, notað sem yfirferð.
- `npm run type-check`
  - Exit code: 0
  - `tsc --noEmit` grænt.
- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: 0
  - 1 test file, 25 tests passed.
- `git diff --check`
  - Exit code: 0
  - Aðeins CRLF warnings, engar whitespace/diff villur.
- `git status --short`
  - Exit code: 0
  - Ath: `.obsidian/workspace.json` er dirty en var ekki snert af Codex.

## Niðurstöður

- TypeScript er grænt.
- Route slot status tests eru græn.
- Diff-check er grænt fyrir raunverulegum villum.
- Enginn dev server var ræstur eða endurræstur.
- Ekkert SQL var keyrt.
- Ekkert commit/push/deploy var gert.

## Hvað mistókst eða var sleppt

- Ég gat ekki browser-staðfest sjónrænt á localhost, þar sem Stebbi keyrir dev server/browser sjálfur í þessu workflow.
- Þetta lagar ekki endanlegt open-road-graph routing eða gravel-avoidance routing engine. Það er stærri næsti áfangi.
- Label collision er enn heuristic. DOM markerar ættu að hætta að reka frá punktum, en density/overlap getur enn þurft polish eftir skjápróf.
- Background forecast calculation notar áfram núverandi provider-slot logic. Ef `vedurstofanLayer` vantar koma ekki 24h slots, og þá er það réttara en að birta falska gráa punkta.

## Ákvarðanir sem Codex tók

- Ekki setja full-screen Teskeið-loader á milli route-valkosta. Gamla route-view á að standa meðan ný leið sækist.
- Ekki birta `error` texta í scrubber þegar hourly forecast calculation mistekst. `Núna` er þá áfram nothæft.
- Ekki birta MET/Yr sampled route points sem fallback í nýja kortinu. Þeir eru enn notaðir í response/fallback mati en ekki sem sjónrænir route punktar.
- Ekki bíða með route-valkosti eftir slitlagsgreiningu. Leiðir birtast fyrst, slitlagsinfo fyllist inn síðar.

## Áhætta sem er enn til staðar

- Ef user smellir route-valkost meðan surface-summary hydration er í gangi er gamla hydration abortuð. Þetta er viljandi, en Claude ætti að rýna hvort við viljum endurræsa hydration fyrir route-valkostalistann eftir switch.
- Ef `vedurstofanLayer` kemur tómt úr API fæst ekki forecast-timeline. UI mun þá halda bara `Núna`, án villuboða. Þetta er betra en röng grá timeline, en þarf mögulega telemetry eða debug log.
- Endpoint-labelar geta lent undir bottom strip ef fitBounds/padding er óheppilegt á litlum skjám. Þeir eru til staðar í DOM, en þarf localhost-próf.
- Þar sem station DOM marker inniheldur eigin punkt, gæti punktur sést tvöfaldur með undirliggjandi GeoJSON circle. Ef það truflar skal minnka `circle-opacity` route-layers eða nota circle-layers eingöngu fyrir hit/click.

## Tillaga að næsta skrefi

Claude ætti að rýna sérstaklega:

1. Hvort `effectiveSelectedCandidateIdx` sé nóg til að tryggja að `Núna` sé selected eftir fyrsta render og eftir background update.
2. Hvort route station label DOM-markerar fylgi punktum við zoom/pan í raun á localhost.
3. Hvort surface-choice hydration sé nógu létt og valdi ekki frystingu.
4. Hvort `routeForecastBuildStatus` fer í `loading` og birtir scrubber texta á meðan fyrstu 24 klst. eru reiknaðar.
5. Hvort user getur skipt milli route-valkosta án full-screen loader og án þess að gamla route-view hverfi.

Næsti stóri áfangi eftir þetta ætti að vera:

- Færa route calculation úr núverandi Google-/fallback-bridge yfir í eigin open-road graph incrementally undir sama feature flaggi.
- Byrja á gravel-aware routing þar sem route-valkostur merktur með möl fær valkost sem reynir að forðast möl.
- Halda gamla bridge sem fallback þar til nýja routingið nær meiri coverage.

## Spurningar sem Codex vill að Claude rýni

- Er `calculateResolvedRoute()` enn of mikið bundið við `travelResult.travelPlan` þannig timeline falli aftur í synthetic candidates ef API skilar bara einum candidate?
- Ætti `hydrateRouteSurfaceChoiceSummaries()` að hætta alveg þegar route-valkostir eru komnir, og sækja summary fyrst þegar valkostakassi er sýnilegur?
- Eigum við að gera `routeForecastBuildStatus` sýnilegra í scrubber, t.d. spinner eða texta inni í timeline-row í stað subtitle?
- Er betra að gera route station labels sem MapLibre symbol layer til lengri tíma, eða DOM markerar séu rétti prototype-millileikurinn?

## Supabase / SQL

- Engin SQL-skrá var skrifuð í þessum áfanga.
- Engin SQL var keyrð.
- Engin áhrif á RLS, auth, grants, policies, functions eða production gögn.

## Localhost checks for Stebbi

Prófaðu á localhost án þess að deploya:

1. Opna `/auth-mvp/vedrid/road-map-prototype` sem notandi með `road-intelligence-v1` flagg.
2. Reikna `Akureyri -> Egilsstaðir`.
   - Vænt: full-screen Teskeið-loader sést aðeins meðan fyrsta leið + `Núna` reiknast.
   - Vænt: kort opnast á `Núna`, Now-slot er selected, og pillutalning telur sömu route-stöðvar og sjást á kortinu.
   - Vænt: ekki sjást gráir future-punktar sem tilbúið veður. Ef 24h útreikningur er í gangi á að sjást loading-texti í scrubber.
3. Þysja inn og út á route-stöðvum.
   - Vænt: punktur, vindtala og stöðvarheiti fylgjast að.
   - Vænt: nöfn mega fela sig vegna collision á þéttum svæðum, en þau eiga ekki að reka langt frá punktum.
4. Prófa `Ísafjörður -> Reykjavík`.
   - Vænt: `Núna` er valið sjálfkrafa og ekki sést 80 MET/Yr route-punkta state sem valin leið.
   - Vænt: Frá/Til labelar birtast við upphaf og endi leiðar þegar zoom/padding leyfir.
5. Bíða þar til fleiri route-valkostir birtast.
   - Vænt: kortið má ekki frjósa óþægilega meðan verið er að leita eða hydrata slitlagsinfo.
   - Vænt: hægt er að velja annan route-valkost án full-screen loader; gamla leiðin helst sýnileg þar til ný leið kemur inn.
6. Staðfesta að textinn `Náði ekki að reikna alla spátímana. Núna-staðan er samt tilbúin.` birtist hvergi.

Ekki keyra Supabase SQL, ekki deploya og ekki breyta feature flags í production út frá þessum localhost-prófum nema Stebbi samþykki það sérstaklega.
