# TODO 090 v012 — Route-fix, progressive spábirting og per-user flagg-plan

Created: 2026-07-26 11:18
Timezone: Atlantic/Reykjavik

## Skilningur á samþykki

Stebbi samþykkti að Codex lagaði 503-villuna í Akstri og progressive birtingu spátöflunnar og keyrði viðeigandi próf. Þetta fól í sér kóða- og prófabreytingar. Það fól ekki í sér commit, push, deploy, env-breytingu, SQL/migration eða Supabase/production-breytingu.

Ný ósk Stebba um per-user stýringu og útgáfu er kortlögð hér, en ekki framkvæmd vegna þess að hún þarf sérstakt afmarkað leyfi fyrir kóða, migration og útgáfuskref.

## Hvað var raunverulega gert

- Lagað var 503-jaðartilvik þar sem venjuleg Google-leið án `selectedRouteId` kallaði `.startsWith()` á `null`.
- Bætt var við regression-prófi sem sendir final-submit án `selectedRouteId`, krefst 200 og staðfestir að Teskeið-candidate lookup sé ekki kallað.
- Spátöflunni var breytt þannig að hún birtist um leið og valin stöð frá met.no eða Veðurstofunni hefur raðir, þótt hinn providerinn sé enn að sækja.
- Ótilbúnir reitir sýna `… Sæki enn spá` / `… Still fetching forecast` og hin gildin fyllast inn án þess að loka töflunni aftur.
- Einn canonical Teskeiðarloader er áfram sýndur meðan engin valin spáröð er komin.
- Retry-villa fyrir met.no er aftur sýnileg þegar engar raðir eru til; loader víkur þá fyrir skýrri villu og endurprófunarhnappi.
- `TeskeidLoader` ver sig nú ef `window.matchMedia` er ekki til staðar, sem gerir hann öruggari í test/embedded umhverfi.
- Dev console-logging í travel API var gert static svo dynamic provider-villur eða request-gildi leki ekki í logs.
- Litapróf og timeout-próf voru samræmd nýja route palette og 30 sekúndna development-budgeti.

## Prófanir

- Afmörkuð route/spá/component próf: 5 skrár, 71/71 græn.
- Afmörkuð log-safety/API/component próf eftir öryggislagfæringu: 3 skrár, 134/134 græn.
- `npm run type-check`: exit 0.
- Fullt `npm run test:run`: exit 0; 145 skrár passed, 1 skipped; 3.679 próf passed, 28 skipped, 8 todo.
- Þýðinga-JSON parse: exit 0.
- `git diff --check`: exit 0, aðeins fyrirliggjandi LF/CRLF warnings.
- `npm run build`: compile og type-check hluti grænn, en exit 1 í `Collecting page data` með `Cannot find module for page: /admin` og `/contacts`. Báðar síðurnar eru til og tengjast ekki breytingunni. `.next/server/app-paths-manifest.json` var aðeins með þrjár leiðir eftir keyrsluna; líkleg skýring er `.next` árekstur við dev-server sem Stebbi keyrir. Þetta er inference, ekki fullstaðfest. Codex stöðvaði hvorki dev-server né hreinsaði `.next`.

## Skrár sem voru breyttar í þessum lokaáfanga

- `app/api/teskeid/weather/travel/route.ts`
- `components/teskeid/TeskeidLoader.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `lib/__tests__/weather-travel-api.test.ts`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/road-graph-candidate.test.ts`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

Öll önnur ócommittuð vinna Stebba og fyrri áfanga var varðveitt.

## Per-user Teskeiðarleiðaflagg — fyrirhuguð útfærsla

Einfaldasta örugga mynstrið er að fylgja núverandi `feature_access` kerfi:

1. Nýr feature-key: `teskeid-routing-v1`.
2. `TESKEID_ROUTE_CANDIDATE_ENABLED=true` verður áfram global kill-switch.
3. Nýtt `TESKEID_ROUTE_CANDIDATE_ACCESS_REQUIRED=true` virkjar strict per-user gate. Þegar það er `true` þarf notandinn `feature_access` röð fyrir `teskeid-routing-v1`.
4. Bæta keynum við `checkFeatureAccess`, admin API allowlist og `FeatureAccessSection` í admin með heitinu „Teskeiðarleiðakerfi (v1)“.
5. Skrifa næstu SQL migration sem bætir `teskeid-routing-v1` við CHECK constraint `feature_access`. Migration skal vera transaction-bundin og breytir hvorki RLS né grants.
6. Reikna aðgang server-side á `/auth-mvp/vedrid` og senda aðeins `teskeidRouteCandidateEnabled=true` fyrir leyfðan notanda.
7. Loka einnig route-candidate API og final-submit Teskeið-route-id server-side. UI-gate eitt og sér er ekki nóg.
8. Public `/vedrid` fær ekki Teskeiðarleiðakerfið meðan strict per-user gate er virkt, þar sem gestur hefur enga `feature_access` röð.
9. Bæta prófum fyrir kill-switch off, access-required + row/no-row, admin allowlist, public lokun og API-bypass.

## Route intelligence check

- Breytingin snertir allar leiðir sem nýi provider-neutral vegagrafskjarninn reiknar; engin ný route-family eða canonical segment er bætt við í þessum lokaáfanga.
- Kjarninn er áfram í `lib/iceland-routes/` og Google er fallback/samanburður.
- Aðgangsstýringin á að vera utan route-reiknialgoritmans svo provider-kjarninn haldist endurnýtanlegur.
- Engin route geometry, lat/lon eða persónuleg ferð verður vistuð í `feature_access`; aðeins canonical email og feature-key samkvæmt núverandi kerfi.
- `IcelandRoadmap.md` var þegar uppfært í fyrri route-grunnáfanga; þessi auth/rollout breyting bætir ekki nýrri leiðaþekkingu.

## Supabase, auth og útgáfuáhætta

- SQL hefur ekki verið skrifað eða keyrt.
- Engin RLS, grant, auth, production-gögn eða notendagögn hafa verið breytt.
- Migration þarf að fara á undan því að admin veiti fyrsta `teskeid-routing-v1` leyfið; annars hafnar CHECK constraint insertinu.
- Ef UI er flaggað en API ekki, gæti óleyfður notandi kallað candidate endpoint beint. Því eru server-side API-próf release blocker.
- Ef `ACCESS_REQUIRED` gleymist í production en global flaggið er `true`, opnast Teskeiðarleiðakerfið fyrir alla weather-notendur samkvæmt graduation-mynstrinu. Fyrsta rollout þarf því bæði env-gildi explicit `true`.
- Commit, push, deploy, Vercel env-breyting og migration-keyrsla eru aðskilin samþykkisskref.

## Localhost checks for Stebbi

### Núverandi villulagfæring

1. Opna `/auth-mvp/vedrid` og reikna Ísafjörður → Reykjavík og Reykjavík → Ísafjörður án þess að velja sérleið fyrst.
2. Vænt: ekkert 503, engin `Cannot read properties of null (reading 'startsWith')` villa og niðurstaðan birtist.
3. Velja Spá meðan providerar eru enn að hlaða.
4. Vænt: einn Teskeiðarloader þar til fyrsti provider skilar; síðan birtist taflan og ótilbúnir reitir sýna `… Sæki enn spá` þar til þeir fyllast inn.
5. Prófa met.no tímabundna villu. Vænt: skýr villa og „reyna aftur“ í stað tóms svæðis eða endalauss loaders.

### Eftir samþykkta per-user útfærslu

1. Nota tvo innskráða localhost-notendur, annan með `teskeid-routing-v1` röð og hinn án hennar.
2. Með bæði env-gildi `TESKEID_ROUTE_CANDIDATE_ENABLED=true` og `TESKEID_ROUTE_CANDIDATE_ACCESS_REQUIRED=true`: leyfði notandinn sér Teskeiðarvalkosti; hinn sér aðeins Google.
3. Í admin á að vera hægt að veita og afturkalla Teskeiðarleiðaaðgang og refresh á `/auth-mvp/vedrid` á að endurspegla breytinguna.
4. Public `/vedrid` á ekki að birta eða geta sótt Teskeiðarleiðir undir strict gate.
5. Ekki prófa production, keyra migration eða breyta Vercel env kæruleysislega; það þarf sérstakt samþykki Stebba.

## Næsta skref / samþykki sem vantar

Stebbi þarf að staðfesta afmarkað hvort Codex megi:

1. framkvæma kóða- og prófabreytingar fyrir `teskeid-routing-v1`,
2. skrifa SQL migration en ekki keyra hana,
3. og hvort commit, push, migration-keyrsla, Vercel env-breyting og deploy eigi einnig að vera hluti af beiðninni.

