# 2026-07-16 07:57 - TODO-086 v308 - Codex review of v307 + reload persistence requirement

Created: 2026-07-16 07:57  
Timezone: Atlantic/Reykjavik

Review target: `2026-07-16-0755-todo-086-v307-claude-v306-done-prerelease`

Additional Stebbi requirement:

> Þegar ég er kominn með leið og endurhleð síðuna á leiðin sem ég var með opna og allir útreikningar að varðveitast.

## Findings

### High - Full pulse page still uses old `vedrid` + `elta-vedrid` per-user gates

Files:

- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx:17-22`
- `lib/chat/access.server.ts:29-46`
- `lib/loans/guard.ts:71-91`

`checkChatAccess(user)` is now the right access contract for Veðurpúls:

- authenticated session
- `TESKEID_CHAT_ENABLED=true`
- base weather shell access through `resolveAuthenticatedWeatherShellAccess`
- Veðurstofan provider access
- weather-pulse access if `WEATHER_PULSE_ACCESS_REQUIRED=true`

But the full pulse page still does this before `checkChatAccess`:

```ts
await guardFeatureAccess(user.email!, 'vedrid')
await guardFeatureAccess(user.email!, 'elta-vedrid')
```

That is likely too strict after pulse/provider graduation:

- `guardFeatureAccess('vedrid')` can still require a per-user `vedrid` row when `WEATHER_AUTH_ACCESS_REQUIRED=true`.
- `guardFeatureAccess('elta-vedrid')` always requires per-user `elta-vedrid` access when `WEATHER_ELTA_VEDRID_FLAG=true`.
- A public user can see Veðurstofan after provider graduation, click the CTA, sign in as a normal user, then be blocked from the full pulse route even though `checkChatAccess` would allow them.

Recommended fix:

- Remove the two legacy `guardFeatureAccess(...)` calls from the full pulse route.
- Keep `guardTeskeidSession()`.
- Use only `checkChatAccess(user)` for pulse access.
- On denial, redirect to a safe weather page or show a controlled access message. Do not redirect to the station explorer as the only fallback, because the user may not have `elta-vedrid` access either.

This should be a blocker before testing the public CTA with non-allowlisted users.

### High - Reload persistence is not implemented for normal refresh

Files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:193-220`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:222-241`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1042-1046`

v307 stores route result state in `sessionStorage`, but only restores when the URL has:

```txt
?restore=1
```

Specifically:

```ts
const params = new URLSearchParams(window.location.search)
if (params.get('restore') !== '1') return
```

That means:

- pulse login flow can restore if it returns to `/auth-mvp/vedrid?restore=1`,
- ordinary browser refresh on `/auth-mvp/vedrid` does not restore,
- after restore the code removes `restore` from the URL, so a later normal refresh can still drop the user back to a fresh wizard.

This does not satisfy Stebbi's new requirement. The route/result state should survive a normal reload while the same route result is still relevant.

Recommended contract:

- If `sessionStorage` has a valid latest route-result payload, `/auth-mvp/vedrid` should restore it on mount even without `?restore=1`.
- `?restore=1` can still force/announce restore from pulse-login flow, but it should not be the only restore path.
- Add `schemaVersion`, `savedAtIso`, and a TTL so old weather decisions do not silently reappear forever.
- Consider showing a small "Endurheimt síðasta leið" affordance or just restore silently if it was the same active tab/session and still fresh enough.

### Medium - Restore payload is incomplete for "allir útreikningar"

Files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:111-183`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:193-241`

Current persisted fields:

```ts
origin,
destination,
trailerKind,
thresholdOverrides,
selectedRouteId,
result,
vedurstofanLayer,
showVedurstofan,
showMetno,
selectedHeatmapIdx,
```

That is a good start, but not "all calculations/state". It omits at least:

- `selectedReturnHeatmapIdx`
- `outboundVisibleStatuses`
- `returnVisibleStatuses`
- `mapOutboundVisibleStatuses`
- `submittedThresholds`
- draft threshold input values
- `routeOptions`
- `routeFallback`
- `ferrySelection`
- `userExplicitSlot`
- possibly compare/detail drawer state, depending on desired UX

Some of these are UI-only, but several affect what the user sees as the selected calculation result. For the reload requirement, define an explicit `WeatherRouteRestoreState` type and decide what is essential.

Recommended minimum:

- Restore the route result, origin/destination, selected route, thresholds actually used, provider toggles, selected departure slot, return slot, and relevant filter sets.
- If ferry route is active, restore ferry context too.
- Keep drawers optional unless Stebbi wants exact overlay/drawer restoration.

### Medium - Session restore should be typed and validated before setting state

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:199-219`

Current restore uses `JSON.parse(raw)` and directly feeds fields into React setters if present. Because this is client-local `sessionStorage`, this is not a server security issue, but malformed/corrupt stale state can still create odd client states.

Recommended:

- Add a small parser/validator for the restore payload.
- Require:
  - `schemaVersion`
  - `savedAtIso`
  - `step === 'result'`
  - `result.id` / `result.travelPlan`
  - valid `origin` and `destination` shapes
- On invalid state: remove it and do not restore.
- Add tests for valid restore, stale restore, corrupted restore, and missing route result.

### Medium - Incomplete-profile users still lose the intended pulse destination

File:

- `components/teskeid/TeskeidLoginForm.tsx:122-126`
- `app/auth-mvp/minn-profill/page.tsx:100-114`

v307 documents this as known:

```ts
router.push(hasName ? (nextHref ?? '/auth-mvp/heim') : '/auth-mvp/minn-profill')
```

That may be acceptable for a narrow test if Stebbi only tests existing complete-profile users. Product-wise, a new user who clicks "Sjá fleiri skilaboð eða segja frá aðstæðum" should not lose their intent after creating a display name.

Recommended follow-up:

- Send incomplete-profile users to `/auth-mvp/minn-profill?next=...`.
- After successful profile save, route to safe `next` if present.
- Reuse the same safe-next helper or a narrower profile-next helper.

### Low - `resolveSafeLoginNext` should use exact path boundaries

File:

- `lib/auth/loginNext.ts:8-16`
- `lib/__tests__/loginNext.test.ts:26-38`

Current allowed prefixes:

```ts
const ALLOWED_PREFIXES = ['/auth-mvp/', '/vedrid']
```

Because `/vedrid` has no slash or query boundary, it also allows paths such as:

```txt
/vedrid-anything
```

That is not an external redirect, so the risk is limited, but it is looser than the tests imply.

Recommended:

- Allow `/vedrid`, `/vedrid?...`, `/auth-mvp/...` explicitly.
- Add tests for `/vedrid-fake` and `/vedridar`.

## What looks good in v307

- The CTA copy was split into a dedicated `pulseLoginCta` key in both message files.
- Login next validation rejects obvious external URLs.
- `/innskraning` now supports safe `next` for already-authenticated users.
- `TeskeidLoginForm` now uses `nextHref` after OTP for complete-profile users.
- The pulse login CTA now points to full pulse route intent rather than plain `/innskraning`.
- The sessionStorage bridge is a reasonable first approach for crossing public route result -> login -> full pulse -> back.

## Recommendation

Do not ship v307 as-is if the goal is to test this with normal signed-in users after public/provider graduation.

I recommend one focused v309 follow-up:

1. Full pulse route: remove old `vedrid`/`elta-vedrid` guards and rely on `checkChatAccess`.
2. Extend route restore so normal reload of `/auth-mvp/vedrid` restores the last valid route result.
3. Define a typed/validated restore payload with version + TTL.
4. Expand restore payload enough to satisfy "leiðin og allir útreikningar".
5. Tighten `resolveSafeLoginNext` path boundaries.

Keep this scoped. Do not touch SQL, RLS, provider fetching, Veðurstofan projection, or chat schema in this pass.

## Localhost checks for Stebbi

After Claude Code implements the follow-up:

1. Public user:
   - Open `/vedrid`.
   - Calculate a route with Veðurstofan visible.
   - Confirm station card CTA says `Sjá fleiri skilaboð eða segja frá aðstæðum`.
   - Click it, log in as a normal user who is not on `elta-vedrid` allowlist.
   - Expected: full pulse page opens for the same station.

2. Back/close from full pulse:
   - Click `Til baka`.
   - Expected: route result is restored with same origin, destination, selected route, selected departure slot, provider toggles, and Veðurstofan station cards.

3. Ordinary refresh:
   - While on the restored route result, press browser refresh.
   - Expected: the same route result and calculations are still visible.

4. New route:
   - Start a new route calculation.
   - Expected: old persisted result does not override the new route.

5. Expired/corrupt state:
   - If practical, simulate stale/corrupt sessionStorage.
   - Expected: app falls back gracefully to normal route wizard, with no broken screen.

6. Safe next:
   - Visit `/innskraning?next=https%3A%2F%2Fevil.example`.
   - Expected: no external redirect.
   - Visit `/innskraning?next=/vedrid-fake`.
   - Expected: rejected/fallback.

Do not run SQL or change Vercel env for these checks.

## SQL / Supabase / RLS

No SQL should be needed.

No RLS, grants, policies, database functions, auth tables, production data, or service-role behavior should be touched.

## Commands / inspection

Read-only inspection only:

```powershell
Get-Content -Encoding UTF8 ai-handoff/2026-07-16-0755-todo-086-v307-claude-v306-done-prerelease.md
Select-String -Path Design.md -Pattern 'loading|route-transition|scroll|input|overflow|mobile|navigation|state|URL' -Context 2,3 -Encoding UTF8
rg -n "nextHref|safeNext|resolveSafe|returnTo|restore|sessionStorage|localStorage|pulseNeedsLogin|pulseLogin|VedurstofanPulseInline|TeskeidLoginForm" app components lib messages -g "*.ts" -g "*.tsx" -g "*.json"
Get-Content relevant source files/sections
```

No tests were run by Codex in this review.

## Óvissa / þarf að staðfesta

- I did not browser-test v307. Findings are based on handoff plus source inspection.
- Need Claude Code to decide exact TTL for route-result restore. My recommendation: short session/tab scope first, with schemaVersion and savedAtIso.
- Need Stebbi to decide whether drawer/open detail state must survive refresh. I think route/result/provider/departure state is the minimum; drawers can be optional.
