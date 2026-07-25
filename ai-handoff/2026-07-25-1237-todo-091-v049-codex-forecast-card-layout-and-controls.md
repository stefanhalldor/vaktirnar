# TODO-091 — Stíf röðun spáspjalda, banner og A−/A+

Created: 2026-07-25 12:37  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti að Codex framkvæmdi:

- deterministic röðun sem reynir að halda spáspjaldi sem næst raunpunkti
- algjört bann við overlap milli spáspjalda og við merkt UI
- banner með fjölda spjalda sem komast ekki fyrir
- tillögu í banner um útþysjun eða færri stöðvar í Spágögnum
- fjarlægingu MapLibre `+/−`
- `A−/A+` fyrir spáspjaldastærð inni í desktop skýringarspjaldi og efst hægra megin á mobile

Ekki var samþykkt commit, push, deploy, migration, Supabase eða production-breyting.

## Framkvæmt

### Röðun

- Hvert valið spáspjald byrjar við sinn raunpunkt.
- Candidate-staðsetningar eru prófaðar í fastri röð út frá punktinum:
  - upprunaleg staðsetning
  - næstu láréttu/lóðréttu staðsetningar
  - næstu horn
  - annar hringur fjær punktinum
- Skrefin taka mið af raunverulegri breidd og hæð spjaldsins eftir valda textastærð.
- Staðsetning er aðeins samþykkt ef spjaldið:
  - er alveg innan kortsins
  - skarast ekki við áður samþykkt spáspjald
  - skarast ekki við annan stöðvapunkt
  - skarast ekki við nearby-stöðvalabel
  - skarast ekki við merkt UI-svæði
- Ef engin staðsetning er lögleg er spjaldið falið. Raunpunkturinn helst sýnilegur.
- Connector-lína er aðeins sýnd fyrir löglega staðsett spjald.
- Collision keyrir aftur eftir pan, zoom, window-resize og breytingu á textastærð.

### UI-obstacles og banner

- Desktop skýringar-/control-svæði og bottom strip eru merkt sem collision-obstacles.
- Mobile `A−/A+` og hidden-card banner eru einnig obstacles.
- Banner sýnir rétt plural-form:
  - fjölda falinna spáspjalda
  - tillögu um að þysja út
  - tillögu um að fækka stöðvum í Spágögnum
- Þegar banner birtist keyrir collision aftur svo spjöld mega ekki liggja undir honum.
- Banner/talning hreinsast þegar markerar eða spástöðvar eru faldar.

### Controls

- `maplibregl.NavigationControl()` var fjarlægt; `+/−` birtist því ekki lengur.
- Desktop `A−/A+` helst inni í skýringarspjaldinu.
- Nýtt mobile `A−/A+` control er efst hægra megin, með 40+ px touch-targets og aðgengilegum labels.
- Pinch, scroll og önnur native MapLibre zoom-hegðun helst.

## Design.md

Lausnin fylgir mobile-first viðmiðum:

- semantic Teskeið tokens í nýju control/banner UI
- 40+ px mobile touch-targets
- focus-visible og disabled state
- `role="group"` fyrir textastærð og `role="status"` fyrir banner
- engin lárétt overflow hönnuð inn
- loading/navigation breyttist ekki

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Checks

- `npm.cmd run type-check` — exit 0
- JSON parse á báðum message-skrám — exit 0
- `npm.cmd run test:run -- lib/__tests__/weather-chase-preferences-api.test.ts lib/__tests__/drive-journey-panel.test.ts` — exit 0; aðeins núverandi `drive-journey-panel` skrá fannst/keyrði, 3/3 próf
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, browserpróf, commit, push, deploy, SQL eða migration var framkvæmd.

## Prófunargat og áhætta

- Collision er DOM/MapLibre geometry-hegðun og hefur ekki verið browserprófuð af Codex.
- Engin sértæk unit-próf eru komin fyrir candidate-placement eða obstacle-reikning; núverandi function vinnur beint með DOMRects.
- Mjög mörg stór spjöld geta réttilega falist. Bannerinn gerir þá stöðu sýnilega í stað þess að leyfa overlap.
- MapLibre zoom-buttons eru farin líka í Aksturskorti þar sem einn sameiginlegur map instance er notaður; gesture zoom er áfram virkt.

## Route intelligence check

Breytingin snertir aðeins spákorts-presentasjón. Engin leið, route-family, canonical segment, provider, matching-regla, cache eða persistence breyttist. Engin staðsetning eða ferð er vistuð. `IcelandRoadmap.md` þurfti ekki uppfærslu.

## Localhost checks for Stebbi

1. Opna Spákort með 2–4 stöðvum.
2. Staðfesta að hvert spjald sé eins nálægt eigin punkti og lögleg staðsetning leyfir.
3. Bæta við mörgum nálægum stöðvum:
   - engin spáspjöld mega overlap-a
   - ekkert spjald má fara undir desktop skýringarspjald, mobile A-control, bottom strip eða banner
4. Þegar pláss klárast:
   - punktar haldast sýnilegir
   - spjöld sem komast ekki fyrir hverfa
   - banner sýnir réttan fjölda og ráðleggingu
5. Þysja út og staðfesta að fleiri spjöld birtist og talning lækki/hverfi.
6. Fækka stöðvum í Spágögnum og staðfesta sama.
7. Prófa `A−/A+`:
   - desktop inni í skýringarspjaldi
   - mobile efst hægra megin
   - texti/spjöld breytast og collision endurreiknast
8. Staðfesta að MapLibre `+/−` sjáist ekki en pinch/scroll zoom virki.
9. Prófa sérstaklega 360, 390, 460 px og desktop með guide opið/lokað.
10. Prófa íslensku og ensku plural-form bannerins með einum og mörgum földum spjöldum.

Engin Supabase-, auth-, RLS- eða production-gagnabreyting fylgir.

## Næsta skref

Claude Code ætti fyrir útgáfu að browserrýna þétt station-set og helst extract-a candidate-placement í pure helper með DOMRect fixtures ef reikniritinu verður breytt frekar.

Confidence: high í stífu accept/reject reglunum og control placement; medium í raunverulegri sjónrænni nýtni þar til Stebbi hefur prófað mismunandi viewport/stöðvafjölda á localhost.
