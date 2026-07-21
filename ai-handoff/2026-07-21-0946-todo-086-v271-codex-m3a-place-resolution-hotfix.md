# todo-086 v271 - Codex M3A place resolution hotfix

Created: 2026-07-21 09:46
Timezone: Atlantic/Reykjavik

## Samthykki

Stebbi bad Codex ad skoda `2026-07-21-0938-todo-086-v270-claude-m3a-autocomplete-clear`, laga ad `Fra`/`Til` stadir finnast ekki i Road Intelligence prototype, og gera handoff fyrir Claude Code.

Framkvaemt: kodabreytingar, unit tests, type-check, targeted tests og build.

Ekki framkvaemt: commit, push, deploy, SQL, migration, Supabase breyting, env/secrets breyting eda production adgerd.

## Stutt root-cause ryni

Screenshot fra Stebba synir ad `/api/place/search` er ad skila HTTP 200, en UI endar samt a `Fann ekki annan stadinn`.

Liklegasta orsokin i kodanum var ekki API route shape heldur brothætt client-resolution:

- v270 notadi `fromResolved && routeFrom === fromResolved.name` til ad endurnyta valda autocomplete nidurstodu.
- Thad brotnar fyrir venjulega innslatt eins og `reykjavik` vs `Reykjavik`/`Reykjavík`, mismunandi casing, accent-laus heiti og `Egilsstadir` vs `Egilsstaðir`.
- Submit nyttist ekki af suggestion-listanum sem var thegar kominn i state nema notandi hefdi explicit valdiklad i dropdown.
- `resolveBridgePlace()` las response shape beint og valdi bara `results[0]`; ekkert defensivt parser layer var til.
- Ef leit skilar tomum nidurstodum var enginn `, Ísland` fallback a submit.

Confidence: medium-high. Codex gat ekki browser-profad, en koda- og screenshot-gogn passa vel vid thetta mynstur.

## Hvad var gert

### Ny reusable place-resolution helper

Ny skra:

- `lib/road-intelligence/placeSearchBridge.ts`

Hann gerir:

- Normaliserar stadaleit med accent/case/islenskum stafbrigda fallback.
  - `reykjavik` passar vid `Reykjavík`
  - `Egilsstadir` passar vid `Egilsstaðir`
- Parser defensivt nokkur response/candidate shapes:
  - `{ results: [...] }`
  - `{ candidates: [...] }`
  - raw array
  - `name` eda `displayName`
  - `lon` eda `lng`
  - `placeId` eda `place_id`
- Velur bestu nidurstodu fyrir query:
  - exact normalized name
  - exact normalized address
  - prefix match
  - contains match
  - optional first-result fallback fyrir nytt fetched result

### RoadMapPrototypeMap tengt við helper

Breytt:

- `components/weather/RoadMapPrototypeMap.tsx`

Helstu breytingar:

- Autocomplete parsing notar nu `parsePlaceSearchResults()`.
- Submit notar nu `resolveBridgePlace(query, signal, [resolved, ...suggestions])`.
- Submit reynir fyrst:
  - valinn/resolved stad ef hann passar normaliserad vid input
  - fyrirliggjandi suggestions ef thau passa
  - nyja `/api/place/search` fyrirspurn
  - ef ekkert finnst, `query + ", Ísland"` fallback
- Exact string compare `routeFrom === fromResolved.name` var tekid ut.
- Cleanup helperar fyrir timers/AbortControllers voru faerdir i module-scope til ad forda nyjum React hook cleanup warnings.

### Test coverage

Ny skra:

- `lib/__tests__/road-intelligence-place-search-bridge.test.ts`

Profar:

- `reykjavik` normaliserast eins og `Reykjavík`.
- `Egilsstadir` normaliserast eins og `Egilsstaðir`.
- Current `/api/place/search` response shape parsast rett.
- Provider-like `displayName`/`lng`/`place_id` shape parsast defensivt.
- Accent-insensitive exact match vinnur fram yfir rangari fyrri candidate.
- Direct typing fallback getur valid val eftir stuttu query eins og `Akur`.

## Skrar skodadar

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-21-0938-todo-086-v270-claude-m3a-autocomplete-clear.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/place/search/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/weather/google.server.ts`
- `lib/__tests__/place-search-api.test.ts`

## Skrar breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/road-intelligence/placeSearchBridge.ts`
- `lib/__tests__/road-intelligence-place-search-bridge.test.ts`

Ath: `components/weather/RoadMapPrototypeMap.tsx` og nokkrar Road Intelligence skrár eru enn untracked i git-status vegna fyrri prototype-vinnu. Codex breytti innan thessa files, en gerdi ekki commit.

## Skipanir keyrdar

- `npm run type-check`
  - Fyrst failadi vegna of þrongs type-guards i nyja helpernum.
  - Lagfaert.
  - Lokaniðurstada: exit code 0.

- `npm run test:run -- lib/__tests__/road-intelligence-place-search-bridge.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts lib/__tests__/place-search-api.test.ts`
  - Exit code 0.
  - 3 test files passed.
  - 23 tests passed.

- `npm run build`
  - Fyrst syni build nyjar RoadMapPrototype cleanup warnings.
  - Lagfaert med module-scope cleanup helperum.
  - Lokaniðurstada: exit code 0.
  - Engar RoadMapPrototype warnings eftir.
  - Eldri/otengdar warnings eru enn i:
    - `app/s/[sessionId]/page.tsx`
    - `components/landing/Avatar.tsx`
    - `components/weather/IcelandOverviewMap.tsx`
    - `components/weather/TravelAuditMap.tsx`
    - `components/weather/WeatherOverviewClient.tsx`

## Hvad var ekki gert

- Ekki var profad i browser af Codex.
- Ekki var breytt `/api/place/search` backend.
- Ekki var breytt `/api/teskeid/weather/travel` backend.
- Ekki var buid til route-options UI.
- Ekki var buid til eigin open-data route graph.
- Ekki var keyrt SQL eda migration.
- Ekki var gert commit, push eda deploy.

## Route intelligence check

- Snertir M3A route bridge fyrir nyja Road Intelligence MapLibre prototype.
- Snertir ekki canonical road graph enn.
- Lausnin er enn provider-neutral a UI/helper stigi ad hluta, en submit kallar enn gamla `/api/teskeid/weather/travel`, sem notar nuverandi weather provider undir hettunni.
- Engin ny route-gogn eru vistud beint med thessari breytingu.
- Existing `/api/teskeid/weather/travel` getur samt haft fyrri route-memory/usage side effects ef Stebbi profar moti raun Supabase env.
- `IcelandRoadmap.md` var ekki uppfaert thvi thetta er hotfix a bridge-place-resolution, ekki ny canonical segment/control-point thekking.

## Design.md check

Engin ny synileg layout-breyting var gerð i thessari umferð. Existing M3A form er ohreyft i meginatridum.

Vid lagfæringu var passad ad:

- Engum nyjum visible texta var baett vid.
- Engum nyjum form controls var baett vid.
- `text-base` inputs og mobile-first overlay fra fyrra skrefi haldast.
- Engin ny one-off lita- eda radius-mynstur voru baett vid.

## Localhost checks for Stebbi

Forsendur:

- Dev server i gangi hja Stebba.
- Innskradur notandi.
- `ROAD_INTELLIGENCE_V1_ENABLED=true`.
- SQL89 keyrt.
- Notandi hefur `feature_access` fyrir `road-intelligence-v1`.

Prufa 1 - direct typing an dropdown vals:

1. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Skrifa `reykjavik` i `Fra`.
3. Skrifa `Akureyri` i `Til`.
4. Ekki velja dropdown nidurstodu.
5. Smella `Reikna`.
6. Vaenta:
   - ekki lengur `Fann ekki annan stadinn`
   - route API kall fer af stad
   - leidarlina og vedurpunktar birtast ef travel API skilar route

Prufa 2 - dropdown val:

1. Smella `Hreinsa` ef einhver leid er virk.
2. Skrifa `Egilsstadir` i `Fra`.
3. Velja `Egilsstaðir` ur dropdown ef hann birtist.
4. Skrifa `Akureyri` i `Til`.
5. Velja `Akureyri` ur dropdown.
6. Smella `Reikna`.
7. Vaenta ad leid reiknist og kortid zoomi ad leidinni.

Prufa 3 - casing/accent edge:

1. Profa `REYKJAVIK` til `akureyri`.
2. Profa `Egilsstadir` til `Reykjavik`.
3. Vaenta ad place-resolution verdi ekki blocker.

Prufa 4 - network/devtools:

1. Opna Network tab.
2. Staðfesta ad `/api/place/search` fyrir full query skili 200.
3. Ef route tekst ekki, skoda hvort villan er nu fra `/api/teskeid/weather/travel` frekar en place-resolution.
4. Ef travel API skilar `route_unavailable`, tha er thad naesta vandamal, ekki sama `place_not_found` vandamal.

Varud:

- Ekki profa kaeruleysislega moti production Supabase ef ekki ma skra route-memory/usage fyrir profanir.
- Ekki keyra SQL, deploy eda cron sem hluta af þessu browserprofi.

## Naesta skref fyrir Claude Code

1. Ryna diffid og keyra browserprof a localhost.
2. Ef `Fann ekki annan stadinn` er horfid en route API failar, greina travel API response body naest:
   - `route_unavailable`
   - `provider_not_configured`
   - `invalid_origin`/`invalid_destination`
   - auth/session vandamal
3. Ef browserprof stenst:
   - halda afram i M3A-2 med route options/trailer/departure inputs, eda
   - fara i M3B open-data route graph prototype eftir akvordun Stebba.

## Ovissa / tharf ad stadfesta

- Codex gat ekki sed actual response body i browser Network panel, bara screenshot og local code.
- Lagfæringin styrkir place-resolution verulega, en ef vandinn reynist vera i `/api/teskeid/weather/travel` route provider kallinu tha þarf naesta hotfix ad taka vid þar.
- Ef Google Geocoding skilar 200 med empty `results` fyrir suma algenga stadi vegna provider/config/rate vandamals, tha tharf server-side geocode fallback eda curated local place index.

