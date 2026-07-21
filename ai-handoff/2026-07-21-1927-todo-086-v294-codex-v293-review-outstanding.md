# 2026-07-21 19:27 - todo-086 v294 - Codex: v293 review + outstanding skref 2 og 6

Created: 2026-07-21 19:27
Timezone: Atlantic/Reykjavik

## Plan áfangans

1. Lesa v292/v293 handoff og staðfesta hvað var útistandandi.
2. Rýna v293 breytinguna án þess að snerta ótengdar skrár.
3. Klára útistandandi skref eins langt og öruggt væri:
   - Skref 2: default scrubber fyrir engin route-state.
   - Skref 6: 💬 púlsinn á kortinu.
4. Keyra type-check/build.
5. Skila handoff fyrir Claude Code og Stebba.

## Hvað var raunverulega gert

Codex kláraði v293 útistandandi skrefin í `components/weather/RoadMapPrototypeMap.tsx`.

### Skref 2 - Default scrubber

- Bætti við `WeatherSourceTimeSelector` neðst á RoadMap prototype þegar engin leið er valin.
- Default state notar nú:
  - `Núna` = Vegagerðin current measurements frá `/api/teskeid/weather/vegagerdin/current`.
  - Veðurstofu spátímar = `/api/teskeid/weather/vedurstofan/stations`.
- Bætti við global Veðurstofu overview-layer á MapLibre kortinu:
  - `overview-vedurstofan-stations`
  - virkjast þegar notandi velur Veðurstofu spátíma í scrubber.
- Breytti Vegagerðin overview-layer þannig að litir fylgja sömu `WindDisplayStatus` lógík og `/vedrid`, ekki lengur föstum 7/15/20 m/s mörkum.
- Vegagerðin notar `classifyObservationWindDisplayStatus`, sem þýðir: hviða er notuð þegar hún er til, annars meðalvindur.
- Sama `Einfalt/Nánar` toggle stjórnar bæði default overview og route mode.
- Default overview pillur nota `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES`, eins og `/vedrid`.
- Overview source/layer updates bíða eftir `mapReady`, svo gögn sem koma inn áður en MapLibre source er til glatast ekki.
- Þegar route er virk eru overview layers faldir. Þegar route er hreinsað kemur rétt overview layer aftur miðað við valið `Núna` eða forecast slot.
- Gamla villandi `&lt;7 / 7-15 / 15-20` wind legend var fjarlægt úr default map því litirnir fylgja nú notandavindmörkum. Neðri status-pillur skýra litina.

### Skref 6 - 💬 púlsinn

- Tengdi 💬 takkann við `useConditionsFeedPreview`.
- Bætti `ConditionsFeedPreview` overlay ofan á kortið.
- Overlay notar sömu feed endpoint og `/vedrid`.
- Overlay sýnir close button og badge með nýjum færslum þegar það er lokað.
- `targetHref` fer í rétta Veðurpúls síðu:
  - Vegagerðin: `vegagerdinPulseHref`
  - Veðurstofan: `vedurstofanPulseHref`
- Púls-textar sem búa í `teskeid.vedrid.eltaVedrid` eru lesnir með sér `tPulse` translation hook, svo ekki þurfti að duplicate-a þýðingar í `messages`.

## Skrár sem voru skoðaðar

- `ai-handoff/2026-07-21-1920-todo-086-v292-claude-ui-redesign-confirmed.md`
- `ai-handoff/2026-07-21-1925-todo-086-v293-claude-v292-done-skref1-3-4-5.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/ConditionsFeedPreview.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `lib/weather/useConditionsFeedPreview.ts`
- `lib/weather/windDisplayStatus.ts`
- `lib/weather/providers/vedurstofanStationExplorer.ts`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- `messages/is.json`
- `messages/en.json`
- `AGENTS.md`
- `WORKFLOW.md`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`

Codex bjó líka til þessa handoff-skrá:

- `ai-handoff/2026-07-21-1927-todo-086-v294-codex-v293-review-outstanding.md`

Athugið: `.obsidian/workspace.json` er enn dirty í git status, en Codex snerti hana ekki í þessum áfanga. Hún virðist local/óviðkomandi og ætti ekki að fara með í commit nema Stebbi ákveði það sérstaklega.

## Skipanir sem voru keyrðar

- `git status --short`
  - Exit code: 0
  - Sýndi dirty `.obsidian/workspace.json`, `components/weather/RoadMapPrototypeMap.tsx` og ótrackaðar v291/v292/v293 handoff-skrár.
- `npm run type-check`
  - Exit code: 0
- `git diff --check`
  - Exit code: 0
  - Aðeins CRLF warnings fyrir `.obsidian/workspace.json` og `components/weather/RoadMapPrototypeMap.tsx`.
- `npm run build`
  - Exit code: 0
  - Build tókst.
  - Fyrirliggjandi lint warnings komu fram í öðrum skrám (`app/s/[sessionId]/page.tsx`, `components/landing/Avatar.tsx`, `IcelandOverviewMap.tsx`, `TravelAuditMap.tsx`, `WeatherOverviewClient.tsx`). Engin ný RoadMapPrototype villa.

## Niðurstöður

- TypeScript: grænt.
- Next build: grænt.
- Engar SQL/migration breytingar.
- Engar Supabase writes.
- Engin commit/push/deploy.
- RoadMap prototype hefur nú bæði route-mode scrubber og default overview source/time scrubber.
- 💬 púlsoverlay er ekki lengur hálftengt state, heldur virk UI.

## Ákvarðanir sem Codex tók

- Notaði sama `WeatherSourceTimeSelector` og `/vedrid`, ekki nýjan sérsmíðaðan scrubber.
- Notaði `ConditionsFeedPreview` + `useConditionsFeedPreview`, ekki nýjan feed component.
- Lét RoadMap prototype sækja Veðurstofu overview gögn beint frá núverandi `/api/teskeid/weather/vedurstofan/stations`.
- Bætti við sér Veðurstofu overview MapLibre layer, í stað þess að blanda forecast punktum inn í route-layers.
- Lét route mode fela overview layers, svo route station visibility haldist einangruð.
- Lét default overview fylgja notandavindmörkum úr route form inputs. Ef input er ógilt notar overview fallback `DEFAULT_ROUTE_THRESHOLDS` þar til input er aftur gilt.
- Fjarlægði fasta m/s legendið, því það var orðið ósatt þegar litirnir eru status-based.

## Hvað mistókst eða var sleppt

- Ekki var gert browser/visual próf af Codex, því Stebbi keyrir localhost sjálfur samkvæmt workflow.
- Ekki var útfært full “select station target from chat item on map” þegar smellt er á feed target. Það er sama preview component, með links í púls, en ekki map pan/select.
- Ekki var gerð persistence fyrir `Einfalt/Nánar` í prototype-inu sérstaklega. Það fylgir nú in-memory state í component eins og v293 route-mode gerði.
- Ekki var breytt API-gating, SQL, env eða feature access.

## Áhætta sem er enn til staðar

- Default overview notar nú tvö client fetch köll (`vegagerdin/current` og `vedurstofan/stations`). Þetta er sambærilegt við `/vedrid`, en Claude Code ætti að rýna hvort við viljum sameiginlegan hook til lengri tíma.
- `overviewForecastAnchorMs` notar nú valinn forecast slot eða `Date.now()` í `Núna` mode. Þetta er nóg fyrir forecast-layer rendering þegar slot er valinn, en ekki fullkomin cache-key abstraction.
- Simple mode hegðun fylgir núverandi `/vedrid` lógík. Þar þýðir default `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES` að simple græni hópurinn getur tekið með `innan-marka`, þar sem `nalgast-othaegindi` fellur undir simple green group. Þetta er deliberate reuse, en Claude Code/Stebbi ættu að staðfesta að þetta sé ósk hegðun í RoadMap prototype.
- Bottom strip er nú alltaf sýnilegur í RoadMap prototype. Það fylgir v292 markmiðinu, en þarf visual check á mobile hvort layer controls sitji nógu vel fyrir ofan strip.
- `.obsidian/workspace.json` er dirty og ótengd. Passa sérstaklega í commit.

## Design.md / mobile app-upplifun

- Breytingin heldur kortinu sem primary surface og fær controls í app-líkan bottom strip.
- Inputs halda `text-base` til að forðast mobile zoom.
- Overlay/panel eru absolute innan korts, ekki page-level overflow.
- Texti er stuttur og endurnýtir núverandi Teskeið UI components.
- Engin ný nested cards voru búin til; púlsinn er einfalt overlay með núverandi component.

## Tillaga að næsta skrefi

Claude Code ætti að rýna sérstaklega:

1. Visual/mobile: bottom strip hæð, layer controls staðsetning, 💬 overlay yfir korti.
2. Default overview: hvort Vegagerðin og Veðurstofan layers skipti rétt þegar scrubber er notaður.
3. Filter: hvort simple/detailed pillur fela/sýna rétta punkta í báðum modes.
4. Route regression: reikna route, loka/opna 🚗 panel, velja departure slot, hreinsa route og staðfesta að overview komi aftur.
5. Commit hygiene: sleppa `.obsidian/workspace.json` nema Stebbi samþykki annað.

## Spurningar fyrir Claude Code / Stebba

- Viljum við að RoadMap prototype lesi vistaðan `statusFilterMode` úr user preferences eins og `/vedrid`, eða er in-memory nóg meðan þetta er undir `road-intelligence-v1` flaggi?
- Viljum við að 💬 feed target click pan-i/select-i station á kortinu, eða er “Nánar” linkur nóg í þessu skrefi?
- Á default simple mode að sýna öll græn gildi, eins og núverandi `/vedrid` hópalógík gerir, eða á það að fela `innan-marka` strangar í samræmi við gamla detailed default?

## Fyrir Supabase / SQL / production

- Engin SQL-skrá skrifuð.
- Engin migration keyrð.
- Engin RLS/grants/auth breyting.
- Engin production breyting.
- Engin notendagögn skrifuð.
- Breytingin notar aðeins núverandi read-only API endpoints í client:
  - `/api/teskeid/weather/vegagerdin/current`
  - `/api/teskeid/weather/vedurstofan/stations`
  - `/api/teskeid/weather/vedurpuls/feed-preview`

## Localhost checks for Stebbi

Forsendur:

- Dev server er keyrður af Stebba.
- Stebbi er innskráður sem notandi með `road-intelligence-v1`.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` er í local env.

Prófa:

1. Opna `/auth-mvp/vedrid/road-map-prototype`.
2. Staðfesta að kortið opnist án þess að 🚗 panel sé opinn.
3. Staðfesta að neðst sé `Einfalt/Nánar`, `WeatherSourceTimeSelector` með `Vegagerðin / Núna` og Veðurstofu spátímum, og status-pillur.
4. Í `Núna`:
   - Vegagerðin punktar eiga að sjást.
   - Litur punkta á að fylgja notandavindmörkum og pillum, ekki fasta 7/15/20 legendinu.
   - Smellur á punkt opnar popup með vind/hviðu/hita.
5. Velja Veðurstofu spátíma í scrubber:
   - Vegagerðin overview punktar eiga að hverfa.
   - Veðurstofu punktar eiga að birtast og litast eftir völdum spátíma.
   - Fyrri/næsti örvar í selector eiga að færa valið slot, ekki bara scrolla.
6. Prófa `Einfalt` og `Nánar`:
   - Pillur eiga að breyta sýnilegum punktum á kortinu.
   - `Sýna allt` á að endurheimta alla punkta.
7. Smella á 💬:
   - Overlay með `Fréttir af aðstæðum frá notendum Teskeiðarinnar` á að opnast.
   - Ef ekkert er til sýnir það empty message.
   - Ef færslur eru til á `Nánar` linkur að fara á viðeigandi púls.
8. Smella á 🚗:
   - Vinstri route panel opnast.
   - Reikna t.d. `Akureyri -> Egilsstaðir`.
   - Route mode á að fela overview layers og sýna route layers + DepartureHeatmap.
9. Hreinsa route:
   - Kortið á að fara aftur í default overview.
   - Ef síðast valið var Veðurstofu spátími á Veðurstofu overview layer að koma aftur; ef `Núna`, þá Vegagerðin.

Regression sem þarf að passa:

- Enginn horizontal overflow á mobile.
- Bottom strip má ekki hylja nauðsynleg korta-controls þannig að ekki sé hægt að nota þá.
- Route station labels mega ekki hverfa vegna default overview filter-state.
- `.obsidian/workspace.json` á ekki að fylgja með commit nema það sé meðvitað.
