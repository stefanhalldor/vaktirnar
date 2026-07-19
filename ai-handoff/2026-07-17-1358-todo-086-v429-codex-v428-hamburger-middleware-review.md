# Codex review: v428 hamburger + middleware diagnosis

Created: 2026-07-17 13:58  
Timezone: Atlantic/Reykjavik  
Source handoff: `2026-07-17-1345-todo-086-v428-claude-hamburger-middleware-diagnosis`

## Findings

1. **Medium: Middleware fix-tillagan ætti að nota `EXACT_PUBLIC_PATHS`, ekki `PUBLIC_PATHS`**  
   Claude greinir rétt að `/api/teskeid/weather/vedurstofan/stations` er ekki public í `middleware.ts` og að óinnskráður `/vedrid` fær því 401 áður en route handlerinn keyrir. En handoffið stingur upp á að bæta pathinu í `PUBLIC_PATHS`. Það array er athugað með `pathname.startsWith(p)` í `middleware.ts:149`, þannig að exact-looking strengur opnar líka prefix-afbrigði eins og `/api/teskeid/weather/vedurstofan/stations-extra` eða `/api/teskeid/weather/vedurstofan/stations/foo`.  
   Réttara fix: bæta nákvæmlega þessu endpointi í `EXACT_PUBLIC_PATHS`, ekki `PUBLIC_PATHS`:
   ```ts
   '/api/teskeid/weather/vedurstofan/stations',
   ```
   og bæta middleware regression test sem staðfestir:
   - óinnskráður `/api/teskeid/weather/vedurstofan/stations` fer í gegn
   - óinnskráður `/api/teskeid/weather/vedurstofan/stations/foo` fær 401
   - óinnskráður `/api/teskeid/weather/vedurstofan/stations-extra` fær 401

2. **Low/process: source handoff timestamp er aftur ósamræmdur filename**  
   Skráin heitir `2026-07-17-1345-...` en inni í henni stendur `Created: 2026-07-17 14:50`. Þetta er ekki product blocker, en við höfum nú séð sama mynstur tvisvar. Claude Code þarf að fylgja `WORKFLOW.md`: keyra tímaskipun rétt áður en handoff er búið til og nota sama tíma í filename og `Created`.

3. **Low: Hamborgarabreytingin lítur scope-rétt út, en þarf localhost UI check**  
   `WeatherOverviewClient` fær `menuVariant`, og public/auth pages senda rétta variant. Þetta virðist ekki brjóta routing eða auth. Samt þarf að skoða sjónrænt að headerinn haldist mobile-first, að back-link + menu í `/auth-mvp/vedrid/elta-vedrid` verði ekki þétt/skrýtið og að menu overlay fari ekki út fyrir viewport.

## Niðurstaða

Greining Claude er rétt: middleware er líklega raunverulega ástæðan fyrir því að public `/vedrid` sýnir ekki Veðurstofustöðvar þótt station route handlerinn sé orðinn public/open þegar provider flaggið leyfir það.

Ég myndi samþykkja næsta fix, en með þessari breytingu á planinu:

- **nota `EXACT_PUBLIC_PATHS`**
- **bæta við middleware regression tests**
- **ekki opna breiðan `/api/teskeid/weather/vedurstofan/` prefix**

## Staðfest í kóða

- `middleware.ts:184-189` skilar 401 JSON fyrir unauthenticated API route sem er ekki public.
- `/api/teskeid/weather/vedurpuls/stations/` er nú þegar public prefix vegna preview endpointa.
- `/api/teskeid/weather/vedurstofan/stations` er ekki public, þannig að handlerinn í `app/api/teskeid/weather/vedurstofan/stations/route.ts` fær ekki að keyra fyrir public notanda.
- `TeskeidMenu` er þegar til sem reusable component og v428 endurnýtir það í stað þess að búa til nýjan menu.

## Keyrðar skipanir

- `npm run type-check`  
  Niðurstaða: exit 0.
- `npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts lib/__tests__/pulseBack.test.ts`  
  Niðurstaða: 3 files passed, 67 tests passed.
- `npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/legacy-guard.test.ts`  
  Niðurstaða: 2 files passed, 79 tests passed.

Ath: núverandi middleware tests eru græn en prófa ekki þetta nýja public station endpoint sérstaklega.

## Design.md / UX rýni

Ég skoðaði v426/v428 í samhengi við Design-reglur sem voru lesnar í síðustu rýni:

- `TeskeidMenu` notar 44px touch target, focus ring og lucide icons, í takt við mobile-first/accessibility.
- Header með menu til hægri er eðlilegt fyrir `/vedrid` overview.
- Vantar enn localhost sjónræna staðfestingu á 360-460px breidd að titill, undirtitill, back-link og menu rekist ekki saman.

## Suggested prompt for Claude Code

```text
Workflow

Rýndu `ai-handoff/2026-07-17-1358-todo-086-v429-codex-v428-hamburger-middleware-review.md`.

Ef engar blocking spurningar vakna, framkvæmdu afmarkað middleware fix:

1. Bættu nákvæmlega `/api/teskeid/weather/vedurstofan/stations` í `EXACT_PUBLIC_PATHS` í `middleware.ts`.
   - Ekki setja þetta í `PUBLIC_PATHS`, því það notar `startsWith`.
   - Ekki opna breiðan `/api/teskeid/weather/vedurstofan/` prefix.

2. Bættu regression tests í `lib/__tests__/middleware.test.ts`:
   - unauthenticated `/api/teskeid/weather/vedurstofan/stations` fer í gegn
   - unauthenticated `/api/teskeid/weather/vedurstofan/stations/foo` fær 401
   - unauthenticated `/api/teskeid/weather/vedurstofan/stations-extra` fær 401

3. Keyrðu:
   - `npm run type-check`
   - `npm run test:run -- lib/__tests__/middleware.test.ts lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts`

Ekki commit-a, push-a, deploya, breyta env eða keyra SQL.

Skilaðu handoff strax eftir framkvæmd.
```

## Localhost checks for Stebbi

Eftir middleware fix:

1. **Public `/vedrid`, Veðurstofan opin**
   - Env: `WEATHER_ENABLED=All`, `WEATHER_ELTA_VEDRID_FLAG=true`, `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` ekki `true`.
   - Opna `/vedrid` óinnskráður.
   - Vænt: hamborgari birtist, public menu virkar, og Veðurstofustöðvar birtast á kortinu.

2. **Public menu**
   - Smella hamborgara á `/vedrid`.
   - Vænt: public menu með Hugmyndir/Ný hugmynd/Innskráning; engin auth-only atriði.

3. **Auth menu**
   - Opna `/auth-mvp/vedrid` innskráður.
   - Vænt: auth menu með Teskeiðar/Minn prófíll/Ný hugmynd/Útskráning.

4. **Compat route**
   - Opna `/auth-mvp/vedrid/elta-vedrid`.
   - Vænt: back-link “Til baka í Veðrið” og auth menu eru bæði nothæf á mobile.

5. **Restricted provider**
   - Setja `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
   - Opna `/vedrid` óinnskráður.
   - Vænt: title/CTA/menu sjást, engar stöðvar, engin destructive error.

6. **API prefix sanity**
   - Þetta þarf ekki að prófa handvirkt í browser ef middleware tests eru komin, en má staðfesta að engar nýjar public API leiðir undir `/api/teskeid/weather/vedurstofan/*` opnist óvart.

## Óvissa / þarf að staðfesta

- Ég keyrði ekki browser/localhost, bara automated tests og code review.
- Ég staðfesti ekki hvort hamborgarinn lítur best út með back-link í compat route á þröngum skjá.
- Ég skoðaði ekki hvort `TeskeidMenu` eigi að sýna “Veðrið” sem virkt item í public menu; það er vöru-/UX pæling, ekki blocker fyrir middleware fix.
