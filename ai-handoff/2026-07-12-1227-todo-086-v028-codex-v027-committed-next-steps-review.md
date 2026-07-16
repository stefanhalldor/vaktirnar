# TODO 086 - Codex review of v027 Phase 1 commit and next steps

Created: 2026-07-12 12:27
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Review / next-step handoff

Reviewed handoff: `ai-handoff/2026-07-12-1225-todo-086-v027-claude-phase1-committed.md`

Scope: Verify the local Phase 1 commit for TODO 086 and make the next steps explicit by role. Codex made no product-code changes in this review, only this review file.

---

## Findings

No blocking findings.

Commit `00e85eb` is present on local `main` and contains exactly the six intended Phase 1 source/test files:

```txt
A  lib/__tests__/weather-vedurstofan-server.test.ts
A  lib/__tests__/weather-vedurstofan-stations.test.ts
A  lib/__tests__/weather-vedurstofan-xml.test.ts
A  lib/weather/providers/vedurstofan.server.ts
A  lib/weather/providers/vedurstofanStations.ts
A  lib/weather/providers/vedurstofanXml.ts
```

No `ai-handoff/` files were included in the commit. No push has happened.

Important residual workflow risk: the worktree is still dirty with unrelated modified/untracked files. Any future commit/push work must use explicit file paths or the already-created commit. Do not use `git add .`.

---

## Verified Current State

Local commit:

```txt
00e85eb (HEAD -> main) feat: Veðurstofan Phase 1 — XML parser, station mapping, fetch/cache wrapper (#86)
```

Phase 1 status:

- Phase 1A XML parser: committed.
- Phase 1B station mapping/list: committed.
- Phase 1C server fetch/cache wrapper: committed.
- MET/Yr route behavior: unchanged.
- `/vedrid`: not wired to Veðurstofan yet.
- SQL/RLS/Supabase schema: unchanged.
- Handoff files: untracked, not committed.
- Push/deploy: not done.

Verification commands:

```txt
npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-server.test.ts
Exit code: 0
Result: 1 test file passed, 22 tests passed.
```

```txt
npm.cmd run test:run -- lib/__tests__/weather-vedurstofan-xml.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts
Exit code: 0
Result: 2 test files passed, 49 tests passed.
```

```txt
npm.cmd run type-check
Exit code: 0
Result: clean.
```

```txt
npm.cmd run lint
Exit code: 0
Result: existing unrelated warnings remain in app/s/[sessionId]/page.tsx, components/landing/Avatar.tsx, and components/weather/TravelAuditMap.tsx.
```

---

## Who Does What Next

### Stebbi decides

Stebbi chooses the next track. Nothing should happen automatically from the existence of this review.

Options:

1. Stop here for now: keep commit `00e85eb` local and do no push/deploy.
2. Ask Claude Code to push the existing local commit.
3. Ask Claude Code for a Phase 2 plan, not implementation.
4. Ask Codex for a Phase 2 plan/review first.
5. Ask Claude Code for Phase 1D cache-warmer planning, not implementation.

Recommended next product step: Phase 2 planning before any more implementation. Phase 1D scheduled warming can wait until Phase 2 proves the data is worth warming.

### Claude Code executes only after explicit permission

Claude Code should not push, deploy, write Phase 2 code, write cron/prewarm code, run Supabase, or edit TODO/DONE unless Stebbi explicitly asks for that exact action.

If Stebbi wants to push the local commit, the safe instruction should be explicit, for example:

```txt
Claude Code, push-aðu local commit 00e85eb á main. Ekki breyta skrám, ekki stage-a neitt nýtt, ekki commit-a meira, ekki deploya handvirkt. Fylgstu með Vercel build samkvæmt WORKFLOW og skilaðu handoff með niðurstöðu.
```

Before pushing, Claude Code should verify:

- `HEAD` is still `00e85eb`.
- The push includes only that commit.
- Dirty unrelated files remain unstaged.
- No `ai-handoff/` files are accidentally staged.

If Stebbi wants Phase 2, the safe instruction should be a plan first, for example:

```txt
Claude Code, gerðu Phase 2 plan fyrir TODO 086 shadow/diagnostic compare + UI. Ekki breyta kóða, ekki commit-a, ekki push-a, ekki deploya, ekki keyra Supabase. Skilaðu handoff með nákvæmu plani, áhættu og Localhost checks.
```

### Codex reviews before product-impacting implementation

Codex should review any Phase 2 plan before Claude Code implements it.

Codex should especially check:

- Veðurstofan remains fail-open.
- MET/Yr remains primary until Stebbi approves changing route verdicts.
- Shadow comparison does not silently alter user-facing recommendations.
- UI provenance/freshness is clear if Veðurstofan data becomes visible.
- Any Supabase writes are server-only and do not weaken RLS/grants.
- No scheduled warmer is mixed into Phase 2 unless separately approved.

### Nobody should do these without new explicit approval

- No push.
- No deploy.
- No new commit.
- No migration.
- No Supabase production write/test.
- No cron/Vercel Cron/Supabase scheduled function.
- No `/vedrid` behavior change.
- No route verdict change.
- No `git add .`.

---

## Recommended Phase 2 Shape

Phase 2 should be deliberately boring at first:

1. Add a server-side shadow/diagnostic layer that can fetch nearby Veðurstofan station data for the same route points.
2. Keep MET/Yr as the only source that affects the actual verdict.
3. Compare MET/Yr point forecasts with Veðurstofan station forecasts internally.
4. Surface diagnostic/freshness/provenance in a controlled UI only after the data model is stable.
5. Add user-facing recommendations only in a later phase after Stebbi has seen enough comparisons.

Do not combine Phase 2 with Phase 1D scheduled warming. A cache warmer is operational infrastructure and should remain a separate explicit approval.

---

## Supabase / RLS / Production Risk

The committed Phase 1C wrapper can write to the existing `weather_cache` table when invoked server-side with service-role configuration, but it is not wired into `/vedrid`.

No SQL was written or run by Codex in this review. No migration was run. No RLS/grant/auth/billing/secrets/deployment/GitHub production action was performed.

If Phase 2 invokes the wrapper from an API route or server action, that becomes the first point where normal app usage can create Veðurstofan cache rows. That change deserves a focused review before implementation and again before release.

---

## Localhost Checks for Stebbi

Current Phase 1 commit should not change visible `/vedrid` behavior.

Before any push/release:

1. Run `npm run test:run -- lib/__tests__/weather-vedurstofan-server.test.ts`.
2. Run `npm run test:run -- lib/__tests__/weather-vedurstofan-xml.test.ts lib/__tests__/weather-vedurstofan-stations.test.ts`.
3. Run `npm run type-check`.
4. Run `npm run lint`; expect exit 0 with existing unrelated warnings unless separately fixed.
5. Open `/vedrid` on localhost and calculate a normal route. Expected: behavior unchanged and no deliberate Veðurstofan/Supabase cache exercise.

Do not manually invoke direct Veðurstofan cache writes against production Supabase without explicit approval.

---

## Open Questions / Uncertainty

- I did not run a full app build.
- I did not live-probe Veðurstofan.
- I did not inspect unrelated dirty worktree files beyond status.
- I did not verify remote branch state or push readiness beyond local `HEAD`; no network/GitHub action was performed.
