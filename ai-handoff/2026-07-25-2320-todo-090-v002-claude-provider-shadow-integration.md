# TODO #90 — Teskeid routing: provider experiment + shadow integration

Created: 2026-07-25 23:26
Timezone: Atlantic/Reykjavik

## Hvað var gert

Framkvæmt "stórt næsta skref" úr Codex handoff v001: `TeskeidRoutingProvider` experiment
með corridor fixtures, einingaprófun, og tenging í travel API í gegnum shadow runner.

## Skrár breyttar

- `app/api/teskeid/weather/travel/route.ts`
  - Bætt við tveimur innflutningum: `runIcelandRoutingShadow`, `TeskeidRoutingProvider`
  - Bætt við fire-and-forget `void runIcelandRoutingShadow(...)` eftir að `routePolyline` er
    leyst. Kallað er ALDREI með `await` — verður aldrei á primary response path.
  - Request byggt úr `originCandidate.lat/lon` og `destCandidate.lat/lon` sem þegar eru
    staðfest af Google provider.

## Skrár búnar til

- `lib/iceland-routes/teskeidRoutingProvider.server.ts` (var skráð í v001 sem næsta skref)
  - `TeskeidRoutingProvider` implements `IcelandRoutingProvider`
  - Inline `haversineM` — forðast cross-domain innflutning úr `lib/weather/`
  - Samræmir origin við capital anchor (120 km radíus)
  - Finnur bestu route family eftir fjarlægð á destination frá terminal waypoint (80 km radíus)
  - `confidence: 'experimental'`, `segmentIds: []`, warning um corridor-only geometry
  - Kastar ef engin family finnst

- `lib/__tests__/teskeid-routing-provider.test.ts` — 9 próf:
  - Provider id er `teskeid_routes`
  - Samræmir öll 4 route families (south coast, north, east, westfjords)
  - Rétt `routeFamilyId`, `id`, `confidence`, `segmentIds`, `warnings`
  - `distanceM` og `durationS` eru jákvæðar heilar tölur
  - `calculatedAt` er gilt ISO timestamp
  - Kastar `teskeid_routes: no corridor fixture` þegar destination er fjarri öllum terminals
  - Kastar þegar origin er utan capital region (Akureyri sem origin)

## Skipanir og niðurstöður

- `npm run test:run -- lib/__tests__/teskeid-routing-provider.test.ts`
  - Exit 0; 1 test file, 9 tests passed.
- `npm run test:run -- lib/__tests__/iceland-routing-shadow.test.ts`
  - Exit 0; 1 test file, 4 tests passed. Engin regression.
- `npm run type-check`
  - Exit 0.

## Hvað var ekki gert

- Enginn commit eða push — bíður eftir leyfi Stebbi
- Engin telemetry eða `onOutcome` callback á shadow runner (vert að bæta við seinna)
- Enginn comparison á Google route vs Teskeid result
- Engin logging á shadow outcome — útkomur fara í `void` að svo stöddu
- Engin nýtt env-flagg; notar `TESKEID_ROUTING_SHADOW_ENABLED` sem var skilgreint í v001

## Uppbygging shadow calls

```
POST /api/teskeid/weather/travel
  → Google provider fetches route geometry
  → routePolyline resolved
  → void runIcelandRoutingShadow(...)   ← ný lína, non-blocking
  → sampleRouteWeatherPoints(...)
  → [rest of primary response unchanged]
```

Shadow runner:
- Ef `TESKEID_ROUTING_SHADOW_ENABLED !== 'true'` skilar `{ status: 'disabled' }` strax
- Ef provider kastar, skilar `{ status: 'failed', error }` — kastar ekki áfram
- Ef vel gengur, skilar `{ status: 'completed', result }` — notað ekki til neins að svo stöddu

## Ákvarðanir

- `vehicleProfile: 'car'` fast-coded í shadow request — travel API er eingöngu fyrir bílferðir
- Origin/destination tekin úr `originCandidate`/`destCandidate` (eftir Google-staðfestingu),
  ekki úr `body` beint — tryggir að koordinátar séu þegar sannprófaðar íslenskar hnitsetningar
- `new TeskeidRoutingProvider()` búin til á hverja beiðni — engin global singleton enda er
  provider stöðulaus
- Shadow runner er ekki tengdur við route memory, Supabase eða nein geymsla

## Þetta vantar fyrir production-notkun

1. `onOutcome` callback með privacy-safe logging (ekki persónugreinanlegar upplýsingar)
2. Samanburðarlíkan: Google distance vs Teskeid corridor distance
3. Fleiri route families eða bi-directional matching (núverandi er aðeins frá capital)
4. Routing engine í stað corridor fixture fyrir nákvæmari distance/duration

## Áhætta sem stendur eftir

- Shadow runner er ekki sýnilegur í logum að svo stöddu — enginn veit hvort hann keyrir
- `TESKEID_ROUTING_SHADOW_ENABLED` er sjálfgefið slökkt á Vercel; þarf að kveikja handvirkt til prófunar
- Corridor fixtures gefa vanmat á distance (bein lína á milli waypoints vs vegur)

## Localhost checks fyrir Stebbi

Engin notendasýnileg breyting — shadow runner er falinn að fullu. Núverandi
`/vedrid` og Akstur eiga að haga sér nákvæmlega eins.

Til að staðfesta shadow keyrslu: setja `TESKEID_ROUTING_SHADOW_ENABLED=true` í `.env.local`,
senda eina travel-beiðni (t.d. Reykjavík → Akureyri), og sjá að engar villur komi
frá travel API. Shadow outcome fer í `void` og er ekki sýnilegur í response.

Ekki ætti að setja þetta á Vercel production fyrr en `onOutcome` logging er til staðar.

## Tillaga að næsta skrefi

Bæta við `onOutcome` callback sem skrifar stutt server-log entry (provider id, corridor id,
distanceM, durationS, status) án þess að geyma persónugreinanlegar upplýsingar. Þetta
gerir samanburð mögulegan milli Google og Teskeid án Supabase.
