# Codex Review — v364 Hólmavík caution-trigger prerelease

Created: 2026-07-16 21:45  
Timezone: Atlantic/Reykjavik  
TODO: 086  
Reviewed handoff: `2026-07-16-2145-todo-086-v364-claude-v363-done-prerelease.md`  
Reviewed commits:
- `983cd26 fix: Holmavik curated route triggers on caution, works both directions (#86)`
- `260190a docs: add v364 handoff for Holmavik caution-trigger fix (#86)`

## Findings

### High / Workflow: v364 says the change was committed and pushed

`v364` states: “implemented, committed, and pushed.” Local git confirms `origin/main` is at:

```text
260190a docs: add v364 handoff for Holmavik caution-trigger fix (#86)
983cd26 fix: Holmavik curated route triggers on caution, works both directions (#86)
```

This is not a code correctness blocker, but it is a workflow issue unless Stebbi explicitly gave commit/push permission outside this Codex thread. Per `WORKFLOW.md`, `Workflow` may allow bounded repo implementation, but it does not allow commit/push/deploy without explicit words.

No rollback recommendation from Codex unless Stebbi asks. The code itself looks targeted and tests pass. But Claude Code should be reminded not to commit/push after handoff implementation unless Stebbi explicitly says so.

### Low: stale unused imports/comments in `google.server.ts`

After changing Hólmavík from bounds-based matching to `triggerCautionId`, these imports remain in `lib/weather/google.server.ts`:

```ts
ICELAND_BOUNDS,
WESTFJORDS_NORTH_BOUNDS,
```

`HOLMAVIK_VIA` and `HOLMAVIK_PROXIMITY_M` are still used by duplicate suppression. `ICELAND_BOUNDS` and `WESTFJORDS_NORTH_BOUNDS` now appear unused in `google.server.ts`, except `WESTFJORDS_NORTH_BOUNDS` is mentioned in a comment. TypeScript did not fail, so this is not urgent, but it should be cleaned in the next small code touch.

Also update the nearby comment:

```ts
// WESTFJORDS_NORTH_BOUNDS and HOLMAVIK_VIA imported from routeCautionConstants.
```

That is stale now that the curated rule no longer uses `WESTFJORDS_NORTH_BOUNDS` directly.

## Code Review

No blocking code findings.

The implementation matches v363’s intended architecture:

- Hólmavík curated route is now caution-triggered with:

```ts
triggerCautionId: 'westfjords-south-route60'
```

- `excludedOrigin` is gone.
- `origin` and `destination` bounds gates are gone.
- Existing caution-trigger flow now controls behavior:
  - any base route has the caution → curated can trigger
  - any base route avoids the caution → no extra safe route needed
  - curated route still has the same caution → suppress it
- `shouldSkipCuratedHolmavik` remains as a duplicate guard.

This is the right model because the Hólmavík alternative should be driven by the dangerous route section/caution, not by whether Ísafjörður is origin or destination.

## Test Coverage Review

Good additions:

- Ísafjörður → Akureyri triggers `CURATED_VIA_HOLMAVIK`.
- Curated request uses `HOLMAVIK_VIA` as `via: true`.
- Base route already through Hólmavík skips curated fetch.
- Existing Garðabær/Höfn → Ísafjörður tests were updated to account for after-fetch caution validation.

One small test realism note:

The mocked curated polyline for Ísafjörður → Akureyri is enough to verify the logic, but it is not a realistic full route to Akureyri. That is acceptable for unit coverage because the key contract is “route passes near Hólmavík and clears the caution.” The final proof is still localhost visual routing against real Google output.

## Commands Run by Codex

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts
```

Results:

- `npm run type-check` passed.
- `npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts` passed: 125/125 tests.

Note: `git status --short` still prints warnings about `C:\Users\Lenovo/.config/git/ignore` permission denied. This is pre-existing/local and unrelated to the Hólmavík code.

## Recommendation

Code is ready for Stebbi localhost testing.

Do not ask Claude Code for another code pass before visual testing unless Stebbi wants the tiny import/comment cleanup immediately. That cleanup is safe but not worth interrupting the current functional test loop.

## Localhost Checks for Stebbi

1. Open `/vedrid`.
2. Search:
   - From: `Ísafjörður`
   - To: `Akureyri`
3. Expected:
   - fastest/base route still shows `Varasamt með eftirvagna` if it avoids Hólmavík
   - an additional route option appears: `Gegnum Hólmavík`
   - the Hólmavík option visually routes through/near Hólmavík
   - the Hólmavík option does not show the `Varasamt með eftirvagna` warning for the Westfjords Route 60 caution
4. Regression checks:
   - `Reykjavík` or `Garðabær` → `Ísafjörður`: still offers `Gegnum Hólmavík`
   - `Höfn` → `Ísafjörður`: still offers `Gegnum Hólmavík`
   - `Reykjavík` → `Akureyri`: does not offer `Gegnum Hólmavík`
   - If Google already offers a route through Hólmavík, there should not be a duplicate extra Hólmavík route

No Supabase, SQL, auth, RLS, env, secrets, migrations, or manual production data checks are involved.

## Óvissa / þarf að staðfesta

The remaining uncertainty is Google’s real route shaping for Ísafjörður → Akureyri with `HOLMAVIK_VIA`. Unit tests confirm our logic; localhost visual testing must confirm Google returns a user-sensible route and that the option appears in the expected order/display.
