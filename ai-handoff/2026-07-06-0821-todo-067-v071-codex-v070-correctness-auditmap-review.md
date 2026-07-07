# 2026-07-06-0821-todo-067-v071-codex-v070-correctness-auditmap-review

Created: 2026-07-06 08:21  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Scope: Review of `2026-07-06-0820-todo-067-v070-claude-correctness-auditmap-shipped.md`, with `2026-07-06-0816-todo-067-v070-codex-deterministic-ai-explainer-addendum.md` intentionally folded into the review.

## Findings

### P1: `buildHighlightedIssue()` still picks return over outbound on equal status, regardless of which leg is actually worse

File:

- `lib/weather/travel.ts:215-216`

Claude fixed metric-aware candidate selection inside each leg, but cross-leg selection still uses:

```ts
entries.reduce((a, b) => order[b.cand.status] >= order[a.cand.status] ? b : a)
```

Because `returnWorst` is appended after `outboundWorst`, equal-status cases always choose return. That can show the wrong decisive point when both outbound and return are `gult` or both are `rautt`, but outbound has the more severe decisive metric.

Impact:

- `svar`, audit map marker, `IssueAuditCard`, and route point summaries can all point to the wrong leg.
- This undermines the whole auditability goal even though tests pass.

Required fix:

- Use a shared candidate comparison for both within-leg and cross-leg selection:
  - status rank first
  - then reason-aware severity
  - then deterministic tie-break, preferably outbound first unless there is a strong reason to prefer return
- Add tests where outbound and return have the same status but different severities.

### P1: Return issue details still show distance as `km frá uppruna`

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:574-575`

The main `svar` uses destination-aware wording for return:

- `lib/weather/travel.ts:473-477`

But `IssueAuditCard` always renders:

```tsx
{Math.round(issue.distanceFromOriginM / 1000)} {tf('kmFromOrigin')}
```

For a return-leg issue, this contradicts the expected UX from the handoff: distance should make sense from the destination/return start, not always from origin.

Required fix:

- Either pass route distance/destination name into `IssueAuditCard` and render:
  - outbound: `X km frá {origin}`
  - return: `Y km frá {destination}`
- Or add a precomputed display field to `TravelIssue`, e.g. `distanceLabel`.
- Add a test or at least a focused component/unit assertion around return issue distance wording if feasible.

### P1: v070 deterministic-vs-AI explainer is not implemented

Files:

- `ai-handoff/2026-07-06-0816-todo-067-v070-codex-deterministic-ai-explainer-addendum.md`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:372-424`
- `messages/is.json:610-665`
- `messages/en.json:606-661`

This review intentionally includes Stebbi's requested product copy. The result UI still does not include:

- short trust line: `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`
- expandable `Hvernig er þetta metið?`
- explanation that AI does not make the weather decision

Required fix:

- Add the v070 explainer near the result/audit area, visually quiet.
- Put copy in `messages/is.json` and `messages/en.json`.
- Keep the wording calm and non-defensive.
- Do not claim travel is guaranteed safe.

Suggested Icelandic body:

```txt
Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.
```

### P2: Static Maps URL building is brittle and should use structured query encoding

File:

- `lib/weather/travel.ts:314-348`

`buildAuditMapUrl()` builds a URL by string concatenation with raw `|`, `,`, `:` and marker/path values:

```ts
url += `&path=color:0x4A90E2B0|weight:3|${pathCoords}`
url += `&markers=color:red|label:V|${highlighted.lat.toFixed(4)},${highlighted.lon.toFixed(4)}`
```

Google examples often display this shape, but the code should not rely on browser/server behavior to preserve or encode delimiters correctly. This also makes it harder to test repeated `markers` and `path` params.

Required fix:

- Build the URL with `URLSearchParams`.
- Use `.append('path', value)` and `.append('markers', value)` for repeated params.
- Add a small unit test for:
  - URL includes `size`, `scale`, `path`, `markers`, `key`
  - highlighted and destination markers are both present
  - long polylines are capped

### P2: `yr.no` URL is still best-effort and tests only check string shape

Files:

- `lib/weather/travel.ts:11`
- `lib/weather/travel.ts:67`
- `lib/weather/travel.ts:304`
- `lib/__tests__/weather-travel.test.ts:245-252`
- `lib/__tests__/weather-travel.test.ts:388-398`

The user-facing `Skoða veðurspá` link is much better than raw met.no JSON, but the implementation assumes:

```ts
https://www.yr.no/en/forecast/daily-table/{lat},{lon}
```

Claude correctly says this must be verified on localhost. The tests only assert that the URL contains `yr.no/en/forecast/daily-table`; they do not prove that yr.no opens a human-readable forecast for arbitrary Icelandic route coordinates.

Required before production:

- Stebbi should click the generated link from a real route result.
- If it fails, switch to a stable provider search URL or a verified `vedur.is` / `yr.no` pattern.
- The label should remain honest if it is a search page, e.g. `Leita að spá á yr.no`.

### P2: One new metric-aware test is too weak to protect the intended behavior

File:

- `lib/__tests__/weather-travel.test.ts:360-375`

The test named `picks precipitation candidate over higher-wind candidate when precipitation is the reason` ends with:

```ts
expect(result.travelPlan?.highlightedIssue).toBeDefined()
```

That does not assert precipitation won, that the rainy point was selected, or that the higher-wind point was not selected.

Required fix:

- Assert:
  - `highlightedIssue.metric === 'precipitation'`
  - `highlightedIssue.lat` or `routeIndex` matches the rainy point
  - `reasonCode === 'precipitation'` where the fixture is meant to prove that

Also add the cross-leg equal-status test from P1.

### P3: A hardcoded fallback string remains in `FerdalagidClient.tsx`

File:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:577-579`

Fallback copy still includes hardcoded `Hnit:`:

```tsx
: `Hnit: ${issue.lat.toFixed(4)}, ${issue.lon.toFixed(4)}`
```

In normal current flow `forecastLat` should be present, so this is not urgent. But per `WORKFLOW.md` and `Design.md`, user-facing strings should be in message files.

## Positive Notes

- Return ETA direction is now corrected through `findWorstMetric`, `evaluateCandidate`, `generateCandidates`, and route point summaries.
- Destination endpoint preservation is improved in both `google.server.ts` and `route.ts`.
- Raw met.no is no longer the primary user-facing forecast link.
- The new audit map is a pragmatic first trust layer.
- Type-check, targeted tests, full tests, and build all pass locally in Codex verification.

## Verification Run By Codex

Commands:

```txt
npm run type-check
npm run test:run -- lib/__tests__/weather-travel.test.ts lib/__tests__/weather-google.test.ts lib/__tests__/weather-coords.test.ts lib/__tests__/weather-tools.test.ts
npm run test:run
npm run build
git status --short
```

Results:

- `npm run type-check`: exit 0.
- Targeted weather tests: exit 0, 4 files passed, 126 tests passed, 5 skipped.
- Full Vitest: exit 0, 51 files passed, 1651 tests passed, 27 skipped, 8 todo.
- `npm run build`: exit 0.
- Build warnings:
  - new/expected: `app/auth-mvp/vedrid/FerdalagidClient.tsx:361` uses `<img>` for Google Static Maps.
  - pre-existing: `app/s/[sessionId]/page.tsx` hook dependency warnings.
  - pre-existing: `components/landing/Avatar.tsx` `<img>` warning.
  - pre-existing: Browserslist stale data warning.
- `git status --short`: dirty worktree with many existing untracked handoff/weather files. Codex did not revert anything.

## Design.md Notes

Relevant Design.md checks:

- Mobile-first and 360/390/460 px testing are required.
- User-facing copy belongs in messages.
- Text and controls must not overflow.
- Operational app UI should stay quiet and practical.

The current audit map approach is compatible with Design.md, assuming Stebbi confirms on mobile that the image and link rows do not overflow.

## Recommended Next Claude Code Scope

Keep this as a small follow-up pass, not route alternatives:

1. Fix cross-leg highlighted issue selection.
2. Fix return-leg distance wording in `IssueAuditCard`.
3. Add v070 deterministic-vs-AI explainer UI and messages.
4. Encode Static Maps URL with structured query params.
5. Strengthen tests for precipitation candidate selection and cross-leg tie-break.
6. Move remaining hardcoded `Hnit:` fallback to messages.
7. Run the same verification commands.

Do not implement route alternatives in this pass. No SQL, Supabase, env, commit, push, or deploy.

## Localhost Checks For Stebbi

After Claude Code fixes the follow-up:

1. Open `/auth-mvp/vedrid`.
2. Test Reykjavík to Selfoss.
3. Confirm:
   - audit map renders
   - blue route line and red/green markers are visible
   - `Skoða veðurspá` opens a human-readable page, not raw JSON
   - `Hrá met.no gögn` is clearly secondary/debug
4. Open `Af hverju?`.
5. Confirm:
   - if the issue is return-leg, distance wording is from destination/return start, not origin
   - metric/time/point match the warning
6. Confirm the new explainer appears:
   - short trust line says the result is calculated from route/forecast data, not guessed by AI
   - expanded text says AI does not decide the result
   - wording does not promise guaranteed travel safety
7. Test mobile widths around 360, 390, and 460 px:
   - no horizontal overflow
   - audit map fits
   - link rows wrap and remain tappable
8. Do not test production or change production env variables.

## Suggested Message To Claude Code

```txt
Claude Code, lestu ai-handoff/2026-07-06-0821-todo-067-v071-codex-v070-correctness-auditmap-review.md og framkvæmdu litla follow-up passann sem þar er mælt með.

Ekki innleiða route alternatives í þessum pass. Ekki SQL, Supabase, env-breytingar, commit, push eða deploy.

Mikilvægast: laga cross-leg highlighted issue selection, return-leg distance wording í IssueAuditCard, bæta inn deterministic-vs-AI útskýringunni úr v070 addendum, encode-a Static Maps URL betur, og herða prófin.
```

## Uncertainty / Needs Confirmation

- Codex did not browser-test the generated yr.no URL. Stebbi needs to click it on localhost.
- Codex did not visually inspect the static map render in browser, because Stebbi controls localhost/dev server.
- Static Maps URL may work as-is in common browsers, but structured encoding is still recommended before production.
