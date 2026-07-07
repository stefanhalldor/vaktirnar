# TODO 067 - v133 Codex review: v132 polish + route/auth/usability next scope

Created: 2026-07-07 18:41  
Timezone: Atlantic/Reykjavik  
From: Codex  
To: Stebbi / Claude Code  
Related handoff reviewed: `2026-07-07-1800-todo-067-v132-claude-v131-polish-handoff.md`

## Findings first

### Medium - Route selection is still single-route and can pick the wrong route for user trust

Current Google provider only requests one route and then uses `routes[0]`:

- `lib/weather/google.server.ts:94-99` builds a `computeRoutes` body without `computeAlternativeRoutes`.
- `lib/weather/google.server.ts:101-107` requests only `routes.polyline,routes.distanceMeters,routes.duration`.
- `lib/weather/google.server.ts:114-116` takes only `data.routes?.[0]`.
- `lib/weather/provider.types.ts:26-29` exposes only `getRouteGeometry(...)`, so the rest of the app has no concept of route alternatives.

This explains Stebbi's Reykjavík -> Selfoss issue. The app is not asking for the shortest or alternative route; it accepts Google's first/default route. For a weather trust product this is not enough. User needs to see the route and confirm it before the weather assessment is treated as meaningful.

Important nuance: Google cannot give "all possible routes" in a literal sense. The realistic version is: request available alternative routes, sort/show them clearly, and let the user choose. Before implementation Claude Code should verify against Google's official Routes docs:

- https://developers.google.com/maps/documentation/routes/alternative-routes
- https://developers.google.com/maps/documentation/routes/shorter-distance-routes

### Low - v132 mostly resolves the v131 polish, but one empty-state branch still reports as error

v132 split server search empty-state from provider failure correctly in normal typing flow:

- `components/weather/PlaceSearch.tsx:121-129`

But in the Google suggestion selection fallback, zero server results still sets `fetchError` instead of `noResults`:

- `components/weather/PlaceSearch.tsx:173-182`

This is not a blocker, because it only happens after a Google suggestion was already visible and `fetchFields` failed. But it is a small consistency bug and should be folded into the next polish pass.

### Low - v132 has no new component tests around Places fallback UI

Claude v132 reports existing checks green and no new tests:

- `2026-07-07-1800-todo-067-v132-claude-v131-polish-handoff.md:117-124`

Codex re-ran:

```text
npm run type-check -> exit 0
npm run test:run   -> exit 0, 1769 passed / 27 skipped / 8 todo (54 files)
```

Residual test gap: `PlaceSearch` fallback/no-results behavior is not directly covered. It is acceptable for this hotfix scope, but if Claude Code touches the component again in v134, add focused tests if the current test setup supports it without a large harness.

## Product decisions from Stebbi to carry forward

1. When route choice matters, the user should choose the route. Do not silently analyze a route that may not be the route the user expects.
2. Alternative route data should be kept so later phases can recommend a longer-but-better-weather route.
3. If destination is Vestmannaeyjar/Heimaey and a drive route cannot be computed, ask whether the user is driving to Herjólfur at Landeyjahöfn or Þorlákshöfn.
4. Save selected origin/destination places for the signed-in user and show them by default in the Frá/Til fields, with X delete.
5. Default precipitation threshold should become `5 mm/klst`, not `2 mm/klst`.
6. Login should be easier and clearer.
7. Authenticated hamburger should not show `Hugmyndir`; it lands in the same practical place as `Teskeiðar`.

## Proposed next handoff for Claude Code

### Phase A - Small polish and threshold changes

These are low-risk and can ship before the route-selection work.

1. Fix `PlaceSearch` fallback empty-state consistency:
   - In `components/weather/PlaceSearch.tsx:173-182`, when server fallback returns `ok: true` and `results.length === 0`, set `noResults(true)` and clear `fetchError`.
   - Keep `fetchError(true)` only for provider/server failure.

2. Change travel precipitation default:
   - `lib/weather/thresholds.ts:27-30`
   - Set `WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour` from `2.0` to `5.0`.
   - Update tests in `lib/__tests__/weather-travel.test.ts` that explicitly reference `2.0` or use precipitation values around that boundary:
     - lines from `rg`: 76, 102, 599-617, 787.
   - Confirm UI threshold defaults pick this up through `resolveThresholds`:
     - `app/auth-mvp/vedrid/FerdalagidClient.tsx:66`, `:338`, `:485`, `:633`.
   - Keep user-overrides working. If user changes the threshold in UI, all explanation text must continue using the resolved value, not the global default.

3. Hide `Hugmyndir` for signed-in users:
   - `components/teskeid/TeskeidMenu.tsx:16-20`
   - Remove `{ href: '/', labelKey: 'ideas', icon: Lightbulb }` from `AUTH_ITEMS`.
   - Keep public menu unchanged unless Stebbi says otherwise.
   - Keep `Senda hugmynd` unless Stebbi explicitly wants that removed too.

### Phase B - Route alternatives and user confirmation

Goal: route correctness/trust before weather correctness.

1. Extend provider types without breaking Mapbox future:
   - Keep `getRouteGeometry` for compatibility if needed.
   - Add something like:

```ts
export type RouteOption = RouteGeometry & {
  id: string
  label?: string
  routeIndex: number
  source: 'google'
}

getRouteOptions(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteOption[]>
```

2. Google provider should request alternatives:
   - Add `computeAlternativeRoutes: true` to the Routes API body if supported by the currently used SKU/options.
   - Keep `polylineEncoding: 'GEO_JSON_LINESTRING'`.
   - Field mask should include all fields needed for every returned route:
     - polyline
     - distanceMeters
     - duration
     - optionally labels if Google returns useful route labels.
   - Do not assume Google returns every possible route. Show copy like "Leiðir sem Google fann".

3. Sort and present route options:
   - Default top option should be shortest by `distanceM`, because Stebbi specifically wants shortest route first.
   - Show duration too, because shortest can be slower.
   - Suggested labels:
     - `Stysta leið`
     - `Fljótlegri leið`
     - `Önnur leið`
   - Each option should show distance, estimated driving time, and a mini route preview on the same interactive map.
   - User must confirm which route to use before final weather calculation.

4. Weather calculation in first implementation:
   - MVP: compute full weather only for the selected route.
   - Keep the unselected route summaries in client state or request result for later phases if cheap.
   - Phase 2: compute weather for all returned alternatives and recommend e.g. "Þessi leið er 12 mín lengri en veðurslega betri".

5. Important state behavior:
   - If user edits Frá or Til, clear selected route and route-weather result.
   - If route alternatives are re-fetched, do not keep a stale selected route.
   - If only one route is returned, still show/confirm it clearly so user sees exactly what will be assessed.

### Phase C - Vestmannaeyjar / Herjólfur fallback

Current UX says "Gat ekki reiknað leiðina. Reyndu aftur síðar." for a valid real-world travel intent. That feels broken.

Implement a specific no-drive-route rescue:

1. Detect island destination:
   - If selected destination name/formattedAddress includes `Vestmannaeyjar`, `Heimaey`, or a known place in Vestmannaeyjar, treat it as a ferry destination.
   - Also handle route failure where destination is an island and no drive route exists.

2. Ask a dedicated question:
   - "Ertu að taka Herjólf frá Landeyjahöfn eða Þorlákshöfn?"
   - Options:
     - `Landeyjahöfn`
     - `Þorlákshöfn`

3. On selection:
   - Set the route destination to the selected ferry port.
   - Preserve final destination context separately, e.g. "Áfangastaður eftir ferju: Vestmannaeyjar".
   - The weather assessment should clearly say it evaluates the drive to the ferry port, not sea conditions or Herjólfur sailing status.

4. Do not overreach:
   - Do not claim ferry safety.
   - Do not evaluate sea weather unless a later phase adds an official source for ferry/weather/sailing conditions.

### Phase D - Saved recent places for signed-in user

This should be server-backed, not only `localStorage`, because Stebbi asked to save places "niður á notandann".

There does not appear to be an existing profile/preferences table for this (`rg preferences/recent_places` did not find one). Recommended migration:

```sql
create table if not exists public.weather_recent_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id text,
  name text not null,
  formatted_address text not null,
  lat double precision not null,
  lon double precision not null,
  usage_kind text not null default 'both',
  use_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, usage_kind, lat, lon)
);
```

Implementation notes:

- RLS owner-only:
  - select/insert/update/delete only where `user_id = auth.uid()`.
- Validate `usage_kind` as `from`, `to`, or `both`.
- Upsert after user selects a confirmed place, not on every keystroke.
- Round lat/lon or use stable `place_id` if available to avoid duplicate rows.
- Limit UI to the most recent 8-10 places per field.
- When Frá/Til input receives focus and query is empty:
  - show saved places first
  - each row has X delete
  - X deletes only that user's saved place
- Deleting a saved place must not clear the currently selected route unless it is the active selected place.

### Phase E - Login simplification and clearer login UI

Current login already has browser OTP affordance:

- `components/teskeid/TeskeidLoginForm.tsx:168-175` uses `autoComplete="one-time-code"` and numeric input.

But email OTP cannot be captured as reliably as SMS WebOTP. For email, the best practical upgrade is a one-click sign-in link in the email, while keeping the six-digit code as fallback.

Current flow:

- `app/api/auth-mvp/request-code/route.ts:44-49` creates a plaintext code and sends it by email.
- `lib/auth/email.ts:42-47` sends only a plain text code.
- `lib/auth/session.ts:62-78` already uses Supabase magic-link machinery internally after code verification, but the magic token never leaves the server.

Recommended phased approach:

1. UI-only clarity first:
   - Make the login page say clearly:
     - "Sláðu inn netfangið þitt."
     - "Við sendum þér 6 stafa kóða."
     - "Þú þarft ekki lykilorð."
   - On code screen:
     - show the target email prominently
     - add "Athugaðu ruslpóst ef kóðinn kemur ekki"
     - make resend and change-email actions more obvious
   - Consider auto-submit when code reaches 6 digits, but only if the UI clearly shows loading and still allows correction.

2. One-click email link second:
   - Do not put the current six-digit OTP in a URL.
   - Either generate a separate one-time login token/link with hash storage, expiry, one-use semantics, and rate limits, or use Supabase's email-link flow intentionally.
   - Link should land on a dedicated callback and set the session server-side.
   - Keep the numeric code fallback for users whose mail clients strip links or open in the wrong browser.

3. Security constraints:
   - Preserve current anti-enumeration behavior.
   - Do not leak whether an email is registered.
   - Do not log raw codes or magic tokens.
   - Any new login-token table needs RLS/service-role review and expiry cleanup.

## Implementation order I recommend

1. v134 small polish:
   - v132 fallback zero-results fix
   - precip default to 5 mm/klst + tests
   - hide authenticated `Hugmyndir`

2. v135 route correctness:
   - Route alternatives from Google
   - route picker/confirmation UI
   - selected route drives weather calculation

3. v136 Vestmannaeyjar ferry-port rescue:
   - destination detection
   - Herjólfur port choice
   - drive-only disclosure

4. v137 saved places:
   - SQL migration + RLS
   - API/server actions
   - UI recent places with delete

5. v138 login clarity:
   - UI copy/layout
   - optionally auto-submit on six digits
   - later: one-click email link design

This order keeps the production-risky pieces separate. Route correctness should not be mixed with new auth token mechanics or Supabase saved-place migration in one huge PR.

## Files reviewed by Codex

```text
WORKFLOW.md
ai-handoff/README.md
ai-handoff/2026-07-07-1800-todo-067-v132-claude-v131-polish-handoff.md
components/weather/PlaceSearch.tsx
app/api/place/search/route.ts
lib/weather/google.server.ts
lib/weather/provider.types.ts
lib/weather/thresholds.ts
lib/weather/types.ts
lib/weather/travel.ts
components/teskeid/TeskeidMenu.tsx
components/teskeid/TeskeidLoginForm.tsx
app/api/auth-mvp/request-code/route.ts
lib/auth/email.ts
lib/auth/session.ts
app/auth/callback/route.ts
```

## Commands run by Codex

```text
npm run type-check
# exit 0

npm run test:run
# exit 0
# 54 files passed
# 1769 passed / 27 skipped / 8 todo

rg ...
# read-only code search for profile/preferences/recent places, thresholds, weather, menu and auth flow

Get-Date -Format 'yyyy-MM-dd HH:mm'
# 2026-07-07 18:41
```

No SQL was run. No migrations were created. No app files were changed.

## Localhost checks for Stebbi

For v132 as currently implemented:

1. Open `/auth-mvp/vedrid`.
2. Search a known place like `Garðabær`; confirm results appear.
3. Search a typo or unknown place; expected: a mild "Enginn staður fannst..." style message, not a scary red provider error.
4. Temporarily test with Google browser APIs blocked in DevTools if possible; expected: server fallback still returns places through `/api/place/search`.

For v134 small polish after Claude Code implements it:

1. Open `/auth-mvp/vedrid` and go to `Veðurmörk`.
2. Confirm default precipitation threshold is `5 mm/klst`.
3. Calculate a route where precipitation is below 5 mm/klst; expected: it should not become yellow just because rain is 2-4 mm/klst.
4. Log in and open hamburger menu; expected: `Hugmyndir` is hidden for authenticated users, `Teskeiðar`, profile and `Senda hugmynd` still behave correctly.

For route alternatives after v135:

1. Test Reykjavík -> Selfoss.
2. Expected: user sees route options before weather result.
3. Shortest route appears first by distance, with duration visible.
4. Selecting a different route changes the map/polyline and the weather points.
5. Editing Frá/Til clears stale route/weather result.

For Vestmannaeyjar after v136:

1. Set destination to `Vestmannaeyjar`.
2. Expected: app asks whether user drives to Landeyjahöfn or Þorlákshöfn.
3. Pick each option and confirm the final route is to that ferry port.
4. Expected copy: weather is for driving to ferry port only, not Herjólfur sailing/sea conditions.

For saved places after v137:

1. Select two or three Frá/Til places while logged in.
2. Reload and focus an empty Frá or Til input.
3. Expected: saved places appear by default.
4. Click X on a saved place.
5. Expected: row disappears and does not come back after reload.
6. Confirm one user's saved places do not appear for another user.

For login after v138:

1. Open `/innskraning`.
2. Confirm the page clearly explains email + 6-digit code + no password.
3. Request code.
4. Confirm the code step makes it obvious which email was used, how to resend, and how to change email.
5. Paste a six-digit code; expected: no awkward formatting or mobile zoom.

## Óvissa / þarf að staðfesta

1. Google Routes alternatives are not "all possible routes"; they are the alternatives Google returns for the request. Claude Code should verify exact supported fields and pricing/SKU impact against current Google docs before implementation.
2. "Shortest first" is Stebbi's requested product default, but it can conflict with fastest/most familiar route. UI must show both distance and duration so the choice is transparent.
3. Saved places needs a Supabase migration and RLS review. Do not implement as only localStorage if the requirement is "niður á notandann" across devices.
4. Magic-link login is useful, but it is auth-sensitive. Do not rush it into the same implementation as route alternatives.
