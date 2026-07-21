# 2026-07-21 21:57 - todo-086 v296 - Codex: overview weather dots fix

Created: 2026-07-21 21:57
Timezone: Atlantic/Reykjavik

## Plan áfangans

1. Greina af hverju `Núna` á nýja kortinu sýndi ekki Vegagerðar-punkta þótt neðri pillur teldu þá.
2. Greina af hverju Veðurstofu-spá sýndi appelsínugula punkta en ekki rauða.
3. Framkvæma afmarkaða lagfæringu í `RoadMapPrototypeMap.tsx`.
4. Keyra type-check, build og diff-check.
5. Skila handoff fyrir Stebba og Claude Code.

## Greining

Skjámyndirnar sýndu að gögnin voru til:

- `Núna` var með Vegagerðin í scrubber og pillur töldu `Innan marka (167)` og `Óþægilegt (15)`.
- Veðurstofu-spá var með status-pillur og einhverja punkta, en rauði punkturinn birtist ekki.

Þetta benti ekki til API-vanda heldur rendering/filter-vanda í MapLibre.

Codex fann þrjú atriði sem gerðu þetta brothætt:

1. Vegagerðar overview layerinn hét enn generic `station-markers`, arfur úr eldri prototype.
2. Overview filtering var gert með MapLibre `setFilter()` expression, á sama tíma og source-gögnin voru þegar með simple/detailed display status.
3. Punktarnir voru mjög litlir og án sort-key, þannig rauðir punktar gátu týnst undir appelsínugulum/grænum eða undir vegalínum.

## Hvað var gert

Breytt í `components/weather/RoadMapPrototypeMap.tsx`:

- Endurnefndi Vegagerðar overview layer/source úr `station-markers` í `overview-vegagerdin-stations`.
- Uppfærði route-line `insertBefore` svo route línan leggist undir nýja Vegagerðar overview layerinn.
- Færði overview filter-lógík úr MapLibre `setFilter()` yfir í JS source-filter:
  - Vegagerðin source fær aðeins stöðvar sem `statusIsVisibleInFilter(...)` leyfir.
  - Veðurstofan source gerir sama.
  - MapLibre layer filter er hreinsaður með `setFilter(layerId, null)` til að forðast stale eða mispassandi filter.
- Bætti við `windDisplaySortValue()` og `windDisplaySort` property á overview features.
- Setti `circle-sort-key` á bæði overview layer:
  - hættulegt teiknast ofan á óþægilegt
  - óþægilegt ofan á innan marka
- Stækkaði overview punkta með zoom-based radius:
  - zoom 4: 7px
  - zoom 6: 8.5px
  - zoom 8: 10px
- Gerði stroke skýrari:
  - `circle-stroke-width: 2`
  - `circle-opacity: 1`
- Hélt `bringWeatherLayersToFront()` úr v295 og notar það áfram eftir:
  - overview source updates
  - overview visibility changes
  - road-segments load/update
  - initial map layer setup
- Hnit eru áfram normaliseruð með `toFiniteCoordinate()` áður en þau fara í GeoJSON.

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherSourceTimeSelector.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `components/weather/windStatusUi.ts`
- `lib/weather/windDisplayStatus.ts`
- `app/api/teskeid/weather/vegagerdin/current/route.ts`
- `lib/weather/providers/vegagerdinCurrentTypes.ts`
- `Design.md`
- `WORKFLOW.md`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-21-2157-todo-086-v296-codex-overview-weather-dots-fix.md`

Athugið:

- `ai-handoff/2026-07-21-2142-todo-086-v295-codex-vegagerdin-now-dots-fix.md` er enn til frá fyrra skrefi.
- `.obsidian/workspace.json` er dirty en Codex snerti hana ekki. Hún á ekki að fara með í commit nema Stebbi vilji það sérstaklega.

## Skipanir sem voru keyrðar

- `rg ... RoadMapPrototypeMap.tsx`
  - Exit code: 0
- `Get-Content ... RoadMapPrototypeMap.tsx`
  - Exit code: 0
- `Get-Content ... WeatherSourceTimeSelector.tsx`
  - Exit code: 0
- `Get-Content ... windDisplayStatus.ts`
  - Exit code: 0
- `Get-Content ... windStatusUi.ts`
  - Exit code: 0
- `npm run type-check`
  - Exit code: 0
- `git diff --check`
  - Exit code: 0
  - Aðeins CRLF warnings fyrir `.obsidian/workspace.json` og `RoadMapPrototypeMap.tsx`.
- `npm run build`
  - Exit code: 0
  - Build tókst.
  - Fyrirliggjandi warnings komu áfram í ótengdum skrám:
    - `app/s/[sessionId]/page.tsx`
    - `components/landing/Avatar.tsx`
    - `components/weather/IcelandOverviewMap.tsx`
    - `components/weather/TravelAuditMap.tsx`
    - `components/weather/WeatherOverviewClient.tsx`
- `git status --short`
  - Exit code: 0
  - Sýnir `.obsidian/workspace.json`, `components/weather/RoadMapPrototypeMap.tsx`, og nýjar handoff skrár.

## Hvað var ekki gert

- Enginn dev server var ræstur eða endurræstur.
- Engin browser-próf voru keyrð af Codex.
- Engin SQL migration skrifuð eða keyrð.
- Enginn commit.
- Enginn push.
- Enginn deploy.
- Engar env/Vercel/Supabase/production breytingar.

## Ákvarðanir Codex tók

- Overview map filtering á nýja MapLibre kortinu á að vera source-driven í React fyrir þetta skref, ekki MapLibre expression filter.
- Vegagerðar `Núna` layer á að hafa sértækt heiti svo hann ruglist ekki við eldri prototype `station-markers` hugmyndina.
- Punktar þurfa að vera sýnilegir sem notendaupplifun fyrst: stærri, hvítur stroke, full opacity og severity sort-key.
- Simple/detailed mode heldur áfram að nota sömu `statusIsVisibleInFilter()` lógík og pillurnar.

## Áhætta sem er enn til staðar

- Þetta þarf að staðfesta í browser á localhost, sérstaklega þar sem fyrri v295 lagfæring dugði ekki sjónrænt hjá Stebba.
- Ef dev server/hot reload heldur gömlu MapLibre instance lifandi gæti þurft hard reload á síðunni.
- `stationCount` sýnir nú fjölda visible overview features, ekki raw fjölda allra stöðva. Það er viljandi til að passa við kortið, en Claude Code má rýna hvort textinn eigi að segja `sýnilegar stöðvar` seinna.

## Design.md / mobile app-upplifun

Design.md var lesið í þessum vinnuhring. Breytingin:

- bætir læsileika kortsins án nýrra controls
- heldur kortinu sem primary app surface
- bætir samræmi milli pillna og kortapunkta
- bætir touch/click hittability með stærri punktum
- bætir ekki við hardcode-uðum notendatexta

## Route intelligence check

- Snertir `/auth-mvp/vedrid/road-map-prototype`.
- Snertir ekki route matching eða canonical route data.
- Snertir provider-neutral rendering: bæði Vegagerðin overview, Veðurstofan overview og route weather layers eru varin með sameiginlegu layer-order helper mynstri.
- Engin ný leiðaþekking þarf í `IcelandRoadmap.md`.

## Spurningar fyrir Claude Code

1. Staðfestir Claude í browser að `Núna` sýni Vegagerðar-punkta, ekki Veðurstofu-punkta?
2. Staðfestir Claude að rauði Veðurstofu-punkturinn birtist þegar rauð spá er valin?
3. Er radius/stroke of mikið á desktop eða mobile, eða er þetta rétt sem prototype default?
4. Eigum við að færa `bringWeatherLayersToFront()` og `windDisplaySortValue()` síðar í reusable MapLibre/weather utility ef fleiri kort byrja að nota sama mynstur?

## Fyrir Supabase / SQL / production

- Engin SQL.
- Engin RLS breyting.
- Engin auth/grants breyting.
- Engin production breyting.
- Engin notendagögn snert.
- Enginn beinn kostnaður.

## Localhost checks for Stebbi

Forsendur:

- Stebbi keyrir dev server sjálfur.
- Stebbi er innskráður með `road-intelligence-v1`.
- `ROAD_INTELLIGENCE_V1_ENABLED=true` er í local env.

Prófa:

1. Opna `/auth-mvp/vedrid/road-map-prototype`.
2. Gera hard reload ef dev server hefur verið lengi opinn.
3. Velja `Vegagerðin / Núna`.
   - Vænt: Vegagerðar-punktar sjást á kortinu.
   - Vænt: þeir eru grænir/appelsínugulir/rauðir eftir `Núna` vind/hviðu og notandavindmörkum.
   - Vænt: þetta eru ekki Veðurstofu-spápunktar.
4. Smella á `Veðurstofan (spá)` slot sem er rautt í scrubber.
   - Vænt: rauður punktur/punktar sjást á kortinu.
   - Vænt: appelsínugulir punktar sjást líka ef þeir passa filter.
5. Prófa `Einfalt` og `Nánar`.
   - Vænt: punktar og pillur fylgjast að.
6. Prófa `Sýna allt`.
   - Vænt: fleiri punktar birtast, þar með grænir þegar þeir voru faldir.
7. Prófa `Fela vegakerfi` og `Fela vegfærð`.
   - Vænt: veðurpunktar hverfa ekki nema status-filter feli þá.
8. Reikna leið, t.d. `Akranes -> Akureyri`.
   - Vænt: overview punktar felast.
   - Vænt: route weather/station punktar sjást ofan á route/vegkafla.
9. Hreinsa leið.
   - Vænt: overview mode kemur aftur, með réttum provider miðað við valinn scrubber.

Regression sem þarf að passa:

- Enginn horizontal overflow á mobile.
- Bottom strip má ekki fela mikilvæg korta-controls.
- `.obsidian/workspace.json` á ekki að fara í commit nema Stebbi samþykki það sérstaklega.
