# TODO-091 v022 — Jöklastærðir, hlutfallslegt letur og zoom-detail

## Plan áfangans

1. Staðfesta flatarmál fimm stærstu jökla úr traustri heimild.
2. Bæta flatarmáli við núverandi jöklagögn.
3. Skala letur eftir flatarmáli án þess að Vatnajökull yfirgnæfi kortið.
4. Birta aðeins heiti á yfirliti og heiti + flatarmál við nánara zoom.
5. Stýra sýnileika minni jökla eftir zoom.
6. Halda fjöllum utan þessa prófunaráfanga.

## Hvað var raunverulega gert

- Flatarmál var bætt við jöklalistann:
  - Vatnajökull: um 7.900 km²,
  - Langjökull: um 900 km²,
  - Hofsjökull: um 890 km²,
  - Mýrdalsjökull: um 560 km²,
  - Drangajökull: um 142 km².
- Gögnin koma frá Náttúrufræðistofnun Íslands og eru merkt í kóðanum með
  source-slóð.
- Leturstærð notar logaritmískan skala frá um 10 px til 16 px við Íslands-zoom.
  Það varðveitir skýran stærðarmun án línulegrar 55-faldrar ýkju.
- Letur stækkar lítillega við innzoom, að hámarki um 2 px til viðbótar.
- Við zoom undir skilgreindu `minZoom` hverfa minni jöklar fyrr:
  - Vatnajökull frá 4,8,
  - Langjökull/Hofsjökull frá 5,2,
  - Mýrdalsjökull frá 5,4,
  - Drangajökull frá 5,8.
- Við zoom 7,2 eða nær birtist önnur lína:
  - `≈ 7.900 km²` o.s.frv., locale-formöttuð.
- `≈` er notað þar sem flatarmál jökla breytist með tíma.
- Jöklaheitin eru áfram aðeins á Spákortinu og áfram
  `pointer-events:none`.
- Engum fjöllum eða ám var bætt við.

## Heimild

- Náttúrufræðistofnun Íslands:
  `https://www.ni.is/en/geology/water/glaciers`
- Veðurstofa Íslands staðfestir jafnframt að íslenskir jöklar rýrna hratt og að
  flatarmál séu því tímabundin nálgun.

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- Opinberar jöklasíður Náttúrufræðistofnunar Íslands.
- Opinberar jökla- og mælingasíður Veðurstofu Íslands.
- `Design.md`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2309-todo-091-v022-codex-scaled-glacier-label-details.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 2 skrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0; engar whitespace-villur, aðeins line-ending viðvaranir.
- `npm.cmd run build`
  - Fyrri keyrsla: exit code 1 eftir compilation vegna tímabundinna
    `PageNotFoundError` fyrir `/contacts` og `/home`.
  - Óbreytt endurkeyrsla: exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.

## Hvað mistókst eða var sleppt

- Ekki var ræstur dev server eða framkvæmd sjónræn browserprófun.
- Ekki var bætt við útgáfuári flatarmálstalnanna í UI; `≈` gefur til kynna að
  þetta séu nálgunargildi.
- Ekki var byggt collision-kerfi milli jöklatexta og spáspjalda.

## Ákvarðanir

- Logaritmískur flatarmálsskali er notaður í stað línulegs skala.
- Flatarmál birtist aðeins við nánara zoom til að halda Íslands-yfirliti
  rólegu.
- Locale formatting er notað svo íslenska sýni t.d. `7.900` og enska `7,900`.
- Textinn er áfram DOM marker þar sem raster-basemap hefur ekki glyph
  configuration fyrir MapLibre symbol layer.
- Lausnin fylgir `Design.md`: stigvaxandi upplýsingar, engin ný controls og
  ekkert sem fangar touch/pointer.

## Áhætta

- Heimildin birtir nálgunartölur en ekki eitt sameiginlegt mæliár beint við
  hvert gildi.
- Flatarmálin breytast; framtíðaruppfærsla þarf version/source date ef þetta
  verður meira en sjónræn prototype-upplýsing.
- Leturstærðir, minZoom og detailZoom eru hönnunartilraun og þurfa sjónprófun.
- Detail-lína getur rekist á spáspjöld á mobile við zoom 7,2–8.
- `zoom` event uppfærir fimm litla DOM markers; kostnaður er lítill en ætti að
  endurmeta áður en tugum fjalla og áa er bætt við.

## Supabase, SQL og production

- Engin SQL, Supabase, RLS, auth, secret, billing eða notendagagnabreyting.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi prófi jöklaskalann og zoom-thresholds. Ef módelinu er tekið vel má
aðskilja natural-feature gögn og presentation helper úr stóra map componentinu
áður en fjöllum og ám er bætt við.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort log-skali endurspegli stærðarmun á skynsamlegan hátt.
- Hvort detailZoom 7,2 sé rétt.
- Hvort flatarmál eigi að innihalda heimildarár eða „um“ texta í stað `≈`.
- DOM performance/collision áður en natural-feature listinn stækkar.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

1. Gerðu hard refresh og opnaðu **Spá → Kort** við Íslands-yfirlit.
2. Vænt:
   - Vatnajökull er stærsta jöklaheitið.
   - Langjökull og Hofsjökull eru álíka stór.
   - Mýrdalsjökull er aðeins minni.
   - Drangajökull er minnstur.
   - Aðeins heitin sjást, ekki flatarmál.
3. Zoom-aðu hægt frá zoom 4,5 upp í 6.
   - Vatnajökull birtist fyrst.
   - Langjökull/Hofsjökull næst, síðan Mýrdalsjökull og loks Drangajökull.
4. Zoom-aðu inn yfir 7,2.
   - Vænt: undir hverju sýnilegu heiti birtist `≈ … km²`.
   - Á íslensku á Vatnajökull að sýna `≈ 7.900 km²`.
5. Zoom-aðu áfram og aftur út.
   - Letur stækkar aðeins, án skyndilegra stökkva.
   - Detail-línan hverfur aftur undir zoom 7,2.
6. Prófaðu 360, 390 og 460 px, sérstaklega þar sem spáspjöld liggja yfir
   jöklum.
   - Passa overlap, læsileika og að jöklaheiti séu sjónrænt undir spáspjöldum.
7. Dragðu kortið með gesture yfir jöklatexta.
   - Kortið á að pan-a eðlilega.
8. Skiptu í **Akstur → Kort** og aftur.
   - Jöklaheitin og flatarmálin eiga að hverfa í Akstri og birtast aftur í Spá.
9. Ef locale-switch er prófað:
   - íslenska: `7.900`,
   - enska: `7,900`.

Prófunin snertir ekki Supabase, production-gögn eða billing.
