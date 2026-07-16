# TODO 086 - assume working handoff

Created: 2026-07-13 16:12
Timezone: Atlantic/Reykjavik
Agent: Codex

Context: Stebbi said "Gerum ráð fyrir að þetta virki - gerðu handoff meðan ég skoða" after `2026-07-13-1615-todo-086-v085-claude-v084-fixes-committed`.

## Current Repo State

Latest TODO 086 commit on `main`:

```text
194b02a fix: log-safety, maxDuration, fresh/stale counts, warmer tests + admin UX (#86)
```

The v085 handoff says this commit includes:

- removal of dynamic caught error logging from the two admin weather routes
- `maxDuration = 300` on `POST /api/admin/weather/warm-vedurstofan`
- explicit `running` state instead of `useTransition` for the two admin buttons
- confirmation dialog before the 280-station warmer
- warmer result split into `fresh`, `stale`, `unavailable`, `projected`, `skipped`, `errors`, `projectionRunId`
- direct unit tests for `warmVedurstofanForecastCache()`

Committed files in `194b02a`:

- `app/(admin)/admin/page.tsx`
- `app/api/admin/weather/project-vedurstofan/route.ts`
- `app/api/admin/weather/warm-vedurstofan/route.ts`
- `lib/weather/providers/vedurstofan.server.ts`
- `lib/__tests__/weather-vedurstofan-warmer-route.test.ts`
- `lib/__tests__/weather-vedurstofan-warmer.test.ts`
- handoff/review files `v081` through `v084`

## Dirty Worktree Notes

`git status --short` still shows unrelated/older dirty files:

- `TODO.md`
- `WORKFLOW.md`
- `app/auth-mvp/vedrid/page.tsx`
- many untracked historical `ai-handoff/` files
- untracked weather trip files/tests

Codex did not touch or revert these. Claude Code should avoid treating them as part of the v085 commit unless Stebbi explicitly says so.

## Assumption For This Handoff

Assume v085 works technically while Stebbi checks:

- Vercel plan/function duration support for `maxDuration = 300`
- admin page behavior
- optional manual warmer/projector behavior

This is an assumption for planning only. It is not approval to push, deploy, run Supabase, run migrations, or trigger the warmer in production.

## What Is Ready If Stebbi Confirms

If Stebbi confirms the manual checks look good and Vercel supports 300 seconds:

1. TODO 086 Phase 2B4/2B5 can be considered locally reviewed.
2. The admin page has tools for:
   - `Keyra breytara`: cache-to-product projection, no live Veðurstofan calls
   - `Sækja allar 280 stöðvar`: live fetch/cache warm/product projection
3. The Elta veðrið page remains feature-gated and cache-only.
4. The product tables exist and can be populated from cached/warmed Veðurstofan data.

## What Claude Code Should Do Next

Only after Stebbi explicitly approves the next action:

### Option A - Release current state

Use this if Stebbi says admin/manual checks are good and wants this shipped.

Claude Code should:

1. Confirm clean/expected git status.
2. Re-run verification if needed:

```powershell
npm run test:run
npm run type-check
npm run build
```

3. If Stebbi explicitly says to push/deploy, push `main`.
4. Watch Vercel build until it is green.
5. Report final deployment status and any warnings.

Do not push/deploy from this handoff alone.

### Option B - Pause before release

Use this if Stebbi wants to first test locally or in Vercel dashboard.

Claude Code should wait. No code changes needed unless Stebbi reports a concrete issue.

### Option C - Continue product work after release

Only after this phase is released/stable:

1. Exact per-station replace semantics for `vedurstofan_forecasts_latest`.
2. Switch Elta veðrið UI from `weather_cache` to `vedurstofan_forecasts_latest`.
3. Add `type=obs` parser and populate `vedurstofan_observations_latest`.
4. Add scheduled cron/background warmer.
5. Convert travel route Veðurstofan enrichment from live/cache request-path logic to product-table reads.

## Risks Still Worth Remembering

- `maxDuration = 300` must match the deployed Vercel plan/runtime. If not, chunk the warmer or keep it local/admin-only until a better job model exists.
- The current warmer is still a long-running HTTP request. It is okay as a manual admin tool if the environment supports it, but cron/background job design should not depend forever on a browser-held request.
- Exact replacement semantics in `vedurstofan_forecasts_latest` are still a known P2 from v079. Stale extra rows are safer than empty stations, but before the UI trusts product tables, exact replacement should be resolved.
- Do not run the warmer casually against production. It live-fetches Veðurstofan and writes Supabase cache/product/run data.

## Supabase / Data Notes

No SQL was run by Codex in this handoff.

Already expected from earlier work:

- `sql/73` feature access constraint exists and was reportedly run by Stebbi.
- `sql/74` product tables exist and were reportedly run by Stebbi.
- `vedurstofan_stations` reportedly has 280 seeded rows.

Manual admin warmer/projector writes:

- `weather_cache`
- `vedurstofan_forecasts_latest`
- `weather_fetch_runs`

It does not populate `vedurstofan_observations_latest` yet.

## Localhost Checks For Stebbi

Before asking Claude Code to push/deploy:

1. In Vercel dashboard, confirm Function Max Duration supports 300 seconds for this project/team.
2. Run localhost yourself.
3. Open `/admin` as an admin user.
4. Scroll to the Veðurstofan controls.
5. Confirm the two buttons are visible:
   - `Sækja allar 280 stöðvar`
   - `Keyra breytara`
6. Click `Keyra breytara` if you want to test projection without live Veðurstofan calls.
7. Click `Sækja allar 280 stöðvar` only if `.env.local` points to the intended Supabase project and you intentionally want live Veðurstofan calls plus Supabase writes.
8. Confirm the warmer asks for confirmation first.
9. Confirm the button stays disabled while running.
10. Confirm the result shows:
    - `Ferskt`
    - `Gömul`
    - `Vantar`
    - `Breytt`
    - `Sleppt`
    - `Villur`
    - `Run ID`
11. Open `/auth-mvp/vedrid/elta-vedrid` and confirm it still loads.
12. Open `/auth-mvp/vedrid` and confirm the existing travel weather flow still works.

Do not test the warmer casually against production Supabase. It writes real data.

## Suggested Message To Claude Code

If Stebbi confirms everything looks good and wants to move forward, send Claude Code this instruction separately and explicitly:

```text
Claude Code, rýndu stöðuna eftir v085 og undirbúðu release-check fyrir TODO 086. Ekki push-a eða deploy-a nema ég segi það sérstaklega. Byrjaðu á git status, keyrðu npm run test:run, npm run type-check og npm run build, og skilaðu handoff með niðurstöðum og hvort eitthvað blokkeri push/deploy.
```
