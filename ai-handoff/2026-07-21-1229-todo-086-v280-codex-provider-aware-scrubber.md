# 2026-07-21 12:29 - TODO-086 v280 - Codex provider-aware scrubber

Created: 2026-07-21 12:29
Timezone: Atlantic/Reykjavik

## Samþykki / umfang

Stebbi bað Codex: "Haltu áfram í framkvæmd á næsta atriði og gerðu svo handoff."

Skilningur Codex:
- Framkvæma næsta afmarkaða atriði úr v279-rýninni.
- Leyft: kóðabreytingar í repo og handoff-skrá.
- Ekki leyft: commit, push, deploy, SQL/migration, env/secrets, Supabase eða production-breytingar.

Næsta atriði var að laga `DepartureHeatmap` í Road Intelligence þannig að scrubberinn endurnýti fyrri íhluti áfram, en sé ekki lengur fastur við MET/Yr status þegar kortið sýnir Vegagerðar/Veðurstofu route-stöðvar.

## Plan afangans

1. Halda `DepartureHeatmap` sem reusable scrubber, ekki búa til nýjan Road Intelligence sér-scrubber.
2. Bæta við `mode?: WindStatusFilterMode` í `DepartureHeatmap` svo `Einfalt/Nánar` geti stýrt sömu `WindStatusFilterPills`.
3. Reikna provider-aware `slotStatusOverrides` í `RoadMapPrototypeMap`:
   - Vegagerðin: núverandi route-stöðvastatus, byggt á hviðum þegar þær eru til.
   - Veðurstofan: per-slot status miðað við brottför + route fraction + route duration.
   - MET/Yr: áfram notað sem timestamp/candidate source þar til nýr provider-native route grunnur tekur við, en ekki sem displayed status þegar íslensk provider-gögn eru til.
4. Laga simple-mode síun á MapLibre layers svo einföld pilla síi líka near-threshold stöður rétt.
5. Keyra type-check og próf.

## Hvað var gert

### 1. `DepartureHeatmap` styður simple/detailed mode

Breytt í `components/weather/DepartureHeatmap.tsx`:
- `WindStatusFilterMode` importað úr `WindStatusFilterPills`.
- Nýtt prop: `mode?: WindStatusFilterMode`.
- `mode` sent áfram í `WindStatusFilterPills`.

Áhrif:
- Sami scrubber getur nú birt annað hvort einföldu þrjár pillurnar eða ítarlegri stöðupillur.
- Existing callers halda default hegðun því prop er optional.

### 2. Road Intelligence scrubber fær provider-aware slot status

Breytt í `components/weather/RoadMapPrototypeMap.tsx`:
- Bætt við helperum:
  - `worstWindDisplayStatusFromCounts()`
  - `countVedurstofanForecastStatusesAt()`
  - `buildProviderSlotStatusOverrides()`
- Þegar route response hefur Vegagerðar eða Veðurstofu route-stöðvar eru `slotStatusOverrides` reiknuð og send í `DepartureHeatmap`.
- Ef engin provider route-stöð er til, er enginn override sendur og `DepartureHeatmap` notar áfram MET/Yr native fallback.
- Ef provider overrides eru til er `bestWindow` ekki sent áfram, því það er enn MET/Yr-derived og gæti annars gefið rangt "best" highlight miðað við provider-statusana.

Áhrif:
- Scrubber litir eiga nú að passa betur við það sem notandinn sér á route-kortinu.
- Vegagerðar current observations eru sami status yfir slotin, þar sem þær eru raungildi núna en ekki forecast.
- Veðurstofan getur breytt slot-statusum eftir brottfarartíma vegna forecast rows.

### 3. `Einfalt/Nánar` sett aftur inn í RoadMap prototype

Breytt í `components/weather/RoadMapPrototypeMap.tsx`:
- Lítill segmented control birtist í route summary þegar leið er virk.
- Control notar núverandi translation keys:
  - `statusFilterModeSimple`
  - `statusFilterModeDetailed`
- `routeStatusFilterMode` fer bæði í `DepartureHeatmap` og fallback `WindStatusFilterPills`.

Design.md athugun:
- Breytingin fylgir segmented-control mynstrinu fyrir 2 valkosti.
- Input textastærðir voru ekki minnkaðar og nýi controlinn á ekki að valda mobile zoomi.
- Þetta er þétt app-control, ekki nýtt card eða nested card.

### 4. Simple-mode map filtering lagfært

Áður:
- HTML Vegagerðar label notuðu `routeStatusIsVisible()` sem skildi simple-mode.
- MapLibre layers notuðu exact `windDisplayStatus` filter, þannig simple `Innan marka` náði ekki endilega yfir `nalgast-othaegindi`.

Núna:
- `expandRouteFilterStatuses()` útvíkkar filter-statusa miðað við `WindStatusFilterMode`.
- `applyRouteStatusFilterToMap()` tekur nú `mode`.
- Þegar notandi skiptir `Einfalt/Nánar` er bæði MapLibre filter og HTML Vegagerðar label state uppfært.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/2026-07-21-1208-todo-086-v279-claude-route-filter-scrubber.md`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `lib/weather/windDisplayStatus.ts`
- `lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`

## Skrár breyttar

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-21-1229-todo-086-v280-codex-provider-aware-scrubber.md` (ný)

Athugið:
- `components/weather/RoadMapPrototypeMap.tsx` er enn untracked í git frá fyrri Road Intelligence vinnu. Venjulegt `git diff` sýnir því ekki breytingarnar þar. Claude þarf að lesa actual file, ekki treysta eingöngu á tracked diff.

## Skipanir keyrðar

- `npm run type-check`
  - Exit code: 0
  - Niðurstaða: TypeScript check passed.
- `npm run test:run -- road-intelligence-travel-bridge-map-data weather-travel-api`
  - Exit code: 0
  - Niðurstaða: 2 test files passed, 28 tests passed.
- `npm run test:run`
  - Exit code: 0
  - Niðurstaða: 127 test files passed. 3533 tests passed, 27 skipped, 8 todo.
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - Exit code: 0
  - Niðurstaða: `2026-07-21 12:29`

## Hvað var ekki gert

- Enginn commit.
- Enginn push.
- Enginn deploy.
- Engin SQL migration skrifuð eða keyrð.
- Engar env/secrets breytingar.
- Engar Supabase, RLS, auth eða production breytingar.
- Engin ný test fixture var búin til fyrir UI component behavior; breytingin er sannreynd með type-check og núverandi unit tests.

## Ákvarðanir

- Þegar íslensk provider route-gögn eru til eiga þau að stýra displayed scrubber-statusum frekar en MET/Yr.
- MET/Yr candidate list er enn notuð sem tímaraðarbeinagrind, því nýi Road Intelligence grunnurinn er ekki enn provider-native.
- `bestWindow` er falið þegar provider overrides eru til, þar sem það er enn MET/Yr-derived og gæti annars orðið misleading.
- Helperarnir voru settir í `RoadMapPrototypeMap.tsx` sem milliskref. Ef Claude er sátt/ur við contractið er næsta skref að færa þá í reusable `lib/road-intelligence/` kjarna með tests.

## Route intelligence check

- Snertir route-weather prototype á `/auth-mvp/vedrid/road-map-prototype`.
- Snertir allar leiðir sem fara í gegnum nýja Road Intelligence kortið, ekki sérstakan landshluta.
- Lausnin er provider-aware en ekki full provider-neutral enn:
  - Vegagerðin current observation status er stutt.
  - Veðurstofan forecast station status er stutt.
  - MET/Yr er enn candidate timestamp fallback.
- Engin ný route-gögn eru geymd.
- Engin privacy áhætta bættist við: engar notendaferðir, heimilisföng eða route geometry eru skrifuð í gagnagrunn.
- `IcelandRoadmap.md` var ekki uppfært í þessum litla UI/status skammti. Næsti stærri graph-native route áfangi ætti að uppfæra það.

## Áhætta / þarf að rýna

1. **Vegagerðin current observations yfir tíma-slotum**
   - Vegagerðin er raungildi núna, ekki forecast. Því verður Vegagerðarstatus sami yfir öll departure slots.
   - Þetta er betra en MET/Yr mismatch, en ekki endanleg tímaleiðarspá.

2. **Veðurstofan + Vegagerðin sameining**
   - Slot override notar worst status milli Vegagerðar current status og Veðurstofu forecast status.
   - Claude ætti að rýna hvort þetta sé rétt UX eða hvort Vegagerðin eigi aðeins að lita "Núna" en Veðurstofan seinni slot.

3. **Best window falið þegar provider overrides eru til**
   - Þetta forðast rangt MET/Yr highlight.
   - En notandinn fær ekki "best" tímaglugga fyrr en provider-aware best-window er reiknað.

4. **RoadMapPrototypeMap er orðinn stór**
   - Þessi breyting bætti við hreinum helperum, en file-ið er enn of mikið orchestration.
   - Næsta extraction ætti að vera `lib/road-intelligence/routeSlotStatuses.ts` eða svipað.

## Tillaga að næsta skrefi

1. Claude rýnir þessa breytingu, sérstaklega:
   - hvort `buildProviderSlotStatusOverrides()` eigi að sameina Vegagerð current + Veðurstofu forecast svona
   - hvort `bestWindow` eigi að vera falið eða provider-aware reiknað strax
   - hvort simple-mode filter expansion sé rétt fyrir bæði MapLibre layers og HTML markers
2. Ef rýni er græn:
   - færa provider slot status helpers í `lib/road-intelligence/routeSlotStatuses.ts`
   - bæta unit tests við helperinn
   - byrja provider-aware best-window eða "Núna / seinna" skýringu í UI
3. Stærra næsta product-skref:
   - skilja MET/Yr timestamp fallback frá official-provider route assessment
   - færa Road Intelligence nær eigin graph-native routing grunni

## Localhost checks for Stebbi

Setup:
- Stebbi keyrir localhost sjálfur.
- Opna: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`
- Nota innskráðan notanda með `road-intelligence-v1` feature access.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` þarf að vera í local env eins og áður.

Próf 1: Provider-aware scrubber
1. Slá inn leið sem sýnir Vegagerðarstöðvar á leið, t.d. `Akranes` -> `Akureyri`.
2. Smella `Reikna`.
3. Vænt:
   - Global stöðvadottar hverfa.
   - Route Vegagerðar label sjást á leiðinni.
   - Scrubber birtist.
   - Scrubber litir eiga ekki lengur að vera eingöngu MET/Yr grænir ef route-stöðvarnar eru appelsínugular/rauðar.

Próf 2: Einfalt/Nánar
1. Eftir reiknaða leið, prófa `Einfalt`.
2. Vænt: pillurnar hópast í grænt/appelsínugult/rautt.
3. Prófa `Nánar`.
4. Vænt: near-threshold stöður birtast aftur sem sérflokkar ef þær eru til.
5. Smella á græna/appelsínugula/rauða pillu og staðfesta að bæði:
   - scrubber slots síast
   - map route-stöðvar/labels síast í samræmi við mode

Próf 3: Velja brottfararslot
1. Smella á mismunandi tíma í scrubber.
2. Vænt:
   - Veðurstofu route-stöðvar á korti uppfærast miðað við valinn brottfarartíma.
   - Vegagerðar label halda áfram að sýna núverandi raungildi.
   - Engin gömul popup/label eiga að sitja eftir.

Próf 4: Hreinsa
1. Smella `Hreinsa`.
2. Vænt:
   - Route line, route labels og scrubber hverfa.
   - Global stöðvadottar og bæjanöfn koma aftur.
   - `Brottfarartími` input birtist aftur.
3. Reikna aðra leið og staðfesta að fyrri filter eða slot-val mengi ekki nýju leiðina.

Regression checks:
- `/auth-mvp/vedrid/ferdalagid` þarf enn að sýna scrubber eins og áður, þar sem `DepartureHeatmap.mode` er optional.
- `/vedrid` overview pillur eiga ekki að breytast.
- Mobile: input texti á að vera 16px+, enginn horizontal overflow, og nýi `Einfalt/Nánar` control má ekki þrýsta formi út fyrir skjá.

Ekki prófa kæruleysislega:
- Ekki keyra SQL, migrations, production cron, deploy eða feature-access breytingar vegna þessa skammts.
- Engar gagnagrunnsbreytingar eru nauðsynlegar.

## Óvissa / þarf að staðfesta

- Hvort Vegagerðar current status eigi að vera sami yfir alla departure slots eða aðeins "Núna" merking í scrubber. Þetta er product ákvörðun.
- Hvort provider-aware best-window eigi strax að koma í næsta skammt eða bíða þar til official-provider route assessment er betur skilgreint.
- Hvort helperarnir eigi strax í `lib/road-intelligence/` áður en fleiri fösum er bætt við.
