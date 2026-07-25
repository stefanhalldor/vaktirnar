# TODO 091 v053 — release candidate review og handoff til Claude Code

Created: 2026-07-25 13:32  
Timezone: Atlantic/Reykjavik

## Til Claude Code

Þetta er sameinað handoff fyrir allan núverandi óútgefinn Akstur/Spákort
vinnupakka. Claude Code á að:

1. lesa þetta handoff og fyrri v038-v052 handoff eftir þörfum;
2. rýna diffið sjálfstætt með production-, auth-, privacy- og regression-gleraugum;
3. stoppa og skila findings ef blocking atriði finnast;
4. ef Stebbi sendir þetta með `Workflow` eða öðru skýru útgáfuleyfi og engir
   blockers finnast, commit-a aðeins réttan verkefnispakka, push-a og fylgjast
   með Vercel þar til build er staðfest grænt.

`.obsidian/workspace.json` er ótengd notendabreyting og **má ekki** fara með í
commit eða vera afturkölluð.

## Review verdict Codex

**Engin þekkt release-blocking finding stendur eftir í static review eða
sjálfvirkum staðfestingum.**

Production build fann fyrst blocking Hooks-villu í
`RoadMapPrototypeMap.tsx`: þrír restore-`useEffect` hookar voru eftir
`if (mapError) return`. Codex færði early return niður fyrir hookana og keyrði
allan staðfestingarhringinn aftur. Type-check, full Vitest suite og production
build eru nú græn.

Release er samt háð loka-browserprófun Stebba, einkum MapLibre geometry,
public session state og leiðarendurheimt.

## Samantekt allra óútgefinna breytinga

### Akstur: copy og loader

- Google Maps viðvörunin var endurskrifuð á íslensku og ensku.
- Varúðarsetningin er feitletruð.
- Loader sýnir röðina:
  - Sæki leiðir frá Google Maps.
  - Sæki gögn frá Vegagerðinni á þessum leiðum.
  - Sæki gögn frá Veðurstofu Íslands á þessum leiðum.
  - Raða veðurgögnum á rétta tímapunkta á leiðinni.
- Samanburðarkaflinn segir „Fyrir þá sem eru að elta veðrið“.

### Public staðir og session

- Public notandi heldur vistuðum stöðum í `sessionStorage` innan sama tabs.
- Skýr texti segir að staðirnir séu tímabundnir og býður innskráningu.
- Eftir innskráningu eru pending public staðir sameinaðir með `mergeOnly`.
- Fyrirliggjandi staður innskráðs notanda er ekki yfirskrifaður.
- Aðeins nýir staðir bætast við og 50 staða server-cap er virt.
- Session-færsla helst eftir ef promotion mistekst eða cap er fullt.

### Public road-intelligence aðgangur

- `map-proxy`, `road-segments`, `road-surface` og `station-markers` leyfa
  public lestur þegar canonical weather enabled mode er `all`.
- Þegar mode er ekki `all` gilda áfram auth og `road-intelligence-v1`
  feature-gate.
- Input validation, upstream allowlists og error headers eru áfram óbreytt.
- Engin RLS, grant, SQL eða migration var breytt.

### Sameiginlegt stórt og lítið Aksturskort

- Nýr reusable `DriveRouteMap.tsx` notar MapLibre, Carto/OSM grunnkort,
  Teskeiðargræna leið og Veðurstofupunkta.
- Stóra kortið notar componentinn sem sameiginlegan map container.
- Litla kortið er ekki lengur einföld SVG-líking heldur sama kortatækni.
- Vegagerðarvegakerfi/vegfærð eru í fullum Aksturskortaham, ekki í litla
  kortinu eða Spákortinu.
- Litla kortið sýnir Veðurstofupunkta, bíltákn og aksturstíma.
- Punktasmellur á litla kortinu velur „Valinn punktur“ á staðnum; hann zoomar
  ekki út og sendir ekki í innskráningu.
- Filter-pillur geta falið/sýnt stöður eins og „Innan marka“.
- Gagnkvæm staðasía kemur í veg fyrir sama stað í Frá og Til.

### Stóra kortið og stöðvaspjöld

- Route-station punktar voru stækkaðir.
- Veðurstofu- og Vegagerðarpunktar opna canonical full stöðvaspjöld á réttum
  routes.
- „Til baka í akstur“ er sýnt með öruggu `returnTo`.
- Route snapshot varðveitir Frá/Til, staðfest hnit, thresholds og Kort/Gögn
  view í session storage í allt að tvær klukkustundir.
- Bæði back-linkur og innbyggt browser/síma-back lenda í sama restore-flæði.
- Restore endurreiknar leiðina eftir að React state hefur raunverulega
  hydratað; stale zero-timeout submit var fjarlægt.
- `resolvePulseBackDestination` leyfir aðeins boundary-safe innri
  Aksturs-slóð.

### Gamlar vistaðar staðsetningar og route fallback

- Gamall vistaður staður með gild hnit, til dæmis Melás 8, er notaður beint
  þó hann sé ekki í styttri curated staðalista nýja kerfisins.
- Ef route provider finnur ekki leið er nálægasti curated staður innan 30 km
  boðinn sem opt-in valkostur.
- Staðgengill er aldrei valinn sjálfkrafa.
- Auth-, rate-limit- og `map_not_ready` villur sýna ekki villandi
  staðgengil.

### Map readiness og console-villur

- Sérstakt initialization-ready ref segir til um hvenær MapLibre layers eru
  tilbúin.
- Route fetch og map readiness keyra samhliða; rendering bíður eftir báðu.
- Polling styður timeout og AbortSignal og treystir ekki lengur á
  `isStyleLoaded()` meðan raster tiles hlaðast.
- Stöðvaspjalds-pages sækja canonical locale server-side með `getLocale()` og
  senda serialized prop í client component.
- SSR og client birta því sama kommu/punkt- og dagsetningarsnið.
- Fyrra `suppressHydrationWarning` var fjarlægt; orsökin var lagfærð.
- `public/manifest.json` var parse-að sem gilt JSON. Fyrri manifest console
  færsla var localhost/cache noise.

### Spákort: spáspjöld og controls

- Deterministic collision placement reynir að halda hverju spáspjaldi nálægt
  sínum punkti án overlap við önnur spjöld eða UI.
- Spjald sem kemst ekki fyrir er falið og banner sýnir fjöldann og leggur til
  útþysjun eða færri stöðvar.
- MapLibre +/- zoom controls voru fjarlægð.
- A−/A+ stjórna textastærð; mobile controls eru efst hægra megin og desktop
  controls í skýringarspjaldi.
- Public breyting á textastærð er session-vædd og innskráður autosave-stuðningur
  er hluti preferences payloads.
- Connector-lína velur nú stysta raunverulega snertipunkt við spáspjald eða
  staðarheiti, ekki ósýnilegan flex-stack ramma. Þetta lagar bilið við
  Vestmannaeyjar.

### UI hreinsun

- Handvirkir „Fela vegakerfi“ og „Fela vegfærð“ rofar voru fjarlægðir.
- Neðri litaskýring, stöðvatalning og vegkaflatalning voru fjarlægð úr
  Aksturskortinu.
- Vegakerfi og vegfærð eru áfram virk í fullum Aksturskortaham.

## Verkefnaskrár í release scope

- `app/api/teskeid/road-intelligence/map-proxy/route.ts`
- `app/api/teskeid/road-intelligence/road-segments/route.ts`
- `app/api/teskeid/road-intelligence/road-surface/route.ts`
- `app/api/teskeid/road-intelligence/station-markers/route.ts`
- `app/api/teskeid/weather/saved-places/route.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/DriveRouteMap.tsx` (ný skrá)
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteTravelDetails.tsx`
- `lib/__tests__/pulseBack.test.ts`
- `lib/__tests__/road-intelligence-road-map-places.test.ts`
- `lib/road-intelligence/roadMapPlaces.ts`
- `lib/weather/pulseBack.ts`
- `messages/is.json`
- `messages/en.json`

Handoff-skrár v038-v053 eru einnig ótracked. Claude Code á að fylgja
repo-venju um hvort þær fari í sama commit, en þær má ekki rugla saman við
ótengda `.obsidian/workspace.json`.

## Sjálfvirk staðfesting

### Lokaniðurstöður

1. `npm.cmd run type-check`
   - Exit code 0.
2. `npm.cmd run test:run`
   - Exit code 0.
   - 135/135 test files passed.
   - 3.601 tests passed.
   - 27 skipped og 8 todo, fyrirfram merkt sem slík.
   - Tvær `Not implemented: navigation to another Document` línur komu frá
     JSDOM og voru ekki test failures.
3. `npm.cmd run build`
   - Exit code 0 í loka keyrslu.
   - Next.js compiled, type/lint phase lauk, 100/100 static pages generated og
     build traces kláruð.
4. JSON parse:
   - `messages/is.json`: OK.
   - `messages/en.json`: OK.
   - `public/manifest.json`: OK.
5. `git diff --check`
   - Exit code 0.
   - Aðeins CRLF conversion warnings.
6. Conflict-marker leit í scoped app/components/lib/messages
   - Engir conflict markers fundust.

### Fyrsta build-tilraun og lagfæring

Fyrsta `npm.cmd run build`:

- compiled successfully;
- stöðvaðist í lint með þremur
  `React Hook "useEffect" is called conditionally` errors í
  `RoadMapPrototypeMap.tsx`.

Codex færði `mapError` early return niður fyrir restore hookana. Eftir það voru
type-check, full Vitest suite og production build keyrð aftur og öll græn.

## Build warnings sem standa eftir

Build er grænn en sýnir fyrirliggjandi warnings:

- missing hook dependencies í `app/s/[sessionId]/page.tsx`;
- `<img>` warning í `components/landing/Avatar.tsx`;
- ref cleanup warning í `components/weather/IcelandOverviewMap.tsx`;
- nokkur exhaustive-deps warnings í `RoadMapPrototypeMap.tsx`,
  `TravelAuditMap.tsx` og `WeatherOverviewClient.tsx`;
- `caniuse-lite` er sex mánaða gamalt.

Claude Code á að staðfesta að engin warning sé nýr release blocker. Ekki
stækka scope með almennri hook-refactor eða dependency update rétt fyrir
útgáfu nema concrete bug finnist.

## Security, auth, privacy og kostnaður

- Engin SQL/migration var skrifuð eða keyrð.
- Engin RLS, grants, policies, auth schema eða production gögn voru breytt.
- Session storage geymir staðanöfn/hnit og route restore í sama tab; TTL fyrir
  route restore er tvær klukkustundir.
- Engin raw Google route geometry er vistuð varanlega.
- Public road APIs verða aðeins opin þegar weather-mode er `all`; annars
  gildir fyrra auth/feature gate.
- Claude Code þarf sérstaklega að rýna að upstream validation/allowlists og
  caching séu næg gegn misnotkun/kostnaði á public `map-proxy`.
- Saved-place merge er add-only fyrir pending public staði og breytir ekki
  fyrirliggjandi notandastað.

## Route intelligence check

- Pakkinn snertir almennt Akstur um allt Ísland, ekki eina route-family.
- `DriveRouteMap`, curated nearest-place fallback og pulse back helpers eru
  provider-neutral þar sem eðlilegt er.
- Google Routes er áfram provider/fallback og raw niðurstöður verða ekki
  canonical Teskeiðargögn.
- Engin ný canonical segment, caution, control point, cache key eða station
  matching regla var stofnuð.
- `IcelandRoadmap.md` þurfti ekki uppfærslu þar sem engri nýrri leiðaþekkingu
  var bætt við; breytingarnar eru UI, session restore og núverandi curated
  place lookup.

## Design.md samræmi

- Mobile-first viðmið: controls með 40 px+ touch targets, engin ný inputs undir
  16 px og engin ný fixed controls sem fara undir browser chrome.
- Navigation aftur úr stöðvaspjaldi varðveitir context og sýnir loader meðan
  leið er endurreiknuð.
- Hidden-card banner gefur skýra empty/overflow skýringu í stað overlap.
- A−/A+ og filter-pillur endurnýta núverandi Teskeið visual language.
- Allur nýr sýnilegur texti er í bæði `messages/is.json` og `messages/en.json`.

## Localhost checks for Stebbi

### A. Public Spákort

State: óinnskráður notandi, nýr tab.

1. Opna `/auth-mvp/vedrid/road-map-prototype`.
2. Staðfesta að default stöðvar birtist ef ekkert gilt session draft er til.
3. Breyta stöðvum og veðurvæntingum, skipta milli Spákorts/Aksturs/Gagna.
4. Endurhlaða sama tab.
   - Vænt: session-stöðvar, staðir, values og textastærð haldast innan
     skilgreinds session; save CTA birtist aðeins eftir raunverulega breytingu.
5. Bíða eftir save prompt og prófa bæði tímabundið áfram og innskráningar-CTA.

### B. Public staðir og innskráning

1. Sem public notandi bæta við tveimur stöðum í Akstur.
2. Skipta tabs og endurhlaða.
   - Vænt: staðir haldast í sama browser tab.
3. Skrá inn sem notandi sem á fyrir vistaða staði.
   - Vænt: fyrirliggjandi staðir eru óbreyttir; aðeins nýir public staðir
     bætast við; engin duplicate/overwrite.

Ekki prófa með production notendagögnum eða breyta Supabase handvirkt.

### C. Akstursútreikningur

1. Prófa Höfðavík → Akranes og venjulega Reykjavík → Akureyri leið.
2. Staðfesta loader-textana í réttri röð.
3. Prófa gamla vistaða staðinn Melás 8.
   - Vænt: staðfest hnit eru notuð beint.
4. Ef provider finnur ekki leið:
   - Vænt: nálægur curated staður innan 30 km er boðinn, aldrei valinn
     sjálfkrafa.
5. Fylgjast með console:
   - engin `map_not_ready`;
   - engin 401 frá road-intelligence APIs þegar weather-mode er `all`.

### D. Lítið og stórt Aksturskort

1. Staðfesta að sama Carto/OSM kort, leið og Veðurstofupunktar séu á báðum.
2. Litla kortið:
   - filtera „Innan marka“ og aðrar stöður;
   - smella á punkt;
   - kortið zoomar ekki út;
   - „Valinn punktur“ spjald birtist;
   - engin innskráning/navigation;
   - bíl-pillur sýna aksturstíma, ekki stöðvarheiti.
3. Stóra kortið:
   - vegakerfi og vegfærð sýnast í Akstri;
   - þau leka ekki inn á Spákort;
   - neðri hide-controls/legend/counts eru farin.

### E. Stöðvaspjöld og back

1. Smella á Veðurstofupunkt á stóra Aksturskortinu.
2. Skoða canonical Veðurstofuspjald og console.
   - Vænt: engin hydration mismatch; `17,7 km` hefur sama format í SSR/client.
3. Smella „Til baka í akstur“.
   - Vænt: sama Frá/Til, hnit, thresholds, leið og Kort/Gögn context kemur
     aftur eftir sjálfvirkan endurútreikning.
4. Endurtaka með innbyggðu browser/síma-back.
5. Endurtaka allt með Vegagerðarpunkti.

### F. Spáspjaldaröðun

1. Velja fleiri stöðvar en komast þægilega fyrir.
2. Prófa pan, zoom og A−/A+ við 360 px, 390 px, 460 px, 530 px og desktop.
3. Staðfesta:
   - ekkert spáspjald fer yfir/undir annað eða UI;
   - spjöld eru eins nálægt punkti og mögulegt er;
   - falin spjöld eru talin í banner;
   - banner leggur til útþysjun eða færri stöðvar;
   - connector snertir spjald eða staðarheiti, sérstaklega Vestmannaeyjar.

### G. Regression og console

1. Prófa íslensku og ensku.
2. Prófa public og innskráðan notanda.
3. Prófa keyboard focus á inputs, pills, A−/A+ og punktum.
4. Staðfesta ekkert lárétt overflow eða mobile input zoom.
5. Console má sýna development CSS preload warnings, en ekki:
   - hydration mismatch;
   - maximum update depth;
   - `map_not_ready`;
   - óvænt 401;
   - runtime TypeError.

## Release sequencing fyrir Claude Code

1. Rýna diff og þetta handoff.
2. Staðfesta að `.obsidian/workspace.json` sé útilokað.
3. Keyra að lágmarki:
   - `npm.cmd run type-check`
   - `npm.cmd run test:run`
   - `npm.cmd run build`
   - `git diff --check`
4. Fá/staðfesta skýrt útgáfuleyfi Stebba (`Workflow` eða bein fyrirmæli).
5. Commit-a afmarkaðan verkefnispakka.
6. Push-a.
7. Fylgjast með Vercel þar til deployment er Ready og build grænt.
8. Ef Vercel mistekst: stoppa og tilkynna nákvæma villu; ekki lýsa útgáfu
   lokið.
9. Skila final handoff með commit SHA, push niðurstöðu, Vercel URL/status og
   þeim localhost/production smoke checks sem voru framkvæmd.

## Óvissa / þarf að staðfesta

- MapLibre collision/connector geometry og browser back eru ekki fullprófanleg
  með núverandi Vitest/JSDOM suite.
- Public map proxy getur aukið upstream umferð; Claude Code þarf að meta
  validation/cache/rate-limit áður en release er samþykkt.
- Ekki er ljóst hvort Stebbi vill commit-a allar v038-v053 handoff-skrár með
  feature diffi; fylgja skal repo-venju eða spyrja ef hún er óljós.

Confidence: hátt fyrir compile/types/tests/build; miðlungs-hátt fyrir fulla
mobile MapLibre UX þar til localhost/browser checklist Stebba er lokið.
