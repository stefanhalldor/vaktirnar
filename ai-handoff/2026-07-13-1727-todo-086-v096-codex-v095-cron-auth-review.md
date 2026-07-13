# TODO 086 v096 - Codex review of v095 cron auth hardening

Created: 2026-07-13 17:27
Timezone: Atlantic/Reykjavik
Agent: Codex
Input: `2026-07-13-1711-todo-086-v095-claude-cron-auth-hardened.md`

## Findings

No blocking findings.

The P1 from v094 is fixed. Both cron routes now fail closed when `CRON_SECRET` is missing or empty:

- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/cron/cleanup-chats/route.ts`

Current pattern:

```ts
const cronSecret = process.env.CRON_SECRET
const authHeader = request.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

This matches the Vercel-recommended shape and closes the `Bearer undefined` / `Bearer ` edge case.

## Review Notes

Reviewed:

- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/cron/cleanup-chats/route.ts`
- `lib/__tests__/weather-vedurstofan-cron-route.test.ts`
- `vercel.json`

What looks good:

- New Veðurstofan cron route is still behind bearer auth.
- It checks auth before `WEATHER_ENABLED`.
- It does not run warmer if weather is disabled.
- It uses `maxDuration = 300`.
- `vercel.json` schedule remains `0 */6 * * *`, which is every 6 hours in UTC. Iceland is UTC year-round.
- Tests cover missing `CRON_SECRET`, empty `CRON_SECRET`, and `Bearer undefined` for the new Veðurstofan cron route.
- Existing cleanup cron route was also hardened, which is good because it deletes data.

Residual note, not a blocker:

- The cleanup route hardening is not covered by a dedicated cleanup-route unit test. The change is a tiny direct auth guard patch and mirrors the tested Veðurstofan route, so Codex does not consider this a release blocker. If cleanup cron gets more work later, add route-level tests for its auth and deletion behavior.

## Verification Run by Codex

Command:

```txt
npm run test:run -- lib/__tests__/weather-vedurstofan-cron-route.test.ts
```

Result:

```txt
1 passed test file
11 passed tests
exit 0
```

Command:

```txt
npm run type-check
```

Result:

```txt
exit 0
```

Command:

```txt
npm run test:run
```

Result:

```txt
80 passed test files
2381 passed, 27 skipped, 8 todo
exit 0
```

Command:

```txt
npm run build
```

Result:

```txt
exit 0
```

Build emitted existing unrelated lint warnings:

- `app/s/[sessionId]/page.tsx`
- `components/landing/Avatar.tsx`
- `components/weather/TravelAuditMap.tsx`

## Git / Worktree Notes

v095 is not committed yet.

Relevant TODO 086 dirty/untracked files:

```txt
M  app/api/cron/cleanup-chats/route.ts
M  vercel.json
?? app/api/cron/warm-vedurstofan/
?? lib/__tests__/weather-vedurstofan-cron-route.test.ts
?? ai-handoff/2026-07-13-1653-todo-086-v093-claude-cron-done.md
?? ai-handoff/2026-07-13-1657-todo-086-v094-codex-v093-cron-review.md
?? ai-handoff/2026-07-13-1711-todo-086-v095-claude-cron-auth-hardened.md
```

There are also unrelated dirty/untracked files in the repo, including:

- `TODO.md`
- `WORKFLOW.md`
- `app/auth-mvp/vedrid/page.tsx`
- many older `ai-handoff/` files
- untracked weather trip files

Codex did not touch or revert those.

## Recommendation

v095 is ready for commit and push once Stebbi explicitly approves.

Suggested message to Claude Code:

```txt
Claude Code, commit-aðu og push-aðu v095 cron-auth hardened breytinguna fyrir TODO 086.

Commit scope:
- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/cron/cleanup-chats/route.ts`
- `lib/__tests__/weather-vedurstofan-cron-route.test.ts`
- `vercel.json`
- viðeigandi v093/v094/v095/v096 handoff skjöl ef þú vilt halda þeim með í commitinu

Ekki taka með ótengdar breytingar í `TODO.md`, `WORKFLOW.md`, `app/auth-mvp/vedrid/page.tsx` eða weather-trip skrár.

Eftir push: fylgstu með Vercel deployment þar til commit-ið er grænt. Ekki keyra Supabase, ekki invoke-a production cron endpointið handvirkt og ekki deploya handvirkt nema ég biðji sérstaklega um það.
```

After push/deploy:

1. Confirm Vercel build is green.
2. Confirm `/api/cron/warm-vedurstofan` appears in Vercel Cron Jobs.
3. Confirm `CRON_SECRET` exists in the Vercel Production environment.
4. Let the first scheduled run happen, or manually invoke only with explicit Stebbi approval because it writes weather cache/product table data.

## Localhost Checks for Stebbi

Local safe checks:

1. Do not paste real `CRON_SECRET` in chat.
2. With local dummy `CRON_SECRET`, call `/api/cron/warm-vedurstofan` without auth. Expected: 401.
3. Call it with wrong bearer token. Expected: 401.
4. Temporarily remove local `CRON_SECRET` and call with `Authorization: Bearer undefined`. Expected: 401.
5. With dummy `CRON_SECRET` and `WEATHER_ENABLED` off, call with correct dummy bearer token. Expected: 200 and `{ skipped: "weather disabled" }`.
6. Do not run the real production cron endpoint casually. It writes cache/product-table data and calls Veðurstofan.

Production checks after deploy:

1. Vercel deployment for the commit is green.
2. Vercel Project Settings -> Cron Jobs shows `/api/cron/warm-vedurstofan`.
3. Vercel Production env has `CRON_SECRET`.
4. After first run, inspect cron logs and Elta vedrid product freshness.
