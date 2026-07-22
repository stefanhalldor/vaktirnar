# TODO 086 - Road Intelligence now/timeline/labels hotfix

Created: 2026-07-22 08:58  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: Prerelease handoff for Claude Code review

## Skilningur á samþykki

Stebbi gaf Codex skýrt framkvæmdarleyfi til að laga eftirfarandi í nýja `/auth-mvp/vedrid/road-map-prototype` kortinu:

- kortið opnist raunverulega á `Núna` source/state
- hætta að detta í gamla 80 MET/Yr sample-punkta sem sýnilega/talda route stöðvar
- sýna vindtölu á öllum route-stöðvum
- sýna station names og brottfarar-/áfangastað
- koma brottfarar-klukkustundum aftur inn í scrubber

Þetta felur í sér kóðabreytingar í repo. Þetta fól ekki í sér commit, push, deploy, SQL, migration, Supabase, env eða production breytingar.

## Plan áfangans

1. Lesa v305/v308 stöðu í `RoadMapPrototypeMap` og `DepartureHeatmap`.
2. Finna af hverju `Núna` birtist eins og selected en hegðar sér ekki sem provider-now state.
3. Skipta skýrar milli:
   - `Núna`: Vegagerðin route layer þegar Vegagerðin skilar stöðvum
   - forecast slots: Veðurstofan ETA-matched forecast layer
   - MET/Yr route sample: aðeins fallback data, ekki sýnilegir punktar
4. Láta scrubber nota `timelineCandidates` í single-departure flow, eins og gamla `/ferdalagid`.
5. Sýna allar route station wind labels og station names.
6. Bæta við endapunkta-labelum fyrir frá/til.
7. Keyra type-check og route-slot tests.

## Hvað var gert

- `DepartureHeatmap`:
  - `selectedIdx = null` + `firstSlotLabel` er nú treated sem raunverulegt selected `Núna` slot.
  - Click á fyrsta sloti með `firstSlotLabel` kallar nú alltaf `onSelectIdx(null)` í stað þess að fara í candidate index `0`.
  - Örvarnar hoppa nú rétt frá `Núna` yfir á næsta sýnilega forecast-slot, líka ef filter felur núverandi slot.

- `RoadMapPrototypeMap`:
  - Bætti við `getRouteDepartureCandidates()` sem notar sama source og gamla `/ferdalagid`:
    - `outbound.candidates` í window mode
    - `outbound.timelineCandidates` í normal single-departure mode
  - Þetta ætti að laga að scrubber sýni ekki bara `Núna`, heldur fyrstu 24 klst og `Sækja meira` þegar fleiri eru til.
  - `activeRouteStatusCounts` notar nú beint `routeVegagerdinPointsRef.current` þegar `selectedCandidateIdx === null`, svo pillurnar telja sýnilegar Vegagerðar route-stöðvar í `Núna`, ekki 80 MET/Yr sample-punkta.
  - Route labels eru nú provider-visible:
    - `Núna` sýnir Vegagerðin labels ef route layer er til.
    - forecast slot sýnir Veðurstofan labels.
    - `TRAVEL_METNO_LAYER_ID` er áfram falið.
  - Tók density filter af Veðurstofan route labels í prototype-inu svo allar matched stations fái vindlabel. Þetta er meðvitað til að gera matching-galla augljósa í þessari tilraun.
  - Breytti route wind label í tvískiptan compact marker:
    - efri label: `7 m/s`
    - neðri label: station name
  - Vegagerðin route label sýnir nú bara meðalvind, ekki hviðu, í samræmi við nýjustu leiðréttingu Stebba um skipulagskortið.
  - Bætti við route endpoint markers fyrir origin/destination svo brottfararstaður og áfangastaður birtist áfram í route mode þótt almenn place labels séu falin.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `lib/road-intelligence/travelBridgeMapData.ts`
- `lib/road-intelligence/vegagerdinRouteLayer.ts`
- `app/api/teskeid/weather/travel/route.ts`

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`

Athugið: `messages/is.json` og `messages/en.json` eru enn dirty frá fyrri v308 hotfixi með `roadMapPrototypeScrubberHourlyError`, en Codex breytti þeim ekki í þessum v310 áfanga.

## Skipanir og niðurstöður

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- road-intelligence-route-slot-statuses`
  - Exit code: 0
  - 25 tests passed
- `git diff --check`
  - Exit code: 0
  - Aðeins CRLF warnings, engar whitespace errors.

## Hvað var ekki gert

- Ekki keyrt localhost browser próf, því Stebbi keyrir dev server/browser sjálfur.
- Ekki keyrt full test suite.
- Ekki commit/push/deploy.
- Ekki SQL/migration/Supabase/env breyting.
- Ekki snert `.obsidian/workspace.json`, sem er dirty fyrir utan þessa vinnu.

## Ákvarðanir

- `Núna` á ekki að vera venjulegur forecast candidate index í UI-state. `selectedIdx=null` er nú explicit `Núna`.
- Í route mode eru visible labels mikilvægari en density í þessum áfanga. Ef það verður of crowded má seinna gera smart collision/density, en fyrst þarf sannprófun að allar stöðvar skili sér.
- Vegagerðin route labels sýna meðalvind eingöngu. Hviður mega áfram vera í popup/detail ef við viljum síðar, en ekki í compact route-planning labelinu núna.
- Timeline scrubber á að byggja á `timelineCandidates` í normal flow, ekki `outbound.candidates`, því gamla `/ferdalagid` notar sama pattern.

## Áhætta / það sem Claude Code þarf að rýna

- Mikilvægast: staðfesta í browser að route opnist strax með Vegagerðin `Núna` labels, án þess að þurfa að smella á `Núna`.
- Staðfesta að `timelineCandidates` séu raunverulega til í response fyrir leiðir eins og `Akureyri -> Egilsstaðir` og `Ísafjörður -> Reykjavík`. Ef API skilar þeim ekki, þarf næsta fix í `/api/teskeid/weather/travel`.
- Labels á öllum route-stöðvum geta skarast á þröngum zoom. Það er samþykkt sem prototype-sannprófun en ekki endanlegt UX.
- `activeRouteStatusCounts` notar ref í render þegar `selectedCandidateIdx === null`. Þetta er viljandi til að telja route-provider stöðvar strax, en Claude Code ætti að meta hvort betra sé að gera `routeNowStatusCounts` að sér state í næsta cleanup.
- Ef Vegagerðin route layer vantar alveg en Veðurstofan route layer er til, `Núna` fellur í Veðurstofu forecast at `Date.now()`. Það er fallback, ekki aðalbraut.

## Route intelligence check

- Snertir route-mode á nýja Road Intelligence kortinu fyrir allar leiðir, sérstaklega:
  - Akureyri -> Egilsstaðir
  - Ísafjörður -> Reykjavík
- Breytingin bætir ekki við nýjum canonical segments eða station matching reglum.
- Lausnin heldur provider-neutral grunni að mestu:
  - Vegagerðin = current observations
  - Veðurstofan = forecast-by-ETA
  - MET/Yr = fallback/calculation support, ekki sýnilegt kortalag í prototype route view
- Engin route-gögn voru vistuð eða schema breytt. Privacy óbreytt.
- `IcelandRoadmap.md` var ekki uppfært í þessum hotfix því þetta var UI/state/rendering lagfæring, ekki ný leiðaþekking.

## Design.md check

- Mobile-first viðmót óbreytt að grunni.
- Labelarnir eru smáir og compact til að forðast stór cards inni á korti.
- Touch/click target er áfram wrapper button.
- Texti er stuttur og ekki hero/dashboard style.
- Notendatextar voru ekki nýir í þessum áfanga, því nýi route label textinn er gögn (`m/s`, station name, place name).

## Localhost checks for Stebbi

Opnaðu `http://localhost:3004/auth-mvp/vedrid/road-map-prototype` sem notandi með `road-intelligence-v1` feature flag og `ROAD_INTELLIGENCE_V1_ENABLED=true`.

Prófaðu:

1. Reiknaðu `Akureyri -> Egilsstaðir`.
   - Vænt: kortið opnast strax á `Núna`, án þess að þurfa að smella á `Núna`.
   - Vænt: pillutalning undir korti telur Vegagerðarstöðvar á leiðinni, ekki 80 sample-punkta.
   - Vænt: allar Vegagerðar route-stöðvar sýna compact vindlabel, t.d. `7 m/s`, og station name undir.
   - Vænt: `Akureyri` og `Egilsstaðir` sjást sem endapunkta-label ef þau eru innan viewport.

2. Reiknaðu `Ísafjörður -> Reykjavík`.
   - Vænt: sama og ofan, sérstaklega að talning fari ekki í 79/80 sample-punkta.
   - Vænt: route labelar fylgi valdri leið og MET/Yr punktar birtist ekki sem sér veðurpunktar.

3. Í scrubber:
   - Strax eftir að route opnast á að sjást `Núna`.
   - Ef Veðurstofan route layer og `timelineCandidates` eru til, á scrubber að fyllast með klukkutíma-slotum í bakgrunni.
   - Á meðan það gerist á textinn `Er að búa til stöðuna m.v. brottför...` að birtast í scrubbernum.
   - `Sækja meira` á að birtast þegar fleiri en 24 slotar eru til.

4. Veldu forecast-slot, t.d. næsta heila tíma.
   - Vænt: kortið skiptir yfir í Veðurstofu route station labels.
   - Vænt: pillutalning breytist í fjölda Veðurstofu route-stöðva á þeim sloti.
   - Vænt: smella á `Núna` færir kortið aftur í Vegagerðar current labels og rétta Vegagerðartalningu.

5. Prófaðu pillu-filter:
   - Í `Einfalt` á grænt/appelsínugult/rautt að filtera bæði kort og scrubber samræmt.
   - Ef aðeins `Hættulegt` er valið og engar hættulegar stöðvar eru á `Núna`, mega route labels hverfa en talningin í pillum á að vera rétt.

Ekki prófa production deploy, Supabase eða migration í tengslum við þetta án sérstöku samþykkis.

## Tillaga að næsta skrefi

Claude Code: rýna diffið sérstaklega með browser-opnun á localhost. Ef v310 sannreynist enn ekki sýna `Núna` sjálfkrafa, þá er næsta skref að bæta tímabundnum dev-only console diagnostics í `calculateResolvedRoute()`:

- `vegagerdinRender.count`
- `vedurstofanRender.count`
- `mapData.pointCount`
- `selectedCandidateIdx`
- `routeWeatherModeRef.current`
- `routeCandidates?.length`
- hvort `outbound.timelineCandidates` hafi komið í response

Þá sjáum við hvort vandinn er enn UI-state eða hvort API response vantar provider layers/timeline candidates.

## Óvissa / þarf að staðfesta

Confidence: medium-high fyrir state/source/timeline bugfix.  
Óvissa: ekki staðfest í browser hjá Codex, því Stebbi keyrir localhost sjálfur. Það þarf endilega að staðfesta sjónrænt að fyrsta render eftir `Reikna` sé `Núna` með Vegagerðarpunktum.
