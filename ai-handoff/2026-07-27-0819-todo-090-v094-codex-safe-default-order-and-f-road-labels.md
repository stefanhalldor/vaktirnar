# TODO #90 — Safe default order and F-road labels

Created: 2026-07-27 08:19
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi samþykkti að laga summary/fullscreen opnunarröð, halda varasamri
first-ready leið í loader meðan alternatives finnast, gera sjálfgefna röðun
ábyrgari, nota lýsandi Teskeiðarheiti og bæta F-road/Fjallavegur merkingu við.

Ekkert commit, push, deploy, migration, Supabase eða production var gert.

## Hvað var gert

- Fullscreen-opnun er sett í sama state-batch og fyrsta örugga weather-resultið,
  í stað post-paint `useEffect` eingöngu.
- Fullscreen má opnast með einni leið og fær fleiri provider-leiðir lifandi.
- Ef first-ready leið hefur caution:
  - sérstakt loader-ástand birtist: `Varasöm leið fannst. Leita að fleiri valkostum…`;
  - summary/fullscreen niðurstöðuspjöld eru ekki sýnd meðan leitað er;
  - fyrsta óvarasama leiðin er valin eftir minni möl og síðan tíma;
  - weather-result fyrir safe leið er applied áður en fullscreen opnast;
  - ef leit klárast án safe leiðar er caution-resultið loks sýnt, svo UI hangi ekki.
- Sjálfgefin card-röðun uppfærist lifandi þegar leiðir bætast við:
  1. non-F-road, non-caution;
  2. minni möl fyrst;
  3. caution routes;
  4. F-roads alveg aftast.
- Duration, distance og weather filters eru óbreytt explicit sorting og yfirskrifa
  default priority þegar notandi velur þau.
- Teskeiðarleiðir nota lýsandi heiti í stað 1/2/3:
  - `Öxi`;
  - `Fjallavegur`;
  - `Leið með varúð`;
  - `Malarleið`;
  - `Leið á bundnu slitlagi`;
  - `Lengri leið á bundnu slitlagi`.
- Fullscreen sýnir `Teskeiðarleiðarkerfið er í vinnslu` yfir leiðaspjöldum.

## F-road contract

- Road graph edges báru þegar `roadNumber`, `isFRoad` og `isMountainRoad` úr
  Vegagerðar-source.
- Routed result ber nú:
  - `fRoadDistanceM`;
  - unique sorted `fRoadNumbers`.
- Signed `RouteOption.experimental.fRoad` ber bounded distance og veganúmer til
  client.
- Envelope validator leyfir aðeins bounded metadata og hámark 32 veganúmer.
- UI sýnir `Fjallavegur` ef `fRoad.distanceM > 0`; möl ein og sér kveikir ekki
  fjallavegamerkingu.

## Skrár breyttar í áfanganum

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `lib/iceland-routes/roadGraph.ts`
- `lib/iceland-routes/roadGraphTypes.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `lib/iceland-routes/routeOptionEnvelope.server.ts`
- `lib/weather/provider.types.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/iceland-road-graph.test.ts`
- `lib/__tests__/road-graph-candidate.test.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- þessi handoff-skrá

Allar skrár voru unnar í dirty route/performance worktree og fyrirliggjandi
breytingar voru varðveittar.

## Prófanir

Lokakeyrsla:

`npm run test:run -- lib/__tests__/iceland-road-graph.test.ts lib/__tests__/road-graph-candidate.test.ts lib/__tests__/route-option-envelope.test.ts lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts`

- exit 0;
- 6 files;
- 173/173 tests passed.

Auk þess:

- `npm run type-check` — exit 0.
- Message JSON parse — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

Ný regression coverage:

- routed F-road distance/numbers;
- F-road facts í Teskeið candidate;
- envelope validation;
- default order: paved → gravel → caution → mountain/F-road;
- stable explicit duration/distance/weather sorting.

Full repo test suite var ekki keyrð í þessum localhost quick-iteration hring og
þarf að keyra fyrir útgáfu.

## Design.md samræmi

- Loader gefur skýrt feedback meðan ábyrgari route option er leitað.
- Notandi sér ekki hálfklárað summary sem hverfur sekúndu síðar.
- Status er texti og badge, ekki litur einn.
- Lýsandi route names koma úr domain facts, ekki provider-númerun.
- Work-in-progress texti er stuttur og lágvær.
- Default ordering er endurreiknuð án þess að route colors eða selection hoppi.

## Route intelligence check

- Snertir allar Teskeið road-graph routes og sérstaklega cautions, gravel og
  F-road classification.
- F-road fact er provider-neutral afleiða úr canonical graph edges.
- Engin raw Google geometry eða persónuleg route gögn eru geymd.
- Engin breyting á routing provider vali, Supabase, RLS eða auth.

## Localhost checks for Stebbi

1. Reikna route þar sem fyrsta Teskeiðarleið kemur fljótt og er óvarasöm.
2. Vænt: summary-spjaldið blikkar ekki áður en fullscreen opnast.
3. Vænt: fullscreen getur opnast með einni leið; fleiri leiðir bætast við án
   reopen eða litabreytinga.
4. Reikna Höfn → Egilsstaðir eða annað flæði þar sem first-ready leið hefur
   caution.
5. Vænt: loader segir `Varasöm leið fannst. Leita að fleiri valkostum…` og
   hvorki summary né fullscreen route cards birtast strax.
6. Þegar safe alternative finnst, vænt: weather fyrir hana er reiknað/applied
   og fullscreen opnast með safe leið valda.
7. Ef hægt er að prófa route þar sem allar alternatives eru cautioned, vænt:
   loader hangir ekki endalaust; niðurstöður birtast eftir terminal search state.
8. Skoða default card order þegar leiðir bætast við:
   - minni möl fyrst;
   - caution aftar;
   - Fjallavegur aftast.
9. Velja explicit Aksturstími/Vegalengd/Veður núna og fara aftur í Sjálfgefið.
10. Vænt: default safety/surface order endurheimtist; selection og litir haldast.
11. Staðfesta heiti: engin Teskeiðarleið 1/2/3; Öxi heitir `Öxi`, F-road heitir
    `Fjallavegur`, aðrar leiðir fá surface/caution heiti.
12. Vænt: `Teskeiðarleiðarkerfið er í vinnslu` sést einu sinni fyrir ofan cards.
13. Prófa staðfesta F-road route ef fixture/live graph býður slíka leið.
14. Vænt: `Fjallavegur` badge birtist aðeins þegar graph route hefur `isFRoad`,
    ekki bara vegna malar.
15. Prófa 360, 390, 460 px og desktop fyrir loader, cards og sort controls.

Engin migration, env-, Supabase-, auth-, RLS- eða production-aðgerð þarf fyrir
þessi localhost-próf.

## Óvissa / eftirstandandi áhætta

- Confidence: high fyrir graph metadata, default comparator og signed contract;
  173 targeted tests og type-check eru græn.
- Confidence: medium-high fyrir no-flicker/safety auto-apply þar til Stebbi
  staðfestir raunverulega async provider-röð og Network requests í browser.
- Lýsandi heiti eru nú fact-based en ekki full corridor names fyrir allar leiðir.
  Næsta route-intelligence skref gæti map-að segment/road-number samsetningar í
  nákvæmari heiti eins og `Um firðina` án handahófslegra UI-reglna.
