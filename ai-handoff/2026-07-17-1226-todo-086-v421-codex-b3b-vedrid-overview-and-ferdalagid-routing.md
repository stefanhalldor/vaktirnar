# 2026-07-17 12:26 - TODO-086 v421 - Codex: B3B /vedrid overview og /ferdalagid routing

Created: 2026-07-17 12:26
Timezone: Atlantic/Reykjavik

## Stutt mannamal

Við eigum að hreyfa okkur í stærra skrefi núna.

Næsti áfangi á að færa Veðrið í rétta vörumynd:

- `/vedrid` verður yfirlit yfir veðrið á Íslandi: kort, Veðurstofustöðvar, Veðurpúls preview og síðar Vegagerðin.
- Ferðareiknivélin sem er núna á `/vedrid` færist í skýrara undirflæði: `/vedrid/ferdalagid`.
- Innskráðir fá samsvarandi structure undir `/auth-mvp/vedrid`.
- Gömul slóð og pulse `returnTo` mega ekki brotna.

Þetta er ekki lengur bara texta-polish. Þetta er routing/product-shell skref sem þarf að gera mobile-first, reusable og án þess að búa til sérlausnir.

## Source / context

Stebbi sagði eftir v419/v420 að handoffið væri of smátt og að við ættum að taka framhaldsskref með.

Relevant prior docs:

- `ai-handoff/2026-07-17-1215-todo-086-v418-codex-v417-hover-copy-and-vedrid-routing-plan.md`
- `ai-handoff/2026-07-17-1222-todo-086-v419-claude-r1-marker-title-prerelease.md`
- `ai-handoff/2026-07-17-1224-todo-086-v420-codex-v419-r1-marker-title-review.md`

## Read / inspected

- `WORKFLOW.md`
- `ai-handoff/README.md`
- `Design.md`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx`
- `app/api/teskeid/weather/vedurstofan/stations/route.ts`
- `lib/chat/access.server.ts`
- `rg` over weather routes/tests/components for `/vedrid`, `/elta-vedrid`, `FerdalagidClient`, `returnTo`.

## Design.md alignment

This touches layout, navigation and route transitions, so `Design.md` applies.

Relevant constraints:

- Mobile-first app feel.
- No lárétt overflow or unexpected mobile zoom.
- Route transitions must have loading/pending feedback.
- Use reusable components and existing Teskeið tokens.
- Avoid big marketing hero; `/vedrid` should feel like the product itself, not a landing page.
- Cards should not be nested unnecessarily.

## Current state

### Public

`app/vedrid/page.tsx` currently renders:

```tsx
return <FerdalagidClient isGuest />
```

So public `/vedrid` is the trip wizard.

### Authenticated

`app/auth-mvp/vedrid/page.tsx` currently renders:

```tsx
return <FerdalagidClient tripEnabled={tripEnabled} />
```

So authenticated `/auth-mvp/vedrid` is also the trip wizard.

### Station overview

`app/auth-mvp/vedrid/elta-vedrid/page.tsx` currently requires:

```ts
await guardFeatureAccess(user.email!, 'vedrid')
await guardFeatureAccess(user.email!, 'elta-vedrid')
```

and renders `VedurstofanStationExplorerClient`.

### Station data API

`app/api/teskeid/weather/vedurstofan/stations/route.ts` currently requires:

- `AUTH_MVP_ENABLED=true`
- `WEATHER_ENABLED` not off
- `WEATHER_ELTA_VEDRID_FLAG=true`
- signed-in user
- `vedrid` feature row
- `elta-vedrid` feature row

That is too restrictive if `/vedrid` overview is meant to become public when Veðurstofan is open globally.

## Product decision for this phase

### End-state we want

```text
/vedrid
  Public Veðrið overview.
  Iceland map, Veðurstofan layer if open, pulse previews, CTA to calculate trip.

/vedrid/ferdalagid
  Public trip weather calculator, current FerdalagidClient with isGuest.

/auth-mvp/vedrid
  Authenticated Veðrið overview.
  Same core overview, with auth-aware affordances and saved-state links.

/auth-mvp/vedrid/ferdalagid
  Authenticated trip weather calculator, current FerdalagidClient with saved places.

/auth-mvp/vedrid/elta-vedrid
  Temporary compatibility route for old station explorer deep links.
  Should either render the same overview shell or redirect to the new authenticated overview preserving stationId.
```

### Important

Do not make "elta-vedrid" the product name. It was a working route name. The reusable overview experience is the product-level `/vedrid` surface.

## Recommended implementation scope: B3B

This should be one meaningful implementation pass, not four tiny polish passes.

### B3B.1 Extract reusable overview client/shell

Create a shared overview component, for example:

```text
components/weather/WeatherOverviewClient.tsx
```

or a similarly named component.

It should own reusable behavior currently living in `VedurstofanStationExplorerClient`:

- station data loading state
- `IcelandOverviewMap`
- provider layer building
- selected station state
- `stationId` URL sync
- selected station preview using `ProviderStationPreviewCard`
- pulse preview
- filter tabs
- station list / summary strip if still needed

`VedurstofanStationExplorerClient` should become either:

- a thin wrapper around the reusable overview client, or
- be renamed/moved if Claude Code can do that safely.

Avoid duplicating station explorer logic in public and auth pages.

### B3B.2 Make station data access support public/open provider mode

Current `/api/teskeid/weather/vedurstofan/stations` is signed-in + feature-row only. That conflicts with a public `/vedrid` overview.

Implement a clear access contract:

- If `AUTH_MVP_ENABLED !== 'true'`: 404.
- If `WEATHER_ENABLED=off`: 404.
- If `WEATHER_ELTA_VEDRID_FLAG !== 'true'`: 404, unless we decide this flag is now deprecated for overview.
- If `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'`:
  - require signed-in user
  - require `weather-provider-vedurstofan` feature access
- If `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` is missing or anything other than `true`:
  - allow public read of station forecast overview data.

Important:

- This endpoint must only read product/cache tables.
- It must never trigger live Veðurstofan fetches.
- It must not expose private user data.
- It may expose public forecast/station registry data and public pulse preview only.

If Claude Code finds that current endpoint naming or guard semantics make this too risky, stop and return a handoff with the exact issue instead of forcing it.

### B3B.3 Add trip routes

Add or move routes so the trip calculator exists at:

```text
app/vedrid/ferdalagid/page.tsx
app/auth-mvp/vedrid/ferdalagid/page.tsx
```

Use the existing `FerdalagidClient` core:

- public: `<FerdalagidClient isGuest />`
- authenticated: same access logic as current `app/auth-mvp/vedrid/page.tsx`, including `resolveAuthenticatedWeatherShellAccess` and `tripEnabled`.

Add `loading.tsx` for new route segments if route/data/auth can wait, per `Design.md`.

### B3B.4 Change `/vedrid` and `/auth-mvp/vedrid` to overview

Public `/vedrid`:

- obey `WEATHER_ENABLED`.
- if mode is `off`: redirect `/`.
- if mode is `authenticated`: redirect `/innskraning`.
- if mode is `all`: render overview.
- include clear CTA: `Reikna ferðaveðrið` -> `/vedrid/ferdalagid`.

Authenticated `/auth-mvp/vedrid`:

- obey `resolveAuthenticatedWeatherShellAccess`.
- render overview for allowed users.
- include CTA: `Reikna ferðaveðrið` -> `/auth-mvp/vedrid/ferdalagid`.

### B3B.5 Compatibility and returnTo

Do not break existing user flows.

Handle these explicitly:

1. `returnTo=/auth-mvp/vedrid` from old pulse links.
   - If query indicates restore/trip context, route to `/auth-mvp/vedrid/ferdalagid`.
   - Or preserve `/auth-mvp/vedrid?restore=...` as a compatibility path that redirects to `/auth-mvp/vedrid/ferdalagid?restore=...`.

2. `returnTo=/auth-mvp/vedrid/elta-vedrid?stationId=...`.
   - Keep working.
   - Either continue rendering compatibility page or redirect to `/auth-mvp/vedrid?stationId=...`.

3. Existing `/auth-mvp/vedrid?restore=1` or route-state query.
   - Must not strand user on overview if the intent is to restore a calculated trip.
   - Redirect/preserve into `/auth-mvp/vedrid/ferdalagid?restore=1`.

4. Public `/vedrid?restore=1`.
   - Same idea: route to `/vedrid/ferdalagid?restore=1`.

5. `lib/weather/pulseBack.ts`, `lib/auth/loginNext.ts`, and associated tests likely need updates for new route boundaries.

### B3B.6 Navigation links

Update only the links that make sense in this phase:

- Public landing can keep linking to `/vedrid`; now it lands on overview.
- Auth home card can keep linking to `/auth-mvp/vedrid`; now it lands on overview.
- Trip CTAs inside overview point to `/vedrid/ferdalagid` or `/auth-mvp/vedrid/ferdalagid`.
- Pulse return links must label destination accurately:
  - trip return: `Til baka í ferðalagið mitt`
  - station overview return: `Til baka í Veðurpúlsinn` or better future copy if renamed.

## Tests to update / add

At minimum:

1. `lib/__tests__/loginNext.test.ts`
   - allow `/vedrid/ferdalagid`
   - allow `/auth-mvp/vedrid/ferdalagid`
   - reject lookalikes.

2. `lib/__tests__/pulseBack.test.ts`
   - trip routes include `/auth-mvp/vedrid/ferdalagid`
   - station overview compatibility still accepted.

3. `lib/__tests__/public-landing.test.ts`
   - `/vedrid` still public entry in All mode.
   - No need to assert trip wizard directly on `/vedrid`.

4. `lib/__tests__/home-page.test.tsx`
   - signed-in weather card links to `/auth-mvp/vedrid` overview.

5. Station API tests if present:
   - public allowed when `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` is not `true`.
   - public blocked when provider access required.
   - signed-in with feature row allowed when provider access required.
   - endpoint does not require `elta-vedrid` feature row in open/global mode.

Run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/loginNext.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/public-landing.test.ts lib/__tests__/home-page.test.tsx
```

If touched API tests exist, run relevant weather station API tests too.

## Out of scope for B3B

Do not include these yet:

- Vegagerðin implementation.
- Route cache / interest heatmap.
- Big new desktop layout beyond necessary overview shell.
- Full RLS/migration work.
- New SQL.
- Commit/push/deploy.
- Removing old routes permanently.

## Risk / devil's advocate

### Risk 1: Public station API can accidentally expose too much

Mitigation:

- Only expose station registry + forecast product/cache data already intended for public display.
- No user data.
- No service_role response leakage.
- No raw errors.
- No live fetch trigger.

### Risk 2: Trip restore/returnTo breaks

Mitigation:

- Add compatibility redirects for old `/auth-mvp/vedrid?restore=...`.
- Update `pulseBack` tests.
- Manual localhost check from pulse -> login -> trip restore.

### Risk 3: Too much moving in one pass

Mitigation:

- B3B is allowed to be a bigger step, but stop if access contract or restore behavior becomes unclear.
- Do not mix in future providers or cache/heatmap.

## Localhost checks for Stebbi

### Public user

1. Open `/vedrid`.
   - Expected: overview/kort opens, not old trip wizard.
   - If Veðurstofan is globally open, stations show.
   - CTA/button to calculate trip is visible.

2. Click `Reikna ferðaveðrið`.
   - Expected: lands on `/vedrid/ferdalagid`.
   - Existing public trip wizard works.

3. Calculate a simple route.
   - Expected: same behavior as current public `/vedrid`.

### Signed-in user without private `vedrid` feature row

1. Open `/auth-mvp/heim`.
   - Weather card still visible when `WEATHER_ENABLED=All` or `Authenticated`.
2. Click `Veðrið`.
   - Expected: `/auth-mvp/vedrid` overview.
3. Click `Reikna ferðaveðrið`.
   - Expected: `/auth-mvp/vedrid/ferdalagid`.
4. Saved places behavior should still be present in the trip calculator where it existed before.

### Signed-in user with Veðurstofan/provider access

1. Open `/auth-mvp/vedrid`.
   - Expected: overview with Veðurstofan markers.
2. Select a station.
   - Expected: URL gets `stationId`, preview opens, close clears `stationId`.
3. Open full pulse and return.
   - Expected: returns to correct overview/station or trip context depending where it came from.

### Compatibility

1. Open `/auth-mvp/vedrid/elta-vedrid?stationId=<known-id>`.
   - Expected: either still works or redirects to new overview preserving selected station.
2. Open old `/auth-mvp/vedrid?restore=1` style link if available.
   - Expected: user lands in trip calculator, not stranded on overview.

### Mobile/desktop

1. Test 390 px width.
   - No horizontal overflow.
   - Map and cards fit.
   - CTA is reachable.
2. Test desktop width.
   - Overview uses space better than narrow mobile-only layout where reasonable, but no dashboard bloat.

## Suggested prompt for Claude Code

```text
Workflow

Lestu:
- WORKFLOW.md
- Design.md
- ai-handoff/2026-07-17-1226-todo-086-v421-codex-b3b-vedrid-overview-and-ferdalagid-routing.md
- ai-handoff/2026-07-17-1224-todo-086-v420-codex-v419-r1-marker-title-review.md

Markmið: framkvæma B3B sem eitt stærra, en samt afmarkað, skref.

Útfærðu:
1. Reusable weather overview client/shell úr núverandi Veðurstofan station explorer.
2. `/vedrid` og `/auth-mvp/vedrid` sem overview landing.
3. Núverandi FerdalagidClient undir `/vedrid/ferdalagid` og `/auth-mvp/vedrid/ferdalagid`.
4. Compatibility fyrir gömul `/auth-mvp/vedrid/elta-vedrid?stationId=...` og trip restore/returnTo.
5. Public/open provider access fyrir station overview ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` er ekki `true`, án live fetch og án notendagagna.
6. Viðeigandi tests og type-check.

Stoppaðu og skilaðu handoff ef:
- public station data access reynist óljóst eða getur lekið notendagögnum
- trip restore/returnTo verður óljóst
- breytingin krefst SQL/migration/env/deploy
- umfangið fer að blandast Vegagerðinni, heatmap/cache eða öðrum framtíðarfösum

Ekki commit-a, push-a, deploya, keyra SQL eða breyta env.
```

## Óvissa / þarf að staðfesta

- Ég staðfesti að núverandi station endpoint er enn authenticated + `vedrid` + `elta-vedrid`, þannig að public `/vedrid` overview krefst meðvitaðrar access-contract breytingar.
- Ég hef ekki staðfest nákvæm route restore query/state format inni í `FerdalagidClient`; Claude Code þarf að skoða það áður en redirect compatibility er útfærð.
- Ef þetta reynist of stórt í framkvæmd, þá á Claude Code að stoppa með handoff frekar en að hálfklára route-migration.
