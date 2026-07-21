# 2026-07-21 16:56 - TODO 086 v290 - Codex release handoff: gefa Road Intelligence út undir per-user flaggi

## Stutt niðurstaða

Codex telur að það sé skynsamlegt að gefa núverandi Road Intelligence vinnu út á production undir `road-intelligence-v1` per-user feature flaggi, ef Claude Code klárar release-gates hér að neðan.

Þetta á ekki að vera opin útgáfa. Þetta á að vera production-prófun fyrir flaggaða notendur.

## Hvað Codex rýndi

- `ai-handoff/2026-07-21-1700-todo-086-v289-claude-station-matching-phase-a-b.md`
- `lib/loans/guard.ts`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `app/api/teskeid/road-intelligence/map-proxy/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `components/weather/WeatherOverviewClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `package.json`
- `package-lock.json`

## Staðfest gating

`road-intelligence-v1` er tvöfalt gated:

1. `ROAD_INTELLIGENCE_V1_ENABLED=true` þarf að vera sett.
2. Notandi þarf row í `feature_access` með `feature_key = 'road-intelligence-v1'`.

Kóðastaðfest:

- `lib/loans/guard.ts` skilar `false` ef env er ekki `true`.
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx` kallar `notFound()` ef notandi er ekki með feature access.
- `/auth-mvp/vedrid` sýnir prototype link aðeins þegar `hasRoadIntelligence` er satt.
- Road Intelligence API routes eru auth + `road-intelligence-v1` gated.
- Public `/vedrid` á ekki að sjá Road Intelligence UI.

## Staðbundin sannprófun sem Codex keyrði

Codex keyrði:

```bash
npm run type-check
```

Niðurstaða: exit 0.

Codex keyrði líka:

```bash
npm run test:run -- road-intelligence-route-slot-statuses road-intelligence-travel-bridge-map-data providerRouteMatching
```

Niðurstaða: exit 0, 3 test files passed, 50 tests passed.

## Mikilvæg release athugasemd

Prototype UI er bak við `road-intelligence-v1`, en hluti af server breytingunni er ekki eingöngu UI-flagg:

- `app/api/teskeid/weather/travel/route.ts` bætir nú `vegagerdinLayer` við response þegar Vegagerðin gögn finnast.
- Sama endpoint notar nú `VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M = 2_500` fyrir Vegagerðin route matching.
- Þetta getur líka haft áhrif á route-memory skrif og ferðaveðurflæði sem kalla núverandi travel endpoint.

Codex metur þetta sem líklega backwards-compatible vegna þess að:

- response fær aukareit, en gamlir consumerar ættu að hunsa hann
- Vegagerðin provider layer er fail-open
- Veðurstofan heldur áfram 1 km þröskuldi
- route-memory fær mögulega fleiri Vegagerðarstöðvar, sem er í takt við vöruósk Stebba

En Claude Code þarf að muna að þetta er ekki 100% einangrað UI-only flagg.

## Release gates fyrir Claude Code

Claude Code má ekki deploya fyrr en þessi atriði eru staðfest:

1. `sql/89_feature_access_road_intelligence_v1.sql` hefur verið keyrt á production.
   - Stebbi segir að sql89 sé keyrt.
   - Ekki keyra SQL aftur nema Stebbi biðji sérstaklega um það.

2. Vercel production env:
   - `ROAD_INTELLIGENCE_V1_ENABLED=true`
   - `AUTH_MVP_ENABLED=true` þarf að vera áfram rétt.
   - Ekki setja `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED` eða önnur provider flags öðruvísi nema Stebbi biðji sérstaklega um það.

3. Feature access:
   - Stebbi/test-notandi þarf `feature_access` row:
     - canonical email
     - `feature_key = 'road-intelligence-v1'`

4. Commit hygiene:
   - Ekki committa `.obsidian/workspace.json`.
   - Ekki committa `.env.local`.
   - Ekki committa `node_modules` eða IDE/debug state.
   - Staðfesta að `package.json` + `package-lock.json` breytingar séu viljandi vegna `maplibre-gl`.

5. Build gate:
   - Keyra `npm run type-check`.
   - Keyra targeted tests úr v289 eða stærra viðeigandi test set.
   - Keyra helst `npm run build` áður en deploy er beðið.

6. No SQL / no data mutation:
   - Engar migrations í þessu release-skrefi.
   - Engar RLS/grant breytingar.

## Deploy ráðlegging Codex

Codex mælir með:

1. Claude Code rýni `git status --short` og geri hreinan, afmarkaðan commit sem sleppir `.obsidian/workspace.json`.
2. Claude Code keyri release checks:
   - `npm run type-check`
   - `npm run test:run -- road-intelligence-route-slot-statuses road-intelligence-travel-bridge-map-data providerRouteMatching`
   - `npm run build`
3. Ef allt er grænt, Claude Code pushi/deployi samkvæmt venjulegu útgáfuferli, en aðeins ef Stebbi gefur skýrt deploy-leyfi.
4. Eftir deploy stilli eða staðfesti Stebbi/Claude Vercel env:
   - `ROAD_INTELLIGENCE_V1_ENABLED=true`
5. Redeploy eftir env breytingu ef hún var ekki til staðar fyrir build/deploy.

## Localhost checks for Stebbi

Áður en production deploy er lokað:

1. Opna `http://localhost:3004/auth-mvp/vedrid` sem flaggaður notandi.
   - Vænt: `Korttilraun` linkur birtist.

2. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
   - Vænt: MapLibre kort opnast.
   - Vegakerfi/vegfærð toggles virka.

3. Reikna `Akureyri` -> `Egilsstaðir`.
   - Vænt: Vegagerðarstöðvar á leiðinni birtast með vindtölum.
   - Vænt: fleiri stöðvar en áður, ekki bara núgildis-dot.
   - Vænt: status pillur/scrubber passa við route station set.

4. Smella á nokkra station punkta.
   - Vænt: popup opnast með réttri stöð og vind/hviðum.

5. Prófa reverse: `Egilsstaðir` -> `Akureyri`.
   - Vænt: sama stöðvamengi í öfugri leiðarröð.

6. Prófa óflaggaðan notanda ef hægt:
   - `/auth-mvp/vedrid` sýnir ekki `Korttilraun`.
   - `/auth-mvp/vedrid/road-map-prototype` gefur 404/notFound.

## Production smoke checks eftir deploy

Sem flaggaður notandi:

1. Opna `https://www.teskeid.is/auth-mvp/vedrid`.
2. Staðfesta að `Korttilraun` birtist.
3. Opna prototype.
4. Reikna `Akureyri` -> `Egilsstaðir`.
5. Staðfesta að Vegagerðarstöðvar birtist með vindtölum.

Sem óflaggaður notandi:

1. Opna `https://www.teskeid.is/auth-mvp/vedrid`.
2. Staðfesta að enginn prototype linkur birtist.
3. Beint prototype URL á að vera 404/notFound.

Public:

1. Opna `https://www.teskeid.is/vedrid`.
2. Staðfesta að public yfirlitið sé óbreytt og sýni ekki Road Intelligence prototype.

## Áhætta sem er enn til staðar

1. Phase C úr v288/v289 er ekki komið:
   - provider-neutral `routeStationMatching.ts`
   - `matchConfidence`
   - strict + buffered + route-memory audit/fallback

2. 2.5 km Vegagerðin buffer er góð tactical lagfæring en ekki gulltryggði langtímakjarninn.

3. `app/api/teskeid/weather/travel/route.ts` behavior breytist fyrir alla sem nota travel endpoint, ekki bara flaggaða Road Intelligence UI.

4. Worktree er stór og dirty. Það þarf að velja commit-scope vandlega.

## Niðurstaða Codex

Já: Codex er hlynntur því að gefa þetta út á production undir `road-intelligence-v1` per-user flaggi, svo við getum prófað nýja kortið á raunverulegri slóð og haldið áfram í Road Intelligence vinnunni.

Ekki: Codex er ekki hlynntur því að deploya án build-checks, án þess að hreinsa commit-scope, eða ef `.obsidian/workspace.json` / local env / óviðkomandi drasl er óvart að fara með.

Best næsta skref:

Claude Code framkvæmir release checklistið, gerir afmarkaðan commit, pushar/deployar aðeins eftir skýrt deploy-leyfi frá Stebba, og skilar svo post-deploy handoff með smoke check niðurstöðum.
