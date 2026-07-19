# TODO 086 v374 - Codex review of v373 Phase B revised handoff

Created: 2026-07-16 23:17
Timezone: Atlantic/Reykjavik
Author: Codex

Related handoff:
- `2026-07-16-2310-todo-086-v373-claude-phase-b-revised-handoff.md`

## Mjog stutt mannamals-samantekt

V373 aetlar ad setja Vedurstofustodvar sem valfrjalst lag a leidarvalskortid i `/vedrid`: notandi getur kveikt/slokkt a laginu, smellt a stod, sed stutta vedurspa og Vedurpuls fyrir stodina. Thetta a ekki ad breyta met.no/Yr utreikningi, nidurstoduspjoldum, SQL, env eda deployment.

## Findings

1. **Medium: 403 felur ekki toggle med nuverandi prop-modeli**

   V373 segir ad 403 eigi ad fela toggle client-side, en pseudo-code gerir bara `setShowRouteStationLayer(false)` eftir 403 og sendir samt `showVedurstofanLayer={showRouteStationLayer}` og `onToggleVedurstofanLayer` afram i `RouteSelectionStep`. Toggle-render conditionid er svo `(showVedurstofanLayer !== undefined || onToggleVedurstofanLayer)`, sem thydir ad toggle verdur enn synilegt med `false` og notandi getur kveikt aftur og lent i 403-loop.

   Ref: `2026-07-16-2310-todo-086-v373-claude-phase-b-revised-handoff.md:277`, `:310`, `:392`, `:651`

   Fix: halda serstoku state-i eins og `routeStationLayerAllowed` / `vedurstofanLayerForbidden`. Ef endpoint skilar 403 skal ekki bara setja layer off, heldur passa ad `RouteSelectionStep` fai hvorki `showVedurstofanLayer` ne `onToggleVedurstofanLayer`, eda fai `canShowVedurstofanLayerToggle=false`. Baeta test-i/thin integration check sem stadfestir ad 403 feli toggle.

2. **Medium: `routePoints` max 1000 getur latid Vedurstofulag hverfa a longum leidum**

   API validation segir max 1000 route points. Selected Google route geometry fyrir langar leidir getur audveldlega ordid lengri en thad, serstaklega leidur eins og Reykjavik -> Egilsstadir / Isafjordur / Austfirdir. Tha faest 400, client swallow-ar villuna og notandi ser bara engar stodvar, sem litur ut eins og providerinn se tómur.

   Ref: `2026-07-16-2310-todo-086-v373-claude-phase-b-revised-handoff.md:92`, `:276`

   Fix: annadhvort haekka cap-id i eitthvad sem er sannanlega ofar en worst-case route geometry, eda betra: normalisera/downsample-a route geometry server-side/client-side ad medvitadri max lengd fyrir provider matching. Mikilvaegt er ad thad gerist explicit og testad, ekki sem osynilegt 400.

3. **Medium: `returnTo = '/auth-mvp/vedrid'` missir route-selection samhengi**

   V373 segir ad thad se rett ad PULS returni bara a wizard-home af thvi notandi hafi ekki submit-ad enn og "no state to restore". En a route-selection step er samt mikilvaegt state: fra/til, route options, selected route, layer toggle og selected station. Stebbi hefur ad undanförnu verid mjog skyr um ad login/Puls flæði eigi ekki ad henda notanda ur ferdalaginu sem hann var buinn ad stilla upp.

   Ref: `2026-07-16-2310-todo-086-v373-claude-phase-b-revised-handoff.md:456`, `:631`

   Fix: nota sama return-state contract og vid hofum verid ad herda fyrir Vedurpuls: ef route-selection state er serializable i URL/search/local restore, nota thad. Ef thad er ekki enn til, tharf planid ad segja skyrt ad Phase B notar fallback en setja ekki "correct behavior" a ad missa samhengi. Minna fix: `returnTo` eigi ad vera nuverandi canonical weather URL med thvi sem vid getum vardveitt, ekki hardcoded home.

4. **Low: Close button i preview card stenst ekki sjalfkrafa 40px touch target**

   Localhost acceptance krefst 40px touch targets, en pseudo-code close takkinn er bara text-muted `button` med `X size={14}` og engum `h-10 w-10` eda padding. A mobile getur thetta ordid of litid.

   Ref: `2026-07-16-2310-todo-086-v373-claude-phase-b-revised-handoff.md:473`, `:615`, `:654`

   Fix: gera close button minnst `h-10 w-10` eda sambærilegt, med icon centerað. Sama gildir ef toggle pill eda station marker click target verdur of litið.

## What v373 Gets Right

- Scope er nu miklu skyrra en v371: no SQL, no env, no deploy, no MET/Yr calculation changes.
- Provider access er server-side og byggir a base weather access + Vedurstofan provider access.
- Station matching notar provider-neutral `matchProviderPointsToRoute` a valinni route geometry, sem er rett fyrirmynd fyrir Vegagerdina sidar.
- Forecast rows eiga ad nota `ForecastRowLine` og `selectUpcomingRows`, sem heldur okkur a samnyttum weather-card grunni.
- Púls inclusion er nu skyr product decision i Phase B, ekki lengur óljost deferred atridi.

## Recommended Next Step

Ekki senda v373 alveg obreytt sem Workflow. Bidja Claude Code ad uppfaera planid eda taka thessi fjogur atridi beint inn i framkvæmd:

1. Serstakt `layerAllowed`/`layerForbidden` state svo 403 feli toggle i raun.
2. Explicit route geometry cap/downsampling fyrir langar leidir, med test-i.
3. ReturnTo contract sem vardveitir route-selection samhengi eins langt og nuverandi architecture leyfir.
4. 40px close/touch target i station preview.

Eftir thad er scope-id annars skynsamlegt fyrir Phase B.

## Localhost checks for Stebbi

Eftir implementation a Phase B:

1. Opna `/vedrid` sem public notandi med Vedurstofu opna globalt.
2. Velja langa leid, t.d. Reykjavik -> Egilsstadir, og stadfesta ad Vedurstofulag detti ekki thogult ut vegna langrar route geometry.
3. Velja styttri leid, t.d. Reykjavik -> Selfoss, og stadfesta ad "Veðurstofan" toggle birtist, se ON by default, og felur/synir stodvar.
4. Smella a stod og stadfesta ad preview notar sama forecast row look og Vedurstofuspjoldin, og ad Vedurpuls birtist inni i preview.
5. Slokkva a toggle medan preview er opid og stadfesta ad preview lokist.
6. Skipta um route option og stadfesta ad preview lokist og markerar endurnyjist.
7. Smella i Púls-link fra preview, fara i login ef tharft, og stadfesta ad notandi missi ekki route-selection samhengi meira en vid hofum medvitad samþykkt.
8. Prófa notanda sem a ekki Vedurstofuadgang ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`: toggle a alls ekki ad vera synilegt, ekki synilegt slokkt.

Engin SQL, RLS, Vercel env, migration, deployment, secrets eda production-data prófun a ad fara fram fyrir thessa ryni nema Stebbi gefi serstakt leyfi.
