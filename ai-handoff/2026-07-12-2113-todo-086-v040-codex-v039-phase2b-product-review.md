# TODO 086 - v039 Phase 2B product review

Created: 2026-07-12 21:13
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Product review / sequencing plan
Input reviewed: `ai-handoff/2026-07-12-2110-todo-086-v039-claude-phase2b-product-ideas.md`
Scope: Review and planning only. No source code changes, no commit, no push, no deploy, no migration.

## Findings

No blocker in the v039 product direction, but Codex recommends one sequencing correction:

**Do not fold the new "Elta vedrid" station map into Phase 2A or make it a blocker for the Phase 2A commit/push decision.** Phase 2A is already scoped, tested, and reviewed as a comparison-only detail-card feature. Keep that clean.

Stebbi's added idea is good and should become the next small validation phase:

**Phase 2B0: "Elta vedrid" station explorer, without route calculation.**

This is a strong step before letting Vedurstofan data influence route verdicts, heatmaps, provider filters, or route recommendations. It lets Stebbi visually verify station locations, coverage gaps, names, forecast freshness, and real values on an Iceland map before the data becomes part of user-facing route logic.

## Answer to Stebbi's extra question

Yes. It is a very good idea to start by setting up "Elta vedrid" without the drive/route flow.

The useful first version is:

- Show all curated Vedurstofan stations from the current station list on an Iceland map.
- No origin/destination, no Google route, no heatmap verdict.
- Clicking a station shows station id, station name, owner/source if available, coordinates, latest fetched/forecast time, freshness/stale state, and the current forecast rows.
- Include distance/confidence only where it is actually meaningful. On the station explorer itself, station confidence is mostly about "is this station verified and correctly placed"; route-point confidence belongs in the route comparison UI later.
- Keep it internal or feature-gated first, not public navigation, until attribution/source terms, map cost, and wording are verified.

This is not a replacement for the route weather flow. It is a validation and debugging tool that can later become a public "weather watcher" view if Stebbi wants that product surface.

## Recommended ordering

### 1. Finish Phase 2A first

Owner: Stebbi decides; Claude Code executes only with explicit commit/push permission.

Phase 2A should stay as reviewed in v038:

- Vedurstofan appears in point detail cards.
- MET/Yr remains the route verdict source.
- No provider filter yet.
- No public "Vedurstofan only" mode yet.

Nothing in v039 or this v040 review should block Phase 2A commit/push if Stebbi is happy with localhost testing.

### 2. Phase 2B0: station explorer / "Elta vedrid"

Owner: Claude Code should implement only after Stebbi gives explicit implementation permission.

Suggested scope:

- New internal/feature-gated page or mode for "Elta vedrid".
- Reuse existing Vedurstofan station metadata and existing server fetch/cache path.
- Show every station on an Iceland map.
- Station marker state should distinguish at least:
  - forecast available
  - stale/cache-only
  - missing/error
  - unverified/weak metadata if that state exists
- Detail panel should show forecast rows, not only one selected row.
- Include source/attribution and freshness clearly.
- Add loading, empty, and error states.
- Do not require a user route.
- Do not write a new Supabase table in this phase unless Stebbi explicitly approves a separate storage plan.

This phase should follow `Design.md`: mobile-first, no dashboard-heavy layout, no nested cards, stable controls, 40px-ish touch targets, no horizontal overflow, no hero section, and all user-facing text in `messages/is.json` and `messages/en.json`.

### 3. Phase 2B1: route comparison and confidence

Owner: Claude Code after separate approval.

After the station map exists, add the comparison features inside the current route UI:

- Show MET/Yr and Vedurstofan side by side in the detail card/drawer.
- Add a small agreement/disagreement indicator.
- Show nearest station distance and confidence for each route point.
- Keep the final route status/verdict MET/Yr-only.

This matches the earlier Phase 2B direction from v033: comparison first, decision logic later.

### 4. Phase 2C/later: provider filter

Owner: future planning first; do not implement as a quick toggle.

Provider filter is realistic as a display filter, but risky as a verdict filter.

"Yr only" is easy because the current route verdict is already MET/Yr-based.

"Vedurstofan only" is not just a UI toggle because:

- Vedurstofan rows are 3-hour forecast steps, while MET/Yr route logic works closer to hourly ETA windows.
- Vedurstofan station coverage is sparse compared with route sampling.
- Vedurstofan data does not currently provide the same gust/precipitation semantics used by the route thresholds.
- A "Vedurstofan verdict" needs its own thresholds and fallback rules.
- If one provider is missing, the app must still explain what source was used and how stale it is.

Codex recommendation: start provider filter as a "sjonarhorn" or display mode, not as a safety/verdict mode. Label it clearly, for example "Syna Vedurstofuna" / "Syna Yr" / "Syna samanburd", rather than "use this provider for the answer" until the decision model is defined.

### 5. Later: canonical Supabase weather store

Owner: separate architecture plan.

Stebbi's broader idea still makes sense: cache/store free Vedurstofan data on our side and build from our own stored data when possible. But that is a larger phase because it touches scheduled jobs, cache freshness, data retention, attribution, RLS/grants, service-role usage, fail-open behavior, and production operations.

Do not mix this into the first "Elta vedrid" explorer unless Stebbi explicitly chooses to prioritize storage architecture before UI validation.

## Who does what next

Stebbi:

- Decide whether Phase 2A should be committed/pushed now, as-is.
- If yes, give Claude Code explicit commit and/or push permission with the intended file scope.
- Decide whether the next implementation request is Phase 2B0 "Elta vedrid" station explorer.

Claude Code:

- Do not implement Phase 2B0 from this handoff alone.
- If Stebbi approves Phase 2A commit/push, stage only the Phase 2A source/test files from v038 unless Stebbi explicitly includes other files.
- If Stebbi later approves Phase 2B0, first produce a small implementation plan that names the route/page, data source, feature gate, map approach, message keys, tests, and localhost checks.

Codex:

- Review the Phase 2B0 implementation plan before code changes if Stebbi sends it back.
- Review the diff before commit/release.

## Cost / external service caution

The Vedurstofan data itself may be free, but the station explorer can still have indirect cost or operational implications:

- If it uses the existing Google Maps loader, map views can count toward Google Maps quota/billing. That is probably acceptable for an internal validation tool, but do not make it broadly public without Stebbi explicitly accepting that cost profile.
- If it fetches live Vedurstofan data through the existing server path, it may write to the current `weather_cache` depending on `.env.local`.
- If `.env.local` points at production Supabase, localhost testing may write cache rows to production.
- Public republishing/storage/attribution terms for Vedurstofan should be verified before turning this into a public product surface.

## Supabase / RLS / Production

For this v040 review:

- No SQL written.
- No migration written or run.
- No RLS, grants, auth, billing, deployment, push, or production change.
- No source files changed.

For the recommended Phase 2B0:

- Prefer no new migration and no new table.
- Use existing server-side Vedurstofan fetch/cache path if possible.
- If Claude Code proposes a new Supabase table, that should be a separate architecture review before implementation.

## Localhost checks for Stebbi

For Phase 2A before commit/push:

1. Open `/vedrid` or `/auth-mvp/vedrid` locally.
2. Calculate a real route, for example Reykjavik to Akureyri.
3. Click a route point and confirm Vedurstofan station details appear.
4. Change departure time and confirm the Vedurstofan forecast row changes with ETA.
5. Check mobile width around 360-460 px for no overflow or overlap.

For the future Phase 2B0 "Elta vedrid" station explorer:

1. Open the new internal page/mode on localhost.
2. Confirm all curated Vedurstofan stations appear on the Iceland map.
3. Click several stations across different parts of Iceland.
4. Confirm station id/name/coordinates and forecast rows are visible.
5. Confirm stale/missing/error states are understandable.
6. Confirm mobile view has no horizontal overflow, no overlapping panels, and usable touch targets.
7. Confirm the page does not require route input and does not change route-weather verdicts.

Do not test migrations, Supabase console changes, cron jobs, push, deploy, or public release behavior unless Stebbi explicitly approves those actions.

## Commands run

- `Get-Content -Encoding UTF8 'WORKFLOW.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2110-todo-086-v039-claude-phase2b-product-ideas.md'`
  - Exit code: 0
- `git status --short`
  - Exit code: 0
  - Result: repo is dirty; Phase 2A files and unrelated files are modified/untracked. Existing permission warning for `C:\Users\Lenovo/.config/git/ignore` appeared.
- `Get-Content -Encoding UTF8 'Design.md'`
  - Exit code: 0
- `rg -n "Elta veðrið|vedrid|TravelAuditMap|weather" app components lib messages`
  - Exit code: 0
  - Result: broad context search; output was long/truncated but confirmed current `/vedrid`, map, route detail, heatmap, and message locations.
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2052-todo-086-v038-codex-v037-final-prerelease-review.md'`
  - Exit code: 0
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-12-2047-todo-086-v037-claude-phase2a-final-prerelease.md'`
  - Exit code: 0
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`
  - Exit code: 0
  - Result: `2026-07-12 21:13`

## Files changed

- Added `ai-handoff/2026-07-12-2113-todo-086-v040-codex-v039-phase2b-product-review.md`

No source code, tests, SQL, env, TODO/DONE, commit, push, deploy, or Supabase state was changed by Codex in this review.

## Tests

No tests were run for this v040 review because it is product planning only.

The latest relevant Phase 2A verification remains v038:

- Targeted tests passed: 108 tests.
- Full test suite passed: 2227 passed, 27 skipped, 8 todo.
- Type-check passed.
- Lint passed with pre-existing warnings.
- Build passed with pre-existing warnings and Browserslist notice.

## Suggested copy/paste to Claude Code

```text
TODO 086 next-step clarification from Stebbi/Codex:

Do not implement from v040 unless Stebbi gives explicit implementation permission.

Phase 2A remains separate and should not be blocked by the new product idea. If Stebbi explicitly approves commit/push, stage only the Phase 2A files listed in v038 unless Stebbi says otherwise.

For the next implementation phase, Codex recommends Phase 2B0: an internal/feature-gated "Elta vedrid" station explorer, without route calculation. It should show all curated Vedurstofan stations on an Iceland map, let Stebbi click stations, see station metadata, forecast rows, freshness/stale/error states, and source attribution. It must not change route verdicts, heatmaps, or provider filtering yet.

Before implementation, produce a small plan naming the route/page, feature gate, data source, map approach, message keys, tests, Supabase/cache implications, and Localhost checks for Stebbi. Read Design.md and keep it mobile-first.
```

## Óvissa / þarf að staðfesta

- Whether Stebbi wants Phase 2A committed/pushed before Phase 2B0 begins.
- Whether "Elta vedrid" should be hidden behind existing `vedrid` access, admin-only access, or a separate feature flag.
- Whether using Google Maps for the station explorer is acceptable for internal testing, given possible map quota/billing.
- Vedurstofan public attribution/storage terms should be verified before a public station explorer or long-term canonical Supabase store is released.
