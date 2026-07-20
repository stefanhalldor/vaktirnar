# Codex Review: v239 Phase A+C+D prerelease

Created: 2026-07-20 16:01
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Pre-release review
Relevant TODO: 086
Reviewed handoff: `2026-07-20-1540-todo-086-v239-claude-v237-phase-a-c-d-done-prerelease.md`

## Findings

### High: Public `Nánar`/`Einfalt` login-save can return to the public `/vedrid` page and never persist to DB

`components/weather/WeatherOverviewClient.tsx:155-160` stores `teskeid_pending_status_filter_mode` and redirects to `/innskraning?next=${window.location.pathname}`.

For public `/vedrid`, that means `next=/vedrid`. The login page/callback respects that exact `next` value:

- `app/vedrid/page.tsx:18-24` renders `WeatherOverviewClient` with `menuVariant="public"`.
- `app/auth-mvp/vedrid/page.tsx:10-16` is the authenticated variant.
- `app/innskraning/page.tsx:29` redirects an already-authenticated user to `safeNext`.
- `app/auth/callback/route.ts:27` redirects to `${origin}${next}` after session exchange.

The pending status-mode consumer only runs when `menuVariant === 'authenticated'`:

- `components/weather/WeatherOverviewClient.tsx:479-480`

So the main public flow can be:

1. public user opens `/vedrid`
2. clicks `Nánar`
3. gets sent to login with `next=/vedrid`
4. returns to `/vedrid`
5. component is still `menuVariant="public"`, so pending save is never consumed/persisted

The localStorage value may make the UI look correct in the same browser, which can hide the bug, but the preference is not reliably saved to the user.

Recommended fix:

- Mirror the existing wind-threshold pattern more closely.
- Either:
  - redirect public status-mode saves to `/auth-mvp/vedrid?saveStatusFilterMode=${nextMode}`, or
  - add a `saveStatusFilterMode=simple|detailed` URL fallback and consume it in a way that works after login, like `saveDefaults`.
- Prefer not to rely only on sessionStorage.
- Do not remove the pending key until a successful authenticated PUT, or keep a URL fallback so transient GET/PUT failure does not lose the intended preference.

### High / Scope Gap: `WeatherWatchersComparison` is not reused on `/vedrid`, despite the combined v237 request

The v237 handoff asked to both extract and reuse `"Fyrir þá sem eru að elta veðrið"` on `/vedrid`.

Claude extracted the component and replaced the `/ferdalagid` inline block, which is good, but `components/weather/WeatherOverviewClient.tsx` still does not render `WeatherWatchersComparison`. The v239 handoff explicitly says this part is deferred because `/vedrid` has raw `StationExplorerStation.forecasts[]` rather than `ForecastDrawerRow[]`.

That is acceptable only if Stebbi agrees this release is intentionally Phase A + `/ferdalagid` extraction + polish. It is not complete for the latest user request.

Recommended next implementation:

- Add a small adapter/helper from overview station forecasts to comparison rows, or broaden `WeatherWatchersComparison` to accept a simpler row shape.
- Render on `/vedrid` only when both selected endpoints can be resolved reliably.
- Hide the component rather than showing misleading endpoint comparisons.

### Medium: Pending status-mode is removed before network success

`components/weather/WeatherOverviewClient.tsx:481-489` removes `teskeid_pending_status_filter_mode` before the preferences GET and PUT complete.

If the authenticated preferences GET fails, the mode is lost and no DB save happens. If the PUT fails, it is also lost. This is especially risky because the code intentionally relies on sessionStorage as the only persistence bridge for this flow.

Recommended fix:

- Read the pending value early, but remove it only after a successful PUT.
- If the value is also encoded in URL params, clean URL only after the attempt is made.

### Medium: v239 leaves Phase B unimplemented

Waypoint support is explicitly deferred. That is a reasonable sequencing decision because it is larger and riskier, but it means the combined v237 request is not complete.

Do not describe the whole v237 scope as ready. Describe it as “Phase A/C/D partial prerelease, waypoint deferred.”

### Low: Working tree includes handoff rename/delete noise and `.obsidian`

`git status --short` shows:

- `.obsidian/workspace.json` modified
- `ai-handoff/2026-07-20-1215-todo-086-v236-followup-post-release.md` deleted
- `ai-handoff/2026-07-20-1212-todo-086-v236-followup-post-release.md` untracked
- new handoff files untracked
- code changes in expected weather files

Before commit, Claude/Stebbi should decide whether the v236 handoff rename/delete is intentional. `.obsidian/workspace.json` should not be committed unless Stebbi explicitly wants editor workspace state tracked.

## Positive notes

- `WeatherWatchersComparison` extraction is directionally good and reduces `FerdalagidClient.tsx` substantially.
- `/ferdalagid` replacement looks faithful to the old compact comparison + drawer pattern.
- `IcelandOverviewMap.tsx` primary-link color change is low-risk and uses the CSS `--primary` token with fallback.
- Preferences API still scopes to authenticated `user.id` and uses service role only server-side; no RLS weakening found in this review.

## Verification run by Codex

Commands run:

```bash
npm run type-check
npm run test:run
npm run build
```

Results:

- `npm run type-check`: pass
- `npm run test:run`: pass, 118 files, 3428 passed, 27 skipped, 8 todo
- `npm run build`: pass
  - Build emitted existing-style lint warnings, including `WeatherOverviewClient.tsx` hook dependency warnings around route filter sets and `IcelandOverviewMap.tsx` cleanup ref warning.
  - No fatal build errors.

## Route Intelligence Check

- Phase B waypoint work was not implemented, so no new route-memory or route-intelligence behavior was introduced by v239.
- No new Google route content is stored by these changes.
- No new route schema or SQL migration was added.
- The deferred waypoint work still needs the Route Intelligence checks from v237: protect `via:*` variants, avoid raw Google route persistence, and ensure route-memory stores only normalized place labels/keys and provider station IDs.

## Supabase / Auth / RLS

- No SQL was written or run by Codex.
- v239 does not change SQL.
- Preferences API uses authenticated `user.id`; no cross-user access found.
- Main auth risk is functional: public status-mode login-save may not hit the authenticated component route and therefore may not persist.

## Localhost checks for Stebbi

Do not release based only on green tests. Please manually test the blocker path:

1. Open `/vedrid` signed out.
2. Click `Nánar`.
3. Complete login.
4. Confirm which URL you land on: `/vedrid` or `/auth-mvp/vedrid`.
5. Reload the page.
6. Open another browser/device or clear localStorage and confirm whether `Nánar` is still saved from DB.

Expected before release:

- The flow must persist to DB, not only localStorage.
- No loop through `/innskraning`.
- Existing `Vista sem sjálfgefin vindmörk` flow still works.

Also test:

- `/auth-mvp/vedrid` logged-in direct toggle between `Einfalt` and `Nánar`.
- `/vedrid/ferdalagid` result still shows `"Fyrir þá sem eru að elta veðrið"`.
- The comparison drawer opens, preset buttons update columns, and drawer closes.
- `/vedrid` station InfoWindow `Nánar` link is green.

## Release recommendation

Hold release if the intent is to ship the public login-save flow or the full v237 combined scope.

If Stebbi only wants to ship the `/ferdalagid` comparison extraction and InfoWindow color, those parts look build-safe, but the status-mode public login-save should be fixed first because it is directly tied to the user-visible preference promise.
