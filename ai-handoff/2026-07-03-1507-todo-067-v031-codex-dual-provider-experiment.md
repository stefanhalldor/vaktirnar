# TODO #67 Vedrid - Dual provider experiment before final Google/Mapbox choice

Created: 2026-07-03 15:07
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Planning handoff. No code, SQL, env, dependency, Supabase, commit, push, deploy, or production changes made.

## Product decision

Stebbi wants to set up both Google Maps Platform and Mapbox for a short test, because both have free tiers and the team can learn which provider gives better user experience before making a long-term choice.

Codex agrees with the experiment, with guardrails.

## Recommendation

Do a short **provider bake-off**, not a long-lived dual-provider product.

Good:

- Compare Google and Mapbox on the same Icelandic route/golf/place cases.
- Let beta users give feedback on whether the shown place/route is correct.
- Keep provider assignment controlled by feature flags or debug config.
- Choose one default provider before app-store submission / broader rollout.

Avoid:

- Asking normal users "Do you want Google or Mapbox?" That is implementation language and creates cognitive load.
- Alternating provider by day as the main test. Weather, provider state, and user behavior vary by day, so the signal gets muddy.
- Mixing providers within one answer, e.g. Google Places result displayed on Mapbox map, unless ToS is explicitly reviewed.

## Best experiment shape

### Step 1 - Internal side-by-side test

Before exposing this to users, run the same 10-15 fixed cases through both providers:

- `Sudurgata`
- `Sudurgata Reykjavik`
- `Sudurgata Hafnarfjordur`
- `Moso`
- `Grafarholtid`
- `Grafarholtsvollur`
- `Apavatn`
- `Husavik`
- `Reykjavik -> Apavatn`
- `Selfoss -> Reykjavik`
- impossible/nonsense place
- impossible route

Measure:

- candidate quality;
- route geometry quality;
- whether user confirmation would be needed;
- latency;
- API call count/cost class;
- error/failure clarity.

No persistence of provider-derived coordinates/results during this test unless a separate storage plan is approved.

### Step 2 - Beta user confirmation test

Expose one provider per route/golf confirmation flow, but do not ask the user to choose the provider.

Instead ask product-level feedback:

```text
Litur þetta út eins og rétti staðurinn?
[Já] [Nei, breyta]
```

Optional tiny beta note:

```text
Kortastaðfesting er í prófun. Láttu okkur vita ef staðurinn lítur rangt út.
```

This asks the user about the thing they can judge, not about vendor strategy.

### Step 3 - Choose one provider

After a short timebox, choose one:

- Google if it clearly wins on user trust, ambiguous Icelandic place resolution, and app-store/native direction.
- Mapbox if it clearly wins on MVP simplicity, custom UI feel, cost, and adequate place/route quality.

Recommended timebox: 1-2 days, not a multi-week provider research project.

## Provider assignment

Recommended:

- For internal testing: a debug switch or explicit provider parameter available only in dev/admin/beta context.
- For beta users: stable assignment per user/session/flow, not alternating by day.
- For Stebbi: allow forcing provider manually for comparison.

Avoid day-by-day switching as the main experiment. If Monday is Google and Tuesday is Mapbox, the result is confounded by different weather, different user questions, different provider uptime, and different user mood. Tiny science hat, but it matters.

## User-facing wording

Do not say:

- "Do you want Google or Mapbox?"
- "We are testing vendors."
- "This answer is from Provider X."

Say:

- "Lítur þetta út eins og rétti staðurinn?"
- "Kortastaðfesting er í prófun."
- "Veldu réttan stað ef þetta er ekki það sem þú meintir."

Provider name can be visible where legally/technically required by map attribution, but not as a product choice.

## Technical guardrails

1. Keep provider adapters separate:
   - `googleProvider`
   - `mapboxProvider`
   - shared normalized result shape

2. Do not create a large abstract provider framework unless the first implementation proves it is needed.

3. Do not mix provider data:
   - Google Places/Routes results should be shown on Google map/static map unless ToS says otherwise.
   - Mapbox Search/Directions results should be shown on Mapbox map/static map unless ToS says otherwise.

4. No global cache of provider-derived geocoding/route results in MVP.

5. `places.ts` remains curated/local and provider-neutral.

6. Store no full raw user questions for learning unless a separate privacy plan is approved.

7. If feedback/telemetry is implemented, keep it minimal:
   - provider;
   - flow type: route/golf/place;
   - confirmation outcome: confirmed/changed/failed;
   - candidate count;
   - coarse latency bucket;
   - error code;
   - no full route text unless explicitly approved.

## Cost/billing guardrails

Even with free tiers, this is not risk-free.

Before any provider calls from code:

- restrict API keys by domain/app/API where supported;
- set budget alerts in Google Cloud and Mapbox;
- use low quotas for the experiment if possible;
- do not run high-volume loops;
- keep the test set small and repeatable.

Current cost framing:

- Google Maps Platform: pay-as-you-go with SKU-specific free usage caps, not a fixed $200 monthly fee.
- Mapbox: pay-as-you-go with product free tiers, not a fixed monthly fee for the ordinary usage model.

## Relationship to v030

v030 remains valid.

If Google is included in the experiment, Claude Code must still correct the issues from v030 before implementing Google:

- Static Maps key exposure;
- pricing table;
- Places Autocomplete/session lifecycle;
- clear separation of server and browser keys;
- Design.md/mobile/loading constraints.

This v031 changes the provider decision from "choose Google now" to "test Google and Mapbox briefly, then choose one."

## Suggested revised phase

### Phase 2A0.5 - Provider bake-off plan

Read-only or minimal dev-only plan:

- define test cases;
- define metrics;
- define key/env requirements;
- define no-persistence rules;
- define budget/quotas;
- define how Stebbi reviews output.

### Phase 2A1 - Weather intent/golf skeleton

No provider dependency.

### Phase 2A2 - Provider experiment

Implement provider adapters and confirmation preview behind beta/dev controls only, after explicit execution permission and key setup.

### Phase 2A3 - Pick provider and shipable flow

Remove or hide provider choice from normal users. Keep only the selected provider as default before broader release/app-store submission.

## Localhost checks for Stebbi

This planning file has no localhost checks because it changes no app code.

For the eventual experiment:

1. Internal provider comparison:
   - Run the same test cases with Google and Mapbox.
   - Expected: side-by-side candidate/route/latency/cost notes.
2. User-facing route:
   - Ask `Er mer ohaett ad keyra med hjolhysi fra Reykjavik ad Apavatni?`
   - Expected: user sees place/route confirmation, not provider jargon.
3. Ambiguous place:
   - Ask route with `Sudurgata`.
   - Expected: user chooses the correct place; provider is stable for the flow.
4. Feedback:
   - Mark place as correct/incorrect.
   - Expected: minimal feedback stored/logged, no full raw question unless separately approved.
5. Safety:
   - Verify provider-derived coordinates are not written to `places.ts` or global Supabase cache.
6. Billing:
   - Confirm no high-volume loops and budget alerts/quotas are set before broader testing.
7. Mobile:
   - 360, 390, 460 px.
   - Expected: confirmation UI fits, no zoom/overflow, feedback controls reachable.

## Suggested message to Claude Code

Stebbi wants to test both Google Maps Platform and Mapbox briefly before making the final provider decision. Please treat v031 as the current provider direction.

Do not ask normal users to choose "Google vs Mapbox" and do not alternate by day as the main experiment. Instead, use a controlled beta/dev provider assignment and ask users product-level feedback: whether the shown place/route looks correct.

Please produce a short revised plan for:

1. a fixed provider bake-off test set;
2. metrics and no-persistence/privacy rules;
3. budget/key restrictions for both providers;
4. how to keep provider choice hidden from normal users;
5. how to choose one default provider before app-store/broader release.

No code, SQL, env, dependency, provider setup, commit, push, deploy, or production changes should happen until Stebbi gives explicit scoped execution permission.
