# TODO 086 v131 - Codex review of v130 prerelease

Created: 2026-07-14 06:52
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-14-0650-todo-086-v130-claude-v129-done-prerelease.md`
Reviewed implementation scope: v129 fixes for provider toggles, Veðurstofan-only display, map markers, and provenance

## Findings

### High - `met.no` can still drive the summary/timing when it is unchecked

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:527-573`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:651-667`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:989-997`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1014-1023`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1055-1059`

v130 improved the Veðurstofan worst-station selection by choosing the forecast row nearest the estimated station ETA. That is a good step.

But the ETA and the displayed departure are still based on `activeOutboundCandidate`, which comes from `result.travelPlan.outbound...`, i.e. the MET/Yr baseline result. In window mode this can be the MET/Yr-selected best departure slot. When `met.no` is unchecked, the UI still:

- uses `activeOutboundCandidate.departureIso` and `arrivalIso` to compute station ETA,
- shows the `Brottför` row from that same candidate,
- can show the MET/Yr-derived best-window text,
- still shows coverage text from `outboundDisplayCandidates`.

This means the product requirement is still not fully met:

> If `met.no` is unchecked, MET/Yr data must not be part of the visible/active calculation.

The current behavior is closer to:

> Veðurstofan station risk is displayed against a MET/Yr-derived candidate/departure scaffold.

That can be acceptable only if it is explicitly labelled as a reference mode, but it is not the same as a Veðurstofan-only assessment.

Recommended next fix:

- Introduce an explicit `activeProviderMode`/`activeAssessment` concept.
- When only Veðurstofan is selected, do not use the MET/Yr candidate as the hidden calculation backbone.
- If there is no Veðurstofan departure-candidate model yet, use a neutral user/reference departure time and label it clearly, for example "Miðað við valinn brottfarartíma" rather than "Teskeið hefur metið brottfarartíma".
- Hide MET/Yr best-window and coverage copy when `showMetno === false`.

Minimum acceptable interim:

- In Veðurstofan-only mode, hide the MET/Yr-derived coverage and best-window text.
- Rename the summary semantics so it does not imply a full provider-independent route assessment.

### High - Turning all providers off still leaves MET/Yr assessment visible

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:906-915`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1014-1023`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1096-1108`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1296-1303`

The UI allows `met.no` to be toggled off while `Veðurstofan` is also off. In that state:

- the map does not render because both active point sets are empty,
- but the result card still falls back to `activeOutboundCandidate?.status ?? result.stada`,
- the summary can still show MET/Yr-derived departure and "Á leiðinni" details.

This contradicts provider-selection semantics: if no provider is active, no provider-derived weather assessment should remain visible as if it were active.

Recommended fix:

- Either prevent the last enabled provider from being disabled.
- Or show an empty/provider-required state: "Veldu að minnsta kosti eina gagnaveitu til að sýna veðurmat."
- Do not fall back to `result.stada` or `activeOutboundCandidate` when all providers are off.

This also future-proofs for Vegagerðin. Provider toggles need a single source of truth for "active data included in assessment", not only conditional map/list rendering.

### Medium - Veðurstofan-only summary does not show which forecast row/time drove the status

References:
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:663-667`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1078-1081`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1933-1936`

The worst-station calculation now picks the nearest row to ETA, but only stores `{ station, windMs }`. The summary shows station name and wind value, but not the forecast row time that produced it.

For validation, Stebbi needs to know whether the 12 m/s value came from `06:00`, `09:00`, etc. The station card lists rows, but the route summary should also include the decisive row time, especially when the user is checking whether Sandskeið really is the most demanding point.

Recommended fix:

- Store the selected forecast row in `worstVedurstofanData`, e.g. `{ station, row, windMs, etaIso }`.
- Display something like:
  - `Sandskeið · vindur 12 m/s · spá kl. 06:00`
  - optionally `áætlað við stöð kl. 06:27`

This makes the Veðurstofan branch auditable without forcing the user to infer from the full station table.

### Medium - `augmentedResult` is still built and returned even though it is outside the approved UI path

References:
- `app/api/teskeid/weather/travel/route.ts:403-484`
- `lib/weather/providers/vedurstofanBlend.ts:13-23`
- `lib/weather/providers/vedurstofanBlend.ts:62-63`

This was left open from v129. It is still low immediate risk because the UI does not use it, but it keeps a max-blended MET/Yr + Veðurstofan result in the API payload. That is exactly the behavior Stebbi pushed back on earlier because it made provider provenance confusing.

Recommended fix before release, if cheap:

- Remove `augmentedResult` from the client response for now, or rename it as internal shadow comparison and avoid exposing it to the UI.

If Claude Code keeps it, add a clear comment that it must not be used for user-facing assessment until product semantics are approved.

### Low - Handoff timestamp is inconsistent with filename

Reference:
- `ai-handoff/2026-07-14-0650-todo-086-v130-claude-v129-done-prerelease.md`

The filename says `0650`, but the handoff body says:

```md
Created: 2026-07-14 07:50 Atlantic/Reykjavik
```

Workflow requires filename HHMM and `Created:` to match the real local time. This is not a product bug, but it matters in this long handoff chain because we use filenames as sequence anchors.

Recommended fix:

- Claude Code should be careful to run the time command immediately before handoff creation and keep filename/body aligned.
- No need to rewrite old files unless Stebbi wants a cleanup.

## What improved in v130

- The map remount key now includes provider selection:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx:1298`
  - This is a reasonable short-term fix for stale Google map markers.
- Veðurstofan worst station now uses the row nearest estimated station ETA instead of static max over all rows.
- `fetchedAtIso` and `expiresAtIso` are now carried in the layer type and API payload.
- Station cards now show `Spá frá` and `Sótt`.
- Map filter chips are hidden when only Veðurstofan station markers are shown.

## Tests / commands run by Codex

```bash
npm run test:run -- lib/__tests__/weather-vedurstofan-blend.test.ts lib/__tests__/weather-travel-api.test.ts
```

Result: exit 0, 2 files passed, 26 tests passed.

```bash
npm run type-check
```

Result: exit 0.

Other commands were read-only inspections:
- `git status --short`
- `git diff --stat`
- targeted `rg`
- targeted line reads with PowerShell
- `Design.md` relevant rule lookup for mobile/status/toggle/text

No code, SQL, env, Supabase, commit, push or deploy action was performed by Codex.

## Design.md notes

Relevant rules checked:

- mobile-first and max-width patterns: `Design.md:55`, `Design.md:133`
- status meaning not by color alone: `Design.md:95`, `Design.md:398`
- text must not overflow controls and must live in messages: `Design.md:125-127`
- touch targets generally at least 40x40 px: `Design.md:168`, `Design.md:400`
- structured summary panels need clear semantic rows and no duplicate/unclear status: `Design.md:206-221`
- toggles are correct for binary provider settings: `Design.md:310-313`

The current provider toggles fit the control pattern, but the summary semantics need to match the active provider state.

## Recommended next step for Claude Code

Do not release v130 as fully provider-correct yet.

Small next patch:

1. Define an explicit active-provider state helper:

```ts
const activeProviderCount = Number(showMetno) + Number(showVedurstofan)
const isMetnoOnly = showMetno && !showVedurstofan
const isVedurstofanOnly = !showMetno && showVedurstofan
const hasNoActiveProvider = activeProviderCount === 0
```

2. Use those booleans to gate the summary:
   - if `hasNoActiveProvider`: show a simple "choose a provider" state, no weather assessment;
   - if `isVedurstofanOnly`: hide MET/Yr coverage/best-window copy and avoid wording that says Teskeið has optimized departure slots;
   - if `isMetnoOnly`: current behavior;
   - if both: current mixed display is acceptable as long as assessment is clearly MET/Yr baseline.

3. For Veðurstofan-only, store and show the decisive forecast row/time:

```ts
type WorstVedurstofanData = {
  station: VedurstofanTravelLayer['points'][number]
  row: VedurstofanTravelLayer['points'][number]['forecastRows'][number] | null
  windMs: number
  etaIso: string | null
}
```

4. Keep the map-remount key for now. It is not elegant, but it is safe enough for the current prerelease.

## Localhost checks for Stebbi

Preconditions:
- Stebbi runs localhost himself.
- `elta-vedrid` access is enabled.
- `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`.
- `WEATHER_ELTA_VEDRID_FLAG=true`.
- Veðurstofan product table has been warmed.
- Do not run migrations, Supabase changes, production cron, deploy, push or commit for these checks unless Stebbi gives separate explicit approval.

After the next patch:

1. Open the same route from Stebbi's screenshots.
2. Default `met.no on`, `Veðurstofan off`.
   - 72 MET/Yr route dots.
   - Existing MET/Yr scrubber and route assessment visible.
3. Turn `Veðurstofan on` while keeping `met.no on`.
   - Map remounts and shows both MET/Yr dots and Veðurstofan station dots.
   - UI clearly says assessment is still MET/Yr baseline if that remains the product decision.
4. Turn `met.no off`, leaving only `Veðurstofan`.
   - Map shows only Veðurstofan station dots.
   - No MET/Yr route dots remain.
   - No `Yr`, `Hrá met.no gögn`, `Punktur 26/72`, MET/Yr coverage text, or MET/Yr best-window text remains.
   - Summary does not imply MET/Yr optimized departure slots.
   - Worst station shows station name, wind, ETA/reference time, and the forecast row time used.
5. Turn both providers off if the UI allows it.
   - Expected: no weather assessment shown; user is asked to select a data source.
   - Not acceptable: MET/Yr assessment remains visible.
6. Toggle providers back and forth several times.
   - Markers do not accumulate.
   - Bounds stay sane.
   - No stale provider labels remain.
7. Inspect a station card.
   - `Spá frá` and `Sótt` are visible.
   - Forecast rows wrap without horizontal overflow at 360, 390 and 460 px widths.

## Release recommendation

Not quite ready as a provider-correct release.

v130 is materially better than v128 and probably fixes the visible marker ghosting, but the route summary still has MET/Yr assumptions underneath when `met.no` is unchecked. One small semantics patch should get this to a cleaner prerelease.

## Óvissa / þarf að staðfesta

- I did not run a browser/Google Maps runtime test. The map key fix is code-level plausible and should be verified by Stebbi on localhost.
- I did not inspect unrelated dirty files. This review is scoped to TODO 086 v130.
