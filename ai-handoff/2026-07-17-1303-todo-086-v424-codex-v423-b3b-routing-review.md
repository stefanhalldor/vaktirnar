# 2026-07-17 13:03 - TODO-086 v424 - Codex review of v423 B3B routing prerelease

Created: 2026-07-17 13:03
Timezone: Atlantic/Reykjavik

## Findings

1. **High: station API tests fail after access-contract change**

   I ran:

   ```bash
   npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts
   ```

   Result: **exit 1**.

   `weather-provider-stations.test.ts` passed, but `weather-vedurstofan-station-explorer-api.test.ts` has 4 failing auth/access tests. The failures are not just stale assertions: because `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` is now absent by default, the endpoint goes down the public-read branch and hits the product-cache reader mock, which returns `undefined`; `buildStationExplorerResponse()` then crashes with `Cannot read properties of undefined (reading 'get')`.

   Relevant changed code:

   - `app/api/teskeid/weather/vedurstofan/stations/route.ts:21-33` now gates auth only when `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'`.
   - Existing test setup in `lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts:92-97` does not set that env var, so old auth tests now exercise the public branch.

   **Fix before next big phase:** update this test file to explicitly cover both contracts:

   - open/global mode: no `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`, public request returns 200 and product/cache data
   - restricted mode: `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`, signed-out returns 401, missing feature rows return 404, allowed user returns 200

   I would also defensively normalize `readVedurstofanProductForStations()` result to a `Map` if it somehow returns a falsy value. That is not a replacement for test fixes, just a safer guard.

2. **High/UX: public `/vedrid` full pulse return path is rejected by `pulseBack`**

   Public overview passes:

   - `app/vedrid/page.tsx:20-21` → `stationPulseReturnBase="/vedrid"`
   - `VedurstofanStationExplorerClient.tsx:375-377` builds `returnTo="/vedrid?stationId=..."`
   - `components/weather/VedurstofanPulseInline.tsx:97-103` sends that into `/auth-mvp/vedrid/puls/stod/...`

   But `lib/weather/pulseBack.ts:27-50` only accepts:

   - `/auth-mvp/vedrid`
   - `/auth-mvp/vedrid/ferdalagid`
   - `/auth-mvp/vedrid/elta-vedrid`

   It rejects `/vedrid?stationId=...`, so a user who starts on public `/vedrid`, logs in through pulse, and lands in the full pulse page will not get the intended back link to the same public overview context.

   **Fix:** `pulseBack` should explicitly accept public overview `/vedrid` with query/hash as a safe `overview` destination, or public overview should pass `/auth-mvp/vedrid` as `returnTo` when the full pulse is auth-only. I prefer accepting `/vedrid?stationId=...` because it preserves the exact public context and is already allowed by `loginNext.ts`.

3. **Medium: public overview can show destructive load error when provider access is intentionally restricted**

   If `WEATHER_ENABLED=All` but `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`, public `/vedrid` now renders the overview client. The station endpoint returns 401 for signed-out users, and `VedurstofanStationExplorerClient.tsx:160-161` renders `loadError` as destructive text.

   That is technically truthful, but product-wise it is wrong: restricted provider mode should hide or gently omit the Veðurstofan layer, not show a scary fetch error on the public weather overview.

   **Fix:** distinguish expected access-denied/provider-restricted state from real fetch failure. For example:

   - 401/403 from station endpoint in public context = no Veðurstofan layer / subdued unavailable state
   - network/500/schema error = actual load error

   This matters because Stebbi has been toggling provider access during rollout.

4. **Medium/Architecture: reusable overview shell is still route-local under `app/auth-mvp`**

   v421/v422 asked for reusable overview shell. v423 made `VedurstofanStationExplorerClient` more configurable, which is good, but public `/vedrid` now imports it from:

   ```ts
   '@/app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient'
   ```

   That is an auth-route-local component being used as public product shell. It works technically, but it is the wrong architectural anchor if the next steps are provider layers, Vegagerðin, overview map, and maybe saved/common route exploration.

   **Fix before building more on it:** move/extract the reusable core to `components/weather/`, e.g.

   - `components/weather/WeatherOverviewClient.tsx`
   - or `components/weather/VedurstofanOverviewClient.tsx` if still provider-specific

   Then make route files thin wrappers. This aligns with `WORKFLOW.md` reusable architecture rules and avoids more imports from `app/auth-mvp/...` into public routes.

5. **Medium/UX: `/vedrid` overview likely still presents itself as “Elta veðrið”**

   `VedurstofanStationExplorerClient` uses translation keys under `teskeid.vedrid.eltaVedrid`, and `messages/is.json:920-922` still says:

   - title: `Elta veðrið`
   - subtitle: “Allar staðfestar Veðurstofustöðvar til sannprófunar...”
   - back: `Til baka í ferðaveðrið`

   After v423, `/vedrid` is meant to be the public product overview, not the old “Elta veðrið” experiment page. The old title may be okay on the compatibility route, but not as the main `/vedrid` surface.

   **Fix:** pass context-specific copy into the overview component:

   - `/vedrid` and `/auth-mvp/vedrid`: `Veðrið`
   - `/auth-mvp/vedrid/elta-vedrid`: compatibility/old “Elta veðrið” copy, if kept

   Also update `backHref="/auth-mvp/vedrid"` on the compatibility route so the visible text is not “Til baka í ferðaveðrið” when it now goes to overview.

## Good parts

- `npm run type-check` is clean.
- New `/vedrid/ferdalagid` and `/auth-mvp/vedrid/ferdalagid` routes use the existing `FerdalagidClient` rather than forking the trip calculator.
- `pulseBack` got a clearer distinction between overview and trip for authenticated routes.
- New route-level `loading.tsx` files were added for the new calculator routes, which matches `Design.md` navigation feedback requirements.
- The station endpoint direction is correct: open/global provider mode should be public read of product/cache data, while restricted mode stays per-user.

## Commands run by Codex

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts
```

Result: **exit 1**. 4 failing tests in `weather-vedurstofan-station-explorer-api.test.ts`.

```bash
npm run type-check
```

Result: **exit 0**.

## Recommendation

Do not release v423 as-is and do not start a new big product feature before B3B hardening is done.

But to keep momentum, make the next Claude Code step a **single larger hardening-and-next-foundation pass**:

1. Fix the B3B blockers above.
2. Move/extract the overview shell to `components/weather/`.
3. Normalize `/vedrid` copy so it is the actual product overview, not “Elta veðrið”.
4. Re-run the failed station API tests, pulseBack tests and type-check.
5. If all clean, prepare the next larger phase handoff for provider-neutral overview layers.

This keeps us moving fast without stacking more product work on top of a route/access regression.

## Suggested prompt for Claude Code

```text
Workflow

Lestu:
- WORKFLOW.md
- Design.md
- ai-handoff/2026-07-17-1258-todo-086-v423-claude-b3b-routing-prerelease.md
- ai-handoff/2026-07-17-1303-todo-086-v424-codex-v423-b3b-routing-review.md

Markmið: harðna B3B og halda áfram í stærra skrefi aðeins ef B3B verður grænt.

Gerðu fyrst:
1. Lagaðu station endpoint tests eftir nýja access-contractinu:
   - open/global mode: public read af product/cache
   - restricted mode: signed-out 401, missing provider access 404, allowed user 200
   - tryggðu að mock product reader skili Map eða að route falli örugglega í new Map fallback
2. Lagaðu public pulse returnTo:
   - `/vedrid?stationId=...` á að vera öruggur overview return destination eða public overview á að senda auth overview returnTo með skýrri ákvörðun.
3. Lagaðu provider-restricted public overview:
   - 401/403 frá station endpoint í public context má ekki birtast sem destructive “náði ekki að sækja” villa.
4. Færðu/extract-aðu reusable overview client úr `app/auth-mvp/...` yfir í `components/weather/...` þannig að public route import-i ekki auth-route-local client.
5. Aðgreindu copy:
   - `/vedrid` og `/auth-mvp/vedrid` = “Veðrið”
   - `/auth-mvp/vedrid/elta-vedrid` = compatibility/old explorer if kept
   - back link text má ekki segja “Til baka í ferðaveðrið” ef hann fer á overview.

Keyrðu:
- npm run type-check
- npm run test:run -- lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts lib/__tests__/weather-provider-stations.test.ts lib/__tests__/pulseBack.test.ts

Ef þetta verður allt grænt, má í sama handoff leggja til næsta stóra provider-neutral overview skref, en ekki byrja á Vegagerðinni, heatmap/cache eða nýjum SQL í þessari lotu.

Ekki commit-a, push-a, deploya, keyra SQL eða breyta env.
```

## Localhost checks for Stebbi

### Public overview

1. Setja local env í opið Veðurstofu-mode:
   - `WEATHER_ENABLED=All`
   - `WEATHER_ELTA_VEDRID_FLAG=true`
   - `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` eytt eða ekki `true`
2. Opna `/vedrid`.
   - Vænt: title/copy er `Veðrið`, ekki “Elta veðrið”.
   - Veðurstofustöðvar sjást.
   - `Reikna ferðaveðrið` fer á `/vedrid/ferdalagid`.

### Public overview með restricted provider

1. Setja `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`.
2. Opna `/vedrid` sem public.
   - Vænt: public weather overview virkar án destructive fetch-error.
   - Ef Veðurstofan er falin, á það að líta út eins og eðlilegt gated/unavailable state.

### Public pulse login return

1. Sem public, opna `/vedrid`, velja stöð og smella á pulse/full message CTA.
2. Skrá inn.
3. Vænt: full pulse opnast og “til baka” skilar í sama station context eða skýrt samsvarandi auth overview context.

### Authenticated trip

1. Sem innskráður, opna `/auth-mvp/vedrid`.
   - Vænt: overview.
2. Smella á `Reikna ferðaveðrið`.
   - Vænt: `/auth-mvp/vedrid/ferdalagid`.
   - Vistanir og route-result state virka áfram.
3. Opna púls úr ferðaspjaldi.
   - Vænt: back link heitir `Til baka í ferðalagið mitt` og fer á `/auth-mvp/vedrid/ferdalagid`.

### Compatibility

1. Opna `/auth-mvp/vedrid/elta-vedrid?stationId=<known-id>`.
   - Vænt: compatibility route virkar áfram.
   - Back-link texti passar raunverulegum áfangastað.

## Óvissa / þarf að staðfesta

- Ég skoðaði ekki allt `FerdalagidClient` sessionStorage restore flæðið end-to-end í browser.
- Ég staðfesti ekki hvernig public overview á nákvæmlega að líta út þegar provider er restricted; það þarf product decision í implementation.
- `git status` sýnir mikið af ócommittuðum/untracked breytingum frá fyrri vinnuhringjum. Claude Code má ekki revert-a eða hreinsa þær nema Stebbi biðji sérstaklega um það.
