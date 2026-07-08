# TODO-067 v167 - Codex review of v165 Claude prerelease

Created: 2026-07-08 05:53  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Reviewed handoff: `2026-07-08-0521-todo-067-v165-claude-v164-done-prerelease.md`

## Findings

### 1. High - `Breyta forsendum` and `Byrja aftur` were removed without being part of v164 scope

Files/lines:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:736`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:771`

The result step now renders route summary, error back button, loader, error message and result card, but no `Breyta forsendum` or `Byrja aftur` action remains.

This was not requested in Codex v164. Earlier product direction from Stebbi was explicitly the opposite: the result screen should not only have `Byrja aftur`; it should also have `Breyta forsendum`. Later work moved editing into top step navigation, but that does not fully replace:

- a clear primary recovery path for normal users,
- a quick reset/new trip path,
- a discoverable "edit assumptions" affordance on the result page.

The top step nav does allow returning to completed steps, but relying only on that is a product decision that Stebbi should approve explicitly. It should not be slipped into v165 as a cleanup.

Recommendation:

- Restore at least `Byrja aftur` on the result screen.
- Prefer restoring both `Breyta forsendum` and `Byrja aftur` until Stebbi explicitly approves their removal.
- If Claude Code believes the top step navigation now replaces `Breyta forsendum`, document that as a proposed product decision and ask Stebbi before removing the visible action.

### 2. Medium - Step-nav threshold screen-reader text does not match live edited values

File/lines:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:599`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:603`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:607`

The visual threshold summary uses `navThreshWind` and `navThreshPrecip`, which update live while the user edits values on the threshold step. The `sr-only` accessibility text still uses `effectiveThresholds`, which represents submitted/effective values, not the draft values.

This creates a mismatch:

- sighted user sees edited draft values in the top nav,
- screen reader user hears stale submitted/default values.

Recommendation:

- Derive nav threshold values as structured numbers/strings once and use the same values for both visual content and `stepNavThresholdSummaryAria`.
- If draft values are invalid/empty, use a safe fallback and consider adding "ógilt gildi" only if needed. Do not silently read different valid numbers than the UI displays.

### 3. Low - Loader hides subtitle whenever route label exists

File/lines:

- `components/weather/WeatherResultLoader.tsx:22`
- `components/weather/WeatherResultLoader.tsx:25`
- `components/weather/WeatherResultLoader.tsx:31`

When `routeLabel` exists, the loader displays the route label and omits `subtitle`. The step list is `aria-hidden`, so assistive tech effectively gets the title plus route only, not the more useful "fetching route, forecast points and weather data" context.

This is not a blocker, but it weakens the accessibility/clarity of the new loader.

Recommendation:

- Show subtitle even when route label exists, or expose it via sr-only text.
- Keep visual density reasonable; a two-line text block is probably fine here.

## What looks good

- `npm run type-check` passes in Codex review.
- The conditional threshold reset behaviour is implemented in the right place and compares draft values against `resolveThresholds(trailerKind)`.
- The result loader is scoped and simple.
- The route step nav uses `effectiveDestinationName`, so ferry-port substitution should be reflected in the route summary.
- Threshold defaults in `lib/weather/thresholds.ts` are centralized through `resolveThresholds()`.

## Scope notes

The v165 handoff includes threshold changes that were "already in progress, not previously documented":

- driving red wind `20 -> 25`
- driving red gust `28 -> 35`
- heavy trailer tier `10/15/18`
- `caravan` and `horse_trailer` routed to heavy trailer
- tent/folding/generic routed to existing `caravan` thresholds `13/18/25`

This is a real product/model change, not only UI. It may be correct, but Stebbi should consciously approve that it belongs in this release. The tests were updated to match the new values; that confirms implementation consistency, not product correctness.

## Suggested message to Claude Code

```md
Claude Code, please tighten v165 before Stebbi does final localhost review.

Codex review found two required fixes:

1. Restore result-screen actions unless Stebbi explicitly approves removing them.
   - v165 removed `Breyta forsendum` and `Byrja aftur`, but that was not part of v164 scope.
   - Please restore at least `Byrja aftur`.
   - Prefer restoring both visible actions for now.
   - If you believe top step navigation replaces `Breyta forsendum`, keep that as a proposed product decision, not an implicit removal.

2. Fix threshold nav accessibility text.
   - The visual nav summary updates live from draft threshold values.
   - The sr-only text currently uses `effectiveThresholds`, so screen reader text can be stale.
   - Use the same live nav values for both visual summary and `stepNavThresholdSummaryAria`.

Optional polish:

3. Loader accessibility:
   - `WeatherResultLoader` hides subtitle when routeLabel exists, and the step list is aria-hidden.
   - Please expose the subtitle visually or as sr-only text so assistive tech gets useful context.

After fixes, rerun:

`npm run type-check`
`npm run test:run`

Then return a short handoff with changed files, test results and any product decision you need Stebbi to confirm.
```

## Localhost checks for Stebbi

After Claude Code tightens v165:

1. Open `/auth-mvp/vedrid` on localhost while logged in with weather enabled.
2. Select route and trailer, then calculate a result.
   - Expected: loader appears while calculating and does not jump layout.
3. On the result screen:
   - Expected: `Byrja aftur` is available unless Stebbi explicitly decided to remove it.
   - Expected: `Breyta forsendum` is available or there is an explicitly approved replacement UX.
4. Tap/click `Breyta forsendum` if present.
   - Expected: user can edit route/trailer/thresholds without losing context unexpectedly.
5. Tap/click `Byrja aftur`.
   - Expected: route/destination/result are cleared and a new trip can be started.
6. Go to `Veðurmörk`.
   - Expected: `Nota sjálfgefin viðmið` is hidden at defaults.
   - Expected: changing one draft value shows reset.
   - Expected: changing it back hides reset.
7. While editing threshold draft values, inspect top nav visually.
   - Expected: threshold nav summary updates live.
8. Check with keyboard/focus if practical.
   - Expected: top step nav and reset button remain reachable and focus-visible.
9. Mobile widths 360 px, 390 px, 460 px.
   - Expected: no horizontal overflow in step nav, result actions or loader.

No SQL, Supabase, RLS, auth, migration, production data, secrets or deployment checks are part of this v165 tightening review.

## Commands Codex ran

```powershell
Get-Content -Encoding UTF8 'WORKFLOW.md'
Get-Content -Encoding UTF8 'ai-handoff/2026-07-08-0521-todo-067-v165-claude-v164-done-prerelease.md'
git status --short
git diff -- app/auth-mvp/vedrid/FerdalagidClient.tsx
git diff -- lib/weather/thresholds.ts lib/__tests__/weather-travel.test.ts
git diff -- messages/is.json messages/en.json components/weather/WeatherResultLoader.tsx
Get-Content -Encoding UTF8 'components/weather/WeatherResultLoader.tsx'
rg -n "editAssumptions|startOver|assumptionsTitle|assumptionThresholds|recompute|thresholdRowValue|returnToStep|stepNavThresholdSummaryAria|navThreshWind|navThreshPrecip" app/auth-mvp/vedrid messages/is.json messages/en.json
$p='app/auth-mvp/vedrid/FerdalagidClient.tsx'; $c=Get-Content -Encoding UTF8 $p; $c[520..625]; $c[720..835]
npm run type-check
$i=0; Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/FerdalagidClient.tsx' | ForEach-Object { $i++; if ($i -ge 585 -and $i -le 612) { '{0,4}: {1}' -f $i, $_ } }
$i=0; Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/FerdalagidClient.tsx' | ForEach-Object { $i++; if ($i -ge 730 -and $i -le 775) { '{0,4}: {1}' -f $i, $_ } }
$i=0; Get-Content -Encoding UTF8 'components/weather/WeatherResultLoader.tsx' | ForEach-Object { $i++; '{0,4}: {1}' -f $i, $_ }
Get-Date -Format "yyyy-MM-dd HH:mm"
```

## Test results

- `npm run type-check`: passed.
- `npm run test:run`: not rerun by Codex in this review. Claude v165 reports it passed with `1856 passed, 27 skipped, 8 todo`.

## Óvissa / þarf að staðfesta

- Whether Stebbi intentionally wants to remove result-screen `Breyta forsendum` and `Byrja aftur`. Codex recommendation: do not remove them in v165 without explicit approval.
- Whether the threshold model changes belong in the same release as v164 UI polish. They may be correct, but they are product/model changes, not just UI cleanup.
