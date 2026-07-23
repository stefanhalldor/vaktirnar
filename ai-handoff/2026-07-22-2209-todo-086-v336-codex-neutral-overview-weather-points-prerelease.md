# TODO 086 / Road Intelligence v1 - Codex handoff v336

Created: 2026-07-22 22:09

## Plan áfangans

Útfæra prufufasa fyrir nýja veðurpunktahugmynd á forsíðu/yfirlitsham nýja MapLibre-kortsins:

- Yfirlitspunktar eiga að vera hlutlausir, ekki grænir/appelsínugulir/rauðir.
- Scrubber í yfirlitsham á að vera hlutlaus tímalína, ekki áhættulituð.
- Vegagerðin "Nústaða" sýnir raungildi sem Vegagerðin hefur: vind, hviðu, lofthita og veghita.
- Veðurstofan "spá" sýnir spágildi: veður-emoji, vind, lofthita og úrkomu.
- Akstursstilling/route mode má áfram nota status-liti, því þar er liturinn settur í samhengi við veðurmörk notandans.

## Hvað var gert

- Bætti `neutralStatusColors` við `WeatherSourceTimeSelector`.
  - Default er `false`, þannig að núverandi notkun breytist ekki sjálfkrafa.
  - Nýja kortið sendir propinn í yfirlitsham svo "Núna" og spátímar fá hlutlausan gráan punkt í scrubber.

- Bætti `neutralColors` við `WindStatusFilterPills`.
  - Default er `false`.
  - Yfirlitshamur nýja kortsins notar propinn svo filterpillurnar séu hlutlausar og án status-icons.
  - Route/akstursstilling notar áfram venjulegu litina.

- Breytti yfirlitsstöðvum í `RoadMapPrototypeMap` úr lituðum punktum í compact veðurkort:
  - Vegagerðin:
    - efri lína: vindátt + meðalvindur og hviða ef til
    - neðri vinstri: lofthiti
    - neðri hægri: veghiti
    - ekkert veður-emoji, því Vegagerðin gefur ekki úrkomu/veðurtexta í þessum nústöðugögnum
  - Veðurstofan:
    - emoji byggt á veðurtexta/úrkomu
    - efri lína: vindátt + vindur
    - neðri vinstri: lofthiti
    - neðri hægri: úrkoma

- Endurnýtti sama marker-helper og route-stöðvarnar nota, með nýjum stillingum:
  - `compact`
  - `showNameLabel`
  - `secondaryMetricText/title/ariaText`
  - optional `weatherEmoji`

- Lagði grunn að provider-aware hægri neðri reit:
  - Veðurstofan notar `Úrkoma`.
  - Vegagerðin notar `Veghiti`.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- `lib/weather/providers/vedurstofanStationExplorer.ts`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-22-2209-todo-086-v336-codex-neutral-overview-weather-points-prerelease.md`

Ath: `.obsidian/workspace.json` var þegar dirty og var ekki snert viljandi.

## Skipanir sem voru keyrðar

- `git status --short`
- `rg ...`
- `Get-Content ...`
- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/windObservationStatus.test.ts`
  - Exit code: 0
  - 2 test files passed, 67 tests passed
- `git diff --stat`

## Design.md samræmi

- Fylgir reglunni um að litir hafi skýra merkingu: yfirlitið er nú hlutlaust og litir eru geymdir fyrir aksturssamhengi þar sem notandamörk gefa merkingu.
- Heldur mobile-first nálgun: markerinn er compact og user texti er í `messages/is.json` og `messages/en.json`.
- Stór áhætta sem þarf að prófa sjónrænt: 200+ DOM markers geta orðið þéttir á zoom-out. Þetta er meðvitaður prufufasi, ekki endanleg density-lausn.

## Ákvarðanir sem Codex tók

- Ekki sýna veður-emoji á Vegagerðar-nústöðu, því gögnin hafa vind/hita/veghita en ekki veðurtexta eða úrkomu.
- Sýna veghita í hægri neðri reit hjá Vegagerðinni í stað úrkomu.
- Halda route/aksturslitum óbreyttum, því þar eru litirnir áhættumat miðað við notanda.
- Gera neutral props opt-in til að lágmarka regression í gamla `/vedrid` og route mode.

## Hvað mistókst eða var sleppt

- Engin Playwright/screenshot sannprófun var keyrð. Stebbi keyrir dev server sjálfur samkvæmt workflow.
- Ekki var útfærð density/collision lausn fyrir yfirlitsveðurkortin. Þetta gæti þurft næsta UI-fasa ef kortið verður of þétt á landsyfirliti.
- Ekki var bætt við nýrri legendu sem útskýrir að Vegagerðin notar veghita en Veðurstofan úrkomu.

## Áhætta sem er enn til staðar

- Yfirlitið getur orðið sjónrænt mjög þétt, sérstaklega þegar allar Vegagerðarstöðvar eru sýndar á zoom-out.
- Filterpillur eru enn byggðar á status counts, þó þær séu hlutlausar sjónrænt í yfirliti. Það gæti verið rétta bráðabirgðalausnin, en UX þarf að ákveða hvort yfirlitið eigi yfirhöfuð að hafa status filters.
- Veðurstofu-emoji er einföld textaleit í íslenskum veðurtexta og þarf seinna að verða canonical mapping ef þetta verður áfram.

## Supabase / SQL / auth

- Engin SQL-skrá var skrifuð.
- Engin migration var keyrð.
- Engin RLS, grants, auth, feature access eða production gögn voru snert.
- Engin env-breyting var gerð.

## Localhost checks for Stebbi

Prófaðu á localhost með `ROAD_INTELLIGENCE_V1_ENABLED=true` og notanda sem hefur `road-intelligence-v1`.

1. Opnaðu `/auth-mvp/vedrid/road-map-prototype` án þess að reikna ferð.
2. Veldu Vegagerðin / nústöðu í efri eða neðri yfirlitsham.
   - Vænt: punktarnir eru ekki grænir/appelsínugulir/rauðir.
   - Vænt: compact marker sýnir vind og hviðu ef til, lofthita og veghita.
   - Vænt: engin úrkoma birtist fyrir Vegagerðina.
   - Vænt: scrubberpunkturinn er hlutlaus grár, ekki status-litaður.
3. Veldu spátíma Veðurstofu í scrubber.
   - Vænt: markerar sýna veður-emoji, vind, hiti og úrkomu.
   - Vænt: scrubberpunktar eru hlutlausir gráir.
4. Prófaðu `Einfalt` og `Nánar`.
   - Vænt: filterpillur eru hlutlausar í yfirlitsham.
   - Vænt: filterun virkar enn, en litir eru ekki notaðir til að lýsa áhættu.
5. Reiknaðu route, t.d. `Reykjavík -> Ísafjörður`.
   - Vænt: route/akstursstilling heldur áfram að nota status-liti á stöðvum og route-pillum.
   - Vænt: Vegagerðarstöðvar á leið sýna veghita í hægri neðri reit, ekki úrkomu.

Ekki prófa production eða deploy nema Stebbi samþykki það sérstaklega.

## Route intelligence check

Sérstaklega þarf að sannreyna að þessi neutral-overview breyting hafi ekki brotið:

- `Núna` route mode sýnir enn Vegagerðarstöðvar á leið.
- Forecast route mode sýnir enn Veðurstofustöðvar á leið.
- `visibleRouteStatuses` hefur enn áhrif í route mode.
- Aksturs-scrubber heldur áfram að nota liti þar sem hann er áhættumat.

## Tillaga að næsta skrefi

Claude Code ætti að rýna sérstaklega UX density:

- Á yfirlitskorti með 200+ Vegagerðarstöðvum: eru veðurkortin of stór?
- Þurfum við zoom/density-reglu sem sýnir:
  - zoom-out: neutral dot eða aðeins vind
  - medium zoom: compact veðurkort
  - route/selected/zoom-in: full weather point með nafni
- Þarf nýja litla provider-legendu: "Vegagerðin: hiti/veghiti, Veðurstofan: hiti/úrkoma"?

