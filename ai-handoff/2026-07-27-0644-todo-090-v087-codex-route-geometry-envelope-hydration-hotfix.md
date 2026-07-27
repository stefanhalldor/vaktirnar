# TODO-090 v087 — Teskeið geometry-envelope og hydration hotfix

**Agent:** Codex  
**Dagsetning:** 2026-07-27 06:44  
**Staða:** Útfært og sjálfvirkt staðfest á localhost-kóðagrunni; bíður tveggja stuttra browserprófa hjá Stebba.  
**Framkvæmdarleyfi:** Stebbi gaf sérstaklega leyfi til að laga 503-villuna í Teskeiðarleið og hydration mismatch á Veðurstofupunktasíðunni.

## Niðurstaða

Tvær afmarkaðar regressions voru lagfærðar:

1. Teskeiðarleiðin gat skilað `503 Service Unavailable` í first-ready flæðinu þegar undirritað route-envelope var notað. Raunleiðin Reykjavík–Ísafjörður hafði 28.496 punkta og sama rúmfræði var send tvisvar, alls um 2,93 MB. Envelope-contract leyfir að hámarki 25.000 punkta í hverju fylki og hafnaði því leiðinni.
2. Veðurstofupunktasíðan gat server-renderað `Mon, July 27` en browserinn `Mán., 27. júlí`. Mismunandi ICU/`Intl` locale-niðurstaða olli React hydration mismatch.

Teskeiðarleiðin flytur nú eina lögunarvarðveitta rúmfræði með að hámarki 1.000 punkta. Íslenskar dagssetningar eru nú myndaðar deterministically úr Reykjavík-dagsetningunni og verða því eins á server og client.

## Plan áfangans

1. Staðfesta nákvæm mörk undirritaða route-envelope og uppruna 503.
2. Minnka Teskeiðarrúmfræði án þess að stride-sampling geti sleppt mikilvægum beygjum.
3. Fjarlægja tvítekna `providerMatchingPoints` rúmfræði og láta núverandi fallback nota `points`.
4. Bæta regression-prófi fyrir raunverulega 28.496 punkta stærðargráðu og undirritun.
5. Gera íslenskt dagsetningarsnið óháð ICU-umhverfi og bæta exact-output prófi.
6. Keyra type-check, afmörkuð próf, heildarpróf, production build og diff-check.

## Hvað var gert

### Bounded geometry contract

- Bætt var við `rdpSimplifyToMaxPoints` sem notar max-deviation-first Ramer–Douglas–Peucker skiptingu.
- Fyrsti og síðasti punktur varðveitast alltaf.
- Mikilvægustu beygjur eru teknar fyrst; lausnin notar ekki einfalt stride sem gæti skorið yfir firði eða fjallvegi.
- Epsilon er 3 metrar og harða flutningshámarkið er 1.000 punktar.
- Sama bounded `points` rúmfræði þjónar korti, veðursampling og provider matching.
- `providerMatchingPoints` er ekki lengur tvítekið í Teskeiðarleiðinni.
- Öryggismörk envelope voru ekki hækkuð: 25.000 punkta og 4 MB varnir standa óbreyttar.

### Hydration

- Íslensk stutt vikudagaheiti og mánaðaheiti eru nú föst í sameiginlega formatterinum.
- Reykjavík-dagsetning er áfram reiknuð með `Atlantic/Reykjavik`, en lokaútprentun íslenska labelsins notar ekki runtime-háð `Intl` locale-data.
- Bæði `is` og `is-IS` gefa nákvæmlega `Mán., 27. júlí` fyrir regression-dæmið.
- Ensk og önnur locale halda fyrri `Intl.DateTimeFormat` hegðun.

## Skrár skoðaðar

- `lib/iceland-routes/routeOptionEnvelope.server.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `lib/weather/providerRouteMatching.ts`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `lib/chat/format.ts`
- Viðeigandi Vitest-próf og fyrri v085/v086 handoff/review.

## Skrár breyttar í þessum hotfix

- `lib/weather/providerRouteMatching.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `lib/chat/format.ts`
- `lib/__tests__/providerRouteMatching.test.ts`
- `lib/__tests__/road-graph-candidate.test.ts`
- `lib/__tests__/chat-format.test.ts`
- Þessi handoff-skrá.

Engum fyrri breytingum Stebba eða Claude Code var snúið við. `.obsidian/workspace.json` var ekki snert af Codex.

## Skipanir og niðurstöður

- `npm run type-check`
  - Exit code 0.
- `npm run test:run -- lib/__tests__/providerRouteMatching.test.ts lib/__tests__/road-graph-candidate.test.ts lib/__tests__/route-option-envelope.test.ts lib/__tests__/weather-route-candidate-api.test.ts lib/__tests__/chat-format.test.ts`
  - Exit code 0; 5/5 skrár og 56/56 próf græn.
- `npm run test:run`
  - Exit code 0; 165 skrár grænar, 1 skipped; 3.859 próf græn, 28 skipped og 8 todo.
- Fyrsta `npm run build`, keyrt samtímis heildarprófum
  - Exit code 1 eftir successful compile/type/lint vegna tímabundinnar vöntunar á `.next` page modules fyrir `/contacts` og `/home`.
- `npm run build`, endurkeyrt eitt og sér
  - Exit code 0; compile, type/lint, 105 static pages og build traces kláruð.
  - Fyrri hook/image/Browserslist warnings standa áfram og tengjast ekki þessum hotfix.
- `git diff --check`
  - Exit code 0; aðeins fyrirliggjandi LF/CRLF viðvaranir.

## Það sem mistókst eða var sleppt

- Codex stjórnaði ekki dev server og framkvæmdi því ekki browserprófið sjálfur.
- Engin raunveruleg Google/Teskeið netköll voru keyrð úr prófunarsvítunni.
- Engin performance-fínstilling umfram nauðsynlegt geometry transport fix var gerð.
- Fyrri unsafe route-memory rows voru ekki hreinsaðar; það er aðskilið gagnamál og ekki hluti af þessu leyfi.

## Ákvarðanir

- Halda envelope-vörnunum óbreyttum og laga payloadinn við upprunann.
- Nota eitt canonical geometry-fylki í stað tveggja samhljóða fylkja.
- Nota hard cap ásamt lögunarvarðveitandi vali, ekki hækka cap eða stride-sample-a.
- Laga sameiginlega dagsetningarformatterinn svo allar íslenskar notkunarsíður fái sömu server/client hegðun.

## Áhætta sem stendur eftir

- Browserpróf þarf að staðfesta að 1.000 punkta rúmfræðin fylgi veginum sjónrænt á langri leið og að punktasampling/worst-point val haldist rétt.
- First-ready hraði ræðst enn af cold road-graph byggingu. Þessi lagfæring fjarlægir 503 og minnkar payload, en er ekki full performance-áfangi.
- Fyrirliggjandi lint warnings í öðrum skrám eru óbreytt.

## Supabase, auth og production

- Engin SQL-skrá var búin til eða keyrð.
- Engin migration, gagnabreyting, RLS-, grant-, policy-, auth- eða secret-breyting var gerð.
- Engin Supabase-, Vercel-, production-, commit-, push- eða deployment-aðgerð var framkvæmd.

## Design.md

Hotfixið breytir ekki layouti eða controls. Hydration-lagfæringin varðveitir núverandi íslenska textann og kemur í veg fyrir rauðan dev-overlay/re-render. Route geometry breytir aðeins gagnamagni undir kortinu; mobile scroll, zoom og navigation hegðun eru óbreytt.

## Localhost checks for Stebbi

### 1. Teskeiðarleið — 503 regression

**Slóð:** `http://localhost:3004/auth-mvp/vedrid`  
**State:** Innskráður notandi sem hefur aðgang að Teskeiðarleiðum.

1. Gerðu hard refresh.
2. Veldu Reykjavík → Ísafjörður og keyrðu leiðina.
3. Bíddu eftir niðurstöðuspjaldinu.

**Vænt:**

- Google-niðurstaða eða Teskeiðarleið opnar first-ready niðurstöðuna eins og áður.
- `POST /api/teskeid/weather/travel/route-candidate` skilar HTTP 200, ekki 503.
- Teskeiðarleið birtist með leiðarlínu og spjaldi; ekki `Teskeiðarleiðin er ekki tiltæk í augnablikinu`.
- Leiðarlínan fylgir vegum eðlilega og endapunktar eru réttir.
- Ef Network response er skoðað: bounded route geometry er að hámarki 1.000 punktar og tvítekið `providerMatchingPoints` fylki á ekki að vera til staðar í Teskeiðar-candidate.
- Veðurstöðvar, versti punktur og handvirkt punktaval halda áfram að virka.
- Ef seinni provider klárast á eftir má hann bæta niðurstöðu við, en má ekki óvænt skipta um valda leið.

### 2. Veðurstofupunktur — hydration regression

1. Smelltu á Veðurstofupunkt á kortinu svo `/auth-mvp/vedrid/puls/stod/[stationId]` opnist.
2. Gerðu hard refresh á punktasíðunni.
3. Skoðaðu bæði síðuna og console.

**Vænt:**

- Enginn React `Hydration failed` eða `server rendered text didn't match the client` rauður error.
- Daglabel er strax íslenskt og stöðugt, t.d. `Mán., 27. júlí`; það á ekki að breytast úr ensku eftir hydration.
- Spá og nálægir Vegagerðarpunktar birtast eins og áður.
- `Til baka í akstur` virkar.

**Öryggis-/gagnavarúð:** Þessi próf þurfa hvorki admin refresh né SQL. Þau lesa venjuleg localhost-gögn og geta gert ytri veður-/leiðaköll samkvæmt núverandi `.env.local`; forðist aðeins óþarfa endurtekningu sem gæti kallað oft á Google.

## Tillaga að næsta skrefi

Ef bæði localhost-prófin ganga skal Claude Code rýna þennan afmarkaða hotfix með áherslu á geometry contract, first-ready regression og deterministic date output. Síðan má taka loka smoke með öðrum prerelease-atriðum; ekki þarf að endurtaka alla smoke-svítuna vegna þessa litla pakka fyrr en í lokin.

## Atriði sem Claude Code á sérstaklega að rýna

1. Að allar consumer-leiðir noti `providerMatchingPoints ?? points` og því tapist engin virkni þegar tvítekna fylkið er fellt niður.
2. Að 1.000 punkta/3 m mörkin séu hæfileg fyrir kort, veðursampling og route matching á íslenskum vegum.
3. Að signed-envelope replay/origin/destination validation haldist óbreytt.
4. Að manual íslenska dagsetningin sé nákvæm fyrir mánaðamót og að önnur locale haldi fyrri hegðun.

