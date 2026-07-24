# Handoff — TODO #91 route-map UI simplification

Created: 2026-07-24 08:59  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: #91 — Veður: basemap refresh og kortapússun

## Skilningur á samþykki

Stebbi samþykkti að Codex einfaldaði nýja akstursviðmótið í átt að gamla
Ferðalaginu:

- hreinna kort með punktum í stað stórra veðurspjalda;
- lítill bíll og ETA við punkta þar sem ETA er tiltækt;
- lítið kortaspjald við smell á punkt;
- samanbrjótanlegt ferðadetail undir brottfarartíma-scrubber;
- endurnýtt summary-, mest krefjandi/valið punkt- og spápunktaviðmót úr gamla
  Ferðalaginu.

Samþykkið fól í sér kóða-, þýðinga-, prófa- og handoff-breytingar. Það fól ekki
í sér commit, push, deploy, migration, Supabase-, env-, secrets-, billing- eða
production-breytingar.

## Plan áfangans

1. Varðveita fyrirliggjandi ócommittaðar breytingar.
2. Einfalda DOM-markerana á route-kortinu.
3. Gera sampled MET/Yr-spápunktana aftur sýnilega sem litla punkta.
4. Tengja punktaval á korti við detail-svæði.
5. Geyma `DeterministicResult` í route-client state meðan leið er virk.
6. Endurnýta `RouteWeatherPointDetailCard` og `buildPointSummary` í nýju
   samanbrjótanlegu ferðadetaili.
7. Keyra TypeScript, afmörkuð próf og production build.

## Hvað var raunverulega gert

### Kort

- Stóru route-station DOM-spjöldin voru tekin af kortinu.
- Route-station marker sýnir nú:
  - lítinn status-punkt;
  - `🚗 HH:mm` þar sem forecast-station hefur ETA.
- Smellur á provider-station heldur áfram að opna litla MapLibre popup-spjaldið.
- Sampled MET/Yr route-punktar eru aftur sýnilegir sem einfaldir litaðir
  circle-punktar.
- Smellur á MET/Yr punkt:
  - velur punktinn fyrir ferðadetail;
  - opnar lítið popup með punktnúmeri, ETA og vindi;
  - opnar ekki stóru ferðaskúffuna sjálfkrafa.

### Ferðadetail undir scrubber

- Nýr samanbrjótanlegur control:
  `Sjá nánar um ferðina m.v. þennan brottfarartíma`.
- Þegar hann er opinn sýnir hann:
  1. summary fyrir virkan brottfarartíma;
  2. valinn spápunkt ef smellt var á punkt á kortinu;
  3. annars mest krefjandi punkt sjálfgefið;
  4. alla aðra spápunkta þar fyrir neðan.
- Punktaspjöldin endurnýta núverandi:
  - `RouteWeatherPointDetailCard`;
  - `buildPointSummary`;
  - `WindStatusBadge`;
  - gömlu ferðaveður-þýðingarlyklana.
- Val á brottfarartíma í scrubber uppfærir candidate sem detail-spjöldin lesa.
- Route-svæðið og innri detail-listinn hafa afmarkaða hæð og
  `overflow-y-auto`/`overscroll-contain` fyrir mobile.

### Textar

Nýir íslenskir og enskir lyklar voru settir í messages:

- titill ferðadetails;
- opna ferðaupplýsingar;
- loka ferðaupplýsingum.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `TODO.md`
- `ai-handoff/README.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/RouteWeatherPointDetailCard.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `components/weather/DepartureHeatmap.tsx`
- `lib/weather/types.ts`
- `lib/road-intelligence/travelBridgeMapData.ts`
- `lib/road-intelligence/routeSlotStatuses.ts`
- `messages/is.json`
- `messages/en.json`

## Skrár sem Codex breytti

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteTravelDetails.tsx` (ný)
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-0859-todo-091-v001-codex-route-map-ui-simplification.md`

## Fyrirliggjandi breytingar sem Codex varðveitti

Þessar breytingar voru þegar ócommittaðar áður en Codex hóf framkvæmd:

- `.obsidian/workspace.json`
- `TODO.md` (þar með talið #91 sem Codex hafði skráð fyrr í samtalinu)
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`

Fyrirliggjandi breytingar í `RoadMapPrototypeMap.tsx` og
`WeatherChasePanel.tsx` tengdust weather-chase preference/default hegðun. Codex
afturkallaði þær ekki.

## Skipanir sem voru keyrðar

1. `npm run type-check`
   - Exit code: 0
2. `npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/road-intelligence-travel-bridge-map-data.test.ts lib/__tests__/road-intelligence-route-slot-statuses.test.ts`
   - Exit code: 0
   - 3 test files passed
   - 127 tests passed
   - 5 tests skipped
3. `npm run build`
   - Exit code: 0
   - Next.js production build compiled and generated successfully
4. `git diff --check`
   - Exit code: 0
   - Engar whitespace-villur
   - Aðeins CRLF-viðvaranir vegna Windows working tree

## Hvað mistókst eða var sleppt

- Engin skipun mistókst í lokasannprófun.
- Dev server var ekki ræstur samkvæmt verkefnisreglum.
- Browser-/localhost-próf voru ekki framkvæmd.
- Engin ný sértæk React component-test var skrifuð fyrir opna/loka hegðun
  skúffunnar. Type-check, domain-próf og production build eru græn, en sjónræn
  hegðun þarf manual staðfestingu.
- Tímainterpolation milli 3 klst. Veðurstofuspáa var ekki framkvæmd. Sú umræða
  er aðskilin frá þessu UI-scope.
- Gamla Ferðalag-summaryið var ekki flutt línu fyrir línu úr
  `FerdalagidClient.tsx`, því það er stór inline samsetning. Nýja summaryið
  endurnýtir sömu gögn, status badge og formatting, en punktaspjöldin endurnýta
  gamla componentinn beint.

## Ákvarðanir Codex

- Kort og detail voru aðskilin:
  - kortið gefur yfirsýn;
  - popup gefur litla staðbundna skýringu;
  - samanbrjótanlega svæðið geymir ítarleg ferðagögn.
- Smellur á punkt opnar ekki stóru detail-skúffuna sjálfkrafa, svo kortið hoppar
  ekki eða hylst þegar notandi er aðeins að skoða punkt.
- Mest krefjandi punktur er sjálfgefinn. Valinn MET/Yr-spápunktur tekur sæti hans
  ef notandi hefur smellt á punkt.
- Provider-station smellur velur ekki MET/Yr detail-punkt, því entities hafa ekki
  örugga 1:1 tengingu. Popup provider-stöðvarinnar opnast samt.
- Vegagerðin-current punktar hafa ekki framtíðar-ETA og sýna því ekki bíl.
  Veðurstofu forecast-punktar sýna bíl/ETA þegar gildið er til.

## Design.md samræmi

- Mobile-first hæðarmörk og innri scroll voru sett á route/detail-svæðið.
- Touch target ferðadetail-takkans er minnst 44 px.
- Enginn nýr hardcode-aður notendatexti var settur í React component.
- Nýtt UI notar canonical card/border/background/primary tokens.
- Engin skrautleg eða stöðug animation var bætt við.
- Kortið verður sjónrænt rólegra með punktum í stað margra stórra spjalda.

## Route intelligence check

- Breytingin snertir aðeins framsetningu route-punkta og val á detail-punkti.
- Routing provider, route geometry, canonical segments, route calculation og
  provider matching breyttust ekki.
- Engin ný route-þekking var búin til og því var `IcelandRoadmap.md` ekki
  uppfært.
- Engin route query, heimilisföng eða notendagögn voru nýlega geymd.

## Áhætta sem er enn til staðar

1. **Mobile hæð og tvöfaldur scroll**
   - Route-bottom-sheet hefur ytri `max-h-[82vh]` og detail-listinn innri
     `max-h-[58vh]`.
   - Þetta kemur í veg fyrir að sheet fari út fyrir viewport, en þarf að prófa á
     iOS/Safari til að tryggja að tvöfaldur scroll sé ekki óþægilegur.
2. **Marker-density**
   - MET/Yr punktar, Veðurstofupunktar og Vegagerðarpunktar geta verið sýnilegir
     saman.
   - Stóru spjöldin eru farin, en punktamagn þarf samt sjónræna staðfestingu á
     löngum leiðum.
3. **Valinn provider-punktur vs valinn MET/Yr-punktur**
   - Aðeins MET/Yr circle-punktur velur detail-spjald.
   - Provider-station hefur sitt popup en er ekki map-að í gamla
     `RouteWeatherPointDetailCard`.
4. **Summary parity**
   - Nýja summaryið er þéttari samsetning en gamla inline summaryið.
   - Ef Stebbi vill nákvæma línu-fyrir-línu parity þarf næsti áfangi að extract-a
     gamla summaryið í shared component í stað þess að tvítaka það.
5. **Engin browser staðfesting**
   - MapLibre event, popup placement, sheet overlay og real-data rendering þurfa
     localhost-próf.

## Localhost checks for Stebbi

### Forsendur

- Stebbi keyrir dev server sjálfur.
- Nota innskráðan notanda með aðgang að nýja road-map prototype.
- Nota leið sem skilar bæði Veðurstofu- og Vegagerðarpunktum, t.d. langa
  landsleið sem Stebbi hefur notað í samanburðinum.
- Engin Supabase-, auth-, billing-, secrets- eða production-breyting er hluti af
  prófinu.

### Slóð

- Opna `/auth-mvp/vedrid/road-map-prototype`.

### Desktop

1. Velja `Akstur`.
2. Reikna sömu leið og notuð var í skjámyndum 2026-07-24.
3. Vænt:
   - stóru veðurspjöldin sjást ekki lengur yfir allt kortið;
   - litlir status-punktar sjást;
   - Veðurstofupunktar með ETA sýna lítinn bíl og tíma;
   - Vegagerðin-current punktar mega vera án bíls.
4. Smella á Veðurstofu- og Vegagerðarpunkt.
5. Vænt:
   - lítið popup opnast;
   - kortið fyllist ekki aftur af öllum spjöldunum.
6. Smella á einfaldan MET/Yr-spápunkt.
7. Vænt:
   - lítið popup sýnir punktnúmer, ETA og vind ef gögn eru til;
   - ferðaskúffan opnast ekki sjálfkrafa.
8. Opna `Sjá nánar um ferðina m.v. þennan brottfarartíma`.
9. Vænt:
   - summary birtist efst;
   - punkturinn sem var valinn á kortinu birtist næst;
   - allir aðrir spápunktar birtast þar fyrir neðan.
10. Loka route, reikna hana aftur og opna detail án þess að velja punkt.
11. Vænt:
   - mest krefjandi punkturinn er sjálfgefinn.
12. Velja annan brottfarartíma í scrubber.
13. Vænt:
   - summary og punktaspjöld lesa virkan candidate/brottfarartíma;
   - engin gömul leið eða fyrra punktaval lekur yfir.

### Mobile

1. Endurtaka flæðið við 360, 390 og 460 px viewport.
2. Prófa bæði lokaða og opna brottfararspá og ferðadetail.
3. Vænt:
   - enginn horizontal overflow;
   - kortið er enn sýnilegt þegar detail er lokað;
   - route-bottom-sheet fer ekki út fyrir viewport;
   - hægt er að scrolla niður alla spápunkta;
   - opna/loka takkinn er auðsnertanlegur;
   - popup og sheet skarast ekki þannig að hvorugt sé nothæft.
4. Prófa Safari/iOS ef tiltækt.
5. Vænt:
   - scroll festist ekki milli innra details og ytra sheets;
   - browser chrome/safe area hylur ekki síðustu spjöldin.

### Helstu regressions

- Route-lína má ekki hverfa.
- Route options/surface choices mega ekki hætta að virka.
- Núna/forecast skipting má ekki sýna ranga provider-stöð.
- Status-filterar mega ekki fela rangan flokk.
- Punktaval skal hreinsast þegar leið er hreinsuð eða endurreiknuð.
- Weather chase preference-breytingarnar sem voru fyrir í worktree mega ekki
  regressa.

## Tillaga að næsta skrefi

1. Stebbi framkvæmir localhost checks hér að ofan og tekur mobile/desktop
   skjáskot.
2. Claude Code eða Codex lagar aðeins staðfest sjónræn atriði, sérstaklega:
   - sheet-hæð/tvöfaldan scroll;
   - marker-density;
   - hvort bíll/ETA eigi að vera við fleiri punktategundir;
   - hvort gamla summaryið eigi að extract-a nákvæmlega í shared component.
3. Að því loknu er rétt að skrifa sér component-próf fyrir:
   - default mest krefjandi punkt;
   - valinn punkt;
   - candidate skipti;
   - opna/loka detail.

## Spurningar fyrir næstu rýni

1. Er rétt að sýna sampled MET/Yr punkta samhliða provider-stöðvum, eða á kortið
   aðeins að sýna eina punktategund í einu?
2. Á smellur á provider-stöð að reyna að velja næsta MET/Yr detail-spjald, eða á
   provider-popup að vera alveg aðskilið?
3. Er þétta summaryið nægilega líkt gamla Ferðalaginu, eða á að extract-a gamla
   summaryið línu fyrir línu í shared component?
4. Á bíll/ETA að sjást við alla forecast-punkta eða aðeins provider-stöðvar þar
   sem ETA er þegar til?

## Supabase / production

- Engin SQL-skrá var skrifuð.
- Engin migration var skrifuð eða keyrð.
- Engin áhrif á gögn, RLS, auth, grants, policies eða functions.
- Engin production-, deploy-, env-, secrets- eða billing-breyting var gerð.
- Ekkert commit eða push var gert.
