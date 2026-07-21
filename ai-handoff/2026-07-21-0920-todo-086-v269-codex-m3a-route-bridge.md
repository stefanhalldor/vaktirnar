# 2026-07-21 09:20 - todo-086 v269 - Codex M3A route bridge

## Plan afangans

1. Ryna `2026-07-21-0904-todo-086-v268-claude-m2b3-separate-toggles-legend`.
2. Gera afmarkadar lagfaeringar ef tharf fyrir utgafu/prototype-stodugleika.
3. Taka stort naesta framkvæmdarskref i Road Intelligence: koma fyrstu `Fra`/`Til` ferdaleidinni inn a nyja MapLibre kortid.
4. Nota nuverandi `/ferdalagid` ferdavedursvel sem bridge, ekki byggja eigin route engine strax.
5. Skila handoffi fyrir Claude Code til ryni og naesta skref.

## Ryni a v268

Engin blocking vandamal fundust i v268. Skiptingin i tvo takka, `Fela vegakerfi` og `Fela vegfaerd`, er rett fyrir notandann: annar stjorna raster vegakerfi fra Vegagerdinni, hinn stjorna vector faerdarkoflum. Legend fyrir vegfaerd er lika rett nasta skref i prototype-inu.

Eitt smavandamal var lagfaert i þessari umferd: ef notandi reiknar leid snemma geta almennu stodvapunktarnir hlaðist eftir leidarpunktana og lent ofan a þeim. Nu eru `travel-bridge-weather-points` faerdir efst i layer-rod eftir route render og aftur eftir station layer load.

## Hvad var raunverulega gert

Sett var inn fyrsti M3A bridge-fasinn:

- A nyja MapLibre prototype kortinu er nu litið `Fra`/`Til` form efst a kortinu.
- Formid notar nuverandi `/api/place/search` til ad finna stadina.
- Sidan kallar thad i nuverandi `/api/teskeid/weather/travel` med `trailerKind: 'none'`.
- Nidurstadan ur gamla ferdavedurskerfinu er breytt yfir i GeoJSON fyrir MapLibre.
- Kortid teiknar leidarlínu og leidarvedurpunkta a nyja kortinu.
- Kortid zoomar/pannar ad reiknadri leid.
- Smellt a leidarvedurpunkt opnar popup med punkti a leid, fjarlagd fra upphafi, ETA, vindi, hvidum og urkomu ef gogn eru til.
- Route summary birtist i form-overlayinu: `Fra -> Til`, km, timi, fjoldi vedurpunkta og stutt svar fra ferdavedursvelinni.

Thetta er medvitad bridge-lausn. Hun gerir Stebba kleift ad profa "Reykjavik til Akureyri" a nyja kortinu strax, en hun er ekki endanlega eigin route-graph lausnin.

## Hvernig thetta birtist notandanum

I prototype-inu ser notandi kortid eins og adur, en nu med litlu reitakerfi efst:

1. Notandi skrifar `Reykjavik` i Fra.
2. Notandi skrifar `Akureyri` i Til.
3. Notandi smellir `Reikna`.
4. Kortid syndir graena ferdaleid yfir landid.
5. Litadir vedurpunktar birtast a leidinni.
6. Pilla i formi synir heildarstoduna: `Innan marka`, `Othaegilegt` eda `Haettulegt`.
7. Smellt a punkt synir litid MapLibre popup med helstu tolum fyrir thennan stad a leidinni.

## Skrar sem voru skodadar

- `ai-handoff/2026-07-21-0904-todo-086-v268-claude-m2b3-separate-toggles-legend.md`
- `WORKFLOW.md`
- `Design.md` var haft sem vidmid fyrir mobile/app upplifun og compact controls.
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/place/search/route.ts`
- `lib/weather/types.ts`
- `components/weather/travelAuditMap.helpers.ts`

## Skrar sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
  - Baett vid M3A `Fra`/`Til` formi.
  - Baett vid place-search + travel API bridge.
  - Baett vid MapLibre route line layer.
  - Baett vid MapLibre route weather point layer.
  - Baett vid popup fyrir route weather points.
  - Tryggt ad route weather points verdi efst i layer-rod.

- `lib/road-intelligence/travelBridgeMapData.ts`
  - Ny helper sem breytir `DeterministicResult.travelPlan` i GeoJSON fyrir MapLibre.
  - Reiknar bbox, route line, weather point features, status/color og summary metrics.
  - Fellur til baka a `routeWeatherPoints` ef `auditPolylinePoints` vantar.

- `lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`
  - Ny test fyrir bridge helper.
  - Profað: vantar `travelPlan`, venjuleg route geometry, bbox/weather points og fallback a `routeWeatherPoints`.

- `messages/is.json`
  - Baett vid is textum fyrir route bridge form, villur, summary og route point popup.
  - Subtitle uppfaerdur i M3A.

- `messages/en.json`
  - Samsvarandi en textar.
  - Subtitle uppfaerdur i M3A.

## Skipanir sem voru keyrdar

- `npm run type-check`
  - Exit code: 0

- `npm run test:run -- lib/__tests__/road-intelligence-segments.test.ts lib/__tests__/road-intelligence-map-proxy.test.ts lib/__tests__/road-intelligence-station-geo-json.test.ts lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts`
  - Exit code: 0
  - 5 test files passed
  - 72 tests passed

- `npm run build`
  - Exit code: 0
  - Build tokst.
  - Adeins eldri/otengd lint warnings komu fram i:
    - `app/s/[sessionId]/page.tsx`
    - `components/landing/Avatar.tsx`
    - `components/weather/IcelandOverviewMap.tsx`
    - `components/weather/TravelAuditMap.tsx`
    - `components/weather/WeatherOverviewClient.tsx`

## Hvad mistokst eda var sleppt

- Ekki var keyrt browserprof af Codex, thvi Stebbi keyrir localhost/dev server sjalfur.
- Ekki var buid til eigin routing engine eda eigin road graph enn.
- Ekki var baett vid route-options UI, kerra/oxi/vidkomustadir eda timaval i nyja kortinu.
- Ekki var baett vid selectable geocode candidates. Bridge tekur fyrsta stad fra `/api/place/search`.
- Ekki var breytt SQL, Supabase, RLS, feature access, env, deploy eda production.

## Akvardanir sem Codex tok

- Nota nuverandi `/api/teskeid/weather/travel` sem bridge til ad fa notendavirkt `Fra`/`Til` eins fljott og oruggt og haegt er.
- Teikna nyja leid a MapLibre sem product proof, an thess ad blanda inn nyjum route-engine ahættum i sama skrefi.
- Halda formi kompaktu og inni a kortinu, med `text-base` inputum til ad forðast mobile zoom.
- Gera route bridge helper i `lib/road-intelligence/` svo MapLibre component sjalft se ekki fullt af data-transform logik.
- Færa route weather point layer efst svo hann se ekki grafinn undir almennum stodvapunktum.

## Fylgni vid Design.md

`Design.md` var lesid i lokaryni thessa afanga. Breytingin fylgir helstu vidmidum fyrir mobile app-upplifun:

- Formid er compact, mobile-first og notar ekki hero/dashboard mynstur.
- Inputs eru `text-base`, svo iOS/Safari a ekki ad zooma sjalfkrafa vid focus.
- Controls eru med stoduga haed og eiga ekki ad valda láréttu overflowi.
- Overlayid notar semantic tokena (`background`, `border`, `primary`, `foreground`, `muted`) i stad nyrrar brand-litapallettu.
- Radius er `rounded-lg`, i anda 8-12 px card/control vidmids.
- User-facing textar foru i `messages/is.json` og `messages/en.json`.

Fravik/athugasemd: kort-overlayid er med `shadow-sm` og `backdrop-blur-sm` til ad vera laesilegt yfir korti. Thetta er afmarkad tool-overlay hegðun, ekki nytt floating-card page-section mynstur.

## Ahaetta sem er enn til stadar

- Bridge notar gamla ferdavedursvel og Google/ferdalagid gruninn undir hettunni. Thetta er ekki enn open-data route intelligence.
- Notkun a `/api/teskeid/weather/travel` getur, eftir env/gagnagrunnsstillingum, triggerad nuverandi route-memory/usage skrif sem thad API gerir adur. Codex baetti ekki vid nyjum skrifum.
- Fyrsta geocode nidurstada getur verid rong fyrir tviradna stadi. Thad tharf candidate-picker eda betri stadfestingu seinna.
- Overlayid efst a kortinu tharf raunverulega mobile-prof: 546px breidd leit vel ut i code/layout, en vid thurfum sjalf prof a sima/mobile viewport.
- Route line notar `auditPolylinePoints` ef til, annars route weather points. Ef gamla API skilur litla/enga geometry getur leidin ordid grof.
- Road condition legend textar eru enn hardcodadir i component fra fyrra skrefi; ekki blocking fyrir prototype, en ætti ad fa i messages seinna.

## Tillaga ad naesta skrefi

Claude Code ætti ad ryna M3A bridgeid og velja eitt af tveimur:

1. Ef browserprof stenst: undirbua M3A-2.
   - route options i nyja MapLibre formi
   - velja leid
   - endurteikna leid og vedurpunkta eftir valinni leid

2. Ef browserprof finnur UI/API vandamal: laga fyrst.
   - map fit/padding
   - popup readability
   - geocode failure states
   - layer order

Naesti stori fasi eftir M3A bridge:

- M3B: byggja open-data route graph prototype a feature flaggi.
- M3C: project-a vedurstodvar a eigin road graph.
- M3D: bera saman gamla ferdalagid nidurstodu og nyju road graph nidurstodu fyrir nokkrar leidar, t.d. Reykjavik-Akureyri, Reykjavik-Egilsstadir og Akranes-Borgarnes.

## Spurningar fyrir Claude Code ad ryna sérstaklega

- Er rett ad route bridge taki fyrsta `/api/place/search` result, eda eigum vid strax ad syna candidate val?
- A route bridge form ad vera inni a kortinu eda undir header a prototype sidanum til ad fa betri mobile height?
- Tharf ad senda threshold state i `/api/teskeid/weather/travel` i þessu bridge skrefi, eda er default nog fyrir prototype?
- Er layer order rett: route line undir station/route points, route weather points efst?
- Er einhver production-risk i ad profa `/api/teskeid/weather/travel` a localhost med real Supabase env?

## Supabase / SQL / auth / production

- Engin SQL skra var skrifud i þessum afanga.
- Engin SQL var keyrd.
- Engin RLS, grants, policies eda functions breyttust.
- Engin auth breyting.
- Engin env/secrets breyting.
- Enginn deploy, push eda production action.

Athugid samt: route bridge kallar nuverandi `/api/teskeid/weather/travel`. Thad API getur haft nuverandi hliðarahrif eins og route-memory/usage skrif ef localhost env bendir a raun gagnagrunn. Thetta er ekki ny hliðarverkun fra Codex, en thad er mikilvaegt i Stebbi-prof.

## Localhost checks for Stebbi

Forsendur:

- Dev server er i gangi hja Stebba.
- Stebbi er innskradur.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` er i `.env.local`.
- SQL89 hefur verið keyrt.
- Notandinn hefur `feature_access.feature_key = 'road-intelligence-v1'`.

Prof:

1. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Staðfesta ad subtitle segi M3A / ferdaleid a nyju korti.
3. Staðfesta ad kortid syni basemap, vegakerfi, vegfaerd og vindpunkta eins og i v268.
4. Skrifa `Reykjavik` i `Fra` og `Akureyri` i `Til`.
5. Smella `Reikna`.
6. Vaenta nidurstada:
   - takkinn fer i loading state
   - leidarlina birtist a kortinu
   - leidarvedurpunktar birtast a leidinni
   - kortid zoomar ad leidinni
   - route summary birtist med stadanofnum, km, tima, fjolda vedurpunkta og stuttu svari
7. Smella a nokkra leidarvedurpunkta.
8. Vaenta nidurstada:
   - popup opnast vid punktinn
   - synir punktatalningu, fjarlagd, ETA, vind, hvidur og urkomu ef til
9. Profa takkana:
   - `Fela vegakerfi`
   - `Fela vegfaerd`
   - leidarlina og leidarvedurpunktar eiga samt ad vera skiljanleg
10. Profa minni leid:
   - `Akranes` til `Borgarnes`
11. Profa lengri/austurleid:
   - `Reykjavik` til `Egilsstadir`
12. Opna devtools network og staðfesta ad:
   - `/api/place/search` skili 200 fyrir bada stadi
   - `/api/teskeid/weather/travel` skili 200
   - engin ny console error komi fra RoadMapPrototype

Varud:

- Ekki profa thetta kaeruleysislega moti production ef `.env.local` bendir a raun Supabase og ekki ma skra route-memory/usage fyrir profanir.
- Ekki keyra SQL, deploy eda cron sem hluta af þessu browserprofi.
