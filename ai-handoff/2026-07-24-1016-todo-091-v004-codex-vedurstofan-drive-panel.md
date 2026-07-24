# Handoff — TODO #91 Veðurstofan Akstur-panel með public Ferðaveður-lúkki

Created: 2026-07-24 10:16  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: #91 — Veður: basemap refresh og kortapússun

## Skilningur á samþykki

Stebbi samþykkti að Codex framkvæmdi endurskoðaða product direction úr v003:

- full Ferðaveður-upplifun beint undir `Akstur`;
- útlit og upplýsingaskipan úr núverandi public Ferðaveðri;
- samanburðartafla milli brottfararstaðar og áfangastaðar með;
- engin provider-kort eða Yr/met.no-sýnileg framsetning;
- Veðurstofan-only notendaframsetning;
- `Kort` áfram aðskilin, einfaldari og stærri kortasýn.

Samþykkið fól í sér kóða-, prófa- og handoff-breytingar. Það fól ekki í sér
commit, push, deploy, migration, Supabase-, env-, secrets-, billing- eða
production-breytingar.

## Plan

1. Endurnýta canonical public Ferðaveður-components og CSS-mynstur.
2. Smíða Veðurstofan-only view-model fyrir route ETA, versta punkt,
   áfangastað, alla punkta og comparison rows.
3. Setja fulla niðurstöðusamsetningu beint í `Akstur` panel.
4. Halda route-map bottom strip aðeins í `Kort`, ekki tvítaka hann undir
   `Akstur`.
5. Prófa view-model, TypeScript og production build.

## Hvað var gert

### Nýr `DriveJourneyPanel`

`components/weather/DriveJourneyPanel.tsx` er ný canonical Akstur-samsetning
sem birtist þegar route er virk.

Röðin fylgir public Ferðaveðrinu:

1. `Þín veðurmörk` attention box;
2. canonical `DepartureHeatmap`;
3. texti um hvaða brottfarartíma útreikningurinn notar;
4. `Á leiðinni` með compact `VedurstofanPointCard`;
5. `Áfangastaður` með ETA og þeirri Veðurstofuspá sem er næst ETA;
6. canonical `WeatherWatchersComparison`;
7. `Spápunktar á leiðinni` með fullum `VedurstofanPointCard` fyrir allar
   Veðurstofustöðvar á leiðinni;
8. `Hreinsa leið` action.

### Veðurstofan-only view-model

- Hver stöð fær ETA:
  `departure + routeFraction * routeDuration`.
- Næsta Veðurstofuspáröð við ETA er valin með
  `selectNearestForecastRowAt`.
- Status er reiknaður með
  `classifyNearestForecastWindDisplayStatusAt`.
- Versti punktur er valinn fyrst eftir status-severity og síðan vindhraða.
- Fyrsta og síðasta route-stöðin fæða canonical comparison componentinn.
- Veðurstofuröðum er breytt í `ForecastDrawerRow` display-contract án
  Yr/met.no-hlekkja eða provider-copy.

### Akstur og Kort aðskilin

- `RoadMapPrototypeMap` geymir nú Veðurstofulag route í React state svo
  Akstur-panelinn geti renderað úr sömu route-niðurstöðu.
- Þegar `Akstur` er opnað eftir route-reikning er full
  departure-forecast timeline byggð sjálfkrafa.
- Fyrri litli route-summary textablockinn í Akstur-panelnum var skipt út fyrir
  `DriveJourneyPanel`.
- Layer-control footer er falinn þegar full Akstur-niðurstaða er virk.
- Korta-bottom-strip er falinn meðan Akstur-panelinn er opinn og birtist aftur
  í `Kort`. Þannig sjást ekki tveir scrubberar samtímis.
- Claude v002 compact station card/full overlay er áfram aðeins hluti
  kortasamhengisins; það er ekki lengur aðalinngangur í Akstur-upplýsingarnar.

## Endurnýttir canonical components

- `DepartureHeatmap`
- `VedurstofanPointCard` (`compact` og `full`)
- `WeatherWatchersComparison`
- `WindStatusBadge` óbeint inni í point-card components
- public Ferðaveður translation keys
- public Ferðaveður card/grid/border/spacing mynstur

Engin provider-selector kort voru endurgerð.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-24-0959-todo-091-v002-claude-route-station-card.md`
- `ai-handoff/2026-07-24-1005-todo-091-v003-codex-public-travel-ui-parity-interpretation.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `components/weather/WeatherWatchersComparison.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `lib/weather/types.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/weather/providers/vedurstofanBlend.ts`

## Skrár sem Codex breytti

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DriveJourneyPanel.tsx` (ný)
- `lib/__tests__/drive-journey-panel.test.ts` (ný)
- `ai-handoff/2026-07-24-1005-todo-091-v003-codex-public-travel-ui-parity-interpretation.md`
- `ai-handoff/2026-07-24-1016-todo-091-v004-codex-vedurstofan-drive-panel.md`

## Fyrirliggjandi ócommittaðar breytingar

- `.obsidian/workspace.json` var þegar breytt og var ekki snert af Codex.
- Claude v002 var þegar commit-að og push-að á `main` samkvæmt handoffinu.
- Codex afturkallaði ekki commit-aðar v002 breytingar; Akstur-stefnan var lögð
  ofan á núverandi stöðu.

## Prófanir og skipanir

1. `npm run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts`
   - Exit code: 0
   - 4 test files passed
   - 148 tests passed
   - 5 tests skipped
2. `npm run type-check`
   - Exit code: 0
3. `npm run build`
   - Exit code: 0
   - Next.js production build completed successfully
   - Aðeins fyrirliggjandi lint-viðvaranir komu fram
4. `npm.cmd run type-check`
   - Exit code: 0 eftir síðustu `Hreinsa leið` prop-breytingu
5. `git diff --check`
   - Exit code: 0
   - Aðeins Windows CRLF warnings

Ein samsett PowerShell keyrsla með `npm run type-check` lenti í local
ExecutionPolicy-villu á `npm.ps1`. Sama type-check var strax keyrt sem
`npm.cmd run type-check` og stóðst. Þetta var shell-policy atriði, ekki
kóða- eða build-villa.

## Ný próf

`drive-journey-panel.test.ts` staðfestir:

- ETA við hálfa route-fraction;
- val á næstu Veðurstofu 3 klst. spáröð;
- threshold classification;
- umbreytingu Veðurstofuraða í canonical comparison rows;
- að comparison row contract innihaldi enga Yr/met.no-hlekki.

## Hvað var ekki gert

- Dev server var ekki ræstur.
- Engin browser-/localhost-prófun var framkvæmd.
- Public `/ferdalagid` var ekki breytt.
- met.no backend/integration var ekki fjarlægð.
- Tímainterpolation milli 3 klst. Veðurstofuspáa var ekki framkvæmd; næsta röð
  við ETA er enn valin.
- Claude v002 map overlay-kóðinn var ekki fjarlægður; hann er áfram
  kortasértækur.

## Mikilvægar ákvarðanir

- Public parity er byggð með endurnýtingu canonical subcomponents í stað þess
  að copy/paste-a 300+ línu inline block úr `FerdalagidClient`.
- Akstur notar aðeins Veðurstofulag í notendaframsetningu.
- Kort notar áfram núverandi provider-station layers fyrir sjónræna yfirsýn.
- Akstur og Kort lesa sömu route, thresholds, duration og departure candidate
  state.
- Comparison table notar fyrstu og síðustu Veðurstofustöð sem route-endpoint
  proxy. Þetta þarf sjónræna og product staðfestingu.

## Design.md samræmi

- Akstur-panel er scrollanlegt innan app-shell, ekki nýtt full-screen
  korta-overlay.
- Canonical cards, borders, typography og touch targets eru endurnýtt.
- Bottom strip er falinn undir Akstur svo enginn tvöfaldur scrubber eða overlap
  myndist.
- Public comparison component hefur sitt canonical horizontal-scroll mynstur.
- Enginn nýr hardcode-aður þýðanlegur notendatexti var settur í componentinn.

## Route intelligence check

- Routing provider, route geometry og route selection breyttust ekki.
- ETA byggir á núverandi `routeFraction` og `durationMinutes`.
- Engin canonical segment-, control-point- eða route-family þekking var bætt
  við.
- `IcelandRoadmap.md` þurfti því ekki uppfærslu.
- Engin route query eða notendastaðsetning er nýlega geymd.

## Áhætta / þarf að staðfesta

1. **Nákvæm visual parity**
   - Canonical subcomponents og public classes eru endurnýtt, en
     `FerdalagidClient` summary-blockið er enn inline og var ekki extract-að
     línu fyrir línu.
   - Browser-samanburður við skjámyndir 092649/092656 er nauðsynlegur.
2. **Endpoint comparison**
   - Fyrsta/síðasta Veðurstofustöð á route er proxy fyrir origin/destination.
   - Ef stöð er langt frá endapunkti getur taflan gefið villandi staðarmerkingu.
   - Betra langtímaskref er sérstakt closest-station-to-origin/destination
     contract frá server.
3. **Allir spápunktar**
   - Listinn sýnir allar matched Veðurstofustöðvar, ekki MET/Yr sampled
     grid-punkta. Þetta er viljandi Veðurstofan-only túlkun.
4. **3 klst. nearest-slot jump**
   - Harða 18/21 skiptingin er enn til og var ekki hluti þessa UI-áfanga.
5. **Mobile panel width/height**
   - Public card er nú inni í full-height Akstur-paneli á mobile og 360 px
     side-panel á desktop. Long station lists og comparison drawer þurfa
     browser-próf.
6. **v002 map detail**
   - Compact station card/overlay er áfram í Kort. Staðfesta þarf að það sé ekki
     enn of flókið miðað við einfaldari Kort-stefnuna.

## Localhost checks for Stebbi

### Forsendur

- Stebbi keyrir dev server sjálfur.
- Innskráður notandi með aðgang að
  `/auth-mvp/vedrid/road-map-prototype`.
- Nota leið með nokkrum matched Veðurstofustöðvum og margra klukkustunda
  ferðatíma.
- Engin Supabase-, auth-, billing-, secrets- eða production-breyting er hluti
  prófsins.

### Akstur — desktop

1. Opna `/auth-mvp/vedrid/road-map-prototype`.
2. Velja `Akstur`, fylla inn Frá/Til og reikna leið.
3. Opna `Akstur` aftur eftir að leiðin birtist.
4. Vænt:
   - provider-/gagnaveitukort sjást ekki;
   - engin Yr/met.no merking eða hlekkur sést;
   - public-líkt hvítt summary-card birtist beint undir Akstur;
   - `Þín veðurmörk` er efst;
   - brottfarartíma-scrubber birtist;
   - textinn um valinn brottfarartíma birtist;
   - `Á leiðinni` sýnir mest krefjandi Veðurstofustöð;
   - `Áfangastaður` sýnir ETA og Veðurstofuspá;
   - samanburðartaflan birtist;
   - allir matched Veðurstofupunktar birtast þar fyrir neðan.
5. Bera hlið við hlið saman við
   `/auth-mvp/vedrid/ferdalagid` og skjámyndir 092649/092656.
6. Meta sérstaklega spacing, borders, textastig og röð.

### Scrubber/state

1. Velja annan brottfarartíma.
2. Vænt:
   - `Á leiðinni` getur skipt um versta punkt;
   - ETA og valin Veðurstofuspáröð uppfærast;
   - áfangastaður uppfærist;
   - punktaspjöld uppfærast;
   - kortið notar sama departure candidate þegar farið er í `Kort`.
3. Fara í `Kort` og aftur í `Akstur`.
4. Vænt:
   - route og brottfarartími tapast ekki;
   - enginn annar scrubber birtist samtímis inni í Akstur.

### Samanburðartafla

1. Skoða compact töfluna.
2. Vænt:
   - brottfararstaður og áfangastaður eru tvær raðir;
   - hiti, vindur og úrkoma koma úr Veðurstofuröðum;
   - taflan scrollar lárétt án page-overflow.
3. Opna `Skoða samanburð nánar`.
4. Prófa `Kl. 12`, `Morgun · hádegi · kvöld` og `Á 3 klst fresti`.
5. Vænt:
   - drawer er nothæfur;
   - engin Yr/met.no merking birtist.
6. Staðfesta hvort fyrsta/síðasta Veðurstofustöðin er ásættanleg proxy fyrir
   staðina. Ef ekki þarf server-side endpoint-station matching í næsta skrefi.

### Punktar

1. Scrolla niður allan listann.
2. Vænt:
   - versti punktur er merktur;
   - hvert spjald sýnir stöð, status, brottför, ETA og prev/used/next
     Veðurstofuspár;
   - engir met.no sampled punktar eða Yr-hlekkir sjást.

### Kort

1. Velja `Kort`.
2. Vænt:
   - Akstur-panel lokast;
   - stærra kort birtist;
   - bottom strip/scrubber getur birst í kortasamhengi;
   - route-lína og einfaldir provider-punktar haldast;
   - full Akstur-summary er ekki lagt yfir kortið.

### Mobile

Endurtaka við 360, 390 og 460 px:

1. Opna Akstur eftir route-reikning.
2. Scrolla frá veðurmörkum niður í síðasta spápunkt.
3. Opna samanburðar-drawer.
4. Skipta í Kort og aftur.
5. Vænt:
   - ekkert horizontal page-overflow;
   - samanburðartafla hefur aðeins innri horizontal scroll;
   - enginn tvöfaldur scrubber;
   - enginn fastur footer hylur efni;
   - touch targets eru minnst um 40 px;
   - back/close og route clear virka;
   - ekkert mobile zoom eða röng scroll-staða.

## Tillaga að næsta skrefi

Stebbi prófar fyrst localhost og sendir skjáskot af:

1. Akstur efst;
2. `Á leiðinni` + áfangastað;
3. samanburðartöflu;
4. fyrstu tveimur fullu Veðurstofupunktaspjöldum;
5. mobile 390 px;
6. Kort eftir skipti úr Akstur.

Næsta breyting á að vera aðeins sjónræn parity-lagfæring eða endpoint-station
matching ef localhost sýnir raunverulegt frávik.

## Supabase / production

- Engin SQL-skrá var skrifuð.
- Engin migration var skrifuð eða keyrð.
- Engin áhrif á gögn, RLS, auth, grants, policies eða functions.
- Engin env-, secrets-, billing-, deploy- eða production-breyting var gerð.
- Ekkert commit eða push var gert.
