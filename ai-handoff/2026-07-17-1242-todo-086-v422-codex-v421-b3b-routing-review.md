# 2026-07-17 12:42 - TODO-086 v422 - Codex review of v421 B3B routing handoff

Created: 2026-07-17 12:42
Timezone: Atlantic/Reykjavik

## Findings

1. **Medium: v421 er rétt vörulega, en þarf harðari framkvæmdarröð til að verða ekki hálf route-migration**

   v421 leggur til að `/vedrid` og `/auth-mvp/vedrid` verði overview, en núverandi síður eru enn beint trip calculator:

   - `app/vedrid/page.tsx:19` skilar `<FerdalagidClient isGuest />`
   - `app/auth-mvp/vedrid/page.tsx:12` skilar `<FerdalagidClient tripEnabled={tripEnabled} />`

   Þetta er rétt átt, en ef Claude Code skiptir þessum routes yfir fyrst og lagar `returnTo`/restore á eftir getur notandi endað á overview þegar hann átti að lenda aftur í ferðalaginu sínu.

   **Fix í handoff:** halda stóra B3B skrefinu, en framkvæma það í innri röð:
   1. bæta við nýjum `/ferdalagid` routes og færa calculator þangað
   2. bæta compatibility redirects/restore
   3. þá fyrst breyta `/vedrid` og `/auth-mvp/vedrid` í overview

2. **Medium: station overview API er enn authenticated + feature-gated**

   Núverandi `app/api/teskeid/weather/vedurstofan/stations/route.ts:21-30` krefst innskráðs notanda og bæði `vedrid` og `elta-vedrid`. Það passar ekki við public `/vedrid` overview þegar Veðurstofan er opin globally.

   v421 nefnir þetta, en framkvæmdin þarf að vera mjög skýr:

   - ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'`: per-user gate
   - annars: public read af product/cache gögnum
   - endpoint má aldrei triggera live fetch
   - endpoint má ekki skila notendagögnum eða raw service-role villum
   - test þarf að ná yfir signed-out, signed-in án provider flaggs og signed-in með provider flaggi

   Þetta er stærsta öryggisatriðið í B3B.

3. **Medium: `returnTo` contract þarf að uppfærast áður en route skipting fer í gegn**

   `lib/weather/pulseBack.ts:25-31` flokkar `/auth-mvp/vedrid` sem trip destination. Eftir B3B verður `/auth-mvp/vedrid` overview, ekki ferðalagið sjálft. Núverandi inline pulse linkar senda enn `returnTo="/auth-mvp/vedrid"` í `components/weather/RouteSelectionStep.tsx:469`.

   **Fix:** `pulseBack`, `loginNext`, inline pulse CTAs og öll restore query þurfa að vita muninn á:

   - overview: `/auth-mvp/vedrid`
   - trip calculator: `/auth-mvp/vedrid/ferdalagid`
   - station explorer compatibility: `/auth-mvp/vedrid/elta-vedrid?...`

   Annars virkar login frá public púlssamhengi ekki nógu vel.

4. **Low: `WEATHER_ELTA_VEDRID_FLAG` er orðið legacy-nafn fyrir product overview**

   `app/api/teskeid/weather/vedurstofan/stations/route.ts:17` og fleiri tests nota enn `WEATHER_ELTA_VEDRID_FLAG`. Það er í lagi að halda því tímabundið sem kill switch fyrir station overview, en v421 ætti að segja skýrt að það sé tímabundið legacy-nafn og ekki nýtt product-heiti.

   Ekki rename-a env núna nema sérstakt plan sé gert. En ekki bæta merkingarlega ruglinu við.

## Overall review

v421 er directionally rétt og tekur loksins nógu stórt vöruskref:

- `/vedrid` verður weather overview, ekki bara route wizard.
- ferðareiknivélin fær eigin slóð.
- overview shell á að verða reusable og provider-hlutlaus.
- compatibility/returnTo er tekið alvarlega.

Ég myndi ekki senda þetta til Claude Code sem “bara framkvæma allt í einni hrinu” án innri gates. Ég myndi senda það sem eitt stærra `Workflow` verkefni, en með kröfu um að Claude Code stoppi ef access-contract eða restore-contract reynist óljóst.

## Revised execution order for Claude Code

### B3B-0 - Preflight og scope guard

Claude Code á fyrst að staðfesta:

- hvaða routes eru nú trip calculator
- hvaða routes eru station overview
- hvaða tests ná yfir `returnTo`, `loginNext`, public weather og station API
- hvort public station endpoint geti lesið aðeins product/cache gögn án user data

Ef eitthvað af þessu er óljóst: stoppa og skila handoff.

### B3B-1 - Reusable overview shell, án route switch fyrst

Extract-a reusable overview component úr núverandi `VedurstofanStationExplorerClient`.

Markmið:

- einn kjarnahlutur fyrir overview kort, station layer, selected station, URL sync og preview
- engin tvítekning milli public og auth overview
- `VedurstofanStationExplorerClient` má verða wrapper tímabundið

Ekki skipta default `/vedrid` routes fyrr en componentinn er kominn.

### B3B-2 - Nýir ferðareiknivélar-routes

Bæta við:

- `/vedrid/ferdalagid`
- `/auth-mvp/vedrid/ferdalagid`

Þeir eiga að nota núverandi `FerdalagidClient`, ekki fork.

Á þessu stigi á gamla `/vedrid` enn að geta virkað eða redirecta örugglega samkvæmt compatibility.

### B3B-3 - Compatibility, restore og pulse returnTo

Áður en `/vedrid` verður overview þarf að laga:

- `lib/weather/pulseBack.ts`
- `lib/auth/loginNext.ts`
- pulse inline `returnTo`
- restore query frá public og auth trip
- gömul `/auth-mvp/vedrid?restore=...` linkahegðun

Lágmark: gamalt trip context má ekki lenda á overview nema það sé vísvitandi CTA frá overview.

### B3B-4 - Switch `/vedrid` og `/auth-mvp/vedrid` í overview

Þegar ofangreint er öruggt:

- public `/vedrid` renderar overview þegar `WEATHER_ENABLED=All`
- authenticated `/auth-mvp/vedrid` renderar auth-aware overview
- CTA fer í rétt `/ferdalagid` route
- landing/home links mega halda áfram að vísa á `/vedrid` og `/auth-mvp/vedrid`

### B3B-5 - Station endpoint access contract

Opna station overview data í samræmi við provider access model:

- per-user gate ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`
- public product/cache read ef breytan er ekki `true`

Sérstaklega passa:

- signed-out public overview
- signed-in án provider flaggs
- signed-in með provider flaggi
- no live fetch
- no user data
- no raw internal errors

### B3B-6 - Tests og handoff

Keyra a.m.k.:

```bash
npm run type-check
npm run test:run -- lib/__tests__/loginNext.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/public-landing.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts
```

Ef einhver test skrá er ekki til eða scriptið tekur ekki við mörgum skrám í einu, Claude Code á að skrá það í handoff og keyra næsta örugga subset.

## Design.md alignment

Þetta snertir layout, navigation og route transitions. `Design.md` segir sérstaklega:

- mobile-first app-upplifun
- engin lárétt overflow eða mobile zoom
- route transitions með loader/pending state
- ekki marketing hero fyrir app-skjá
- reusable components frekar en one-off

B3B ætti því að nota product overview sem raunverulegan app-skjá, ekki landing page. Ný `/ferdalagid` route segments þurfa `loading.tsx` eða að Claude Code rökstyðji af hverju þau geta ekki valdið sýnilegri bið.

## Suggested updated prompt for Claude Code

```text
Workflow

Lestu:
- WORKFLOW.md
- Design.md
- ai-handoff/2026-07-17-1226-todo-086-v421-codex-b3b-vedrid-overview-and-ferdalagid-routing.md
- ai-handoff/2026-07-17-1242-todo-086-v422-codex-v421-b3b-routing-review.md

Markmið: framkvæma B3B sem eitt stærra product-routing skref, en með innri checkpoints.

Framkvæmdarröð:
1. Preflight: staðfestu núverandi routes, station API access, returnTo/restore contract og relevant tests.
2. Extract-a reusable overview shell úr núverandi Veðurstofan station explorer án þess að búa til tvítekna public/auth lausn.
3. Bættu við `/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid` sem nota sama FerdalagidClient.
4. Lagaðu compatibility fyrir old `/vedrid`, `/auth-mvp/vedrid`, `/auth-mvp/vedrid/elta-vedrid?stationId=...`, login `next` og pulse `returnTo`.
5. Breyttu `/vedrid` og `/auth-mvp/vedrid` í overview shell með CTA inn í rétt `/ferdalagid`.
6. Lagaðu station overview API access þannig að Veðurstofan sé public þegar `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` er ekki `true`, en per-user þegar hún er `true`.
7. Keyrðu type-check og relevant tests.
8. Skilaðu handoff strax.

Stoppaðu og skilaðu handoff ef:
- public station endpoint gæti lekið notendagögnum eða raw service-role villum
- ekki er ljóst hvernig restore/returnTo á að varðveita ferðalagið
- breytingin krefst SQL, env, migration, deploy eða production aðgerða
- þú þarft að blanda Vegagerðinni, heatmap/cache eða öðrum framtíðarfasa inn í B3B

Ekki commit-a, push-a, deploya, keyra SQL eða breyta env.
```

## Localhost checks for Stebbi

### Public

1. Opna `/vedrid`.
   - Vænt: overview/kort, ekki ferðareiknivél.
   - Ef Veðurstofan er opin globally, þá sjást Veðurstofustöðvar.
   - Það er skýr CTA í ferðareiknivél.

2. Smella á `Reikna ferðaveðrið`.
   - Vænt: `/vedrid/ferdalagid`.
   - Gamla public ferðaflæðið virkar óbreytt.

3. Opna public pulse login flæði frá stöð.
   - Vænt: eftir innskráningu endar notandi á réttum pulse/trip context, ekki á forsíðu.

### Authenticated án sér provider access

1. Opna `/auth-mvp/heim`.
   - Vænt: Veðrið sést ef `WEATHER_ENABLED=All` eða `Authenticated`.

2. Smella á Veðrið.
   - Vænt: `/auth-mvp/vedrid` overview.

3. Smella á `Reikna ferðaveðrið`.
   - Vænt: `/auth-mvp/vedrid/ferdalagid`.
   - Vistanir/saved places halda áfram að virka þar.

### Authenticated með Veðurstofu access

1. Opna `/auth-mvp/vedrid`.
   - Vænt: overview með Veðurstofustöðvum ef provider er opinn eða user hefur flagg.

2. Velja stöð.
   - Vænt: `stationId` kemur í URL, preview opnast, loka hreinsar val.

3. Opna fullan púls og fara til baka.
   - Vænt: skilar í rétt station eða ferðalag eftir uppruna.

### Compatibility

1. Opna `/auth-mvp/vedrid/elta-vedrid?stationId=<known-id>`.
   - Vænt: virkar áfram eða redirectar á nýtt overview og varðveitir stöð.

2. Prófa gamalt `/auth-mvp/vedrid?restore=1` ef þannig state er til.
   - Vænt: lendir í ferðareiknivél, ekki á tómu overview.

### Mobile

Prófa 390 px:

- ekkert horizontal overflow
- kort og controls passa
- CTA og station preview eru nothæf
- route transitions sýna feedback og líta ekki út eins og dauður hnappur

## Óvissa / þarf að staðfesta

- Ég staðfesti núverandi kóða fyrir helstu routes og station endpoint, en skoðaði ekki allt `FerdalagidClient` restore/session-state flæðið í smáatriðum.
- Ég staðfesti ekki hvort allir tests sem nefndir eru séu til í nákvæmri mynd eða hvort `npm run test:run -- file file` virki með öllum nefndum skrám í einu.
- `git status` sýnir ócommittaðar breytingar og deleted/untracked handoff skrár frá öðrum vinnuhring. Claude Code má ekki revert-a eða hreinsa það sem hluta af B3B.
