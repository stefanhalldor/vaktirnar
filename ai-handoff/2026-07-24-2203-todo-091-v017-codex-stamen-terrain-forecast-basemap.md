# TODO-091 v017 — Stamen Terrain á Spákortinu

## Plan áfangans

1. Fjarlægja hafnaðan dökkan OpenFreeMap Fiord-stíl.
2. Setja upp ljósan terrain-grunn sem sýnir fjallform, landcover og náttúru.
3. Sýna venjulegar cartographic vegalínur, en ekki hrá Vegagerðar- eða
   færðarlög.
4. Halda Aksturskortinu óbreyttu.
5. Staðfesta TypeScript, próf og build.

## Hvað var raunverulega gert

- OpenFreeMap Fiord var fjarlægður úr kóðanum.
- Spákortið notar nú þrjú aðskilin Stamen Terrain rasterlög frá Stadia Maps:
  - terrain background með hillshade og landcover,
  - terrain lines með almennum stílfærðum vegum og mörkum,
  - terrain labels með örnefnum.
- Almennu terrain-vegalínurnar eru hluti af basemapinu.
- `vegagerdin-vegakerfi` og `road-segments` eru áfram falin í Spá.
- Akstur notar áfram ógegnsætt Carto Voyager raster og núverandi
  Vegagerðar-/færðartoggles.
- EU tile-endpoint Stadia Maps er notaður.

## Kostnaður og authentication

- Localhost á `localhost` eða `127.0.0.1` þarf samkvæmt Stadia Maps engan
  API-lykil, en er með strangari rate limits.
- Fyrir production þarf að stofna Stadia-aðgang og skrá production-lénið með
  domain-based authentication, eða nota viðeigandi API authentication.
- Stadia merkir Stamen Terrain sem tiltækt á Free tier, en production-notkun
  þarf að staðfesta gegn gildandi service limits áður en rollout er samþykkt.
- Enginn lykill, account, billing eða production domain var sett upp í þessum
  áfanga.

## Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `TODO.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- Stadia Maps Stamen Terrain documentation.
- Stadia Maps authentication documentation.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2203-todo-091-v017-codex-stamen-terrain-forecast-basemap.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0 eftir lokabreytingu.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0.
  - 2 testaskrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0.
  - Engar whitespace-villur; aðeins line-ending viðvaranir.
- `npm.cmd run build`
  - Fyrri keyrsla: exit code 1 vegna tímabundinna `PageNotFoundError` fyrir
    `/contacts` og `/settings` eftir vel heppnaða compilation.
  - Óbreytt endurkeyrsla: exit code 0.
  - Build var keyrt áður en terrain-lines source/layer var bætt við; type-check
    var endurkeyrt eftir þá litlu lokabreytingu og stóðst.

## Hvað mistókst eða var sleppt

- Fiord-tilraunin í v016 var hafnað sjónrænt og er ekki lengur virk.
- Ekki var ræstur dev server eða stjórnað localhost.
- Ekki var hægt að staðfesta rasterútlitið sjónrænt innan agent-umhverfisins.
- Production authentication fyrir Stadia var ekki stofnað, enda þarf það
  sérstakt ytra samþykki og rollout ákvörðun.

## Ákvarðanir

- Nota raster layer groups í stað heils vector-stíls. Það gerir okkur kleift að
  velja landslag, línur og labels sérstaklega án eigin kortastíls.
- Almennar terrain-vegalínur eru leyfðar á Spákortinu, en hrátt
  Vegagerðar-vegakerfi og lituð færð eru áfram eingöngu í Akstri.
- Nota `@2x` PNG tiles fyrir skýrari mobile/retina framsetningu.
- Lausnin fylgir `Design.md` með ljósari, náttúrulegri og rólegri grunnmynd án
  nýrra controls eða layout-breytinga.

## Áhætta

- Localhost getur fengið HTTP 429 ef ólyklaðar Stadia-beiðnir fara yfir
  þróunarmörk.
- Production mun ekki virka traust án domain authentication eða annars
  samþykkts Stadia-auth forms.
- Raster labels geta ekki aðlagast collision við eigin DOM-spáspjöld.
- Sjónræn gæði jökla og fjallgarða á Íslandi þurfa localhost-staðfestingu.
- Attribution-lengd þarf mobile-prófun.

## Supabase, SQL og production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin áhrif á Supabase, RLS, auth eða notendagögn.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi endurhleði localhost-síðuna og meti terrain-grunninn. Ef fjallform og
jöklar eru rétt en litir of sterkir eða daufir má fínstilla raster opacity,
brightness, saturation og contrast án annars provider-skiptis.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort Stamen Terrain sýni íslenska jökla og fjallform nægilega vel.
- Hvort terrain-lines séu hæfilega fíngerðar.
- Hvort `@2x` tiles og þrjú rasterlög séu ásættanleg á mobile.
- Production authentication, limits og attribution áður en rollout kemur til
  greina.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

1. Gerðu hard refresh og opnaðu **Spá → Kort**.
   - Vænt: svarti Fiord-grunnurinn er alveg horfinn.
   - Vænt: ljósara terrain-kort með hillshade, landformum og örnefnum.
2. Skoðaðu Vatnajökul, Hofsjökul, Langjökul, Tröllaskaga, Vestfirði og
   hálendið.
   - Vænt: fjallform og jöklar lesast betur en á fyrri Carto- og Fiord-grunni.
3. Skoðaðu venjulegar vegalínur.
   - Vænt: fíngerðar basemap-línur sjást.
   - Ekki vænt: grænt/blátt Vegagerðar-raster eða lituð færðarsegment.
4. Prófaðu zoom 5–9 á 360, 390 og 460 px og desktop.
   - Passa POI/label magn, spjaldalæsileika, tile sharpness og overlap.
5. Skiptu yfir í **Akstur → Kort**.
   - Vænt: Carto Voyager og núverandi Vegagerðar-/færðarvirkni birtist eins og
     áður.
6. Skiptu nokkrum sinnum milli Spár og Aksturs.
   - Vænt: ekkert lag lekur milli contexta.
7. Fylgstu með Network/Console.
   - HTTP 401 þýðir authentication-vandamál.
   - HTTP 429 þýðir að localhost rate limit Stadia hafi náðst.
8. Athugaðu attribution á mobile.
   - Vænt: OpenStreetMap, Stadia Maps, Stamen Design og OpenMapTiles eru
     sýnileg án þess að hylja mikilvæg controls.

Prófunin snertir ekki Supabase eða production-gögn. Ekki setja API-lykil í
repo eða client-kóða ef 429 kemur upp; production authentication þarf sérstaka
ákvörðun.
