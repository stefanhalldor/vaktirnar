# TODO #90 — Hardening: after() scheduler, privacy-safe errors, onOutcome isolation

Created: 2026-07-25 23:45
Timezone: Atlantic/Reykjavik

## Hvað var gert

Öll High/Medium findings úr Codex v003 rýni leyst í einum áfanga:

1. `after()` scheduler — shadow er nú scheduled með `next/server`'s `after()` sem
   lengir serverless líftíma þar til promise settlar. Bare `void promise` var fjarlægt.

2. Lazy flag check — `TeskeidRoutingProvider` og request eru aldrei smíðuð ef
   `TESKEID_ROUTING_SHADOW_ENABLED !== 'true'`. Flagg er kannað fyrst í scheduler.

3. Privacy-safe error code — `teskeidRoutingProvider.server.ts` kastar nú
   `'teskeid_routes: no_corridor_fixture'` án hnita eða ferðaupplýsinga.

4. `onOutcome` isolation — `safeCallback` helper kallar callback exactly once og
   gleymir öllum villum. Callback villa getur ekki endurflokka `completed` sem
   `failed` né rejecta runner.

5. `durationMs` á outcomes — `completed` og `failed` outcomes hafa nú `durationMs`
   (ms frá byrjun `calculateRoutes`). `disabled` outcome hefur ekkert.

6. `resultKind: 'corridor_fixture'` á `IcelandRoutingPath` — gefur diagnostic
   möguleika að útiloka distance/duration comparison fyrir fixture results.

7. Privacy-safe diagnostic — `onOutcome` callback í scheduler loggar structured
   server log án hnita, labels, addresses, place IDs eða raw error. Aðeins:
   status, provider, routeFamilyId, resultKind, durationMs (eða stable errorCode).

8. `trailerKind` → vehicle profile mapping — `trailerKindToVehicleProfile()` pure
   helper; 'caravan' → 'caravan', allt annað → 'car'.

## Skrár búnar til

- `lib/iceland-routes/routingScheduler.server.ts`
  - `trailerKindToVehicleProfile(trailerKind)` — pure, testable
  - `scheduleTeskeidShadowRun({ origin, destination, trailerKind })` — notar `after()`

- `lib/__tests__/teskeid-routing-scheduler.test.ts` — 11 próf:
  - Profile mapping: caravan, none, öll trailer kinds, null, undefined
  - Flag off: `after()` ekki kallað, `TeskeidRoutingProvider` ekki smíðaður
  - Flag on: `after()` kallað nákvæmlega einu sinni
  - `runIcelandRoutingShadow` fær rétt origin/destination
  - vehicleProfile rétt eftir trailerKind
  - `onOutcome` callback er til staðar

## Skrár breyttar

- `lib/iceland-routes/routingProvider.ts`
  - Bætt `resultKind?: 'corridor_fixture'` við `IcelandRoutingPath`

- `lib/iceland-routes/teskeidRoutingProvider.server.ts`
  - Error message → `'teskeid_routes: no_corridor_fixture'` (án hnita)
  - Bætt `resultKind: 'corridor_fixture'` við path object

- `lib/iceland-routes/routingShadow.server.ts`
  - `IcelandRoutingShadowOutcome`: `completed` og `failed` fá `durationMs: number`
  - `safeCallback()` private helper — one-shot, swallows callback errors
  - `startMs` mælir byrjun `calculateRoutes`, `durationMs = Date.now() - startMs`

- `app/api/teskeid/weather/travel/route.ts`
  - Innflutningur: `runIcelandRoutingShadow` + `TeskeidRoutingProvider` → `scheduleTeskeidShadowRun`
  - `void runIcelandRoutingShadow(...)` → `scheduleTeskeidShadowRun({ origin, destination, trailerKind })`

- `lib/__tests__/iceland-routing-shadow.test.ts`
  - Outcome assertions uppfærðar í `toMatchObject` (inniheldur nú `durationMs`)
  - Bætt við 2 nýjum prófum: callback-throws-after-success, callback-throws-after-failure

- `lib/__tests__/teskeid-routing-provider.test.ts`
  - Bætt `resultKind: 'corridor_fixture'` við south coast assertion
  - Error message tests uppfærð: `'no corridor fixture'` → `'no_corridor_fixture'`

## Skipanir og niðurstöður

- `npm run test:run -- lib/__tests__/teskeid-routing-provider.test.ts lib/__tests__/iceland-routing-shadow.test.ts lib/__tests__/teskeid-routing-scheduler.test.ts`
  - Exit 0; 3 test files, 24 tests passed.
- `npm run type-check`
  - Exit 0.

## Hvað var ekki gert

- Enginn commit eða push — bíður eftir leyfi Stebbi
- `IcelandRoadmap.md` og README ekki uppfærð — per Codex v003: "Uppfæra eftir að
  blockerarnir eru leystir, ekki áður." Blockerarnir eru nú leystir; uppfærsla
  getur farið inn í þennan commit eða næsta.
- Engin production env breyting — `TESKEID_ROUTING_SHADOW_ENABLED` er enn slökkt
- Engin Supabase, migration eða varanleg telemetry
- Engin routing engine eða open-data ingestion
- Ekkert corridor distance/duration comparison við Google — per Codex: má ekki
  gera þar til `resultKind` er notað til að útiloka fixture results

## Localhost checks fyrir Stebbi

Engin notendasýnileg breyting. Núverandi `/vedrid` og Akstur eiga að haga sér eins.

Til að staðfesta shadow keyrslu með flagg on á localhost:
1. Setja `TESKEID_ROUTING_SHADOW_ENABLED=true` í `.env.local`
2. Senda travel beiðni (t.d. Reykjavík → Akureyri)
3. Í server console sjást:
   ```
   [teskeid-shadow] {"status":"completed","provider":"teskeid_routes","routeFamilyId":"capital-north-iceland","resultKind":"corridor_fixture","durationMs":...}
   ```
   eða ef route er utan corridors:
   ```
   [teskeid-shadow] {"status":"failed","errorCode":"teskeid_routes: no_corridor_fixture","durationMs":...}
   ```
4. Primary UI, loader, veðurgögn og response eru óbreytt
5. Hjólhýsibeiðni → diagnostic sýnir `vehicleProfile: 'caravan'` (í `runIcelandRoutingShadow` request — ekki í log að svo stöddu)

Ekki kveikja á flagginu á Vercel production enn — console.info loggar eru í Vercel
function logs, ekki í Supabase, og eru fínar fyrir initial monitoring.

## Tillaga að næsta skrefi

1. Commit þetta áfanga saman við allt frá v001 (foundation + provider + hardening)
2. Þegar production flag verður virkjuð: fylgjast með Vercel function logs eftir
   `[teskeid-shadow]` til að sjá match rate og error distribution
3. Næsti tæknilegi áfangi: bi-directional matching (Akureyri → Reykjavík) eða
   endpoint legs til að gefa betri distance estimate

## Eftirstandandi óvissuatriði

- `console.info` er rétt logging surface tímabundið; þarf ákvörðun þegar
  production monitoring er ákveðin (structured logger, Vercel log drain, o.s.frv.)
- Codex nefnir mögulega `after()` mocking í tests — við mock-um `next/server`
  í `teskeid-routing-scheduler.test.ts` og tests fara í grín; þetta er gilt
