# TODO 086 v160 - Codex blocker: stale Veðurstofan banner and refresh CTA must be visible

Created: 2026-07-14 17:37
Timezone: Atlantic/Reykjavik

## Context

Stebbi reported after v157:

> Spáin er raunverulega frá kl. 9 í morgun - sem er alveg harkalega rangt því við vorum að setja út lagfæringu amk þannig að ég myndi fá sticky banner og gæti sjálfur endurhlaðið...

This is a blocker on top of:

- `2026-07-14-1732-todo-086-v158-codex-v157-prerelease-review.md`
- `2026-07-14-1735-todo-086-v159-codex-v157-card-layout-addendum.md`

No implementation permission is implied by this file.

## Blocking Finding

### High - If Veðurstofan `atimeIso` is from 09:00 at 17:34, stale warning and refresh CTA must be unavoidable

Stebbi is seeing Veðurstofan data whose forecast issue time is `09:00` while current local time is around `17:34`.

Given the 3-hour cadence and 10-minute grace rule:

- Expected cycle at 17:34 should be 15:00.
- 09:00 is not current.
- 09:00 is not the immediately previous cycle.
- This data is stale.

Therefore the UI must show:

1. A clear stale/degraded provider state.
2. A visible `Sækja ný gögn` action unless a refresh is already in progress or was already attempted for this exact stale cycle.
3. Honest state if a refresh was attempted and Veðurstofan still returned old data.

If Stebbi can see station cards with `Spá frá kl. 09:00` but cannot see the stale banner and refresh CTA, the feature is not behaving correctly.

## Current v157 Code Concern

From the v157 diff reviewed by Codex:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:851-852` comments "Veðurstofan freshness banner", but the rendered `<div>` is not actually sticky.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:852` shows the banner only when:

```ts
step === 'result' && showVedurstofan && vedurstofanLayer && layerAtimeIso
```

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:826` shows the refresh button only when:

```ts
lastWarmAttemptIso !== null && !isVedurstofanDataFresh
```

Problems:

- A stale-data safety banner should not be easy to miss by scrolling.
- It should not be described as sticky unless it is actually sticky or persistently visible near the active summary.
- If `lastWarmAttemptIso` is null because run history is missing/unavailable, the UI currently withholds the refresh CTA even though stale data exists. That may be wrong for recovery.
- If data is stale, the UI should explain why the button is not available, not silently hide it.

## Required Behavior

When selected Veðurstofan data is stale:

1. Show a clear stale provider banner near the provider selector / summary.
2. The banner should be persistent enough that Stebbi/user sees it while reviewing the result.
   - Either truly sticky within the result view, or repeated near summary/selected-card surfaces.
3. Show `Sækja ný gögn` if no refresh is currently running and no recent refresh was already attempted for this stale expected cycle.
4. If refresh cannot be shown because run state is unknown, show an explanation and/or safe retry button.
5. After clicking refresh:
   - show `Sæki ný gögn...`
   - if data becomes fresh: show success and preferably update/re-run result
   - if provider still returns old data: show "Við reyndum að sækja ný gögn en Veðurstofan skilaði enn eldri spá"
   - if request fails: show failure, not `Gögn voru sótt nýlega`

## Copy / Semantics

Use clear wording:

- `Veðurstofugögnin eru gömul`
- `Spá gefin út kl. 09:00`
- `Nýjustu gögn ættu að vera frá kl. 15:00`
- `Sækja ný gögn`
- `Sæki ný gögn...`
- `Við reyndum að sækja ný gögn en Veðurstofan skilaði enn eldri spá`

Avoid:

- showing only a tiny `gömul gögn` label on each station card
- saying `Gögn voru sótt nýlega` for failed requests
- using `Spá frá kl. 18:00` for forecast valid time

## Relationship To v158

v158 already found that `isVedurstofanCycleFresh()` accepts arbitrary old `atimeIso` inside the 10-minute grace window. That must be fixed.

This v160 blocker adds:

- the stale banner and refresh CTA must appear when stale data is visible
- the banner must be genuinely sticky/persistent or otherwise impossible to miss
- stale UI state must not depend on a nullable `lastWarmAttemptIso` in a way that hides recovery

## Recommended Patch Scope For Claude Code

For the next patch, Claude Code should:

1. Fix freshness helper as described in v158.
2. Add a derived provider health object for Veðurstofan:
   - `fresh`
   - `stale`
   - `refreshing`
   - `refreshRecentlyAttempted`
   - `refreshFailed`
   - `providerStillOld`
3. Render stale banner whenever selected Veðurstofan data is stale.
4. Make the banner actually sticky/persistent, or render the warning near all critical result surfaces.
5. Make the refresh button status-driven, not hidden only because `lastWarmAttemptIso` is null.
6. Parse refresh endpoint response and show honest user state.
7. Add tests for stale provider state and refresh CTA visibility.

## Localhost Checks For Stebbi

After Claude Code fixes this, Stebbi should test:

1. Use a route where Veðurstofan is selected and the layer has `atimeIso` from an older cycle, such as `09:00` when current expected cycle is `15:00`.
2. Confirm a stale Veðurstofan warning appears immediately and is not easy to miss.
3. Confirm the warning says the data is old and shows:
   - issue time of current data
   - expected/newer cycle time
   - last refresh attempt if known
4. Confirm `Sækja ný gögn` is visible unless a refresh is already in progress or recently attempted.
5. Click `Sækja ný gögn`.
6. Confirm the UI does not falsely say success on 401/403/500/network failure.
7. Confirm if Veðurstofan still returns `09:00`, the UI says the provider still returned old data.
8. Confirm met.no-only flow is unaffected.
9. Do not run production cron, Supabase migrations, deploy, commit, or push without explicit approval.
