# TODO-091 v019 — Jöklaheiti á Spákortinu

## Plan áfangans

1. Bæta aðeins helstu jöklaheitum við hreina terrain-grunninn.
2. Nota sjálfstætt Teskeið-lag í stað provider-label rasterlags.
3. Sýna heitin aðeins í Spá og halda Akstri óbreyttum.
4. Gera uppsetninguna endurnýtanlega fyrir möguleg fjalla- og árheiti síðar.

## Hvað var raunverulega gert

- Bætt var við landfræðilegum merkjum fyrir:
  - Drangajökul,
  - Langjökul,
  - Hofsjökul,
  - Mýrdalsjökul,
  - Vatnajökul.
- Heitin eru DOM MapLibre markers staðsett við miðjur jöklanna.
- Útlit er fíngert blágrátt skáletur með ljósri textaútlínu svo það lesist yfir
  mismunandi terrain-lit.
- Heitin eru `pointer-events:none` og trufla því ekki map-pan eða spáspjöld.
- Þau sjást aðeins í `weather` context og eru falin í `route` context.
- Cleanup fjarlægir markerana þegar component unmountast.
- Engum fjalla- eða árheitum var bætt við í þessum áfanga.

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `Design.md`
- Fyrri terrain- og label-handoff v017–v018.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2230-todo-091-v019-codex-forecast-glacier-labels.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 2 skrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0; engar whitespace-villur, aðeins line-ending viðvaranir.
- `npm.cmd run build`
  - Fyrri keyrsla: exit code 1 eftir compilation vegna tímabundinna
    `PageNotFoundError` fyrir `/stillingar/tengsl/page` og
    `/api/followers/route`.
  - Óbreytt endurkeyrsla: exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.

## Hvað mistókst eða var sleppt

- Ekki var ræstur dev server eða framkvæmd sjónræn browserprófun.
- Engin collision-vél var tengd jöklaheitunum við spáspjöldin. Fimm heiti eru
  vítt dreifð, en overlap þarf samt mobile-staðfestingu.

## Ákvarðanir og áhætta

- Notaðir eru DOM markers þar sem núverandi raster-style hefur ekki glyph
  configuration fyrir MapLibre symbol layer.
- Landfræðileg hnit eru afmörkuð static presentation-gögn, ekki routing- eða
  veðurgögn.
- Öll fimm heitin sjást á núverandi Íslands-zoom. Meta þarf hvort Drangajökull
  eða Mýrdalsjökull verði of nálægt spáspjöldum á litlum skjám.
- Lausnin fylgir `Design.md`: engin ný controls, touch targets eða overflow;
  textinn er vísvitandi rólegur og víkur fyrir spáupplýsingum.

## Supabase, SQL og production

- Engin SQL, Supabase, RLS, auth, secret eða billing-breyting.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Staðfesta staðsetningu, stærð og contrast jöklaheitanna á localhost. Ef þetta
virkar vel má síðar útbúa sérstakan, takmarkaðan lista yfir helstu fjallgarða
og ár með eigin zoom-reglum, frekar en að endurvekja provider-label lagið.

## Atriði sem Codex ætti sérstaklega að rýna

- Landfræðilega staðsetningu merkjanna.
- Overlap við spáspjöld og tengilínur á 360–460 px.
- Hvort zoom-dependent font size eða visibility þurfi áður en fleiri
  náttúruheiti bætast við.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

1. Gerðu hard refresh og opnaðu **Spá → Kort**.
2. Vænt: Drangajökull, Langjökull, Hofsjökull, Mýrdalsjökull og Vatnajökull
   sjást á sínum landfræðilegu svæðum.
3. Vænt: engin almenn provider-heiti á borð við `ICELAND`, Keflavík, Höfn eða
   Ísafjörður.
4. Athugaðu að jöklaheitin séu læsileg en sjónrænt veikari en spáspjöldin.
5. Pan-aðu og zoom-aðu við 360, 390 og 460 px og desktop.
   - Passa overlap við spáspjöld, tengilínur og kortastýringar.
   - Passa að textinn haldist fastur við jöklana.
6. Dragðu kortið með því að byrja gesture yfir jöklaheiti.
   - Vænt: kortið pan-ar eðlilega; heitin fanga ekki pointer.
7. Skiptu yfir í **Akstur → Kort**.
   - Vænt: jöklaheitin hverfa og Aksturskortið er óbreytt.
8. Skiptu aftur í Spá.
   - Vænt: jöklaheitin birtast aftur án tvöföldunar.

Prófunin snertir ekki Supabase, production-gögn eða billing.
