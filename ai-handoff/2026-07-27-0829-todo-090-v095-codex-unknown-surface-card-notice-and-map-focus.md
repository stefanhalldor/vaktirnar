# TODO-090 v095 — Óstaðfest slitlag, vinnslumerking og kortafókus

Created: 2026-07-27 08:29  
Timezone: Atlantic/Reykjavik

## Samþykkt og plan

Stebbi samþykkti afmarkaðan UI-áfanga á stóra leiðakortinu: merkja km af óstaðfestu slitlagi, raða slíkum leiðum aftast sjálfgefið, færa vinnslumerkingu Teskeiðar inn á Teskeiðarspjöldin og færa valið spjald smoothly í fókus þegar leið er valin á kortinu.

## Hvað var gert

- Bætt var við `unknownSurfaceKm` í sameiginlegt route-card model.
- Sjálfgefin röðun setur allar leiðir með óstaðfest slitlag aftast. Aðrar röðunarstillingar halda sinni skýru merkingu.
- Óstaðfest/mixed slitlag birtist sem sérstakt badge, t.d. `69 km óstaðfest slitlag`.
- `Teskeiðarleiðarkerfið er í vinnslu` birtist nú inni á hverju Teskeiðarspjaldi í stað sérlínu ofan við spjöldin.
- Kortaval kallar `scrollIntoView` með smooth hreyfingu og miðjar viðkomandi spjald í lárétta listanum.
- Scroll-kallið er varið fyrir umhverfi sem styðja ekki `scrollIntoView`.

## Route intelligence check

- Breytingin snertir allar Teskeiðarleiðir sem bera `experimental.surface` gögn, ekki eina route-family eða provider-sérreglu.
- Engin slitlagsflokkun var fölsuð eða yfirskrifuð. Óstaðfest slitlag er áfram fail-closed öryggisupplýsing og sýnt notanda.
- Engri canonical route-, segment-, station- eða cache-reglu var breytt og `IcelandRoadmap.md` þurfti því ekki uppfærslu í þessum UI-áfanga.
- Engin persónuleg ferðagögn voru geymd eða talin.

## Skrár skoðaðar

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `messages/is.json`
- `messages/en.json`
- Þessi handoff-skrá

## Skipanir og niðurstöður

- `npm run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx` — exit 0, 15/15 próf græn eftir eina lagfæringarumferð.
- `npm run type-check` — exit 0 eftir eina lagfæringarumferð.
- JSON parse á `messages/is.json` og `messages/en.json` — exit 0.
- `git diff --check -- ...` á breyttu skránum — exit 0; aðeins fyrirliggjandi LF/CRLF viðvaranir.

Fyrsta prófunarumferð fann gamalt `systemNotice` parameter og að jsdom hafði ekki sjálfgefið `scrollIntoView`. Bæði voru lagfærð; endurkeyrsla var græn.

## Ákvarðanir og eftirstandandi áhætta

- „Koma í veg fyrir óþekkt slitlag“ var útfært þannig að óstaðfest leið verði ekki sjálfgefinn fremsti kostur, en gögnin eru ekki falin eða ágiskuð. Það er öruggara en að merkja óþekktan kafla sem bundið slitlag eða möl án heimildar.
- Full prófasvíta var ekki keyrð samkvæmt hraða localhost-vinnulagi Stebba; hún bíður fyrir útgáfu.
- Smooth fókus er sannreyndur í component-prófi en þarf sjónræna staðfestingu í raunverulegum mobile browser.
- Engin SQL, migration, Supabase, auth, env, commit, push, deploy eða production-breyting var gerð.

## Tillaga að næsta skrefi

Stebbi prófi hegðunina á localhost. Fyrir útgáfu skal keyra fulla prófasvítu og meta sérstaklega hvort source-audit fyrir óstaðfesta `IDKAFLI` tengingu eigi að vera sérstakur data-quality áfangi.

## Localhost checks for Stebbi

1. Opnaðu route-flæðið á `http://localhost:3004/auth-mvp/vedrid` innskráður og reiknaðu leið sem skilar nokkrum Teskeiðar- og Google-leiðum.
2. Staðfestu að gamla sérlínan `Teskeiðarleiðarkerfið er í vinnslu` sé horfin ofan við spjaldaröðina og textinn birtist aðeins inni á Teskeiðarspjöldunum, ekki Google-spjöldunum.
3. Notaðu leið með óstaðfest slitlag. Staðfestu sérstakt badge með km-fjölda og að leiðin sé aftast undir `Sjálfgefið`, jafnvel þótt hún sé styttri en aðrar leiðir.
4. Prófaðu `Aksturstíma`, `Vegalengd` og `Veðri núna`; þær eiga áfram að raða eftir valinni mælistiku og scrollbar að fara til vinstri við filter-smell.
5. Skrunaðu spjaldaröðina þannig að einhver leið sé utan skjás. Smelltu svo á línu þeirrar leiðar á kortinu. Spjaldið á að renna mjúklega inn í miðju og verða valið.
6. Passaðu sérstaklega að kortið færist ekki til, spjöld overlap-i ekki, enginn láréttur page-overflow myndist og CTA neðst haldist sýnilegt á iPad/mobile stærð.

Engin þessara localhost-athugana snertir Supabase, production-gögn, auth-reglur, billing, secrets eða deployment umfram venjulega staðbundna innskráningu og route-notkun.
