# TODO-091 v016 — OpenFreeMap Fiord á Spákortinu

## Plan áfangans

1. Velja tilbúinn basemap sem dregur náttúrulegt Ísland betur fram.
2. Afmarka nýja útlitið við Spákortið.
3. Halda núverandi Carto- og Vegagerðarútliti óbreyttu í Akstri.
4. Varðveita öll sérlög, spáspjöld og tengilínur.
5. Keyra type-check, afmörkuð próf og production build.

## Hvað var raunverulega gert

- OpenFreeMap Fiord er nú upphafsstíll sameiginlega MapLibre-kortsins.
- Fiord er sýnilegur þegar kortið er í `weather` context og verður því nýr,
  náttúrulegri grunnur Spákortsins.
- Núverandi Carto Voyager raster er bætt ofan á Fiord eftir style-load og er
  aðeins sýnilegt í `route` context.
- Vegakerfi Vegagerðarinnar og færðarsegment eru áfram aðeins sýnileg í Akstri
  og fylgja núverandi toggles.
- Context-skipti nota layer visibility í stað `setStyle()`. Það kemur í veg
  fyrir að sérlög, route-lína eða spáspjöld tapist við tab-skipti.
- Engum notendatexta var bætt við og því þurfti ekki að breyta þýðingum.

## Af hverju Fiord

- Tilbúinn OpenFreeMap-stíll sem virkar beint með MapLibre.
- Meiri náttúrulegur karakter en núverandi flati rastergrunnur.
- Enginn API-lykill eða notendaskráning.
- Opinbera public instance er sögð ókeypis og án uppgefinna request/map-view
  marka.
- Attribution er áskilið og kemur úr style/source metadata.

## Þjónustu- og kostnaðarfyrirvari

- Enginn beinn kostnaður eða billing-tenging var sett upp.
- OpenFreeMap public instance er framlagsfjármögnuð og kemur ekki með
  hefðbundið greitt SLA. Því þarf að meta stöðugleika og performance áður en
  þetta verður endanlegt production-val.
- Enginn API-lykill, secret, Vercel env-breyta eða domain restriction var
  stofnuð.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `TODO.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- Opinber OpenFreeMap quick-start og verkefnisupplýsingar.
- Opinberar upplýsingar um MapTiler og Stadia Terrain til samanburðar.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2156-todo-091-v016-codex-openfreemap-fiord-forecast-basemap.md`

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0.
  - 2 testaskrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0.
  - Engar whitespace-villur; aðeins line-ending viðvaranir í fyrirliggjandi
    worktree.
- `npm.cmd run build`
  - Fyrri keyrsla: exit code 1 eftir vel heppnaða compilation vegna
    `PageNotFoundError` fyrir `/api/admin/teskeid-usage/route` í prerender.
  - Önnur keyrsla án kóðabreytinga eða cache-hreinsunar: exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.

## Hvað mistókst eða var sleppt

- Fyrsta build-keyrslan rakst á tímabundið Next.js page/module vandamál.
  Óbreytt endurkeyrsla stóðst.
- Dev server var ekki ræstur og browserprófun var ekki framkvæmd samkvæmt
  vinnureglum verkefnisins.
- Ekki var byggt sérstakt runtime fallback yfir í Carto ef OpenFreeMap
  style-þjónustan sjálf er óaðgengileg. Núverandi map error-state tekur við
  style-load villu; production fallback má meta eftir localhost/network prófun.

## Ákvarðanir

- Fiord er prófaður í stað þess að sérhanna vector-stíl eða byggja tile server.
- Sama MapLibre instance er notað fyrir bæði context til að halda núverandi
  state, bounds og sérlögum stöðugum.
- Ógegnsætt Carto raster hylur Fiord í Akstri. Þannig helst Aksturskortið
  sjónrænt óbreytt án dýrra style-endurhleðslna.
- Breytingin fylgir `Design.md` með því að auka sjónrænan karakter án nýrra
  controls, layout shift eða minni touch targets. Endanleg mobile-læsileiki
  þarf þó browserstaðfestingu.

## Áhætta sem er enn til staðar

- OpenFreeMap er ný ytri runtime dependency fyrir kortagrunn Spákortsins.
- Fiord gæti sýnt of mörg POI eða örnefni á sumum zoom-stigum; það verður að
  meta sjónrænt á Íslandi.
- Attribution getur orðið lengra þar sem bæði Fiord og Carto sources eru í
  style þó Carto sé falið í Spá.
- Performance og font/glyph hleðsla þarf að staðfesta á mobile og hægri
  tengingu.
- Fjöldi eldri ócommittaðra breytinga er í worktree. Þeim var ekki snúið við.

## Supabase, SQL og production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin breyting var gerð á Supabase, RLS, auth, notendagögnum eða production.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi beri Fiord saman við fyrri grunn á localhost á sömu sex stöðum og meti
sérstaklega hvort Ísland verði lifandi án þess að spáspjöld og örnefni fari að
keppa um athygli. Ef grunnurinn stenst má næst fínstilla spjaldaskugga, punkta
og tengilínur gegn nýja litrófinu.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort Fiord sé rétti náttúrulegi karakterinn fyrir Teskeið eða hvort
  OpenFreeMap Liberty/Positron sé læsilegri.
- Hvort ógegnsætt Carto raster tryggi í reynd óbreytt Akstursútlit.
- Hvort bæta eigi við afmörkuðu runtime fallback áður en production rollout
  kemur til greina.
- Attribution, mobile performance og POI-magn.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

Nauðsynlegt state:

- Valdar spástöðvar í Spá.
- Valin leið í Akstri.
- Internettenging svo ytri OpenFreeMap style, tiles, glyphs og sprites hlaðist.

Skref:

1. Opnaðu **Spá** og skiptu yfir á kortið.
   - Vænt: Fiord-grunnur birtist og Ísland hefur meiri náttúrulegan karakter.
   - Spáspjöld, punktar og tengilínur eiga að birtast óbreytt ofan á grunninum.
   - Vegakerfi Vegagerðarinnar og færðarsegment eiga ekki að sjást.
2. Skoðaðu Reykjavík, Gullfoss, Vatnajökul, Mývatn, Vestfirði og Hálendið.
   - Meta sérstaklega landform, jökla, vatn, strandlínu, íslensk örnefni,
     POI-magn og hvort spáupplýsingarnar séu áfram aðalatriðið.
3. Pan-aðu og zoom-aðu við 360, 390 og 460 px mobile-breidd og desktop.
   - Vænt: engin lárétt overflow, overlap eða dauð kortastýring.
   - Passa að texti og spjöld séu læsileg yfir ljósum og dökkum landsvæðum.
4. Skiptu yfir í **Akstur** og opnaðu kort valinnar leiðar.
   - Vænt: núverandi Carto Voyager útlit birtist, ekki Fiord.
   - Route-lína, spáspjöld, Vegagerðarlag og færð eiga að virka eins og áður.
5. Breyttu Vegagerðar- og færðartoggles í Akstri og skiptu nokkrum sinnum milli
   Spár og Aksturs.
   - Vænt: Spákortið heldur Fiord án vegalaga; Aksturskortið heldur Carto og
     virðir toggle-stöðu.
6. Athugaðu attribution neðst á kortinu.
   - Vænt: OpenFreeMap/OpenMapTiles/OpenStreetMap attribution er til staðar.
   - Meta hvort lengdin valdi overlap-i á mobile.
7. Prófaðu ef mögulegt er á hægri tengingu.
   - Vænt: notandi fær loader/error feedback en ekki dautt kort.

Prófunin breytir ekki Supabase, auth, secrets, billing eða production-gögnum.
Ekki þarf að breyta env-breytum eða keyra migration.
