# 2026-07-18 09:40 - TODO 086 v473 - Claude v472 done, prerelease

Created: 2026-07-18 09:40
Timezone: Atlantic/Reykjavik

Source handoffs implemented:
- `2026-07-18-0906-todo-086-v471-codex-v470-review-and-second-live-warm-gate` (stale comment cleanup)
- `2026-07-18-0915-todo-086-v472-codex-vedrid-overview-cleanup-vegagerdin-pulse-handoff` (Phases A-E)

## What was implemented

### Commit: parser field name fix (v470 work)

Committed separately as "fix: correct Vegagerdin parser field names from live upstream response (#86)":
- `lib/weather/providers/vegagerdinCurrentTypes.ts`: stale PENDING VERIFICATION comment replaced with verified field list
- `lib/weather/providers/vegagerdinCurrent.server.ts`: parseStationId docblock updated (Nr not Maelir_nr)
- `lib/__tests__/weather-vegagerdin-current.test.ts`: all fixture objects updated to live field names
- `lib/__tests__/warm-vegagerdin-cron.test.ts`: timestamp flake fix (FIXED_NOW)

### Phase A — Provider toggle state

`WeatherOverviewClient.tsx`:
- Added `const [showVedurstofan, setShowVedurstofan] = useState(true)`
- Added `const [showVegagerdin, setShowVegagerdin] = useState(true)`
- Both providers: `canToggle: true`, `isVisible: showX`, `onToggle: (v) => setShowX(v)`

### Phase B — Removed Veðurstofu debug/status UI

`WeatherOverviewClient.tsx`:
- Removed `STATUS_COLOR` constant
- Removed `Filter` type and `const [filter, setFilter]` state
- Removed summary strip (total/ok/stale/unavailable counts) from `vedurstofanProvider.renderPreMap`
- Removed filter tabs (Allar/Í lagi/Gömul/Vantar) from `vedurstofanProvider.renderPostMap`
- Removed station list from `vedurstofanProvider.renderPostMap`
- All Veðurstofu markers now `visible: true` (no filter-based hiding)
- `vedurstofanProvider.renderPostMap` now only returns `StationDetail` when a station is selected

### Phase C — Vegagerðin visible on map

Vegagerðin markers were already built into `vegagerdinLayer` from earlier work. With:
- `canToggle: true` and `isVisible: showVegagerdin`
- `unavailableReason` reflecting real state (restricted/error/empty/undefined)

Vegagerðin markers now appear on the map when cache is warm and pill is active.

### Phase D — Conditions feed ownership moved to Vegagerðin

`WeatherOverviewClient.tsx`:
- `ConditionsFeedPreview` removed from `vedurstofanProvider.renderPreMap`
- `vedurstofanProvider.renderPreMap` removed entirely (no longer needed)
- Added `vegagerdinProvider.renderPreMap` with the full `ConditionsFeedPreview` block
- Feed is owned by Vegagerðin because it reads `vegagerdin_station` threads only
- `emptyBehavior="hide"` unchanged — no empty public block when no messages

`WeatherOverviewShell.tsx`:
- Provider strip replaced with filter pills:
  - Active pill: `bg-foreground text-background border-foreground`, `aria-pressed=true`
  - Inactive pill: `border-border text-muted-foreground`, `aria-pressed=false`
  - Unavailable/loading pill: muted, `disabled`
- Added `useEffect` to clear selected marker + URL when its provider layer is toggled off

### Phase E — Provider-aware chat access

`lib/chat/access.server.ts`:
- `ChatAccessResult` now includes `'no-vegagerdin'`
- `checkChatAccess(user, options?: { provider? })` accepts optional provider
- `provider='vegagerdin'`: checks `weather-provider-vegagerdin` only when `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`; otherwise open to all weather-enabled users
- `provider='vedurstofan'` (default): existing behavior unchanged

Updated callers:
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`: `checkChatAccess(user, { provider: 'vegagerdin' })`
- `app/api/auth-mvp/vedurpuls/thread/route.ts`: access check moved to after provider validation; passes `{ provider }` from body
- `app/api/auth-mvp/vedurpuls/feed/route.ts`: `checkChatAccess(user, { provider: 'vegagerdin' })`
- `app/api/auth-mvp/vedurpuls/messages/route.ts` POST: `checkChatAccess(user, { provider: 'vegagerdin' })`
- `messages/route.ts` GET, `read/route.ts`, `access/route.ts`: unchanged (vedurstofan default)

`lib/__tests__/chat-access.test.ts`: 7 new tests for vegagerdin provider path.
`lib/__tests__/vedurpuls-api.test.ts`: thread POST auth tests updated to include `provider` field (needed after access check moved post-validation).

## Commands run

```
npm run type-check   -> exit 0
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/vedurpuls-feed.test.ts
-> exit 0, 8 files, 225 tests passed
```

No localhost checks. No SQL. No commit or push (v470 commit was made above). No live upstream fetch.

## Changed files (uncommitted)

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `lib/chat/access.server.ts`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`
- `app/api/auth-mvp/vedurpuls/thread/route.ts`
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `lib/__tests__/chat-access.test.ts`
- `lib/__tests__/vedurpuls-api.test.ts`

## Localhost checks for Stebbi

### Require a warmed cache

Run the warm route if cache is stale (>2 min since last warm):
```powershell
curl.exe -s -H 'Authorization: Bearer <CRON_SECRET>' http://localhost:3004/api/cron/warm-vegagerdin
```
Expected: `{ "status": "ok", "stationCount": 202, ... }`

### Open /vedrid

1. Provider row is now two pills: `Veðurstofan` and `Vegagerðin` (both active/dark by default)
2. Both Veðurstofu and Vegagerðin markers visible on the map
3. Old summary strip (280 stöðvar, Ný gögn...) is gone
4. Old filter tabs (Allar/Í lagi/Gömul/Vantar) are gone
5. Old station list under the map is gone
6. Conditions feed appears if Vegagerðin messages exist, hidden if none

### Provider pill toggles

7. Toggle `Vegagerðin` off → Vegagerðin markers disappear, pill becomes muted/inactive
8. If a Vegagerðin marker was selected, card closes and URL clears
9. Toggle `Vegagerðin` back on → markers reappear
10. Toggle `Veðurstofan` off → Veðurstofu markers disappear
11. Toggle `Veðurstofan` back on → markers reappear

### Marker selection

12. Click Veðurstofu marker → detail card opens (forecast rows, pulse preview)
13. Click Vegagerðin marker → detail card opens (current measurements, pulse preview)
14. URL gets `?provider=vegagerdin&stationId=...` or `?provider=vedurstofan&stationId=...`
15. Reload URL → same marker restores

### Regression

16. Legacy `?stationId=31392` (no provider param) → Veðurstofu marker restores (fallback)
17. Veðurstofan pulse page still accessible

## Deferred

- Vercel cron scheduling (after localhost validation)
- SQL 81: Vegagerðin write/compose still needs this before users can post vegagerdin pulse messages
- Route-selection provider overlays
- Stronger concurrent-warm protection
- messages GET / read / report routes: still use vedurstofan default access check for ALL_TARGET_TYPES threads; vegagerdin-specific access would require looking up thread.targetType from DB
