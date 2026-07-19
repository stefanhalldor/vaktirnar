# 2026-07-19 08:08 - TODO 086 v180 - Codex review of v179 bidirectional nearest station

Created: 2026-07-19 08:08
Timezone: Atlantic/Reykjavik

Source reviewed: `2026-07-19-0810-todo-086-v179-claude-v178-bidirectional-nearest-station-handoff`

## Stutt mannamál

v179 er á réttri leið: route-memory pickerinn er nú bidirectional, kostar ekki Google kall á `/vedrid`, og getur opnað næstu Veðurstofustöð þegar borg er valin.

En nýjasta ósk Stebba er ekki alveg uppfyllt: þegar `Akureyri` er valin sem fyrsti staður á kortið að filterast niður á Akureyri-stöðina, en núverandi kóði opnar bara detail card. Kortið sjálft er enn full overview þar til bæði `Frá` og `Til` eru valin.

Ég myndi gera eitt mjög lítið polish-skref fyrir útgáfu, ekki opna nýjan fasa:

1. Single-place selection filterar kortið niður á næstu/local stöð fyrir valinn stað.
2. Bæta hint texta við þegar áfangastaður er ekki sýnilegur.
3. Staðfesta/fixa build-villuna á `/contacts`.

Eftir það: gefa út. Ekkert feature creep fyrr en route-memory byrjar að safna raunleiðum í production.

## Findings

### Medium - Akureyri selection opnar stöð en filterar ekki kortið niður í hana

Í `components/weather/WeatherOverviewClient.tsx` er route-memory filter aðeins virkur þegar bæði `fromPlaceDraft` og `toPlaceDraft` eru valin:

- `routeMemory` fer aftur í `idle` ef annað hvort vantar: `WeatherOverviewClient.tsx:131-134`
- filter settin eru bara `resolved`: `WeatherOverviewClient.tsx:392-399`
- marker visibility notar bara route filter + status filter: `WeatherOverviewClient.tsx:410-412` og `WeatherOverviewClient.tsx:481-482`

v179 nearest-station hegðunin gerir þetta:

- finnur næstu Veðurstofustöð: `WeatherOverviewClient.tsx:192-207`
- sendir hana sem `requestedSelection`: `WeatherOverviewClient.tsx:653-662`
- shellið setur selected marker og URL: `WeatherOverviewShell.tsx:156-169`

Það þýðir: detail card má opnast, en öll önnur kortamerki eru enn sýnileg. Þetta passar ekki við Stebba: “ég er búinn að velja Akureyri, kortið á bara að sýna veðurstöðina hjá Akureyri.”

**Lágmarksfix fyrir Claude Code:**

- Bæta við `singlePlaceFocusFilterIds` þegar `fromPlaceDraft && !toPlaceDraft`.
- Reikna einn næsta marker per provider úr cached station data, ekki Google:
  - Veðurstofan: `findNearestStations(...data.stations, 1)`
  - Vegagerðin: `findNearestStations(...vegagerdinData.stations, 1)` þegar `vegagerdinData.status === 'ok'`
- Láta route-memory pair-filter vinna yfir single-place filter þegar bæði `from` og `to` eru valin.
- Ef active mode er `now`, sýna næstu Vegagerðarstöð; ef active mode er spá, sýna næstu Veðurstofustöð.
- Fyrir Akureyri á þetta að enda með einni stöð á kortinu, ekki öllum grænum/orange/rauðum stöðvum landsins.

Þetta er ekki nýtt feature; þetta er að gera núverandi single-place picker skiljanlegan.

### Low/UX - Vantar hint þegar áfangastaður er ekki sýnilegur

`RouteMemoryPicker.tsx` sýnir title, `Frá`, `Til`, pills og `Hreinsa leið`, en það er engin leiðbeinandi copy sem útskýrir hvað notandi á að gera ef áfangastaður vantar: `RouteMemoryPicker.tsx:115-199`.

**Lágmarksfix fyrir Claude Code:**

- Bæta við texta úr `messages/is.json` og `messages/en.json`, ekki hardcode.
- Sýna undir `Til` valkostum þegar `selectedFrom && !selectedTo`.
- Íslensk tillaga:
  - `Er áfangastaðurinn ekki hér? Veldu nálægan stað eða opnaðu Ferðalagið fyrir ítarlegri útreikning.`
- Ensk tillaga:
  - `Destination not shown? Pick a nearby place or open Ferðalagið for a more detailed calculation.`

Ekki bæta við nýjum CTA hér; `Ferðalagið` takkinn er þegar neðst.

### Medium/Release gate - `npm run build` er ekki grænt

Ég keyrði `npm run build` og buildið stoppaði með:

```txt
PageNotFoundError: Cannot find module for page: /contacts
Failed to collect page data for /contacts
```

`/contacts` virðist vera legacy route undir `app/(app)/contacts/page.tsx`, og þetta lítur ekki route-memory tengt út. Samt er þetta release-gate: ef Vercel build keyrir sama build þá fer útgáfa ekki í gegn.

**Lágmarksfix fyrir Claude Code áður en push/deploy er reynt:**

- Staðfesta hvort þetta sé þekkt local-only build-vandamál eða raunverulegur Next build blocker.
- Ef raunverulegt: laga `/contacts` routing/build issue í sér afmörkuðu skrefi eða tryggja að legacy guard/config útiloki route-ið rétt.
- Ekki deploya fyrr en `npm run build` er grænt eða Stebbi samþykkir meðvitað að þetta sé local artifact sem Vercel lendir ekki í.

## Það sem lítur vel út

- `/api/teskeid/weather/route-memory/places` skilar union af `from` og `to`: `places/route.ts:19-53`.
- `/destinations` skilar counterpart í báðar áttir: `destinations/route.ts:30-64`.
- `/lookup` notar bidirectional lookup og strippar restricted provider station IDs ef provider access er lokað: `lookup/route.ts:63-106`.
- `lookupRouteMemoryBidirectional` er einfalt og rétt v1 fyrir kostnaðarlausa reverse lookup hegðun: `routeMemory.server.ts:167-174`.
- Route-memory picker notar ekki Google Places eða Routes á `/vedrid`; hann kallar bara route-memory endpoints: `RouteMemoryPicker.tsx:56-72`.
- Textar eru í `messages/is.json` og `messages/en.json` fyrir núverandi title/loading/empty.

## Route intelligence check

- Snertir: `/vedrid` overview route-memory picker og route-memory station filtering, ekki ákveðinn vegkafla eins og Öxi eða Hólmavík.
- Þekkingin á rétt heima í `lib/iceland-routes/` og route-memory töflunum, ekki í Google wrapper.
- Lausnin er að mestu provider-neutral fyrir leiðir, en v179 nearest-station er of Veðurstofu-miðað. Lágmarksfixið ætti að reikna næstu stöð fyrir virkan provider svo Vegagerðin/Núna virki líka.
- Engin ný canonical segment/control point/caution þarf fyrir þetta skref.
- Privacy: áfram öruggt ef aðeins normalized place keys/labels og station IDs eru notuð. Ekki bæta við raw Google geometry, place IDs eða heimilisföngum.
- Google cost: nýja picker flæðið á `/vedrid` á ekki að kalla Google. Route-memory fyllist áfram úr raunverulegum `/ferdalagid` útreikningum, þar sem Google Routes kostnaður er nú þegar til staðar.
- `IcelandRoadmap.md` þarf ekki að uppfærast fyrir þessa litlu polish-lagfæringu; þar er route-memory direction og privacy stefnan þegar skráð.

## Design check

- Pill-listi fyrir route-memory er ásættanlegur mobile-first v1 og einfaldari en nýtt kortaflæði fyrir útgáfu.
- Ekki bæta inn öðru korti eða stærra flow núna.
- Single-place filterinn gerir upplifunina skýrari án þess að þyngja UI.
- Hint textinn þarf að vera stuttur, texti í messages, og má ekki ýta `Ferðalagið` CTA langt niður á mobile.

## SQL / migration staða

- Engin ný migration þarf fyrir v179 polish.
- SQL86 er þegar keyrð samkvæmt stöðu frá Stebba.
- Ekki keyra fleiri migrations fyrir þetta release-polish nema sérstök ný þörf komi fram.

## Commands run by Codex

```txt
npm run type-check
exit 0

npm run test:run -- lib/__tests__/nearestStations.test.ts lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/middleware.test.ts lib/__tests__/weather-public.test.ts
exit 0
7 files passed, 186 tests passed

npm run test:run
exit 0
116 files passed, 3376 passed, 27 skipped, 8 todo

git diff --check
exit 0, only CRLF warnings for TODO.md and WORKFLOW.md

npm run build
exit 1
Fails on PageNotFoundError for /contacts
```

## Recommended handoff to Claude Code

```md
## v180 release polish: single-place route-memory filter + hint text + build gate

Stebbi wants to ship this now. Do not start a new feature phase and do not add extra scope.

### Goal

Finish the current `/vedrid` route-memory picker so it behaves clearly before release:

1. When a user selects only one route-memory place, e.g. `Akureyri`, the main map should filter to the local station(s) for that place immediately.
2. When a destination is not visible in the `Til` pills, show a short hint that the user can pick a nearby place or use `Ferðalagið` for the detailed calculation.
3. Confirm/fix the current `npm run build` failure before release.

### Required behavior

#### Single-place filter

Current v179 opens nearest Veðurstofan station but does not filter the map. Change that.

- When `fromPlaceDraft && !toPlaceDraft`, compute a small single-place focus filter from cached provider station data.
- Use no Google APIs.
- Use existing `findNearestStations`.
- For Veðurstofan forecast mode, filter to the nearest Veðurstofan station.
- For Vegagerðin/Núna mode, filter to the nearest Vegagerðin station if Vegagerðin data is loaded.
- When both `fromPlaceDraft && toPlaceDraft` are selected, route-memory exact route filter must override the single-place filter.
- When route is cleared, return to normal overview map.
- Keep the current `requestedSelection` behavior if helpful, but the map itself must be filtered.
- Do not add SQL or new APIs unless absolutely necessary.

For Stebbi’s exact localhost case:

- Select `Akureyri`
- Expected: map shows only the Akureyri-local station for the active source, not all Iceland.

#### Hint text

Add a short hint in `RouteMemoryPicker` when `selectedFrom && !selectedTo`:

IS:
`Er áfangastaðurinn ekki hér? Veldu nálægan stað eða opnaðu Ferðalagið fyrir ítarlegri útreikning.`

EN:
`Destination not shown? Pick a nearby place or open Ferðalagið for a more detailed calculation.`

Use `messages/is.json` and `messages/en.json`. Do not hardcode.

#### Build gate

Codex ran `npm run build` and it failed with:

`PageNotFoundError: Cannot find module for page: /contacts`

Before Stebbi releases:

- Determine if this is a real build blocker or a local artifact.
- If real, fix it in the smallest possible way.
- Do not deploy/push until build is green, unless Stebbi explicitly accepts the risk.

### Do not do

- Do not add the map-based Frá/Til picker now.
- Do not add current-location flow now.
- Do not change SQL86.
- Do not add new migrations.
- Do not call Google from `/vedrid` route-memory picker.
- Do not start the next IcelandRoadmap phase before this release polish is done.

### Verification

Run:

- `npm run type-check`
- Targeted tests for nearest stations, route-memory SQL/static tests, route-place normalization, middleware/weather public routes
- `npm run test:run`
- `npm run build`

### Localhost checks for Stebbi

1. Open `/vedrid`.
2. Confirm the route-memory section says `Skoða veðrið á ákveðinni leið`.
3. Select `Akureyri`.
4. Expected: map filters to only the Akureyri-local station for the active source.
5. Expected: `Reykjavík` appears as a destination option.
6. Confirm the hint text is visible near the destination options.
7. Select `Reykjavík`.
8. Expected: map filters to the exact station set from route-memory for the Akureyri/Reykjavík route.
9. Clear route.
10. Expected: full overview map returns.
11. Network tab: no `maps.googleapis.com` or `places.googleapis.com` calls from the `/vedrid` picker.
12. Do not test migrations casually; no new migration should be needed for this polish.
```

## Localhost checks for Stebbi

Before release:

1. Open `/vedrid`.
2. Confirm the route-memory section appears above the bottom `Ferðalagið` CTA.
3. Select `Akureyri`.
4. Expected after the next polish: map shows only the Akureyri-local station for the active source.
5. Confirm `Reykjavík` appears as destination.
6. Select `Reykjavík`.
7. Expected: map filters to the stored Reykjavík/Akureyri route-memory station set, regardless of direction.
8. Clear route.
9. Expected: full overview returns.
10. Open DevTools Network while using the picker.
11. Expected: only route-memory endpoints, no Google Maps/Places/Routes calls.
12. Before deploy, Claude Code must confirm `npm run build` is green or explain why the `/contacts` failure is not production-relevant.

## Release recommendation

Ekki opna meira product scope fyrir þessa útgáfu. Ég myndi bara laga single-place filter + hint text + build gate. Ef það er grænt, þá er þetta tilbúið í release candidate.
