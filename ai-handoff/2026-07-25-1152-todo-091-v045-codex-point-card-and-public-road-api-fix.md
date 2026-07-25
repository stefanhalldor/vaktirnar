# TODO-091 — Punktaspjald og public road-intelligence 401

Created: 2026-07-25 11:52  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti að Codex lagaði:

- villuna sem birtist þegar punktur á stóra kortinu opnar ferðaspjald
- 401-villur frá road-intelligence köllum fyrir public notanda

Ekki var samþykkt commit, push, deploy, migration, Supabase/RLS eða production-breyting.

## Orsök

- `roadMapPrototypeDepartureLabel` var þegar til í báðum message-skrám undir `teskeid.vedrid.overview`.
- `RouteTravelDetails` notaði hins vegar namespace `teskeid.vedrid`, svo next-intl leitaði á röngum stað og kastaði `MISSING_MESSAGE`.
- `road-segments` hafði þegar public-aware aðgang en þrír endpointar sem stóra Aksturskortið notar voru enn eingöngu opnir innskráðum `road-intelligence-v1` notendum:
  - `station-markers`
  - `road-surface`
  - `map-proxy`

## Framkvæmt

- `RouteTravelDetails` notar nú rétta `teskeid.vedrid.overview` namespace.
- Ofangreindir þrír endpointar leyfa public lestur eingöngu þegar `getWeatherEnabledMode() === 'all'`.
- Þegar weather-mode er `authenticated` eða `off` gildir fyrri auth + `road-intelligence-v1` feature-gate óbreytt.
- `AUTH_MVP_ENABLED !== true` skilar áfram 404.
- Engin Supabase-gögn, notendagögn eða persónulegar ferðir eru opnaðar; endpointarnir proxy-a/normalisera allowlisted opin provider-gögn.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `components/weather/RouteTravelDetails.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/road-intelligence/road-segments/route.ts`
- `app/api/teskeid/road-intelligence/station-markers/route.ts`
- `app/api/teskeid/road-intelligence/road-surface/route.ts`
- `app/api/teskeid/road-intelligence/map-proxy/route.ts`
- `lib/weather/weatherBaseAccess.server.ts`
- `lib/weather/weatherEnabledMode.server.ts`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/RouteTravelDetails.tsx`
- `app/api/teskeid/road-intelligence/station-markers/route.ts`
- `app/api/teskeid/road-intelligence/road-surface/route.ts`
- `app/api/teskeid/road-intelligence/map-proxy/route.ts`
- þessi handoff-skrá

## Checks

- `npm.cmd run type-check` — exit 0
- `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/weather-saved-places-api.test.ts` — exit 0, 29/29 próf
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, browserpróf, commit, push, deploy, SQL eða migration var framkvæmd.

## Öryggi og eftirstandandi áhætta

- Public aðgangurinn er bundinn við `WEATHER_ENABLED=All`; hann er ekki almenn framhjáhlaup á feature-gate.
- `map-proxy` heldur áfram allowlist og bbox/content-type validation.
- `road-surface` heldur áfram bbox, upstream content-type og GeoJSON normalization.
- `station-markers` skilar opinberum Vegagerðarmælingum sem GeoJSON, ekki user data.
- Sérstök API-auth próf fyrir þessar þrjár nýju `All` greinar eru ekki til í þessum hraða áfanga. Þetta er helsta prófunargatið fyrir release-rýni.
- Public notkun getur aukið upstream/provider-umferð; núverandi cache headers og allowlists haldast.

## Route intelligence check

Engin route-family, canonical segment, control point, matching-regla eða cache-key breyttist. Aðeins aðgangur að núverandi public provider-lögum var samræmdur public Veður-mode. Engar nákvæmar ferðir eða heimilisföng eru vistuð. `IcelandRoadmap.md` þurfti ekki uppfærslu.

## Localhost checks for Stebbi

Með `AUTH_MVP_ENABLED=true` og `WEATHER_ENABLED=All`:

1. Opna `/auth-mvp/vedrid/road-map-prototype` sem óinnskráður public notandi.
2. Reikna leið, opna stóra kortið og hreinsa console áður en kortið hleður.
3. Smella á Veðurstofupunkt. Punktaspjaldið á að opnast án `MISSING_MESSAGE`.
4. Staðfesta að brottfarartími og áfangastaður birtist í ferðaupplýsingum.
5. Staðfesta að `station-markers`, `road-surface`, `road-segments` og `map-proxy` skili ekki 401.
6. Athuga að vegakerfi, vegfærð og stöðvar birtist áfram á fulla Aksturskortinu.
7. Endurtaka innskráður til að grípa regression í feature-aðgangi.

Ekki breyta env á production eða prófa gegn production-gögnum án sérstaks leyfis. Engin RLS-/schema-breyting fylgir.

## Næsta skref

Claude Code ætti fyrir útgáfu að bæta við afmörkuðum route-handler prófum fyrir public `All`, signed-out `Authenticated` og feature-gated authenticated flæði endpointanna þriggja.

Confidence: high í orsök og namespace-lagfæringu; high í afmarkaðri public-gate lógík, medium-high þar til browser/network-próf Stebba staðfestir að enginn annar road-intelligence endpoint skili 401.
