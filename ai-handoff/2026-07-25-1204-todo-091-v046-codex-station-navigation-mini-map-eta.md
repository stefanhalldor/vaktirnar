# TODO-091 — Réttar stöðvasíður og aksturstímar á litla kortinu

Created: 2026-07-25 12:04  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti að Codex:

- léti Veðurstofu- og Vegagerðarpunkta opna réttu fyrirliggjandi stöðvasíðurnar
- varðveitti leið og rétt Aksturs-view við „Til baka í akstur“
- kæmi í veg fyrir að litla kortið þysjaðist við punktasmell
- sýndi bíl og aksturstíma í pillum litla kortsins, ekki stöðvarheiti
- breytti Vegagerðarloader-textanum í „Sæki gögn frá Vegagerðinni á þessum leiðum...“

Ekki var samþykkt commit, push, deploy, migration, Supabase eða production-breyting.

## Framkvæmt

- Veðurstofupunktar á stóra kortinu fara nú beint á:
  `/auth-mvp/vedrid/puls/stod/[stationId]`
- Vegagerðarpunktar á stóra kortinu fara nú beint á:
  `/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]`
- Bæði DOM-marker og MapLibre circle-layer click nota sama navigation-flæði.
- Litla kortið opnar sömu Veðurstofustöðvasíðu við punktasmell.
- Fyrir navigation er leiðin vistuð í núverandi session route-snapshot.
- `returnTo` inniheldur `context=route`, rétt `view` (`map` eða `information`) og `restoreRoute=1`.
- Fyrra innbyggða station-detail overlayið og auka Vegagerðarspjaldið í bottom-strip voru fjarlægð; þau voru röngu spjöldin/röng staðsetning.
- Litla kortið geymir station click callback í ref. Callback-breyting endurstofnar því ekki MapLibre eða keyrir `fitBounds` aftur.
- Litla kortið sýnir `🚗 HH:mm` fyrir áætlaðan tíma við punkt í stað stöðvarnafns.
- Stöðvarheitið birtist á réttu stöðvasíðunni sem opnast.
- Loader-textinn var uppfærður á íslensku og ensku.

## Design.md

Navigation nýtir nú canonical pulse-stöðvasíður og fyrirliggjandi route `loading.tsx`, í stað tvítekinna innbyggðra spjalda. `returnTo` gefur sýnilega og fyrirsjáanlega back-navigation og litla kortið heldur stöðugu viewporti.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `lib/weather/pulseTarget.ts`
- `lib/weather/pulseBack.ts`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/DriveRouteMap.tsx`
- báðir pulse station clients og routes

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/DriveRouteMap.tsx`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Checks

- `npm.cmd run type-check` — exit 0
- `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/pulseBack.test.ts` — exit 0, 33/33 próf
- JSON parse á báðum message-skrám — exit 0
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending viðvaranir

Enginn dev server, browserpróf, commit, push, deploy, SQL eða migration var framkvæmd.

## Route intelligence check

- Engin route-family, canonical segment, provider matching-regla eða route calculation breyttist.
- Virk route geometry er aðeins geymd í fyrirliggjandi session snapshot til að skila notandanum aftur í eigið flæði.
- Engin nákvæm ferð eða heimilisfang er sett í URL eða varanlega persistence.
- `IcelandRoadmap.md` þurfti ekki uppfærslu; þetta er navigation/presentation lagfæring.

## Localhost checks for Stebbi

1. Reikna leið á `/auth-mvp/vedrid/road-map-prototype?context=route&view=information`.
2. Smella á Veðurstofupunkt á litla kortinu:
   - kortið má ekki þysjast eða hoppa áður en navigation hefst
   - rétt Veðurstofustöðvasíða á að opnast
   - pillan á kortinu á að hafa sýnt `🚗` og tíma, ekki stöðvarheiti
3. Ýta á „Til baka í akstur“:
   - leiðin á að vera varðveitt
   - notandinn á að koma aftur í gögnin/information view
4. Opna stóra kortið og smella á Veðurstofupunkt:
   - rétt Veðurstofustöðvasíða opnast
   - back skilar á kortið með sömu leið
5. Smella á Vegagerðarpunkt á stóra kortinu:
   - rétt Vegagerðarstöðvasíða opnast
   - back skilar á kortið með sömu leið
6. Staðfesta að gamla innbyggða station overlayið og auka Vegagerðarspjaldið neðst birtist ekki.
7. Reikna nýja leið og staðfesta nýja loader-textann.
8. Prófa mobile 360/390/460 px og passa að 🚗-pillur overlap-i ekki óhóflega og navigation virki með einum smelli.

Engin Supabase-, auth-, RLS- eða production-gagnabreyting fylgir.

## Áhætta / næsta skref

- Navigation notar `window.location.href`; route-level canonical loader tekur við þegar nýja síðan hleðst.
- Marker-density fyrir 🚗-pillur þarf sjónrænt localhost-próf á leið með mörgum stöðvum.
- End-to-end route snapshot/restore er staðfest með unit-prófum á back URL parser en ekki browserprófi í þessum hraða áfanga.

Confidence: high í navigation target og snapshot/back contract; medium-high í sjónrænu marker-layouti þar til Stebbi hefur prófað localhost.
