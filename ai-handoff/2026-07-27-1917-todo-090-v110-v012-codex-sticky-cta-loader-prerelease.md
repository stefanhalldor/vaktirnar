# TODO-090 v110/v012 — sticky leiða-CTA og samfelldur niðurstöðuloader

**Staða:** Local prerelease tilbúið fyrir rýni Stebba. Ekki committað, push-að eða deployað.

## Plan áfangans

1. Gefa fyrst út staðfesta 32-skrá official-place/no-wind pakkann.
2. Halda CTA á stóra leiðakortinu sýnilegum neðst án þess að hann hylji spjöld.
3. Halda canonical Teskeiðar-loader sýnilegum þar til heil ný leiðarniðurstaða er tilbúin.
4. Varðveita sömu-leið endurnýtingu án nýs veðurútreiknings.
5. Læsa hegðuninni með targeted regression-prófum og keyra type-check, lint og build.
6. Skila seinni pakkanum local-only og bíða sérstaks leyfis fyrir commit eða útgáfu.

## Fyrri production-áfangi

Staðfesti 32-skrá pakkinn var afmarkaður, committaður og gefinn út áður en UI-vinnan hófst:

- commit: `8354095` — `feat(weather): add official settlements and no-wind filter`
- branch/remote: `main`, `origin/main`
- Vercel deployment: `dpl_7ZwzWm8FKXVsmboWdV1vwxzPTXZM`
- deployment URL: `https://vaktirnar-4nj0cohxi-stefan-halldor-jonssons-projects.vercel.app`
- status: `Ready`
- canonical aliases: `https://www.teskeid.is` og `https://teskeid.is`

Read-only production smoke var grænt:

- `GET /vedrid`: HTTP 200
- gilt `POST /api/place/search` með `Hella`: HTTP 200, 8 niðurstöður, ein opinber `Hella`-þéttbýlisniðurstaða
- `GET /api/teskeid/weather/vegagerdin/current`: HTTP 200, `status=ok`, 202 stöðvar
- 182 af 202 stöðvum báru `windDirectionDeg` eða `windDirectionText`

Fyrstu tvær local smoke-tilraunir með Windows PowerShell/curl mynduðu ekki gilt HTTP-body vegna client-harness vandamáls. Loka smoke var því endurtekið með Node `fetch`, sem serialiseraði gilt JSON, og það var grænt. Þetta var ekki production-villa.

Tilkynningarpóstur með production-prófunarskrefum var sendur í tengda Gmail-reikning Stebba.

## Hvað var raunverulega gert local

### Sticky CTA án overlaps

`RouteComparisonFullscreenMap` notar nú skýrt þriggja hluta flex-layout:

1. header,
2. kort,
3. neðri samanburðarskúffa með sjálfstæðu scroll-svæði og sér CTA-footer.

CTA-footerinn er `shrink-0`, utan `overflow-y-auto` svæðisins og með `env(safe-area-inset-bottom, 0px)`. Hann tekur pláss í layoutinu í stað þess að liggja ofan á síðasta spjaldi. Dialogið notar `100dvh`, `overflow-hidden`, 44 px lágmarks snertiflöt og tengt `aria-labelledby` heading.

Þetta fylgir `Design.md`: mobile-first, enginn fixed-overlay reikningur yfir spjöldum, sýnileg aðalaðgerð og safe-area padding.

### Deterministic loader og summary-gate

Nýr hreinn `resolveRouteResultsDisplayState()` helper skilgreinir sex sýnileg state:

- `safety-search`
- `route-switching`
- `route-loading`
- `comparison-opening`
- `summary`
- `form`

Summary birtist aðeins þegar:

- bridge-status er `success`,
- `routeBridgeSummary` er komið,
- `routeTravelResult` er komið,
- engin safety-leit stendur yfir,
- engin önnur leið er í endurútreikningi,
- stóra sjálfgefna samanburðarkortið er ekki enn í opnunartransition.

Gamla summaryið má áfram vera varðveitt í state til rollback, en það er ekki renderað meðan önnur leið reiknast. Við switch-villu er gamla valið sett aftur í preview, gamla gilda summaryið varðveitt og sýnileg villa birtist. Escape/cancel endurheimtir líka applied leiðina svo preview og summary geti ekki orðið ósamstæð. Ef fyrsta varasama leiðin bilar eða Teskeiðar-provider endar í `no_route`/`unavailable` er safety-loader hreinsaður svo UI geti ekki hangið endalaust. Virk eða væntanleg alternatives-leit heldur honum hins vegar áfram sýnilegum.

`shouldRecalculateRouteChoice()` festir nú explicit að:

- sama applied leið lokar kortinu og notar núverandi niðurstöðu,
- önnur leið ræsir nýjan útreikning og loader.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- viðeigandi route-comparison, first-ready, route-loading og route-candidate próf
- `messages/is.json` og `messages/en.json` til að endurnýta núverandi loader-texta

## Skrár sem voru breyttar

- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/routeResultsDisplayState.ts` — ný hrein state-lógík
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/road-map-route-loading-ui.test.ts`
- þessi handoff-skrá

`.obsidian/workspace.json` og eldri ótrackuð handoff-skjöl voru ekki snert eða sett í scope.

## Skipanir og niðurstöður

1. `npm run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/road-map-route-loading-ui.test.ts`
   - exit 0
   - 2 test files, 26/26 próf græn
2. `npm run type-check`
   - exit 0
3. Fyrsta `npm run lint`
   - fór ekki af stað vegna Windows PowerShell execution-policy á `npm.ps1`; engin lint-niðurstaða myndaðist
4. `npm.cmd run lint`
   - exit 0
   - aðeins eldri, óbreytt warnings
5. `npm.cmd run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/road-map-route-loading-ui.test.ts lib/__tests__/iceland-routes-first-ready-discovery.test.ts lib/__tests__/iceland-routes-first-ready-coordinator.test.ts lib/__tests__/weather-route-candidate-api.test.ts`
   - exit 0
   - 5 test files, 60/60 próf græn
6. `npm.cmd run build`
   - exit 0
   - production-build, innbyggt type/lint-check og 107 static pages kláruð
   - Next.js tilkynnti venjulega framework environment-hleðslu; Codex opnaði ekki `.env.local` og ekkert gildi var birt eða breytt
7. `git diff --check -- <fimm UI/test skrár>`
   - exit 0

## Hvað var sleppt

- Enginn dev server var ræstur eða endurræstur.
- Engin browser- eða raunveruleg iPhone/Safari-prófun var keyrð af Codex.
- Full 4.000+ prófa svítan var ekki endurkeyrð fyrir þennan local UI-pakka; targeted 60 próf, type-check, lint og build eru græn.
- Engin ný þýðing var nauðsynleg; núverandi íslenskur og enskur loader-texti var endurnýttur.
- Enginn commit, push, deploy, environment-breyting, SQL eða Supabase-aðgerð var framkvæmd fyrir seinni pakkann.

## Ákvarðanir

- CTA er flex-footer, ekki `position: sticky`, svo hann hylji aldrei síðasta spjaldið.
- Gamalt gilt summary er varðveitt fyrir öruggt rollback en falið meðan ný leið reiknast.
- Sjálfgefin opnun stóra kortsins notar explicit `comparison-opening` gate í stað þess að treysta á post-paint effect eitt og sér.
- Sama applied leið telst núverandi niðurstaða og er ekki endurreiknuð.
- Switch-villa eyðir ekki síðustu gildu niðurstöðunni.
- Terminal `no_route`/`unavailable` og óvirkur candidate-provider geta ekki skilið safety-loader eftir fastan.
- Escape/cancel endurheimtir applied leiðar-previewið áður en stóra kortið lokast.

## Eftirstandandi áhætta

- Raunverulegt iOS/Safari browser chrome og home-indicator safe area þarf handvirka mobile-staðfestingu.
- Focus trap/full focus-lifecycle stóra dialogsins er eldri hegðun og var ekki víkkað í þessum afmarkaða pakka.
- Targeted próf geta ekki sjálf sannað sjónrænt að map-hæð sé næg á mjög lágum landscape viewport.
- Nýja UI-breytingin er ócommittuð og má ekki fara út án nýs samþykkis Stebba.

## Óháð kóðarýni

- Sér agent rýndi lokastöðuna eftir lagfæringar og fann engan útgáfublokkera.
- Rýnin staðfesti sérstaklega að upphafsvilla, terminal `no_route`/`unavailable`, óvirkur provider, Escape/cancel og misheppnað leiðarskipti skilja ekki loader eða route-preview eftir í röngu state-i.
- Eftirstandandi lágt test-debt er að source-string regression-prófið sannar state-vélina og wiring en er ekki full mounted lifecycle-prófun á öllu `RoadMapPrototypeMap` componentinu. Það er ekki talið prerelease-blokkari eftir græn targeted próf og build.

## Localhost checks for Stebbi

**Forsenda:** Haltu þínum eigin dev server í gangi, skráðu þig inn og opnaðu `/vedrid` eða `/auth-mvp/vedrid` á mobile viewport. Engin SQL-, Supabase-, env- eða secret-aðgerð þarf fyrir þessi próf.

### 1. Fyrsta niðurstaða opnar stóra kortið án summary-blikks

1. Farðu í `Akstur` og reiknaðu nýja leið.
2. Fylgstu með frá submit þar til stóra kortið birtist.
3. Vænt: Teskeiðar-loader er samfelldur; gamla/litla summary-spjaldið birtist aldrei í eina sekúndu á milli.
4. Vænt: stóra `Veldu leið á korti` opnast sjálfkrafa fyrst þegar heil niðurstaða og leiðaspjöld eru tilbúin.

### 2. Sticky CTA og scroll

1. Prófaðu 360–390 px breidd og einnig stutt landscape viewport.
2. Skrunaðu neðri samanburðarskúffuna upp og niður og spjaldaröðina til hliðar.
3. Vænt: `Skoða veðurskilyrði fyrir þessa leið` helst alltaf sýnilegur neðst.
4. Vænt: síðasta spjald og status-texti komast alveg upp fyrir CTA; ekkert overlap eða lárétt page-overflow.
5. Á iPhone/Safari: staðfestu að takkinn sitji fyrir ofan home indicator/browser chrome.

### 3. Sama leið endurnýtir niðurstöðu

1. Með route-summary tilbúið skaltu opna stóra kortið aftur.
2. Hafðu sömu leið valda og ýttu á CTA.
3. Vænt: kortið lokast beint á núverandi summary, án nýs loaders eða nýs `/api/teskeid/weather/travel` kalls.

### 4. Önnur leið reiknast undir loader

1. Opnaðu stóra kortið, veldu aðra línu eða annað spjald og ýttu á CTA.
2. Vænt: kortið lokast, canonical Teskeiðar-loader tekur við og gamla summaryið blikkar ekki fram.
3. Vænt: loader hverfur aðeins þegar nýja leiðin er komin með heilt summary og ferðaniðurstöðu.
4. Vænt: nýja summaryið samsvarar leiðinni sem var valin.
5. Opnaðu kortið aftur, preview-aðu aðra leið og lokaðu með Escape án CTA.
6. Vænt: applied leiðin færist aftur í fókus og passar við óbreytta summaryið.

### 5. Varasöm fyrsta leið

1. Prófaðu leið þar sem fyrsta Teskeiðarleið er merkt varasöm ef þú átt slíkt dæmi.
2. Vænt: `Varasöm leið fundin…`/safety-loader helst á meðan fleiri kostir eru leitaðir.
3. Vænt: engin hálfgerð niðurstaða birtist á milli; stóra kortið opnast þegar leitinni lýkur eða öruggari valkostur hefur verið valinn.

## Tillaga að næsta skrefi

Stebbi tekur localhost/mobile check 1–5. Ef þau eru græn gefur hann sérstakt leyfi fyrir curated commit, push, Vercel-vöktun og production smoke á þessum sex skrám. Ekki blanda vindörvaáfanganum inn í sama commit.

## Spurningar fyrir rýni

1. Helst CTA sýnilegur án þess að kortið verði of lágt á iPhone og stuttu landscape viewport?
2. Er loader-transition alveg samfellt bæði við fyrstu leið og þegar skipt er um leið?
3. Staðfestir Network flipinn að sama applied leið valdi ekki nýju travel-kalli?
4. Á focus-lifecycle stóra dialogsins að verða sér afmarkað næsta UI-atriði?

## Supabase, SQL og production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engin migration, RLS, grant, policy, auth-regla eða Supabase-gögn voru snert.
- Engin environment variable eða secret var lesið eða breytt.
- Seinni UI-pakkinn er aðeins local og hefur engin production-áhrif enn.
