# TODO-086 v331 - Codex handoff: route pulse title and realtime refresh gap

Created: 2026-07-16 14:51
Timezone: Atlantic/Reykjavik

Source context:
- Stebbi reviewed the released/prerelease route-scoped pulse summary after `2026-07-16-1436-todo-086-v330-claude-v328-v329-done-prerelease`.
- Stebbi's latest screenshots show the new route-level pulse summary is in a good place product-wise, but the title and freshness behavior need correction.
- This is handoff only. Codex did not change product code, SQL, env, migrations, commits, pushes, deployment, Supabase data, or production.

## Findings

### 1. Route-scoped pulse summary does not update after new station messages

Severity: High

Evidence from code:
- `components/weather/VedurstofanRoutePulseSummary.tsx` fetches `/api/teskeid/weather/vedurpuls/route-preview` once inside `useEffect`.
- The effect depends only on `stationIdsKey`.
- There is no polling interval, no shared refresh event, and no Supabase Realtime subscription.

Evidence from Stebbi's screenshots:
- The route-level summary shows only one older Sandskeið message: `Flottar aðstæður núna.`
- The Sandskeið station card below shows additional messages: `Prófun: Skilaboð 2` and `Prófun: Skilaboð 3`.
- The Garðabær - Kauptún station card shows a station-specific message: `Prófunarskilaboð 1`, but the route summary does not reflect it.

Expected behavior:
- The route-scoped summary should refresh when a new pulse message is posted for any Veðurstofan station included in the active route.
- It should update without a full page reload.
- It should preserve the product behavior Stebbi likes: route-level read-only preview, not a compose surface.
- It should remain hidden when there are no messages for any included station.

Recommended implementation direction:
- Prefer reusing the chat core refresh pattern rather than adding one-off route-only logic.
- Short safe fix: add a 30-second polling refresh to `VedurstofanRoutePulseSummary`, matching `VedurstofanPulseInline`.
- Better fix if low-risk: create a reusable preview refresh hook for station previews and route previews, so:
  - station cards and route summary share loading/fetch/update behavior,
  - the full chat panel remains the full threaded experience,
  - route summary can re-fetch after posts without layout jumps.
- True Realtime can be added, but be careful:
  - message rows are keyed by `thread_id`, while this component starts from station IDs,
  - Supabase realtime filters are easier if the client knows the relevant thread IDs,
  - otherwise a lightweight poll may be the safer first release fix.

### 2. Route summary title should change

Severity: Medium

Current text:
- `messages/is.json`: `safnpulsRouteTitle = "Nýjast frá stöðvum á leiðinni"`
- `messages/en.json`: `safnpulsRouteTitle = "Latest from stations on your route"`

Stebbi's requested title:
- Icelandic: `Nýjast frá notendum Teskeið.is`
- Suggested English: `Latest from Teskeið.is users`

Do this through message files, not hardcoded text.

### 3. Kauptún-specific message not appearing in route summary must be verified

Severity: High if it is not only the refresh bug

The Kauptún message should appear in route summary if Garðabær - Kauptún is one of the route's Veðurstofan stations. If it does not appear even after refresh, check:
- station ID consistency between `vedurstofanLayer.points` and chat thread `target_id`,
- route station deduping in `VedurstofanRoutePulseSummary`,
- route-preview endpoint response ordering and per-station map output,
- whether Kauptún is being omitted by station limit or route filtering.

### 4. Route-preview still has a 40 station hard limit

Severity: Medium

From v330 review context:
- `app/api/teskeid/weather/vedurpuls/route-preview/route.ts` has `MAX_STATION_IDS = 40`.
- `VedurstofanRoutePulseSummary` sends all ordered route station IDs.

If a route has more than 40 Veðurstofan stations, the endpoint returns 400 and the route summary silently disappears. That can look like "no pulse" even when data exists.

Recommended fix:
- Either chunk requests client-side/server-side, or consciously cap route-summary station IDs in route order with clear code comments.
- Chunking is more correct, but capping may be acceptable if the UI intentionally previews only the first N route stations. Do not silently send >40 and hide the component on 400.

### 5. Keep the current placement unless Stebbi later changes direction

Severity: Product note

Stebbi said the current placement did not land exactly where expected, but is "eiginlega betra svona". Keep the current route-summary placement for now.

Do not move it back under "Mest krefjandi" unless Stebbi explicitly asks later.

## Suggested Claude Code task

Please implement a small, focused v332 fix:

1. Rename route-summary title:
   - `messages/is.json`: `Nýjast frá notendum Teskeið.is`
   - `messages/en.json`: `Latest from Teskeið.is users`

2. Make `VedurstofanRoutePulseSummary` refresh after new pulse messages:
   - minimum acceptable: poll the route-preview endpoint every 30 seconds, same cadence as station preview,
   - better if still simple: extract/shared a small preview refresh hook used by both station inline preview and route summary,
   - avoid UI jumping and keep component hidden if no messages.

3. After any successful inline station post on the same page, make route summary update faster than waiting for the next interval if this can be done simply:
   - for example a lightweight custom event from `VedurstofanPulseInline` after successful post, listened to by `VedurstofanRoutePulseSummary`,
   - but avoid a broad event system if it makes this phase large.

4. Fix the >40 station case:
   - chunk route-preview calls, or cap intentionally in route order with a clear constant and comment.

5. Verify Kauptún:
   - post to Kauptún station card,
   - route summary must update if Kauptún is on the route.

## Files likely involved

Likely changed:
- `components/weather/VedurstofanRoutePulseSummary.tsx`
- `messages/is.json`
- `messages/en.json`

Possibly changed:
- `components/weather/VedurstofanPulseInline.tsx` if using a same-page refresh event after posting.
- A new reusable hook under `components/chat/` or `lib/chat/` if Claude Code chooses to reduce duplication.
- `app/api/teskeid/weather/vedurpuls/route-preview/route.ts` only if adjusting the API contract for batching or thread metadata.

Avoid unless clearly needed:
- SQL migrations
- RLS/policy changes
- auth changes
- env changes
- route calculation or weather scoring changes

## Commands run by Codex for this handoff

Read-only commands:
- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-16-1436-todo-086-v330-claude-v328-v329-done-prerelease.md'`
- `Get-Content -Encoding UTF8 'components/weather/VedurstofanRoutePulseSummary.tsx'`
- `Get-Content -Encoding UTF8 'components/weather/VedurstofanPulseInline.tsx'`
- `Get-Content -Encoding UTF8 'app/api/teskeid/weather/vedurpuls/route-preview/route.ts'`
- `Select-String` over message and chat files to inspect relevant keys and refresh patterns.

No tests were run for this handoff.

## Localhost checks for Stebbi

After Claude Code implements the fix:

1. Open `/vedrid` and calculate a route that includes Veðurstofan stations with existing pulse messages, for example Sandskeið and Garðabær - Kauptún if they are on the route.
2. Confirm the route-level summary title is exactly:
   - `Nýjast frá notendum Teskeið.is`
3. Confirm the route-level summary is still hidden if none of the route stations have pulse messages.
4. As an authenticated user, post a new message on the Sandskeið station card.
5. Expected:
   - the Sandskeið station card updates,
   - the route-level summary also updates without reloading the page,
   - if an immediate event is implemented, it updates almost immediately,
   - if polling is implemented only, it updates within the documented polling interval.
6. Post a new message on the Garðabær - Kauptún station card.
7. Expected:
   - the Kauptún card updates,
   - the route-level summary includes/updates Kauptún if Kauptún is one of the route stations.
8. Open the same route in a second browser/session and post a message there.
9. Expected:
   - the first browser eventually updates via realtime or polling.
10. Test public view:
   - public users can see preview messages,
   - public users cannot compose,
   - no empty route-pulse box is shown when no messages exist.
11. Test mobile width around 390px:
   - no horizontal overflow,
   - no jarring layout jump when the route summary refreshes,
   - "Sjá fleiri skilaboð" still preserves `returnTo`.

## Remaining uncertainty

- Codex did not inspect the browser runtime or production logs.
- Based on code, the route summary definitely does not have realtime or polling today; that matches Stebbi's screenshot.
- Whether Kauptún is missing solely because of the missing refresh, or because station IDs are mismatched/filtered, must be confirmed during implementation.
