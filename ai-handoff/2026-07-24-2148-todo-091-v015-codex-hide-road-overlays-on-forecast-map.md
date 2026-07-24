# TODO-091 v015 — Fela vegalög á Spákortinu

## Plan áfangans

1. Greina hvaða MapLibre-lög teikna vegakerfið og færðina.
2. Fela þau eingöngu þegar kortið er í `weather` context.
3. Varðveita núverandi hegðun og toggles á Aksturskortinu.
4. Keyra afmörkuð próf, type-check og production build.

## Hvað var raunverulega gert

- `vegagerdin-vegakerfi`, rasterlag Vegagerðarinnar, er nú falið á Spákortinu.
- `road-segments`, vektorlag með færð/ástandi vega, er nú falið á Spákortinu.
- Þegar farið er yfir á Aksturskortið eru lögin endurheimt samkvæmt núverandi toggle-stöðu notandans.
- Context kortsins er geymt í ref svo `road-segments` birtist ekki óvart ef async gagnahleðsla lýkur eftir að Spákortið hefur opnast.
- Venjulegur basemap, spáspjöld og tengilínur spjaldanna voru ekki snert.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `TODO.md`
- `components/weather/RoadMapPrototypeMap.tsx`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2148-todo-091-v015-codex-hide-road-overlays-on-forecast-map.md`

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0.
  - 2 testaskrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0.
  - Engar whitespace-villur; aðeins fyrirliggjandi line-ending viðvaranir.
- `npm.cmd run build`
  - Fyrri keyrsla: exit code 1 eftir vel heppnaða compilation vegna tímabundinna `PageNotFoundError` villna fyrir `/contacts`, `/settings` og `/home` við page-data skref.
  - Önnur keyrsla, án kóðabreytinga eða cache-hreinsunar: exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.
- `git status --short`
  - Notað read-only til að staðfesta vinnuskrár og varðveita ótengdar breytingar.

## Hvað mistókst eða var sleppt

- Fyrsta build-keyrslan rakst á tímabundið Next.js page-data/module vandamál. Óbreytt endurkeyrsla stóðst.
- Ekki var ræstur dev server og engin browserprófun var framkvæmd, samkvæmt vinnureglum verkefnisins.

## Ákvarðanir

- Aðeins sértæk Road Intelligence/Vegagerðin lög eru falin. Vegir sem eru hluti af almenna Carto-basemapinu eru áfram sýnilegir sem eðlilegur landakortsgrunnur.
- Sama MapLibre component er áfram endurnýtt, en sýnileiki laganna er bundinn skýrt við `weather` eða `route` context.
- Aksturstoggles halda áfram að ráða sýnileika laganna á Aksturskortinu.

## Áhætta sem er enn til staðar

- Sjónræn browserprófun þarf að staðfesta að engin async hleðsla láti vegalög birtast aftur á Spákortinu.
- Þar sem almenni basemapinn sýnir sína eigin vegi verða vegir ekki alveg fjarlægðir úr landakortinu; aðeins sérlög Vegagerðarinnar og færðarinnar hverfa.
- Margar eldri ócommittaðar breytingar eru í worktree. Þeim var ekki breytt eða snúið við í þessum áfanga.

## Supabase, SQL og production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin breyting var gerð á Supabase, gögnum, RLS, auth, policies, functions eða production.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi prófi context-aðskilnaðinn á localhost. Ef hann stenst má taka næstu litlu fegrunarbót á Spákortinu án þess að breyta Aksturskortinu.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort `lastMapContextRef` loki öllum async leiðum sem geta sýnt `road-segments`.
- Hvort layer visibility endurheimtist rétt miðað við bæði toggles þegar skipt er aftur yfir í Akstur.
- Hvort æskilegt sé síðar að hafa aðskildar style-stillingar fyrir almenna basemapinn á Spákorti og Aksturskorti.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

Nauðsynlegt state:

- Opna þarf bæði Spá og Akstur.
- Best er að hafa valda leið í Akstri og valdar spástöðvar í Spá.

Skref:

1. Opnaðu **Spá** og skiptu yfir á litla kortið.
   - Vænt niðurstaða: græna/bláa raster-vegakerfi Vegagerðarinnar og lituðu færðarsegmentin sjást ekki.
   - Venjulegur basemap á áfram að sjást.
   - Valin spáspjöld, staðapunktar og tengilínur þeirra eiga áfram að sjást.
2. Pan-aðu og zoom-aðu kortið og bíddu þar til öll gögn virðast hlaðin.
   - Vænt niðurstaða: vegalögin birtast ekki aftur eftir async hleðslu.
3. Opnaðu **Akstur** og kort valinnar leiðar.
   - Vænt niðurstaða: vegakerfi og færðarsegment birtast þar samkvæmt núverandi toggles.
4. Breyttu vegakerfis- eða færðartoggle í Akstri, farðu yfir í Spá og síðan aftur í Akstur.
   - Vænt niðurstaða: Spákortið helst hreint og Aksturskortið virðir toggle-stöðuna.
5. Prófaðu í mjóum mobile glugga og desktop-stærð.
   - Passa sérstaklega að ekkert overlap, lárétt overflow eða óvænt kortastökk hafi bæst við.

Þessi prófun snertir ekki Supabase, production-gögn eða notendagögn umfram venjulega lestur/stillingar í localhost appinu. Ekki þarf að keyra migration eða breyta env-breytum.
