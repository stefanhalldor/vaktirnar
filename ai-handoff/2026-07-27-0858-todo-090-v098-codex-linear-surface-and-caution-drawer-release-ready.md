# TODO-090 v098 — línuleg slitlagsgreining og skýring á varasömum leiðum

**Agent:** Codex  
**Tími:** 2026-07-27 08:58  
**Staða:** Útfært og prófað; kóðinn er tilbúinn fyrir útgáfurýni. Ný slitlagsgreining tekur þó ekki gildi í virka leiðar-snapshotinu fyrr en afmörkuð snapshot-refresh keyrsla fær sérstakt leyfi.

## 1. Plan áfangans

1. Útfæra tillöguna í `2026-07-27-0842-todo-090-v097-codex-remove-found-label-and-deep-surface-audit` með línulegri vörpun opinberra slitlagsbila Vegagerðarinnar á canonical veglínur.
2. Láta gögn falla örugglega aftur í `mixed`/`unknown` ef opinber stöðvagögn eru óheil eða ósamræmanleg, og hindra promotion á snapshoti sem inniheldur enn óleyst slitlag.
3. Setja mannamálsskýringar á varasamar leiðir í collapsed skúffu á compact leiðarspjöldunum, með skýrri áherslu á að viðvörunin eigi við bíla með eftirvagna.
4. Staðfesta breytingarnar með targeted prófum, live read-only Vegagerðin-prófi, fullri test suite, type-check, production build og diff whitespace-check.

## 2. Hvað var raunverulega gert

### Slitlagsgreining

- Opinberu reitirnir `KAFLISTODUPPHAF`/`KAFLISTODENDIR` eru nú sóttir með vegköflum og `UPPH_STOD`/`ENDA_STOD` með slitlagsgögnum.
- Slitlagsbil eru vörpuð hlutfallslega eftir cumulative lengd canonical veglínunnar. Source-geometry Vegagerðarinnar er ekki notuð til að breyta topology.
- Bæði venjuleg og öfug stöðvun eru studd.
- Samliggjandi bil með sama slitlagi eru sameinuð til að halda graph-stærð í skefjum.
- Inntak er sannreynt fyrir bounds, samfellu, lokaða domain-þekju og lengdarsamræmi. Ófullnægjandi gögn falla lokuð aftur í fyrri `mixed`/`unknown` flokkun.
- Snapshot validation krefst nú `mixed === 0` og `unknown === 0`; óheil ný mynd getur því ekki leyst síðasta góða snapshotið af hólmi.
- Live gögn Vegagerðarinnar skiluðu graphi með 0 `mixed` og 0 `unknown` edges og stóðust núverandi promotion-mörk og golden-route próf.

### Skýring á varasömum leiðum

- Fullscreen compact leiðarspjöld sýna nú merkið **„Varasamt með eftirvagna“** í stað almenna textans „Varasöm leið“ þegar caution-contractið á við.
- Sérstök collapsed `<details>` skúffa birtir:
  - almenna skýringu um bíla með eftirvagna;
  - leiðarsértæka ástæðu, t.d. Öxi eða Vestfirði.
- Skúffan er lokuð sjálfgefið, með 40 px snertiflöt og ör sem sýnir open-state.
- Leiðarval og skúffa eru aðskildir interactive controls. Að opna skýringuna velur því ekki leið eða veldur invalid nested-button HTML.

### Tengdar UI-lagfæringar sem fylgdu þessum vinnuferli

- Summary-spjöld eru ekki lengur renderuð í millibili meðan fyrsta tilbúna fullscreen leiðarkortið er að opnast.
- „N Teskeiðarleiðir fundust“ ready-labelið er ekki lengur sýnt á stóra kortinu; loading/none/unavailable skilaboð halda sér þar sem þau veita raunverulegt feedback.

## 3. Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/2026-07-27-0842-todo-090-v097-codex-remove-found-label-and-deep-surface-audit.md`
- Vegagerðin ArcGIS metadata og feature responses fyrir `vegakerfi/MapServer/6` og `slitlag/MapServer/0` í read-only live prófi
- Viðeigandi route graph, refresh, UI, translation og test skrár sem taldar eru upp að neðan

## 4. Skrár sem voru breyttar í þessum áfanga

- `IcelandRoadmap.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.ts`
- `lib/iceland-routes/roadGraphRefresh.server.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/vegagerdin-road-graph-source.test.ts`
- `lib/__tests__/vegagerdin-road-graph.live.test.ts`
- `lib/__tests__/road-graph-refresh.test.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/road-map-route-loading-ui.test.ts`
- Þessi handoff-skrá

Vinnusvæðið var þegar með margar ócommittaðar breytingar frá Stebba/Claude Code. Þær voru varðveittar; ekkert var resettað eða afturkallað.

## 5. Skipanir sem voru keyrðar

| Skipun | Niðurstaða |
| --- | --- |
| `npm run type-check` | Exit 0 |
| `npm run test:run -- lib/__tests__/vegagerdin-road-graph-source.test.ts lib/__tests__/road-graph-refresh.test.ts lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/weather-route-cautions.test.ts lib/__tests__/route-option-envelope.test.ts` | Exit 0, 5 skrár og 63/63 próf |
| `$env:ROAD_GRAPH_LIVE_TEST='true'; npm run test:run -- lib/__tests__/vegagerdin-road-graph.live.test.ts` | Exit 0, 1/1 live read-only próf; keyrt tvisvar |
| `npm run test:run -- lib/__tests__/vegagerdin-road-graph-source.test.ts` | Exit 0, 9/9 próf eftir reverse-station fixture |
| `npm run test:run` | Exit 0, 168 passed og 1 skipped test files; 3884 passed, 28 skipped, 8 todo, 3920 total |
| `npm run build` | Exit 0, production build og 105 static pages |
| JSON parse á `messages/is.json` og `messages/en.json` | Gilt JSON |
| `git diff --check` | Exit 0; aðeins núverandi LF/CRLF viðvaranir |

## 6. Niðurstöður og exit codes

- Allar framkvæmdar verification-skipanir luku með exit code 0.
- Production build lauk með fyrirliggjandi lint warnings um hook dependencies og `<img>` í ótengdum skrám, auk úrelts Browserslist gagnagrunns. Engin ný build villa kom fram.
- Full test suite er græn: **3884 passed**.
- Live Vegagerðin-prófið staðfesti 0 óleyst slitlags-edge og að graphið stenst snapshot promotion-reglur.
- Fyrirliggjandi jsdom skilaboð um `Not implemented: navigation to another Document` voru non-failing test output.

## 7. Hvað mistókst eða var sleppt

- Ekkert próf mistókst.
- Dev server var hvorki ræstur né endurræstur; Stebbi stjórnar localhost samkvæmt vinnureglum.
- Virka road-graph snapshotið var **ekki** refresh-að. Það er gagnagrunns-/storage-aðgerð sem þarf sértækt framkvæmdarleyfi.
- Engin SQL migration var skrifuð eða keyrð.
- Ekkert commit, push, deploy eða production rollout var framkvæmt.

## 8. Ákvarðanir sem Codex tók

- Canonical veglínan heldur áfram að ráða topology; slitlagsbilin merkja aðeins hluta hennar. Þetta minnkar hættu á disconnects og route-regression.
- Gögn eru fail-closed: ef stöðvabil eru ekki sönnuð sem heil og samfelld er ekki giskað á slitlag.
- Snapshot promotion er hert svo slæm upstream breyting geti ekki virkjað graph með `mixed` eða `unknown` edges.
- Caution-skýringin notar fyrirliggjandi typed `RouteCautionResult` og þýðingarkerfi fremur en nýtt samhliða textakerfi.
- Skýringarskúffan er aðskilin frá route-select control til að halda aðgengi og hegðun fyrirsjáanlegri.

## 9. Áhætta sem er enn til staðar

- **Release/activation dependency:** nýja slitlagsgreiningin breytir ekki núverandi virka snapshoti sjálfkrafa. Localhost og útgáfa geta því áfram sýnt gömlu óvissu-kílómetrana þar til protected snapshot refresh er keyrt og promotion tekst.
- Snapshot refresh mun lesa Vegagerðin-gögn og skrifa nýtt snapshot/active pointer. Það má ekki keyra kæruleysislega eða án sérstakrar heimildar, sérstaklega ekki gegn production umhverfi.
- Live upstream schema eða gögn geta breyst síðar. Fail-closed validation og LKG promotion verja virk gögn, en monitoring þarf áfram að grípa refresh sem hafnar.
- Sjónræn mobile hegðun þarf localhost-staðfestingu á raunverulegum leiðum og viewportum þótt component- og build-próf séu græn.

## 10. Tillaga að næsta skrefi

1. Stebbi framkvæmir localhost checks hér að neðan þegar hann kemur til baka.
2. Ef UI er staðfest gefur Stebbi, ef hann vill virkja nýju slitlagsniðurstöðurnar, sérstakt leyfi fyrir afmarkaðri protected snapshot-refresh keyrslu og tilgreinir hvort hún eigi að snerta local/dev eða production.
3. Eftir refresh þarf að sannreyna diagnostics (`mixed=0`, `unknown=0`), golden routes og Ísafjarðarleiðina í UI áður en deploy/rollout kemur til greina.

## 11. Atriði sem næsta rýni ætti sérstaklega að skoða

- Hvort proportional station mapping sé rétt stefna fyrir allar canonical línur sem geta hugsanlega orðið multipart í framtíðinni.
- Hvort snapshot promotion-reglan `mixed=0 && unknown=0` sé æskilega ströng til lengri tíma eða hvort sérstakt, mælt undantekningarkerfi verði einhvern tíma nauðsynlegt.
- Hvort collapsed caution copy sé nægilega skýrt án þess að gefa í skyn að leiðin sé varasöm fyrir alla bíla.
- Sjónrænt overflow, focus og scroll í 48dvh leiðaspjaldalistanum þegar skúffa er opnuð á fyrsta, miðju- og síðasta spjaldi.

## 12. Supabase, SQL, auth og production

- **SQL:** ekkert skrifað og ekkert keyrt.
- **Supabase/storage:** ekkert lesið eða skrifað af þessum implementation- og test-keyrslum.
- **Active snapshot:** óbreytt.
- **RLS/auth/grants/functions:** óbreytt.
- **Production/notendagögn/secrets/billing:** engin áhrif.
- Live prófið las aðeins opinber Vegagerðin ArcGIS gögn yfir netið.

## Route intelligence check

- Provider boundary helst í `vegagerdinRoadGraphSource.server.ts`; output til route-kjarnans er áfram provider-neutral `IcelandRoadGraphSegmentInput`.
- Engin provider geometry tekur yfir canonical topology.
- Golden-route og Ísafjörður live-próf stóðust eftir split.
- Snapshot promotion tryggir last-known-good hegðun ef ný slitlagsgögn eru ófullnægjandi.

## 13. Localhost checks for Stebbi

**Slóð og state:** Opnaðu viðeigandi route-flæði á localhost með innskráðum notanda og veldu leið þar sem Teskeið finnur Öxi- eða Vestfjarðaviðvörun. Ekki þarf að endurræsa dev server nema þú ákveðir það sjálfur.

1. Bíddu eftir stóra „Veldu leið á korti“ skjánum.
   - Vænt: summary-spjaldið blikkar ekki fyrst.
   - Vænt: ready-labelið „N Teskeiðarleiðir fundust“ sést ekki.
2. Finndu leið með caution.
   - Vænt: pillan segir **„Varasamt með eftirvagna“**.
   - Vænt: textinn gefur ekki í skyn að leiðin sé sjálfkrafa varasöm fyrir alla bíla.
3. Opnaðu **„Af hverju er leiðin merkt varasöm?“**.
   - Vænt: skúffan er lokuð sjálfgefið og opnast án stökks eða lárétts overflow.
   - Vænt: bæði almenna eftirvagnaskýringin og leiðarsértæk ástæða, t.d. Öxi, sjást á mannamáli.
   - Vænt: að opna/loka skúffunni skiptir ekki um valda leið.
4. Prófaðu fyrsta, miðju- og síðasta spjald í lárétta listanum, á mobile/iPad viewporti.
   - Vænt: spjöld haldast compact, listinn má scrolla eðlilega og CTA neðst overlappar ekki efnið.
5. Prófaðu kort-smell og röðunarfilter aftur.
   - Vænt: rétt spjald færist mjúklega í fókus og filter færir listann lengst til vinstri.
6. Athugaðu Ísafjarðarleiðina sem áður sýndi 69 km óþekkt slitlag.
   - Mikilvægt: ný gildi sjást **ekki endilega enn**, því active snapshot var ekki refresh-að. Þetta er vænt hegðun þar til sérstök refresh-keyrsla hefur verið heimiluð og staðfest.

**Öryggisvarúð:** Ekki keyra snapshot refresh, Supabase-aðgerðir eða production rollout sem hluta af þessu localhost-prófi án nýs, afmarkaðs leyfis. Slík keyrsla getur skrifað snapshot og breytt active pointer þótt implementation-prófin séu græn.
