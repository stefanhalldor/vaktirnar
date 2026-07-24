# TODO-091 v026 — Hraðari og þolin spáhleðsla

Created: 2026-07-24 23:44  
Timezone: Atlantic/Reykjavik

## Samþykktur rammi

Stebbi samþykkti afmarkaðar kóðabreytingar svo cache-uð Veðurstofugögn
birtist fyrst, met.no hlaðist óblokkerandi á eftir og kortapillan notaði aftur
textann „Kort“. Ekki var samþykkt commit, push, deploy, migration,
Supabase-schema- eða production-breyting.

## Plan áfangans

1. Rekja Veðurstofu- og met.no-gagnaflæði.
2. Endurnýta núverandi product/cache töflur.
3. Hindra að kortaskipti glati met.no-köllum eða niðurstöðum.
4. Leyfa vistuðu vali að hydrate-a áður en öll provider-gögn eru komin.
5. Færa kortapilluna aftur í skýran texta.

## Hvað var gert

- Staðfest var að `/vedurstofan/stations` les aðeins úr
  `vedurstofan_forecasts_latest`; ekkert live-kall til Veðurstofunnar er á
  request-path.
- Fullt samsett station-explorer svar er nú geymt í sameiginlegu Next
  `unstable_cache` í 60 sekúndur.
  - Auth/feature-access check fer áfram fram fyrir cache-lestur.
  - Cache-ið inniheldur aðeins sameiginleg veðurgögn, ekki notendagögn.
  - Fyrsta kall eftir cold server-cache getur enn þurft product-table lestur.
- Vistaðar provider-stöðvar eru settar inn sem tímabundin items áður en
  provider-svarið er komið.
  - Þetta gerir panelinum kleift að endurheimta val notanda án þess að bíða
    með allan selection-state.
  - Raunveruleg Veðurstofufærsla leysir placeholder af hólmi þegar svarið
    kemur.
- met.no request og niðurstöður voru færð upp í parent component:
  - samtímis köll fyrir sama stað og sömu veðurmörk eru deduplicated,
  - niðurstaða er geymd í minni á meðan map component lifir,
  - ef notandi skiptir yfir á kort áður en svarið kemur heldur kallið áfram,
  - við enduropnun notar panelinn sama promise eða tilbúna niðurstöðu.
- met.no-köll fyrir mismunandi veðurmörk nota aðskilda cache-lykla.
- Kort-emoji var fjarlægt; inactive helmingur pillunnar segir aftur
  **Kort**.

## Hvers vegna þetta ætti að leysa upplifunina

Áður lifðu sóttar met.no-raðir aðeins í `WeatherChasePanel`. Panelinn er
unmountaður þegar farið er á kortið, þannig að seint svar gat ekki nýst nýju
panel-instance og nýtt kall gat hafist við enduropnun. Nú lifir request/cache
í `RoadMapPrototypeMap`, sem helst mountað við skipti milli Gagna og Korts.

Veðurstofan var þegar product-table cache-uð, en hvert endpoint-kall gat samt
endurtekið paginated lestur yfir þúsundir raða. 60 sekúndna samsett
server-cache fjarlægir þá endurtekningu fyrir heita request-pathinn.

## Design.md

- „Kort“ er skýr textastýring í stað óljóss emoji og styður því betur
  fyrirsjáanlegt navigation-mynstur.
- Núverandi 40 px pillu-control, focus feedback og mobile layout eru
  varðveitt.
- Gögn fyllast inn progressive í stað þess að navigation virðist hætta eða
  vera dautt.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `app/api/teskeid/weather/metno/point/route.ts`
- `lib/weather/metno.server.ts`
- `lib/weather/providers/vedurstofan.server.ts`
- `lib/weather/providers/vedurstofanStationExplorer.ts`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`

## Skrár breyttar

- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2344-todo-091-v026-codex-progressive-forecast-loading.md`

## Keyrðar skipanir

- `npm run type-check`
  - Exit code 0.
- `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts`
  - Exit code 0; 3 skrár og 8 próf stóðust.
- `git diff --check`
  - Engin whitespace-villa sást; fyrirliggjandi line-ending viðvaranir.
- `npm run build`
  - Fyrsta keyrsla: exit code 1 eftir compilation vegna tímabundinna
    `PageNotFoundError` fyrir `/contacts`, `/settings` og `/home`.
  - Óbreytt endurkeyrsla: exit code 0.
  - Fyrirliggjandi React Hook og `<img>` lint-viðvaranir eru áfram.

## Ekki gert

- Engin ný Supabase tafla eða migration var búin til; núverandi
  `vedurstofan_forecasts_latest` og `weather_cache` voru endurnýtt.
- met.no cache-lógík á server var ekki breytt.
- Ekki var bætt við persistent browser-cache fyrir full Veðurstofugögn.
- Dev server/browser var ekki ræstur.
- Ekkert var committað, push-að eða deployað.

## Áhætta og óvissa

- Cold server instance þarf enn fyrsta paginated product-table lesturinn.
- `unstable_cache` er best-effort Next/Vercel cache; raunverulegur cold/warm
  latency þarf að mæla í localhost og síðar production telemetry.
- Parent-level met.no cache lifir aðeins á meðan map component er mountað og
  er ekki persistent milli fullra page reloads.
- Placeholder-stöð hefur engar Veðurstofuraðir þar til sameiginlega
  station-svarið kemur; hún varðveitir valið en finnur ekki sjálf forecast.
- Engin ný automated test hermir enn eftir því að skipta yfir á kort meðan
  met.no request er in-flight. Þetta þarf manual regression-próf.

## Supabase, auth og production

- Aðeins var bætt cache-i ofan á fyrirliggjandi read-only product-table lestur.
- Auth og feature-access röð er óbreytt og gerist áður en cached payload er
  afhent.
- Engin RLS, grant, policy, auth, secret, billing eða notendagagnabreyting.
- Engin SQL var skrifuð eða keyrð.
- Engin production-aðgerð var framkvæmd.

## Route intelligence check

Breytingin snertir Spá/„Elta veðrið“, ekki leiðir, route-family,
vegkafla eða station matching fyrir ferðalag. `IcelandRoadmap.md` og
`lib/iceland-routes/` voru því ekki uppfærð.

## Næsta skref

Mæla þarf cold og warm tíma fyrir:

1. fyrstu Veðurstofutöflu,
2. fyrstu met.no-röð,
3. enduropnun Gagna eftir að hafa farið á Kort.

Ef cold Veðurstofulestur er enn of hægur er næsta skref ekki önnur tafla,
heldur annaðhvort afmarkað station-endpoint fyrir aðeins vistaðar stöðvar eða
precomputed response við warmer-keyrslu.

## Localhost checks for Stebbi

Slóð: `/auth-mvp/vedrid/road-map-prototype`  
State: innskráður notandi með bæði Veðurstofu- og Yr/met.no-staði vistaða.

1. Gerðu fulla endurhleðslu og vertu í **Spágögn**.
   - Vænt: vistuðu staðirnir eiga ekki að hverfa á meðan provider-gögn berast.
   - „Sæki spár…“ má birtast sem status, en viðmótið má ekki líta út eins og
     val notandans hafi tapast.
2. Athugaðu Veðurstofustöð.
   - Vænt: gögn hennar birtast um leið og cached station-svar kemur, án biðar
     eftir öllum met.no-stöðum.
3. Meðan Yr/met.no er enn að hlaðast skaltu smella á **Kort**.
   - Vænt: kortið opnast strax og viðmótið frýs ekki.
4. Bíddu nokkrar sekúndur og smelltu aftur á **Gögn**.
   - Vænt: sama met.no-kall hefur haldið áfram og niðurstaðan birtist án nýrrar
     langrar biðar.
5. Skiptu hratt 3–5 sinnum milli **Gögn** og **Kort**.
   - Vænt: engin frysting, ekkert tómt endanlegt state og ekki sífellt ný
     „Sæki spár…“ lota fyrir sama stað.
6. Endurhladdu aftur innan mínútu.
   - Vænt: Veðurstofusvarið ætti að vera á heitum server/browser cache-path og
     koma merkjanlega hraðar.
7. Prófaðu notanda með aðeins Veðurstofustöðvar og síðan aðeins met.no-staði.
   - Vænt: hvor provider getur birt gögn án þess að hinn blokki.
8. Staðfestu pilluna:
   - í **Spágögn** á inactive helmingurinn að heita **Kort**,
   - í **Spákort** á inactive helmingurinn áfram að heita **Gögn**.
9. Prófaðu 360, 390 og 460 px breidd.
   - Vænt: pillurnar haldast innan viewport, án mobile zoom eða overflow.

Ekki þarf og á ekki að breyta Supabase, env eða production til að framkvæma
þessi localhost-próf.
