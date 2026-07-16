# 2026-07-15 23:15 - TODO-086 v284 - Codex review of v283 + state-preserving pulse navigation

Created: 2026-07-15 23:15  
Timezone: Atlantic/Reykjavik

Reviewed handoff: `2026-07-15-2313-todo-086-v283-claude-v282-done`

## Findings

### Medium - Full pulse back navigation drops station/result context

Stebbi's localhost test found this:

1. Open `/auth-mvp/vedrid/elta-vedrid`
2. Select station `Æðey`
3. Open full pulse route from that station
4. Click `Til baka`
5. User returns to `/auth-mvp/vedrid/elta-vedrid`, but the page starts fresh and `Æðey` is no longer open

The code confirms why:

- `selectedId` is only local React state in `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:50`
- station/marker selection only calls `setSelectedId(...)` (`lines 123-126`, `253-256`)
- station card pulse link is a plain route without context:
  - `href={`/auth-mvp/vedrid/puls/stod/${stationId}`}` at `lines 400-401`
- full pulse route back link is hardcoded:
  - `href="/auth-mvp/vedrid/elta-vedrid"` in `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:61-62`

This is especially important for the next planned use: Veðurpuls embedded from final `/vedrid` travel result cards. If a user opens a pulse from a route result and returns, they must not lose route/destination/departure/provider/result context.

Recommended fix:

1. URL-back the selected station in `elta-vedrid`.
   - Example: `/auth-mvp/vedrid/elta-vedrid?stationId=2655`
   - On mount, read `stationId` from `useSearchParams()` and initialize/select that station after data loads.
   - On marker/list click, update the URL with `router.replace(...)` or `router.push(...)`.
   - Prefer `replace` for simple selection changes unless product wants station selection itself in browser history.

2. Preserve return context when opening full pulse.
   - Build `returnTo` from the current path + search params.
   - Link to: `/auth-mvp/vedrid/puls/stod/${stationId}?returnTo=${encodeURIComponent(currentUrl)}`
   - Full pulse back link should use validated `returnTo` when present, otherwise fallback to `/auth-mvp/vedrid/elta-vedrid?stationId=${stationId}`.

3. Validate `returnTo` server/client-side before using it.
   - Only allow internal paths.
   - For this phase, allow `/auth-mvp/vedrid/elta-vedrid...`.
   - Later, allow `/auth-mvp/vedrid...` result URLs when the travel-result integration exists.
   - Never redirect/link to external URLs from untrusted query params.

4. Scroll/focus restoration:
   - When `stationId` is loaded from URL, ensure the selected station detail is visible.
   - If using the list, scroll the selected row/detail into view once data is loaded.
   - Map marker should show selected state as it already does when `selectedId` is set.

Add tests where practical:

- `elta-vedrid?stationId=2655` selects `Æðey` after data load.
- full pulse route with safe `returnTo` uses it for back link.
- unsafe `returnTo=https://evil.example` is ignored and falls back internally.

### Low - Public middleware prefix is narrower but still prefix-based

v283 improved `middleware.ts` from:

```ts
'/api/teskeid/weather/vedurpuls'
```

to:

```ts
'/api/teskeid/weather/vedurpuls/stations/'
```

This is better, and current route handler is read-only. It still means any future endpoint under `/api/teskeid/weather/vedurpuls/stations/...` bypasses middleware auth by prefix. Route handlers must still enforce auth, but future contributors could miss that.

Not a blocker, but document the rule clearly: the only public endpoint in this subtree should be the read-only `.../preview` endpoint.

## Confirmed Fixed From v282

- `getFeedMessages(...)` now uses `toPublicFirstName(...)`.
- Public preview tests were added.
- Station-card composer is now visible by default only when `canPost=true`.
- Thread creation remains lazy: station card only calls `/api/auth-mvp/vedurpuls/thread` from `handleSend`.
- Anonymous/no-access station card users see preview and no composer.
- `pulseWrite` was removed from message files after the write-toggle button was removed.

## Commands Run

Read-only inspection:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-2313-todo-086-v283-claude-v282-done.md'
rg -n "toPublicFirstName|authorName|getFeedMessages|getPreviewMessages|preview|PUBLIC_PATHS|WeatherPulseSummary|pulseWrite|returnTo|selectedId|searchParams|stationId" app components lib messages middleware.ts --glob '!lib/weather/providers/vedurstofanStationsRegistry.ts'
git diff --name-only
git status --short -- app/api/teskeid/weather/vedurpuls app/api/auth-mvp/vedurpuls app/auth-mvp/vedrid/elta-vedrid app/auth-mvp/vedrid/puls components/chat lib/chat lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/chat-repository.test.ts messages/is.json messages/en.json middleware.ts
```

Verification:

```powershell
npm run type-check
```

Result: exit 0.

```powershell
npm run test:run -- lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/vedurpuls-preview.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
```

Result: exit 0. 5 test files passed, 115 tests passed.

## SQL / Supabase / RLS

No SQL was run in this review.  
No migration was applied.  
No Supabase data, RLS policy, grant, auth setting, or production setting was changed.

## Recommendation

v283 is much closer. Before committing/releasing the pulse UI phase, I recommend one focused navigation-state pass:

1. Add URL-backed selected station state to `/auth-mvp/vedrid/elta-vedrid`.
2. Add safe `returnTo` support to the full station pulse route.
3. Use the same return-context pattern later from `/auth-mvp/vedrid` travel result cards.

This is not just polish. It protects the core workflow: users should be able to inspect a pulse and return to exactly the weather decision context they came from.

## Localhost Checks for Stebbi

After Claude Code implements the navigation-state pass:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Select `Æðey`.
3. Confirm URL contains the selected station, e.g. `?stationId=2655`.
4. Open `Opna púlsinn`.
5. Click `Til baka`.
6. Expected: returns to `elta-vedrid` with `Æðey` still selected/open, map marker selected, and the user not dumped at an unrelated top/fresh state.
7. Reload `/auth-mvp/vedrid/elta-vedrid?stationId=2655`.
8. Expected: `Æðey` opens from the URL.
9. Try a bad full-pulse URL with an external `returnTo`.
10. Expected: back link ignores the external value and falls back to a safe internal URL.

Later, when this is embedded in `/auth-mvp/vedrid` final route results, repeat the same pattern: open pulse from a travel-result station, go back, and confirm route result/departure/provider/filter context is preserved.

## Uncertainty / Needs Confirmation

- I did not browser-test the back behavior myself; this is based on Stebbi's localhost observation and code inspection.
- Need Claude Code to choose between `router.replace` and `router.push` for station selection. My recommendation: `replace` for station selection, because selecting stations should not necessarily spam browser history.
