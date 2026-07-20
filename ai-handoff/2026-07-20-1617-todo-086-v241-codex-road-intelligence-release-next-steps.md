# Codex Handoff: Release-mat og Road Intelligence næstu skref

Created: 2026-07-20 16:17
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Strategy + release handoff for Claude Code
Relevant TODO: 086

## Samhengi

Stebbi er að endurmeta hvort `Viðkomustaður` í `/vedrid/ferdalagid` sé rétta næsta skrefið. Eftir yfirferð á:

- `2026-07-20-1540-todo-086-v239-claude-v237-phase-a-c-d-done-prerelease`
- `2026-07-20-1601-todo-086-v240-codex-v239-prerelease-review`
- `2026-07-20-0845-todo-086-v222-codex-ferdalagid-waypoint-plan`
- viðhengjum frá Stebba um “Iceland Road Intelligence Platform” og “Live Road OS”
- `IcelandRoadmap.md`

er Codex tillagan þessi:

**Setja arbitrary viðkomustað í bið fyrir almenna notendur og byrja frekar strax á eigin Road Intelligence hliðarleið á user-level feature flaggi.**

Þetta þýðir ekki að eyða waypoint hugmyndinni. Hún verður frekar internal/admin/advanced capability síðar. Fyrir venjulega notendur á Teskeið að velja eða mæla með mannamálslegum route alternatives, t.d. `Gegnum Hólmavík`, frekar en að biðja notanda að vita sjálfur hvaða millilending leysir leiðina.

## Release-mat núna

### Ekki gefa v239 út óbreytt

v239 er ekki release-ready óbreytt vegna blocker úr v240:

- Public `Nánar`/`Einfalt` login-save flæðið getur sent notanda aftur á `/vedrid`.
- `/vedrid` notar `menuVariant="public"`, þannig pending preference consume keyrir ekki og DB-save getur aldrei gerst.
- LocalStorage getur látið þetta líta út fyrir að virka í sama browser, en notandastillingin er ekki örugglega vistuð.

Claude Code þarf fyrst að laga þetta eða taka Phase A breytinguna úr release.

### Tilbúið í útgáfu eftir smá lagfæringu

Eftir að login-save blockerinn er lagaður er eftirfarandi líklega tilbúið:

1. `WeatherWatchersComparison` extraction fyrir `/vedrid/ferdalagid`
   - `FerdalagidClient.tsx` minnkaði og inline comparison logic var fært í reusable component.
   - Þetta virðist build/test-safe.
2. InfoWindow `Nánar` link-litur
   - `IcelandOverviewMap.tsx` notar CSS `--primary` með fallback í stað hardcoded blás litar.
3. Authenticated status-filter-mode persistence
   - Virkar líklega, en þarf að sannreyna handvirkt með logged-in user.

### Ekki tilbúið / á að halda eftir

1. `/vedrid` reuse á `"Fyrir þá sem eru að elta veðrið"`
   - Component var extractað en ekki tengt inn á `/vedrid`.
   - Þetta má vera næsta smááfangi, en ekki lýsa v239 sem fullri klárun á v237.
2. `Viðkomustaður`
   - Setja í bið samkvæmt nýrri stefnu.
   - Ekki byrja á þessu fyrir venjulegan UI nema Stebbi biðji sérstaklega um það aftur.
3. Open data / Road Intelligence production notkun
   - Ekki fullyrða um leyfi, caching eða attribution fyrr en gögnin hafa verið rýnd.

## Immediate fix fyrir release

Claude Code ætti að gera lítinn hotfix á Phase A:

### Vandamál

`components/weather/WeatherOverviewClient.tsx` public path notar:

```ts
window.location.href = `/innskraning?next=${encodeURIComponent(window.location.pathname)}`
```

Á `/vedrid` verður þetta `next=/vedrid`, ekki `/auth-mvp/vedrid`.

### Mælt fix

Nota sömu hugmynd og vindmarka-flowið, en tryggja authenticated return:

- Þegar public notandi velur `Nánar` eða `Einfalt`:
  - setja local UI state og localStorage
  - vista pending mode í sessionStorage
  - redirecta á login með `next=/auth-mvp/vedrid?saveStatusFilterMode=<mode>` eða sambærilegri öruggri leið
- Eftir authenticated return:
  - lesa `saveStatusFilterMode` úr URL eða pending sessionStorage
  - validate-a bara `simple | detailed`
  - PUT-a í `/api/teskeid/weather/preferences/thresholds`
  - hreinsa sessionStorage og URL aðeins eftir að save-attempt hefur farið fram

Mikilvægt:

- Ekki brjóta núverandi `saveDefaults` vindmarka-flow.
- Ekki fjarlægja pending mode áður en network save hefur tekist nema URL fallback sé öruggur.
- Ekki gera anon DB write.

## Ný stefna: Road Intelligence á feature flaggi niður á notanda

Stebbi vill byrja að huga að eigin lausn strax, byggða á fríum/opnum gögnum þar sem hægt er, og keyra hana sem hliðarleið á feature flaggi niður á notanda.

Codex styður þessa stefnu, með varúð:

- Byrja lítið.
- Ekki skipta út Google í production strax.
- Ekki byggja fullkomið kort.
- Byggja fyrst eigin segment/route-intelligence kjarna sem getur keyrt samhliða núverandi Google-backed flow.

### Feature flag

Mælt er með user-level flaggi, t.d.:

- `weather_road_intelligence_v1`
- eða núverandi feature-access naming convention ef það er þegar til í projectinu

Kröfur:

- Flaggið má vera enabled fyrir Stebba/test notendur fyrst.
- Public users sjá ekkert nýtt nema sérstaklega ákveðið.
- Engin production-hegðun breytist fyrir almenna notendur.
- Feature flag á að gate-a bæði UI og server/API behavior ef nýjar API-leiðir verða til.

Claude Code á að skoða núverandi feature-access pattern áður en nýtt flagg er búið til.

## Road Intelligence MVP: hvað á að byggja fyrst

### Ekki byrja á fullu routing engine

Ekki byrja á GraphHopper/Valhalla/OSRM/self-hosted routing strax.

Byrja á provider-neutral intelligence layer ofan á núverandi gögn:

1. `IcelandRouteSegment`
   - typed segment registry í `lib/iceland-routes/`
   - 10-20 hand-curated segmentar
   - dæmi: Hellisheiði, Þrengsli, Öxi, Holtavörðuheiði, Hólmavík/Vestfirðir, Mýrdalssandur
2. `IcelandRouteFamily`
   - mannamálslegar leiðafjölskyldur
   - dæmi: Reykjavík -> Ísafjörður, Reykjavík -> Egilsstaðir, Reykjavík -> Akureyri
3. `IcelandRouteAlternative`
   - curated alternatives sem notandi skilur
   - dæmi: `Gegnum Hólmavík`, `Um Hellisheiði`, `Til að sleppa við Öxi`
4. `IcelandRouteCaution`
   - segment-driven cautions, ekki sérreglur bundnar frá/til parinu einu
   - dæmi: `varasamt með eftirvagn`, `vindnæmt`, `fjallvegur`, `vetraróvissa`
5. Station matching
   - Veðurstofu- og Vegagerðarstöðvar tengjast segmentum/route families
   - route order kemur úr segment order þegar við treystum honum

### Hvernig þetta nýtist strax

Á `/vedrid`:

- Þegar notandi velur `Frá` og `Til`, sýna route alternatives sem Teskeið þekkir.
- Route pillur koma úr eigin route family/alternative grunni, ekki aðeins route-memory.
- Ef route-memory vantar, getum við samt sýnt “known route alternative” og sensible station set úr segment matching.

Á `/vedrid/ferdalagid`:

- Google Routes má áfram reikna nákvæma leið.
- Eftir útreikning má keyra “Route Intelligence Intake” sem þýðir provider route yfir í Teskeiðar segment/caution hugtök.
- Ekki vista raw Google route geometry sem canonical gögn.

## Open data research spike

Áður en opin gögn verða production dependency þarf Claude Code eða sér research-session að staðfesta:

- Hvaða Vegagerðar GIS þjónustur eru opnar og stöðugar.
- Leyfi, attribution og caching rules.
- Hvort gögnin eru ArcGIS REST, GeoJSON, WMS/WMTS/WFS eða annað.
- Uppfærslutíðni og reliability.
- Hvort gögn má geyma í Supabase/PostGIS eða þarf að sækja on-demand/cache-a öðruvísi.
- Sama fyrir Landmælingar Íslands og OSM ef þau verða notuð.

Ekki byggja production behavior á þeirri forsendu að gögn séu “frí” fyrr en þetta hefur verið staðfest.

## Proposed execution plan for Claude Code

### Step 1: Fix release blocker

Laga public status-mode login-save þannig að `/vedrid` public user lendi á authenticated flow og preference vistist í DB.

Keyra:

```bash
npm run type-check
npm run test:run
npm run build
```

Skila stuttu handoffi.

### Step 2: Decide release subset

Ef Step 1 er grænt:

- v239/v240/v241 release subset má innihalda:
  - `WeatherWatchersComparison` extraction á `/ferdalagid`
  - InfoWindow primary-link color
  - lagað status-filter-mode login-save

Ekki innihalda:

- waypoint/viðkomustað
- Road Intelligence behavior fyrir almenna notendur
- `/vedrid` Weather Watchers reuse nema það sé sérstaklega klárað og prófað

### Step 3: Create Road Intelligence feature flag proposal

Búa til plan/handoff, ekki strax framkvæmd nema Stebbi samþykki:

- Heiti flags
- hvaða users fá flaggið
- hvaða UI surface sýnir nýju hliðarleiðina
- hvaða server/API behavior flaggið gate-ar
- hvort SQL þarf
- hvernig rollback er gert

### Step 4: Build tiny flagged Road Intelligence skeleton

Aðeins eftir samþykki:

- new typed domain files under `lib/iceland-routes/` if needed
- no Supabase writes initially if hægt er að byrja static/typed
- no raw Google persistence
- no public UI change without flag
- tests fyrir 3-5 route families

### Step 5: `/vedrid` integration behind flag

Fyrsta UI integration má vera lítil:

- Þegar flagged user velur `Frá`/`Til`, sýna “Teskeið þekkir þessar leiðir” route alternatives.
- Nota station sets úr route family/segments ef route-memory vantar.
- Birta confidence/experimental state skýrt.

## Files likely involved

Current release fix:

- `components/weather/WeatherOverviewClient.tsx`
- possible tests under `lib/__tests__` or component tests

Road Intelligence planning/implementation:

- `IcelandRoadmap.md`
- `lib/iceland-routes/types.ts`
- `lib/iceland-routes/segments.ts`
- `lib/iceland-routes/routeFamilies.ts`
- `lib/iceland-routes/lensResolver.ts`
- `lib/iceland-routes/lensFilter.ts`
- possible new:
  - `lib/iceland-routes/cautions.ts`
  - `lib/iceland-routes/alternatives.ts`
  - `lib/iceland-routes/intake.ts`
  - `lib/iceland-routes/stationMatching.ts`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/RouteMemoryPicker.tsx`
- feature-access files/migrations, if existing pattern requires SQL

## Working tree caution

Current working tree includes:

- `.obsidian/workspace.json` modified
- handoff rename/delete noise around v236
- new handoff files
- code changes from v239
- `components/weather/WeatherWatchersComparison.tsx` untracked

Before any commit, Claude Code should explicitly list what will be included and exclude `.obsidian/workspace.json` unless Stebbi asks otherwise.

## Route Intelligence Check

1. Leiðir/landshlutar: general Iceland route families, especially Vestfirðir/Hólmavík, Öxi, Hellisheiði/Þrengsli, Holtavörðuheiði and Hringvegurinn.
2. Ný þekking á heima í `IcelandRoadmap.md` og `lib/iceland-routes/`, not scattered through UI components.
3. Lausnin á að vera provider-neutral. Google má vera calculation provider/fallback, ekki canonical data owner.
4. Þarf líklega canonical segments, cautions, alternatives, station matching og test fixtures.
5. Privacy: byrja static/typed og aggregate. Ekki geyma user_id, raw addresses, raw Google geometry eða personal route history.
6. Ef opin gögn eru notuð þarf license/caching/attribution rýni áður en production dependency er búin til.
7. Ef `IcelandRoadmap.md` er ekki uppfært í fyrsta fix-skrefi er það eðlilegt, því Step 1 er release blocker, ekki ný route knowledge. Þegar Road Intelligence skeleton byrjar á roadmap/kjarni að uppfærast.

## Design.md check

Fyrir release blocker:

- Login redirect þarf skýrt pending/return behavior.
- Ekki valda route loop eða dauðum button.

Fyrir Road Intelligence hliðarleið:

- Mobile-first.
- Ekki gera venjulega notendur ruglaðri.
- Ekki bæta `Viðkomustaður` inn í main flow nema það sé seinna advanced/admin mode.
- Route alternatives eiga að vera mannamálslegar pillur/cards með stuttum texta.
- Enginn horizontal overflow.
- Controls mega ekki hoppa við loading.
- Feature-flaggað experimental UI þarf að vera augljóst fyrir Stebba/test users en ekki trufla public users.

## Localhost checks for Stebbi

### Release blocker

1. Opna `/vedrid` signed out.
2. Velja `Nánar`.
3. Ljúka innskráningu.
4. Staðfesta að notandi lendir á authenticated weather route, helst `/auth-mvp/vedrid`.
5. Reload.
6. Hreinsa localStorage eða prófa annan browser/device.
7. Staðfesta að `Nánar` kemur úr DB-vistaðri preference, ekki bara localStorage.

Expected:

- Enginn redirect loop.
- Engin 500 villa frá preferences API.
- `Vista sem sjálfgefin vindmörk` virkar enn.

### Release subset

1. Opna `/vedrid/ferdalagid`.
2. Keyra route sem skilar niðurstöðu.
3. Staðfesta að `"Fyrir þá sem eru að elta veðrið"` birtist enn í result.
4. Opna drawer og skipta presetum.
5. Opna `/vedrid`, smella á station marker og staðfesta að `Nánar` link er primary green.

### Road Intelligence feature flag, þegar það kemur

1. Prófa sem user með flaggi og user án flags.
2. User án flags á ekki að sjá neina nýja route-intelligence hliðarleið.
3. Flagged user má sjá experimental route alternatives.
4. Prófa mobile 360-430px: enginn overflow, ekkert zoom, pillur/texti brotna snyrtilega.
5. Prófa route-memory miss: UI má ekki lofa of miklu eða sýna villandi station sets.

## Recommendation

Short term:

1. Fixa status-mode login-save blocker.
2. Gefa út aðeins örugga subsetið.
3. Halda waypoint í bið.

Next:

1. Búa til sérstakt Road Intelligence feature flag plan.
2. Byrja með pínulítinn static/typed route intelligence skeleton í `lib/iceland-routes/`.
3. Nota þetta fyrst sem hliðarleið fyrir Stebba/test users, ekki sem replacement fyrir public routing.

Strategic direction:

Teskeið á ekki að biðja notendur um að vera routing sérfræðingar með viðkomustöðum. Teskeið á sjálft að skilja íslensku leiðirnar og bjóða mannamálslega örugga valkosti.
