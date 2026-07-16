# Codex review of 2026-07-11-0905-todo-078-v023-claude-phase07-prerelease

## Verdict

Not quite ready to release as-is.

The UI shape is fine and `npm run type-check` passes, but the feature flag semantics are currently fail-open for an unfinished Phase 0.7 affordance. That contradicts the hidden/prerelease intent from v022 and the localhost checks in v023.

## Findings

### P1 - `ferdalagid` is enabled for all logged-in weather users when `WEATHER_TRIP_FLAG` is unset

Files:

- `lib/loans/guard.ts:75`
- `lib/loans/guard.ts:77`
- `.env.example:44`
- `.env.example:45`
- `app/auth-mvp/vedrid/page.tsx:8`

Current code:

```ts
if (featureKey === 'ferdalagid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  if (process.env.WEATHER_TRIP_FLAG !== 'true') return true
  return checkPerUserAccess(email, 'ferdalagid')
}
```

That means:

- `WEATHER_ENABLED=true`
- `WEATHER_TRIP_FLAG` unset or false
- any logged-in user with Veðrið access

will see `Breyta í ferðalag`.

This is the opposite of the v022 review and the v023 localhost check that says no affordance should appear without the trip flag. Since Phase 0.7 is deliberately a hidden seed affordance for an unfinished feature, default-open is too risky.

Recommended fix:

```ts
if (featureKey === 'ferdalagid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  if (process.env.WEATHER_TRIP_FLAG !== 'true') return false
  return checkPerUserAccess(email, 'ferdalagid')
}
```

This gives the desired prerelease behavior:

- unset/false `WEATHER_TRIP_FLAG`: nobody sees it
- `WEATHER_TRIP_FLAG=true` + `feature_access(email, 'ferdalagid')`: only selected users see it

When Ferðalagið is later ready for everyone, make that an explicit graduation decision in a later handoff, not the default now.

Also update `.env.example` comment to match:

```env
# WEATHER_TRIP_FLAG=true     # enable per-user access control for the hidden Ferðalag affordance
                             # if unset or false: Ferðalag affordance is hidden
```

### P2 - Admin copy implies per-user control, but current runtime ignores it unless the flag is true

Files:

- `app/(admin)/admin/page.tsx:1539`
- `app/(admin)/admin/page.tsx:1541`
- `app/api/admin/feature-access/route.ts:7`

The admin section itself is OK, but with current P1 behavior, adding/removing emails under `Ferðalag-aðgangur` has no effect unless `WEATHER_TRIP_FLAG=true`.

After fixing P1, this becomes coherent:

- Admin can manage the allowlist.
- The allowlist matters when `WEATHER_TRIP_FLAG=true`.
- The feature remains hidden otherwise.

No additional admin UI change is required for this phase.

### P3 - Minor accessibility polish on the new button

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1141`

The button is visually fine, but add the usual focus style and expanded state:

```tsx
aria-expanded={tripHintVisible}
className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
```

This is not a release blocker by itself, but it is a tiny fix and aligns with the rest of the app.

## What Looks Good

- `FerdalagidClient` defaults `tripEnabled=false`, so public `/vedrid` remains safe as long as the auth page passes the right value.
- The affordance is placed between the summary and the map, which avoids nested-card clutter.
- The action is secondary, not a primary CTA.
- No SQL, no API, no persistence, no saved trip model.
- Messages are in `messages/is.json` and `messages/en.json`.
- Admin feature-access API allowlist includes `ferdalagid`.

## Commands Run By Codex

```powershell
npm run type-check
```

Result:

```text
tsc --noEmit
exit code 0
```

## Recommended Next Step For Claude Code

Make a very small v025 patch:

1. Change `ferdalagid` access in `lib/loans/guard.ts` to fail closed unless `WEATHER_TRIP_FLAG=true`.
2. Update `.env.example` comment accordingly.
3. Add focus/aria polish to the `Breyta í ferðalag` button.
4. Re-run `npm run type-check`.
5. Hand off again.

Do not change the Phase 0.7 UI scope beyond that.

## Supabase / Auth / Production Notes

No SQL should be run.

The `feature_access` table is reused, but after P1 is fixed it will only affect the hidden Ferðalag affordance when `WEATHER_TRIP_FLAG=true`.

This is safe for production if the default is fail-closed. It is not safe to release as hidden/prerelease if default remains fail-open.

## Localhost Checks For Stebbi

After Claude's fix:

### Flag unset or false

1. Ensure `WEATHER_TRIP_FLAG` is absent or false in `.env.local`.
2. Restart local dev server.
3. Open logged-in `/auth-mvp/vedrid`.
4. Complete one route to result.
5. Expected: no `Breyta í ferðalag` affordance appears.

### Flag true, user not allowlisted

1. Set `WEATHER_TRIP_FLAG=true`.
2. Make sure your email is not listed for `ferdalagid` in `/admin`.
3. Restart local dev server.
4. Complete one route to result.
5. Expected: no `Breyta í ferðalag` affordance appears.

### Flag true, user allowlisted

1. Keep `WEATHER_TRIP_FLAG=true`.
2. Add your email under `/admin` -> `Ferðalag-aðgangur`.
3. Reload `/auth-mvp/vedrid`.
4. Complete one route to result.
5. Expected: `Breyta í ferðalag` appears after the summary and before the map.
6. Tap it.
7. Expected: inline text appears; no navigation, no API call, no saved data.

### Public route regression

1. Open public `/vedrid` logged out.
2. Complete one route if public weather is enabled.
3. Expected: no Ferðalag affordance appears.

Main regression checks:

- Veðrið still works for logged-in users.
- Public weather still works when `WEATHER_PUBLIC_ENABLED=true`.
- Admin feature access list still loads.
- No mobile horizontal overflow around the new action.
