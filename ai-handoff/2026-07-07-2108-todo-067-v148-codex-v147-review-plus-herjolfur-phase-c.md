# Codex review: todo-067 v148 - v147 route/public-nav review + Phase C Herjólfur handoff

Created: 2026-07-07 21:08:51
Timezone: Atlantic/Reykjavik
Reviewed handoff: `2026-07-07-2055-todo-067-v147-claude-v146-fixes-public-nav-handoff`
Reviewed commit: `6ae11af`
Next requested item: Phase C - Vestmannaeyjar / Herjólfur ferry-port fallback

## Findings

1. **Medium - Route fingerprint is improved, but still not geometry-stable enough for a trust-critical selected route.**
   `lib/weather/google.server.ts:169-177` now uses distance, duration, first coordinate and last coordinate. That fixes pure array-index drift, but first/last coordinates are the same for nearly every alternative between the same origin and destination. If two route alternatives ever share the same rounded distance and duration, they collide. Also, if Google changes only duration between the route-selection call and final weather call, the same geometry can fail to match.

   Recommended fix before relying on this long term: include a small deterministic geometry hash in the id, based on normalized decoded polyline coordinates or sampled route points. A good simple version is something like: provider + distance + first + last + hash of every Nth coordinate + final coordinate. Keep duration as display metadata, not the core identity, unless there is a specific reason to make live travel-time changes invalidate the selected route.

2. **Medium - `PublicTopNav` hardcodes user-facing text and brand colors.**
   `components/teskeid/PublicTopNav.tsx:7-10` hardcodes `Hugmyndir`, `Ný hugmynd`, and `Innskráning`; `PublicTopNav.tsx:19` and `PublicTopNav.tsx:29-32` hardcode colors. AGENTS/WORKFLOW says user text belongs in `messages/is.json` and `messages/en.json`, and `Design.md` asks for semantic tokens where possible. Also, the active state uses `text-[#9dd090]` on `bg-[#2d5a27]` with `text-[10px]`; that may be too low-contrast for such small text. Safer: use `text-white` or a tested semantic foreground token on active state.

3. **Low - Public top nav does not add route-transition pending feedback.**
   The v146 requirement said the sticky top bar should not feel dead during navigation. `PublicTopNav` uses plain `Link`s and the public routes do not currently have `loading.tsx` files. This is probably not a blocker for release if pages are fast, but it is a direct gap against the nav requirement and `Design.md` navigation guidance. If Claude Code touches this again, add either route loading files for `/`, `/senda-hugmynd`, `/innskraning` or a tiny pending state in the nav component.

4. **Low - v147 fallback localhost instructions are incorrect.**
   v147 suggests testing fallback by turning off `WEATHER_MAP_PROVIDER`. That disables the provider for both `/travel/routes` and the final `/travel` endpoint. The fallback button submits without `selectedRouteId`, but final weather still needs `getRouteGeometry`; with provider disabled, the fallback cannot succeed. Test this instead by blocking or mocking only `POST /api/teskeid/weather/travel/routes` while leaving `WEATHER_MAP_PROVIDER=google`.

5. **Low - `git show --check 6ae11af` fails because of trailing whitespace in the previously committed v146 handoff file.**
   This does not affect app runtime, and the whitespace is in `ai-handoff/2026-07-07-2037-todo-067-v146-codex-v144-route-alternatives-review-plus-public-nav.md`, not app code. Still worth cleaning in a later docs-only tidy if we care about commit hygiene.

## What looked good

- v147 resolves the main hard-blocking route-selection issue from v146: selected route ids are no longer plain `google-0` / `google-1`.
- If Stebbi explicitly approved fastest-first, the label change from `Stysta leið` to `Fljótlegasta leið` is correct.
- The route fallback state is a meaningful improvement over a disabled dead-end.
- Public hamburger removal for unauthenticated users is implemented in `components/teskeid/NavBar.tsx`.
- `PublicTopNav` appears on `/`, `/senda-hugmynd`, and `/innskraning`.
- No SQL, migrations, RLS, Supabase policy, Vercel env, billing, or production data changes were introduced in v147.

## Commands run by Codex

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Read workflow rules before review.
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Read handoff filename and content rules.
- `git show --stat --oneline 6ae11af`
  - Exit code: 0.
- `git show --name-only --format=fuller 6ae11af`
  - Exit code: 0.
- `git status --short`
  - Exit code: 0.
  - Only untracked `.claude/` and `.obsidian/` shown.
- `git show --check --pretty=short 6ae11af`
  - Exit code: 1.
  - Trailing whitespace in the committed v146 handoff file only.
- `npm run type-check`
  - Exit code: 0.
- `npm run test:run`
  - Exit code: 0.
  - Result: 55 passed test files, 1793 passed tests, 27 skipped, 8 todo.

## Files inspected

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-07-2055-todo-067-v147-claude-v146-fixes-public-nav-handoff.md`
- `ai-handoff/2026-07-07-1841-todo-067-v133-codex-v132-review-route-auth-usability.md`
- `ai-handoff/2026-07-07-1853-todo-067-v135-codex-v134-plan-review.md`
- `lib/weather/google.server.ts`
- `lib/weather/provider.server.ts`
- `lib/weather/provider.types.ts`
- `lib/weather/places.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `components/teskeid/PublicTopNav.tsx`
- `components/teskeid/NavBar.tsx`
- `app/page.tsx`
- `app/senda-hugmynd/page.tsx`
- `app/innskraning/page.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-google.test.ts`

## Phase C handoff: Vestmannaeyjar / Herjólfur ferry-port fallback

### Goal

When the user selects Vestmannaeyjar / Heimaey as the destination, the app should not fail with a generic "Gat ekki reiknað leiðina" message. Instead, ask which Herjólfur ferry port the user is driving to and calculate Ferðaveðrið for the drive to that port.

This phase evaluates road weather only. It must not evaluate ferry sailing conditions, sea weather, harbour closure, Herjólfur operations, ticket availability, or ship safety.

### Scope for Claude Code

Implement Phase C narrowly:

1. Detect destination in Vestmannaeyjar / Heimaey.
2. Ask the user whether they are driving to:
   - Landeyjahöfn
   - Þorlákshöfn
3. Replace the route destination with the selected ferry port for route/weather calculation.
4. Preserve the original final destination context in UI copy.
5. Clearly say that the weather result is for the drive to the ferry port only.
6. Add tests for the helper detection and state transitions where practical.

Do not combine this with saved places, login PIN improvements, SQL, RLS, Herjólfur live status, sea forecast, or a new external API.

### Recommended implementation shape

Add a small helper, for example `lib/weather/ferryPorts.ts`:

```ts
export type FerryPortId = 'landeyjahofn' | 'thorlakshofn'

export const VESTMANNAEYJAR_BBOX = {
  minLat: 63.30,
  maxLat: 63.50,
  minLon: -20.45,
  maxLon: -20.05,
}

export function isVestmannaeyjarDestination(place: { lat: number; lon: number; name?: string; formattedAddress?: string }): boolean
```

Primary detection should be coordinate-based. Use text aliases like `Vestmannaeyjar` and `Heimaey` only as a secondary hint, not the sole source of truth, because string matching can false-positive on hotel/guesthouse/business names.

Use curated ferry-port candidates. Coordinates below are placeholders and must be verified against Google Maps / existing geocoder before hardcoding:

- Landeyjahöfn: verify exact harbour coordinates before committing.
- Þorlákshöfn: verify exact harbour coordinates before committing.

Do not ask Google Places to re-geocode the labels every time after the user chooses a port. Once verified, store the fixed port candidates in code with clear names and coordinates.

### UI behavior

In `RouteSelectionStep` / `FerdalagidClient`:

1. User selects origin and destination.
2. If destination is inside the Vestmannaeyjar bounding box, show a dedicated ferry choice card before route options are required.
3. Suggested Icelandic copy:
   - Title: `Þú ert að fara til Vestmannaeyja`
   - Body: `Ferðaveðrið metur aksturinn að ferjuhöfninni. Það metur ekki siglingu Herjólfs eða sjólag. Hvaða höfn ætlarðu að keyra að?`
   - Buttons: `Landeyjahöfn`, `Þorlákshöfn`
   - Note after selection: `Áfangastaður eftir ferju: Vestmannaeyjar. Veðurmatið hér er fyrir aksturinn að {portName}. Athugaðu stöðu Herjólfs áður en þú leggur af stað.`
4. After user chooses the port, route options should be fetched for `origin -> selected ferry port`.
5. The visible route header/result should make this explicit, for example:
   - `Reykjavík -> Landeyjahöfn`
   - `Áfram með Herjólfi til Vestmannaeyja`
6. If user clears or changes destination, clear ferry state.
7. If user changes ferry port, clear selected route/result and fetch routes again.

### Result behavior

In the result view:

- Do not display the final result as if the app evaluated road weather all the way to Vestmannaeyjar.
- Show a small context line near route metadata:
  - `Ferðaveðrið er reiknað fyrir akstur að Landeyjahöfn. Það metur ekki siglingu Herjólfs.`
- The beta banner may continue to ask for feedback, but do not imply the app has ferry-status knowledge yet.

### Data model

Keep this client-side for Phase C unless Claude Code sees a strong reason otherwise:

```ts
type FerrySelection = {
  finalDestination: RoutePlace
  ferryPort: RoutePlace
  ferryPortId: 'landeyjahofn' | 'thorlakshofn'
}
```

Submit the route/weather request using `ferryPort` as `destination`. Preserve `finalDestination` only for UI display in this phase. Do not change the travel API contract unless necessary.

If preserving final destination in the result across a reload becomes necessary, defer that to a later phase.

### Tests to add

Add focused tests rather than broad UI snapshots:

1. `isVestmannaeyjarDestination` returns true for coordinates inside Heimaey/Vestmannaeyjar bbox.
2. It returns false for Þorlákshöfn, Landeyjahöfn, Reykjavík, Selfoss, and random mainland coordinates.
3. Ferry-port candidates validate through `validateIcelandicCoords`.
4. If practical, a component/client test that selecting a Vestmannaeyjar destination shows the ferry choice before route confirmation.
5. If practical, a state test that choosing Landeyjahöfn changes the route destination used for route options.

### Copy and i18n

All new user-visible text must go into `messages/is.json` and `messages/en.json`.

Suggested keys under `teskeid.vedrid.ferdalagid`:

- `ferryVestmannaeyjarTitle`
- `ferryVestmannaeyjarBody`
- `ferryPortLandeyjahofn`
- `ferryPortThorlakshofn`
- `ferrySelectedNote`
- `ferryResultNote`
- `ferryCheckHerjolfurNote`

### Localhost checks for Stebbi

After Claude Code implements Phase C:

1. Open `/auth-mvp/vedrid` signed in with `vedrid` access.
2. Choose `Reykjavík` as origin and `Vestmannaeyjar` or `Heimaey` as destination.
3. Expected: app asks whether Stebbi is driving to Landeyjahöfn or Þorlákshöfn instead of showing a generic route failure.
4. Choose `Landeyjahöfn`.
5. Expected: route options are fetched for `Reykjavík -> Landeyjahöfn`.
6. Continue to result.
7. Expected: result says weather is for driving to Landeyjahöfn only and does not assess Herjólfur sailing or sea conditions.
8. Go back and choose `Þorlákshöfn`.
9. Expected: route options and final result update to Þorlákshöfn.
10. Change destination back to `Selfoss`.
11. Expected: ferry question disappears and normal route options return.

Regression checks:

1. `Reykjavík -> Selfoss` should not show ferry UI.
2. `Garðabær -> Akureyri` should not show ferry UI.
3. Route alternatives should still work after ferry state is cleared.
4. Public top nav should still show for unauthenticated `/`, `/senda-hugmynd`, `/innskraning`.
5. Authenticated `Lánað og skilað` should still show normal authenticated navigation.

Do not test Herjólfur live status, ferry availability, sea safety, Supabase changes, SQL, Vercel env, production auth, or production data in this localhost pass.

## Files changed by Codex

- `ai-handoff/2026-07-07-2108-todo-067-v148-codex-v147-review-plus-herjolfur-phase-c.md`

Codex did not change app code, SQL, migrations, env vars, Supabase settings, Vercel settings, commits, pushes, or deployment.

## Open questions for Stebbi / Claude Code

1. v147 says Stebbi confirmed fastest-first by driving time. If that was a misunderstanding and Stebbi still wants shortest-by-distance first, change sorting back before release.
2. Should Phase C also handle the reverse trip, where origin is Vestmannaeyjar and destination is on the mainland? This handoff scopes only the user-reported case: destination is Vestmannaeyjar.
3. Should the result include a direct Herjólfur link later? If yes, treat it as informational only, not as a status integration.
