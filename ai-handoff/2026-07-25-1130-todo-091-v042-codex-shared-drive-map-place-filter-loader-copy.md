# TODO-091 — Sameiginlegt Aksturskort, staðasía og loader-textar

Created: 2026-07-25 11:30  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti að Codex framkvæmdi:

1. sameiginlegan kort-component fyrir litla leiðarkortið og stóra Aksturskortið
2. gagnkvæma síun svo valinn „Frá“ staður komi ekki í „Til“ og öfugt
3. þrjá nýja Akstursloader-texta

Ekki var samþykkt commit, push, deploy, migration, Supabase eða production-breyting.

## Hvað var gert

- Nýr `DriveRouteMap` er sameiginlegur MapLibre canvas/component fyrir bæði kortin.
- Litla SVG-eftirlíkingin var fjarlægð og litla kortið er nú raunverulegt MapLibre-kort.
- Sameiginleg kortaskilgreining heldur utan um:
  - Carto Voyager grunnkort og attribution
  - Vegagerðarvegakerfi
  - Vegagerðarvegfærðarkafla
  - Teskeiðargræna leiðarlínu og layer-röð
  - stöðvapunkta og valinn punkt
- Stóra kortið notar sama `DriveRouteMap` canvas og sömu exported kortastillingar.
- Litla kortið sækir vegfærð fyrir sýnilegt bbox og endurnýjar hana eftir pan/zoom.
- Leitarniðurstöður og vistaðir staðir sía út staðinn sem þegar er valinn í gagnstæða reitnum.
- Defensive guard kemur líka í veg fyrir að sami place-id/hnit séu sett í báða reiti.
- Loader-textar eru nú:
  - „Sæki leiðir frá Google Maps...“
  - „Sæki gögn frá Veðurstofu Íslands á þessum leiðum...“
  - „Raða veðurspám á rétta tímapunkta á leiðinni...“
- Samsvarandi enskir textar voru uppfærðir.

## Design.md

Lausnin endurnýtir einn component og semantic Teskeið-liti, heldur touch/focus hegðun stöðvapunkta og notar fast kortahæð án lárétts overflow. „Stækka kort“ helst sér control ofan á litla kortinu; kortagrunnur og layers eru sameiginleg en controls mega vera mismunandi eftir stærð.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `lib/__tests__/drive-journey-panel.test.ts`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/DriveRouteMap.tsx` — nýr sameiginlegur component
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

Worktree inniheldur fleiri eldri samþykktar breytingar og ótengda `.obsidian/workspace.json` breytingu. Þeim var ekki snúið við.

## Skipanir og niðurstöður

- `npm.cmd run type-check` — exit 0
- `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/weather-saved-places-api.test.ts` — exit 0, 29/29 próf
- JSON parse á báðum message-skrám — exit 0
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server var ræstur eða stöðvaður. Engin browserpróf, commit, push, deploy, SQL eða migration voru framkvæmd.

## Áhætta og eftirstandandi prófunargat

- Litla kortið bætir við einu bbox-kalli í road-segment endpoint þegar það opnast og eftir raunverulegt pan/zoom. Kallið er abort-að/debounce-að.
- MapLibre þarf browserpróf fyrir raunverulega tile-birtingu, fitBounds, resize og attribution; TypeScript/unit-próf geta ekki staðfest canvas.
- Litla kortið sýnir Veðurstofupunktana sem panelið hefur þegar. Sameiginlegi componentinn styður stöðvadataset sem prop, en Vegagerðarpunktar stóra kortsins eru áfram stýrðir af stóra kortaflæðinu.

## Route intelligence check

- Breytingin snertir hvaða kortalög sýna núverandi route geometry og provider-stöðvar, ekki tiltekna route-family eða vegkafla.
- Engin ný canonical leiðaþekking, control point, caution, matching-regla, cache eða persistence var búin til.
- Google route geometry er aðeins birt í virku client-sessioni og er ekki vistuð sem Teskeiðar-road graph.
- Engum nákvæmum ferðum eða heimilisföngum er safnað.
- `IcelandRoadmap.md` var ekki uppfært þar sem þetta er UI/component-endurnýting, ekki ný route-domain þekking.

## Localhost checks for Stebbi

Opna:
`/auth-mvp/vedrid/road-map-prototype?context=route&view=information`

1. Velja Reykjavík sem „Frá“. Opna „Til“: Reykjavík á hvorki að sjást í vistuðum stöðum né leitarniðurstöðum.
2. Velja Akureyri sem „Til“. Fara aftur í „Frá“: Akureyri á að vera síuð út.
3. Eyða/breyta öðrum reit og staðfesta að staðurinn komi aftur þegar hann er ekki lengur valinn gagnstætt.
4. Ýta á „Reikna“ og staðfesta nákvæma röð nýju loader-textanna.
5. Þegar niðurstaða birtist: litla kortið á að sýna raunverulegt Carto-kort, Vegagerðarvegakerfi, vegfærð, sömu grænu leiðarlínu og stöðvapunkta.
6. Ýta á „Stækka kort“ og bera saman kortagrunn, leiðarlínu, vegakerfi og vegfærð við stóra kortið.
7. Prófa pan/zoom á litla kortinu og staðfesta að það verði hvorki hvítt né valdi láréttu overflowi við 360, 390 og 460 px.
8. Smella á stöðvapunkt á litla kortinu og staðfesta að rétt Veðurstofuspjald birtist fyrir neðan.

Ekki prófa á production eða breyta Supabase. Engin auth-, RLS-, schema- eða notendagagnabreyting fylgir.

## Næsta skref

Claude Code rýnir lifecycle í `DriveRouteMap`, browserprófar bæði kort og metur hvort road-segment bbox-kall litla kortsins þurfi frekari cache/debounce áður en Stebbi samþykkir útgáfu.

## Óvissa / þarf að staðfesta

Confidence: high í type-safe endurnýtingu og staðasíu; medium-high í pixel-/tile-samsvörun þar til bæði MapLibre canvas hafa verið borin saman á localhost.
