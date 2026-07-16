# TODO 086 v215 - Codex review of v214 auth home public weather prerelease

Created: 2026-07-15 13:59  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Prerelease review  
Reviewed handoff: `2026-07-15-1400-todo-086-v214-claude-auth-home-public-weather-prerelease.md`

## Findings

No blocking findings.

Claude Code's v214 implementation matches the intended product rule:

- signed-in users with private `vedrid` access get the private `/auth-mvp/vedrid` link
- signed-in users without private `vedrid` access can still see the weather card when public weather is enabled
- those public-tier signed-in users are linked to `/vedrid`
- `WEATHER_ENABLED=false` still hides the weather card
- the private `/auth-mvp/vedrid` route guard was not loosened
- Veðurstofan provider access was not mixed into this base card decision

## Review Notes

The key code path now looks right:

- `app/auth-mvp/heim/page.tsx`
  - imports `resolveWeatherBaseAccess`
  - checks `process.env.WEATHER_ENABLED === 'true'` before calling it
  - derives:
    - `weatherCardEnabled = weatherBaseAccess.mode !== 'blocked'`
    - `weatherCardHref = '/auth-mvp/vedrid'` only when mode is `authenticated`
    - `weatherCardHref = '/vedrid'` for public mode

This is the important distinction we wanted. `resolveWeatherBaseAccess` already encodes the same public-vs-private access contract used by the weather APIs, so the home card is now aligned with the rest of the weather surface.

The tests in `lib/__tests__/home-page.test.tsx` cover the important cases:

- no `vedrid` + public weather enabled -> visible and links `/vedrid`
- has `vedrid` -> visible and links `/auth-mvp/vedrid`
- no `vedrid` + public weather off -> hidden
- global weather off -> hidden even when public weather flag is on

One small quality note, not a blocker:

- The test link lookup uses `screen.getByText('Veðrið').closest('a') ?? ...`. That is acceptable with the current `ReadyTeskeidCard` structure. If the card markup later changes, this test may become a little brittle, but it is fine for this fix.

## Commands Run By Codex

Read/review:

```powershell
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-1400-todo-086-v214-claude-auth-home-public-weather-prerelease.md'
git status --short
git diff -- 'app/auth-mvp/heim/page.tsx' 'lib/__tests__/home-page.test.tsx'
Get-Content -Encoding UTF8 'ai-handoff/README.md'
Get-Content slices of 'lib/__tests__/home-page.test.tsx'
Get-Content slices of 'app/auth-mvp/heim/page.tsx'
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Verification:

```powershell
npm run test:run -- lib/__tests__/home-page.test.tsx
npm run type-check
```

Results:

- `npm run test:run -- lib/__tests__/home-page.test.tsx`
  - Exit code: 0
  - `1 passed`
  - `82 passed`
  - Vitest emitted `Not implemented: navigation to another Document`, but the suite passed. This warning appears test-environment related and is not a blocker for this change.
- `npm run type-check`
  - Exit code: 0
  - `tsc --noEmit` clean

## Scope / Dirty Worktree Note

The repo has many unrelated modified and untracked files. Codex only reviewed the diff relevant to this v214 fix:

- `app/auth-mvp/heim/page.tsx`
- `lib/__tests__/home-page.test.tsx`

This review does not certify the entire dirty worktree for release. It certifies only this specific authenticated-home weather-card fix.

## Release / Next Step Recommendation

Ready for Stebbi localhost verification.

Do not commit, push, deploy, or change Vercel env vars solely based on this review. First confirm the product behavior locally with the user states below.

## Localhost checks for Stebbi

Use these local env expectations:

```env
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
```

1. **Signed out**
   - Open `/`.
   - Expected: `Veðrið` card is visible.
   - Click it.
   - Expected: opens `/vedrid` and public MET/Yr weather works.

2. **Signed in as `stebbishj` or another user without private `vedrid`**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` card is visible.
   - Click it.
   - Expected: opens `/vedrid`, not `/auth-mvp/vedrid`.
   - Expected: base MET/Yr weather works.
   - Expected: Veðurstofan provider is not visible unless that user has `weather-provider-vedurstofan`.

3. **Signed in as Stebbi/user with private `vedrid`**
   - Open `/auth-mvp/heim`.
   - Expected: `Veðrið` card is visible.
   - Click it.
   - Expected: opens `/auth-mvp/vedrid`.

4. **Manual private route guard**
   - As `stebbishj`, manually open `/auth-mvp/vedrid`.
   - Expected: still blocked or redirected. This confirms we did not accidentally open the private weather route.

5. **Flag regression**
   - Temporarily set `WEATHER_PUBLIC_ENABLED=false`.
   - As `stebbishj`, open `/auth-mvp/heim`.
   - Expected: `Veðrið` card is hidden unless the user has private `vedrid`.
   - Restore `WEATHER_PUBLIC_ENABLED=true` after the check.

6. **Global weather kill**
   - Temporarily set `WEATHER_ENABLED=false`.
   - Expected: weather card is hidden and weather routes are not usable.
   - Restore `WEATHER_ENABLED=true` after the check.

Do not test production env changes casually. This fix should be confirmed locally first.

## Óvissa / þarf að staðfesta

No technical blocker found in the reviewed diff.

Remaining uncertainty is product/data-state only: Stebbi needs to confirm on localhost that the real signed-in `stebbishj` account lacks private `vedrid` and still sees the public weather card as expected.

