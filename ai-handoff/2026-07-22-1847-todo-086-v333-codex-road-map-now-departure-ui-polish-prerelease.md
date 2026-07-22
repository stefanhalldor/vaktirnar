# 2026-07-22 18:47 - TODO-086 v333 - Codex Road Map Now/Departure UI Polish

## Plan Afangans

Afmarkad UI finslipun fyrir Road Intelligence prototype a `/auth-mvp/vedrid/road-map-prototype`:

1. Skilja betur adgreininguna milli `Nustada Vegagerdar` og brottfararspa.
2. Laga timeline-candidates svo brottfararskuffan syni `Nuna` sem raunverulega brottfor nuna og sidar naestu heilu klukkutima, ekki aukalegt 10-min slot.
3. Gera efri `Nuna` hnapp ad skyrum Vegagerdin-current hnappi med timasetningu gagnanna.
4. Setja brottfarartima i skuffu med heitinu `Hvenaer er best ad leggja af stad?`.
5. Loka brottfararskuffu thegar notandi velur efri Vegagerdin-current hnapp.
6. La brottfararskuffu nota Vedurstofu ETA spa fyrir oll slot, thar a medal fyrsta `Nuna` brottfararslotid.
7. Sleppa `Besti`/best-window hring i nyja Road Intelligence heatmapinu.

## Hvad Var Raunverulega Gert

- `selectedCandidateIdx` er ekki lengur thvingad i `0` fyrir current view.
- Ny merking i state:
  - `routeWeatherMode === 'now'` og `selectedCandidateIdx === null` merkir efri `Nustada Vegagerdar`.
  - `routeWeatherMode === 'forecast'` og `selectedCandidateIdx >= 0` merkir brottfararspa i skuffunni.
- Nytt `handleSelectRouteNow()`:
  - stillir map aftur a Vegagerdin current,
  - endurreiknar current status counts ur synilegum Vegagerdar route-punktum,
  - lokar brottfararskuffunni.
- `handleSelectCandidateIdx(0)` merkir nu fyrsta brottfararspaslotid, ekki lengur current Vegagerdin state.
- Route calculation opnar eftirleidis med:
  - `selectedCandidateIdx: null`,
  - `routeWeatherMode: now`,
  - `routeSlotStatusOverrides: null`,
  - status counts fra Vegagerdin current.
- Buinn er til `routeNowMeasuredAtIso` state og helper til ad finna nyjustu timasetningu a Vegagerdar route-punktum.
- Efri current-hnappur notar nu textann `Nustada Vegagerdar kl. hh:mm`.
- Brottfararspain:
  - smidar ekki lengur 10-min millislott,
  - hefur seed slot = raunveruleg brottfor nuna,
  - sidari slot eru naestu heilu klukkutimar.
- Ny helper `buildDepartureForecastSlotStatusOverrides()` notar Vedurstofu ETA counts fyrir oll brottfararslot.
- `buildProviderBestWindow()`/`routeBestWindow` var tekid ur prototype componentinu svo ekki birtist `Besti`/hringur i nyja route heatmapinu.
- Textar uppfaerdir i `messages/is.json` og `messages/en.json`.

## Skra Sem Voru Skodadar

- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/README.md`

## Skra Sem Var Breytt

- `components/weather/RoadMapPrototypeMap.tsx`
  - Timeline slot smidi lagad.
  - Current-vs-forecast state adgreint.
  - Vegagerdin-current label og measured time tengt UI.
  - Departure drawer texti og selection behavior lagad.
  - Departure slot statuses eru nu Vedurstofu-first fyrir oll departure slot.
  - Best-window state hreinsad ur prototype kortinu.
- `messages/is.json`
  - Nyir/uppfaerdir textar fyrir `Nustada Vegagerdar`, `Hvenaer er best ad leggja af stad?` og loading/source texta.
- `messages/en.json`
  - Samsvarandi enskir textar.

Athugid: vinnustreid var fyrir med ocommittadar breytingar fra fyrri Road Intelligence lotum:

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/__tests__/road-intelligence-route-slot-statuses.test.ts`
- `lib/__tests__/windObservationStatus.test.ts`
- nokkrar nyjar `ai-handoff/` skrár

`.obsidian/workspace.json` var dirty og otengd. Codex snerti hana ekki.

## Skipanir Sem Voru Keyrdar

- `rg -n "..."`
  - Exit code 0.
  - Notad til ad finna state/render/texta sem tengist scrubber og departure UI.
- `git diff -- ...`
  - Exit code 0.
  - Notad til ad stadfesta breytingar og passa ad ekki se verid ad snerta otengd files.
- `npm run type-check`
  - Exit code 0.
  - Keyrt tvisvar, badar keyrslur grenar.
- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/windObservationStatus.test.ts`
  - Exit code 0.
  - `2 passed`, `67 passed`.
- `git status --short`
  - Exit code 0, en Git syndi warning um read permission a global git ignore: `C:\Users\Lenovo/.config/git/ignore`.
  - Warningid er ekki tengt breytingunni.
- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
  - Exit code 0.
  - Notad fyrir handoff filename.

## Nidurstodur Og Exit Codes

- TypeScript: grænt.
- Markviss Vitest prof: græn.
- Engin SQL, Supabase, migration, commit, push, deploy eda production adgerd.
- Enginn dev server ræstur eda endurræstur.

## Hvad Mistokst Eda Var Sleppt

- Ekki var keyrt browser automation eda screenshot validation. Stebbi keyrir localhost/dev server sjalfur samkvæmt vinnureglum.
- Ekki var snert a label collision/logik fyrir vedurstodva i pessari lotu, nema thad sem fylgdi state/UI adgreiningunni.
- Ekki var lagað route graph / Google dependency / slitlag-val i pessari lotu.
- Ekki var breytt sameiginlega `DepartureHeatmap` componentinu; i stadinn sendir RoadMap prototype `bestWindow={undefined}` svo nyja kortid synir ekki `Besti`.

## Akvardanir Sem Codex Tok

- `selectedCandidateIdx = null` er nu skyr current-state fyrir Vegagerdin.
- `selectedCandidateIdx = 0` er nu skyr forecast-state fyrir "lagt af stað núna" i brottfararskuffunni.
- Brottfararskuffan notar eingongu Vedurstofu ETA slot-status þegar Vedurstofu route data er tiltækt.
- Vegagerdin current er ekki lengur notad sem first departure slot override.
- 10-min candidate var tekinn ut. First future after current departure er næsti heili klukkutimi.
- `Besti`/best-window var tekin ut ur nyja kortinu thvi Stebbi bad um ad sleppa thvi i akstursvidmotinu.

## Ahaetta Sem Er Enn Til Stadar

- `buildProviderSlotStatusOverrides()` i `lib/road-intelligence/routeSlotStatuses.ts` heldur enn sinni fyrri merkingu fyrir tests/eldri notkun: slot 0 getur notad Vegagerdin current. RoadMap prototype notar hann ekki lengur fyrir brottfararskuffuna.
- Ef Vedurstofu route layer vantar, fellur brottfararskuffan i native/fallback logic. Thad er betra en ad frjosa, en productlega aetli vid liklega ad syna skyrari "spá ekki tiltæk" state sidar.
- Handoff inniheldur ekki visual confirmation. Stebbi þarf ad stadfesta a localhost ad UI hagar ser rett i raun.
- Gamlar console diagnostic logs eru enn i `RoadMapPrototypeMap.tsx` fra fyrri debugging lotum. Claude ætti ad meta hvort thær megi fara fyrir release.

## Tillaga Ad Naesta Skrefi

Claude Code ætti ad ryna sérstaklega:

1. Hvort `selectedCandidateIdx = null` og `routeWeatherMode = now` na yfir oll render tilfelli.
2. Hvort brottfararskuffan notar rett fyrsta slot:
   - `Nuna` = brottfor akkúrat nuna med Vedurstofu ETA,
   - næsta slot = næsti heili klukkutimi.
3. Hvort efri `Nustada Vegagerdar kl. hh:mm` hnappurinn loki skuffunni og syni Vegagerdarstodvar.
4. Hvort status-pillur fylgi virku map-lagi:
   - Vegagerdin current i `now`,
   - Vedurstofan ETA i `forecast`.
5. Hvort `Besti`/hringur er horfinn ur nyja Road Intelligence route heatmapinu.

## Spurningar Fyrir Codex/Claude Ryni

- Eigum vid ad breyta `buildProviderSlotStatusOverrides()` sjalfu sidar til ad passa nyja product semantics, eda halda thvi sem generic helper med gomlum tests?
- A `routeScrubberSubtitle()` ad vera synilegt inni i skuffu eda er textinn enn of mikill fyrir mobile?
- A efri `Nustada Vegagerdar kl. hh:mm` hnappur ad syna route station count lika, eda er status-pillan fyrir neðan nog?

## Supabase / SQL / Auth / Production

- Engin SQL-skrá skrifuð.
- Engin migration keyrð.
- Engin RLS/grants/auth breyting.
- Engin production/deploy/billing/secrets/notendagagna adgerð.

## Localhost Checks For Stebbi

Slod: `/auth-mvp/vedrid/road-map-prototype` med `ROAD_INTELLIGENCE_V1_ENABLED=true` og feature flaggi a notanda.

Prufa 1: Akureyri -> Egilsstadir

1. Opna sidan og reikna leið.
2. Þegar kortið opnast, staðfesta að efri current-hnappur se valinn og heiti `Nústaða Vegagerðar kl. hh:mm`.
3. Staðfesta að Vegagerðarstöðvar a leiðinni sjást i `now` mode og að status-pillur telji sömu stöðvar og sjást a leiðinni.
4. Opna `Hvenær er best að leggja af stað?`.
5. Staðfesta að loading textinn segi að verid se að reikna brottför núna og næstu heilu klukkutíma.
6. Staðfesta að fyrsta slottið i skuffunni se `Núna` sem brottfararspá, og að næsta slot se næsti heili klukkutimi. Ef klukkan er t.d. 18:14 a fyrsta future slot ad vera 19, ekki 18.
7. Velja eitthvert spáslot og staðfesta að kortið skiptir yfir i Veðurstofu forecast stöðvar/status.
8. Smella aftur a efri `Nústaða Vegagerðar kl. hh:mm`.
9. Staðfesta að skuffan lokist og kortid fari aftur i Vegagerdin current.

Prufa 2: Ísafjörður -> Reykjavík

1. Reikna leið þar sem fleiri leiðarvalkostir birtast.
2. Staðfesta að route selection kortin haldist nothæf og að skipti milli leiða setji aftur current view.
3. Opna brottfararskuffu og staðfesta að ekki birtist `Besti` merking eða hringur á góðum slotum.
4. Prófa status-pillur í bæði `Einfalt` og `Nánar`.
5. Staðfesta að efri nústöðu-pilla og skuffu-spá ruglist ekki saman.

Regressions að passa:

- Ekki má missa Vegagerðar route-punkta í `Nústaða Vegagerðar`.
- Ekki má telja 80 MET/Yr punkta þegar notandi er í Vegagerdin current route view.
- Ekki má láta brottfararskúffuna opna full-screen loader eða frysta kortið.
- Ekki má birta auka future slot innan sama klukkutíma og "núna".
- Ekki prófa production, Supabase eða feature access breytingar kæruleysislega; þessi breyting er local UI/kóði eingöngu.
