# TODO-091 v018 — Fjarlægja basemap-heiti af Spákortinu

## Plan áfangans

1. Finna lagið sem teiknar `ICELAND`, Keflavík, Höfn og Ísafjörð.
2. Fjarlægja það án áhrifa á terrain, vegalínur eða Teskeið-spjöld.
3. Keyra type-check og whitespace-yfirferð.

## Hvað var raunverulega gert

- `stamen_terrain_labels` source og layer voru fjarlægð úr Spákortinu.
- Provider-heiti á borð við `ICELAND`, Keflavík, Höfn og Ísafjörð birtast því
  ekki lengur.
- Hillshade/landcover og almennar terrain-vegalínur eru áfram sýnileg.
- Staðaheiti sem Teskeið sjálft sýnir við valin spáspjöld eru óbreytt.
- Aksturskortið var ekki snert.

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- Skjámynd Stebba af Stamen Terrain Spákortinu.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2206-todo-091-v018-codex-remove-forecast-basemap-labels.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `git diff --check`
  - Exit code 0.
  - Engar whitespace-villur; aðeins fyrirliggjandi line-ending viðvaranir.

## Hvað mistókst eða var sleppt

- Dev server og browser voru ekki ræst.
- Production build var ekki endurkeyrt fyrir þessa afmörkuðu source/layer
  fjarlægingu. Build v017 stóðst og type-check v018 stóðst.

## Ákvarðanir og áhætta

- Allt provider-label rasterlagið var tekið út; rasterlagið leyfir ekki að fela
  aðeins fjögur valin heiti.
- Þar með hverfa einnig önnur Stamen-örnefni við meira zoom. Teskeið-spjöld og
  þeirra eigin staðaheiti halda áfram að gefa notandanum samhengi.
- Attribution helst á terrain-background source og er því áfram til staðar.
- Lausnin fylgir `Design.md` með því að minnka sjónrænan hávaða án nýrra
  controls, overflow eða mobile layout-breytinga.

## Supabase, SQL og production

- Engin SQL eða Supabase-breyting.
- Engin áhrif á auth, RLS, secrets, billing eða notendagögn.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Meta sjónrænt hvort kortið hafi nægt samhengi án basemap-örnefna. Ef síðar þarf
örfá valin náttúrunöfn væri betra að bæta þeim við sem sérstöku Teskeið-lagi en
að endurvekja allt raster-label lagið.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort spáspjöldin veiti nægilegt staðfræðilegt samhengi án basemap-heita.
- Hvort einhver nauðsynleg náttúrunöfn eigi síðar heima í afmörkuðu eigin lagi.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

1. Gerðu hard refresh og opnaðu **Spá → Kort**.
2. Vænt: `ICELAND`, Keflavík, Höfn og Ísafjörður sjást ekki.
3. Vænt: fjallaskygging, jöklar/landcover og almennar vegalínur sjást áfram.
4. Vænt: Reykjavík, Hella, Egilsstaðaflugvöllur og önnur heiti sem tilheyra
   Teskeið-spáspjöldunum sjást áfram með sínum spjöldum.
5. Zoom-aðu inn og út og staðfestu að engin önnur provider-heiti birtist.
6. Skiptu yfir í **Akstur → Kort**.
   - Vænt: Carto-heiti og núverandi Aksturskort eru óbreytt.
7. Prófaðu mobile-breiddir 360, 390 og 460 px og passaðu að kortið hafi áfram
   nægt sjónrænt samhengi.

Prófunin snertir ekki Supabase, production-gögn eða billing.
