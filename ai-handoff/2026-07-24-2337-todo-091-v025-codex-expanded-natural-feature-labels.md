# TODO-091 v025 — Stækkað safn fjalla og jökla á Spákorti

## Plan áfangans

1. Leita að traustum heimildum um helstu fjöll og jökla Íslands.
2. Stækka handvalið prototype-safn án þess að gera það að tæmandi örnefnaskrá.
3. Nota zoom-mörk til að halda Íslands-yfirliti læsilegu.
4. Varðveita hæð og flatarmál sem sjónrænt hierarchy.
5. Staðfesta að breytingin sé bundin við Spákortið.

## Hvað var raunverulega gert

- Jöklasafnið var stækkað úr 5 í 13 jökla:
  Snæfellsjökull, Torfajökull, Tindfjallajökull, Þrándarjökull,
  Eiríksjökull, Þórisjökull, Tungnafellsjökull, Eyjafjallajökull,
  Drangajökull, Mýrdalsjökull, Hofsjökull, Langjökull og Vatnajökull.
- Fjallasafnið var stækkað úr 8 í 28 fjöll og kennileiti víðs vegar um land:
  meðal annars Eldfell, Keilir, Fagradalsfjall, Kirkjufell, Akrafjall,
  Esja, Kaldbakur, Súlur, Dyrfjöll, Hekla, Herðubreið, Snæfell,
  Kverkfjöll, Bárðarbunga og Hvannadalshnúkur.
- Þekkt smærri fjöll geta birst fyrr en hæð þeirra ein myndi gefa tilefni til,
  en þéttari staðbundin nöfn birtast við zoom 6,4–7,0.
- Leturstærð byggir áfram á:
  - flatarmáli fyrir jökla,
  - hæð yfir sjávarmáli fyrir fjöll.
- Min/max útreikningur er nú óháður röð færslna í listunum.
- Vatnajökull notar um 7.600 km² samkvæmt stöðu árið 2023.
- Náttúruheiti birtast áfram aðeins í `weather` context; Aksturskortið er
  óbreytt.

## Heimildir og gagnavarúð

- Notaðar voru síður Náttúrufræðistofnunar, Veðurstofu Íslands,
  Jöklarannsóknafélags Íslands og opinberra staðasíðna, auk samanburðarlista
  yfir fjöll og jökla.
- Hnit og sum mæligildi eru handvalin/nálguð fyrir sjónrænt prototype.
- Þetta er ekki tæmandi eða canonical örnefnaskrá og á ekki að nota sem
  vísindaleg mæligögn.
- Áður en lagið verður fullgilt production-gagnalag þarf að færa gögnin í
  sérstakt typed safn og staðfesta hnit/heiti/hæðir gegn einni útgáfustýrðri
  opinberri heimild, helst LMÍ.

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2327-todo-091-v024-codex-card-text-scaling-and-mountains.md`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2337-todo-091-v025-codex-expanded-natural-feature-labels.md`

## Skipanir og niðurstöður

- `npm run type-check`
  - Exit code 0.
- `npm run test:run -- lib/__tests__/road-intelligence-road-map-places.test.ts`
  - Exit code 0; 1 skrá og 4 próf stóðust.
- Tilraun til að keyra test-skrá með nafni map-components:
  - Exit code 1 vegna þess að sú test-skrá er ekki til; engin próf keyrð.
- `git diff --check`
  - Exit code 0; aðeins fyrirliggjandi line-ending viðvaranir.
- `npm run build`
  - Exit code 0.
  - Fyrirliggjandi React Hook og `<img>` lint-viðvaranir, engin ný build-villa.

## Hvað mistókst eða var sleppt

- Dev server og browser voru ekki ræst.
- Engin sjálfvirk visual/collision próf eru til fyrir náttúruheiti.
- Safnið er ekki „öll fjöll og allir jöklar“; það er viljandi handvalinn
  byrjunarlisti yfir það helsta.
- Ekki var innleidd sjálfvirk label-collision milli fjalla, jökla og
  spáspjalda.
- Prominence er ekki til í gögnunum; hæð er enn notuð fyrir fjöll.

## Ákvarðanir

- „Allt það helsta“ var túlkað sem landsþekjandi, handvalið safn sem nýtist til
  að meta útlitið áður en farið er í gagnaveitutengingu.
- Staðbundin og lægri kennileiti eins og Akrafjall, Esja og Kirkjufell fá
  lægra `minZoom` vegna þekkjanleika, þótt leturstærð fylgi áfram hæð.
- Smájöklar birtast seinna en stóru jöklarnir svo yfirlitskortið haldist rólegt.

## Áhætta

- Nöfn geta skarast við zoom 6,5–8, sérstaklega á Suðurlandi og
  Vatnajökulssvæðinu.
- Nálguð hnit geta sett texta örlítið frá eðlilegri sjónmiðju fjallgarðs eða
  jökuls.
- Mælifell og Kaldbakur eru margnefni; valin staðsetning þarf sjónræna
  staðfestingu.
- DOM-markerum fjölgar, en 41 náttúrumarker er enn lítið safn. Tæmandi
  örnefnaskrá ætti ekki að nota þessa rendering-leið.

## Supabase, SQL og production

- Engin SQL, Supabase, RLS, auth, secret, billing eða notendagagnabreyting.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi prófi fyrst hvort þéttleiki, staðsetningar og stigvaxandi birting séu
rétt við zoom 5–9. Ef útlitið gengur upp er næsta skref label-collision og
leiðrétting á einstökum hnitum; canonical LMÍ-tenging má bíða.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort listinn nái þeim landshlutum og kennileitum sem notendur búast við.
- Overlap á Suðurlandi, Snæfellsnesi og Vatnajökulssvæðinu.
- Hvort þekkt lágreist fjöll eigi að fá meiri leturvigt óháð hæð.
- Hvort fjallgarðar eigi síðar að vera sér gagnategund frá einstökum tindum.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

1. Opnaðu **Spákort** og byrjaðu á Íslands-yfirliti.
   - Vænt: aðeins stærstu jöklarnir sjást; fjallanöfn eiga ekki að yfirgnæfa
     spáspjöldin.
2. Zoom-aðu jafnt frá um 5 upp í 8.
   - Vænt: minni jöklar og fjöll birtast stigvaxandi, ekki öll í einu.
3. Prófaðu sérstaklega:
   - Faxaflóa: Akrafjall, Esja, Keilir og Fagradalsfjall.
   - Snæfellsnes/Vestfirði: Snæfellsjökul, Kirkjufell, Kaldbak og Bolafjall.
   - Norðurland: Súlur, Kerlingu og Hraundranga.
   - Austurland: Dyrfjöll, Búlandstind, Vestrahorn og Snæfell.
   - Suðurland/hálendi: Heklu, Eyjafjallajökul, Mýrdalsjökul,
     Torfajökul, Bárðarbungu og Vatnajökul.
4. Við zoom 7,5+:
   - Vænt: hæð birtist undir fjöllum og nálgað flatarmál undir jöklum.
5. Færðu kortið og prófaðu 360, 390 og 460 px breidd.
   - Passa að nöfn fari ekki í óásættanlegt overlap við spáspjöld eða hvort
     annað.
6. Skiptu yfir í **Aksturskort**.
   - Vænt: öll fjalla- og jöklaheiti hverfa; aksturskortið er óbreytt.

Prófunin er aðeins sjónræn og snertir hvorki Supabase né production-gögn.
