# 2026-07-21-2240 TODO-086 v297 Codex handoff - overview DOM marker filter fix

Created: 2026-07-21 22:40  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Related TODO: TODO-086 / Road Intelligence prototype on `/auth-mvp/vedrid/road-map-prototype`

## Plan áfangans

Fixa tvö atriði sem Stebbi sá á nýja kortinu:

1. Þegar scrubberinn er á `Vegagerðin / Núna` á kortið að sýna Vegagerðarstöðvar, ekki Veðurstofupunkta.
2. Status-pillurnar undir kortinu eiga að hafa raunveruleg áhrif á sýnilega punkta á nýja kortinu, þar með þegar aðeins `Hættulegt` er hakað inn.

## Hvað var gert

`components/weather/RoadMapPrototypeMap.tsx` var breytt þannig að overview-veðurpunktar eru nú DOM `maplibregl.Marker` markerar í stað MapLibre `circle` source/layera.

Ástæðan er sú að fyrri útfærslan var farin að lenda í ósamræmi milli UI-state og sýnilegra MapLibre-laga. Screenshot frá Stebba sýndi að status-pillur voru ekki að fela sýnilega punkta, og `Núna` var ekki að sýna Vegagerðar-punkta. Með DOM markerum stjórnar sama React-state beint:

- provider vali: `Núna` sýnir aðeins Vegagerðina
- spátímar sýna aðeins Veðurstofuna
- pilla-filteri: sömu `statusIsVisibleInFilter` lógík og núverandi /vedrid
- litum: `WIND_STATUS_MARKER_COLOR` og `toSimpleWindDisplayStatus`
- marker cleanup á Fast Refresh / unmount

Einnig var gamla `station-markers` layer-id hreinsað sérstaklega út með `LEGACY_OVERVIEW_LAYER_IDS`, svo eldri MapLibre lag geti ekki hangið eftir á localhost og ruglað sýnina.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherOverviewClient.tsx`
- `lib/weather/windDisplayStatus.ts` gegnum `rg`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-21-2240-todo-086-v297-codex-overview-dom-marker-filter-fix.md`

Ath: `.obsidian/workspace.json` var dirty áður/óskylt og var ekki snert af þessari lagfæringu.

## Tæknilegt yfirlit

Í `RoadMapPrototypeMap.tsx`:

- Bætt við `OverviewStationMarker` type og tveimur refs:
  - `overviewVegagerdinMarkersRef`
  - `overviewVedurstofanMarkersRef`
- Bætt við helperum:
  - `removeOverviewMapLayerArtifacts`
  - `clearOverviewMarkerSet`
  - `clearOverviewStationMarkers`
  - `updateOverviewMarkerVisibility`
  - `createOverviewStationDotElement`
  - `openOverviewVegagerdinPopup`
  - `openOverviewVedurstofanPopup`
- Overview effects fyrir Vegagerðina og Veðurstofuna búa nú til DOM markers.
- Gamla MapLibre overview source/layer uppsetningin var fjarlægð úr map init.
- `updateOverviewLayerVisibility` hreinsar nú legacy overview layer/source og stýrir DOM marker visibility.
- `handleOverviewStatusFilterChange`, `handleOverviewModeChange` og `handleRouteStatusFilterModeChange` uppfæra DOM marker visibility strax.
- Cleanup í map effect fjarlægir overview markerana.

## Skipanir sem voru keyrðar

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 Design.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- Nokkur `rg` og `Get-Content` köll á `RoadMapPrototypeMap.tsx` og tengdar weather-skrár.
- `npm run type-check`
- `npm run build`
- `git diff --check`
- `git status --short`
- `git diff --stat`

## Niðurstöður skipana

- `npm run type-check`: PASS þegar keyrt eitt og sér.
- `npm run build`: PASS.
- `git diff --check`: PASS.

Ath: Ein `npm run type-check` keyrsla mistókst þegar hún var keyrð samhliða `npm run build`. Villan var `.next/types/**/*.ts not found`, sem var race vegna þess að buildið var að endurgera `.next`. Sama skipun var keyrð aftur ein og sér eftir build og passaði.

Build var með ESLint warnings. Þau voru ekki blocking og eru að hluta eldri:

- Nokkur pre-existing hook warnings í öðrum weather/app skrám.
- Ný hook warnings í `RoadMapPrototypeMap.tsx` fyrir marker helpera í effects. Þau eru ekki runtime-blocker en Claude Code má gjarnan rýna hvort best sé að setja helperana í `useCallback`, refactor-a marker lifecycle eða skilja þetta eftir í prototype.

## Hvað var ekki gert

- Ekkert commit.
- Ekkert push.
- Enginn deploy.
- Engin SQL/migration keyrð.
- Engar env/secrets/Vercel/Supabase breytingar.
- Ekki prófað í browser af Codex, þar sem Stebbi keyrir localhost/dev server sjálfur.

## Áhætta og atriði fyrir Claude Code að rýna

1. DOM markers fyrir overview eru einfaldari og líklega réttari núna, en ekki endanleg long-term vector-layer lausn.
2. Það þarf að staðfesta í browser að `/api/teskeid/weather/vegagerdin/current` sé örugglega sótt á prototype síðunni. Ef það sést ekki í terminal/Network eftir hard refresh, er næsta vandamál data-load/auth/cache frekar en marker rendering.
3. Hook dependency warnings í `RoadMapPrototypeMap.tsx` eru ekki build blocker en þarf að ákveða hvort hreinsa fyrir release.
4. Popup textar eru enn að hluta hardcoded eins og áður var í prototype. Þetta er ekki ideal miðað við `Design.md`/i18n reglur, en þessi áfangi var hotfix á virkni.

## Route intelligence check

- Snertir Road Intelligence prototype kortið og overview weather marker rendering.
- Engin ný route-gögn eru geymd.
- Engin Google-specific gögn bætt við.
- Lausnin er provider-neutral að því leyti að marker lifecycle styður bæði Vegagerðina og Veðurstofuna, en markerarnir eru enn UI-local í `RoadMapPrototypeMap.tsx`.
- `IcelandRoadmap.md` var ekki uppfært, því þetta er ekki ný route-domain regla heldur UI rendering/filter fix.

## Design.md check

- Breytingin heldur mobile-first app-yfirborði óbreyttu.
- Markerar eru `button` element með `aria-label`, `title`, og smelltan popup.
- Touch target er sjónrænt lítill punktur eins og kortapunktar almennt; þetta er sambærilegt við núverandi kortamynstur, en framtíðarútgáfa mætti bæta stærra hit-area.
- Engin ný card/layout/navigation breyting.
- Enginn nýr route, loader eða form state.

## Localhost checks for Stebbi

Opna:

`http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

Gera helst hard refresh fyrst, eða opna í nýjum tab, til að tryggja að Fast Refresh haldi ekki í gamalt MapLibre instance.

Próf 1 - Vegagerðin Núna:

1. Velja `Vegagerðin / Núna` í scrubber.
2. Búast við að sjá marga Vegagerðarstöðvapunkta á kortinu.
3. Punktarnir eiga að lita sig eftir núverandi Vegagerðargögnum og notandamörkum.
4. Í Network/terminal ætti að sjást kall á `/api/teskeid/weather/vegagerdin/current` eftir load/hard refresh.

Próf 2 - Status-pillur:

1. Vera í `Einfalt`.
2. Haka aðeins inn `Hættulegt`.
3. Kortið á þá aðeins að sýna rauða/hættulega hópinn, ekki græna eða appelsínugula punkta.
4. Smella á `Sýna allt` og staðfesta að allir virkir provider-punktar komi aftur.
5. Skipta í `Nánar` og prófa sömu síun með ítarlegri pillum.

Próf 3 - Provider skipti:

1. Velja `Vegagerðin / Núna`: aðeins Vegagerðar núgildi.
2. Velja næsta Veðurstofu spátíma: aðeins Veðurstofuspápunktar.
3. Fara aftur í `Núna`: Veðurstofupunktar hverfa og Vegagerðar-punktar birtast aftur.

Próf 4 - Leið:

1. Reikna leið, t.d. Akranes -> Akureyri.
2. Staðfesta að global overview punktar hverfi þegar route er virk.
3. Ýta á `Hreinsa` og staðfesta að overview punktar komi aftur samkvæmt virkri scrubber-stillingu.

Regression að passa:

- Vegagerðar vegakerfi overlay á enn að birtast.
- Route station labels/punktar á leið eiga ekki að brotna.
- Staðarheiti/labels eiga ekki að hverfa þegar route er hreinsuð.
- Pilla-talningar þurfa að vera í samræmi við sýnilega punkta.
- Engin horizontal overflow eða mobile zoom regressions.

## Tillaga að næsta skrefi

Claude Code ætti að rýna diffið og prófa sérstaklega localhost skrefin hér að ofan. Ef allt stenst, er þetta release-candidate undir `road-intelligence-v1` flaggi, með þeim fyrirvara að hook warnings í prototype megi annaðhvort hreinsa eða samþykkja tímabundið.

