# TODO 078 - Addendum: flagged release strategy for Ferðalagið without fork risk

Created: 2026-07-11 07:45  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Product/architecture handoff update for Claude Code  
Related TODO: #78 Tjaldferð / Ferðalagið / shared route-weather core  
Builds on:

- `2026-07-10-2026-todo-078-v006-codex-future-proof-shared-weather-core.md`
- `2026-07-11-0731-todo-078-v007-codex-product-flow-model-addendum.md`
- `2026-07-11-0737-todo-078-v008-codex-single-drive-to-trip-addendum.md`

Status: Planning/handoff only. No implementation approval implied.

## Stebbi's Question

Stebbi asked whether it will be messy to release the future Ferðalagið direction under a feature flag.

Codex answer: **No, not if the flag controls product/UI access, not the existence of a separate engine.**

## Core Recommendation

Use feature flags for **visibility and access to the richer trip mode**, not for forking route/weather logic.

The shared route-weather core should be able to ship independently when it preserves current behavior.

The new trip UI should be gated.

In short:

```txt
Shared core seam: can ship when behavior-compatible.
Ferðalagið UI/conversion actions: behind feature flag.
Camping preset: behind a later, narrower feature flag if needed.
```

## Suggested Flags

Preferred first flag:

```txt
WEATHER_TRIP_ENABLED=true
```

Meaning:

- enables hidden/experimental Ferðalagið mode;
- enables future `Breyta í ferðalag`;
- enables future `Bæta við áfangastað`;
- enables future trip-builder UI;
- does **not** create a separate route-weather system.

Possible later flag:

```txt
WEATHER_CAMPSITE_PRESET_ENABLED=true
```

Meaning:

- enables `Finna tjaldsvæði`;
- enables campsite-specific candidate ranking/preset UI;
- still uses the same `WeatherTrip` / route-weather core.

Avoid making `TJALDFERD_ENABLED` the main architecture flag, because that can push the codebase toward a product-specific fork too early.

## Release Strategy

### Phase A - Shared core, no visible change

Goal:

- extract or introduce the shared route-weather seam;
- current `/vedrid` and `/auth-mvp/vedrid` remain visually and behaviorally the same;
- `Einn akstur` maps internally to a one-leg trip or to an adapter that can become one.

Flag:

- no visible flag required if behavior stays identical;
- if a riskier internal seam is introduced, use a server-side internal flag only, but avoid two production behaviors for long.

Tests:

- characterization tests for current travel weather output;
- route options and final forecast regression tests;
- no SQL.

### Phase B - Hidden flagged trip mode

Goal:

- introduce an experimental `Ferðalagið` mode or hidden route;
- keep it unavailable unless `WEATHER_TRIP_ENABLED=true`;
- no public nav yet;
- no marketing/home-card exposure yet.

Allowed when flag is on:

- hidden route or hidden mode;
- `Breyta í ferðalag` from a completed one-drive result;
- basic add-stop state, if implemented;
- no persistence unless separately reviewed.

### Phase C - Public/product exposure

Goal:

- decide whether `/vedrid` shows a compact mode control such as `Einn akstur | Ferðalagið`;
- possibly expose a campsite entry/preset;
- only after Stebbi has tested the hidden/flagged flow.

Flag:

- `WEATHER_TRIP_ENABLED` still gates the trip mode;
- `WEATHER_CAMPSITE_PRESET_ENABLED` can gate campsite-specific UI.

## Important Guardrail

When `WEATHER_TRIP_ENABLED=false`, current Veðrið must continue to work exactly like today's single-drive Ferðaveðrið.

When `WEATHER_TRIP_ENABLED=true`, the app may show trip affordances, but:

- it must still default to `Einn akstur`;
- it must not make the first screen heavier;
- it must not require login just to explore public weather if `WEATHER_PUBLIC_ENABLED=true`;
- it must not duplicate route/weather logic.

## What The Flag Should NOT Do

The flag should **not** switch between two different weather engines:

```txt
if WEATHER_TRIP_ENABLED:
  use new weather logic
else:
  use old weather logic
```

That creates long-term branch risk.

Better:

```txt
Always use shared core once it is proven equivalent.
Only hide/show new trip UI behind WEATHER_TRIP_ENABLED.
```

## Interaction With Current Public Weather

Current flags:

- `AUTH_MVP_ENABLED`
- `WEATHER_ENABLED`
- `WEATHER_PUBLIC_ENABLED`

New flag should be orthogonal:

```txt
WEATHER_PUBLIC_ENABLED controls whether guests can use weather.
WEATHER_TRIP_ENABLED controls whether trip-mode affordances are visible/usable.
```

Examples:

- Public weather on, trip off:
  - guest can calculate one drive;
  - no trip-builder UI.

- Public weather on, trip on:
  - guest can calculate one drive;
  - guest may explore trip conversion in-session;
  - saving/re-opening remains login value later.

- Public weather off, trip on:
  - authenticated users may test trip mode;
  - guests still go through normal auth/public gating.

## Recommended Product Behavior Under Flag

If `WEATHER_TRIP_ENABLED=true`, after a successful one-drive calculation the UI can later show secondary actions:

- `Breyta í ferðalag`
- `Bæta við áfangastað`
- `Finna tjaldsvæði` if campsite preset flag is on

These are secondary. The primary single-drive result remains the main product moment.

## Data / SQL Recommendation

Do not add SQL in the first flagged release unless the scope explicitly becomes saved trips.

For early experiments:

- in-memory/client state is enough for conversion from one drive to trip;
- route/weather snapshots can remain ephemeral;
- authenticated saved trips require a separate schema review;
- public users should not create saved trip rows without a deliberate auth/privacy plan.

## Design.md Notes

Relevant Design.md constraints:

- Mobile-first at 360-460 px.
- Keep common workflows fast and ergonomic.
- Do not make the app feel like a heavy dashboard.
- Use segmented controls only for genuine modes.
- Avoid nested cards.
- Text must fit and not create horizontal overflow.
- Visible text belongs in `messages/is.json` and `messages/en.json`.

Applied here:

- No mode picker should block the default one-drive flow.
- Any future `Einn akstur | Ferðalagið` control must be compact and safe on mobile.
- Conversion actions should appear after a result, not as clutter before the user has calculated anything.

## Guidance For Claude Code

When updating the TODO #78 plan, Claude Code should explicitly say:

1. Shared route-weather core can be released without visible flag if output is equivalent.
2. `WEATHER_TRIP_ENABLED` gates only trip UI / conversion affordances / hidden route.
3. `Einn akstur` remains default even when the flag is on.
4. `Finna tjaldsvæði` should be a later preset/use case, optionally behind `WEATHER_CAMPSITE_PRESET_ENABLED`.
5. No SQL/persistence in the first flagged experiment.
6. No public nav or marketing exposure until Stebbi has tested hidden/flagged flow.
7. Do not keep old/new weather engines in parallel longer than absolutely necessary.

## Suggested Message To Claude Code

```md
Claude Code, bættu þessu við TODO #78 planið:

Við viljum geta gefið Ferðalagið út undir flaggi án fork-vesens.

Meginregla:
- shared route-weather core má fara út þegar núverandi Ferðaveður hegðar sér eins og áður;
- flaggið á að stýra nýjum UI-ham/conversion affordances, ekki tveimur weather engines.

Notum frekar:
- `WEATHER_TRIP_ENABLED` fyrir Ferðalagið / `Breyta í ferðalag` / add-stop UI
- mögulega `WEATHER_CAMPSITE_PRESET_ENABLED` síðar fyrir `Finna tjaldsvæði`

Ekki gera `TJALDFERD_ENABLED` að aðalarkitektúrflaggi því það ýtir undir fork.

Útgáfuleið:
1. Shared core seam án sýnilegrar breytingar.
2. Hidden/flagged Ferðalagið mode með `WEATHER_TRIP_ENABLED=true`.
3. Engin SQL fyrst.
4. Engin public nav fyrr en Stebbi hefur prófað.
5. `Einn akstur` áfram default og óþyngdur.

Skilaðu uppfærðu plani með feature-flag strategy, hvað er gated, hvað er ekki gated, Design.md notes og Localhost checks for Stebbi.
```

## Localhost Checks For Stebbi

This is a planning handoff only; no app behavior changes yet.

When Claude Code returns a revised plan or implementation:

1. With `WEATHER_TRIP_ENABLED` off:
   - `/vedrid` should behave like today's one-drive weather flow.
   - No trip/conversion controls should appear.

2. With `WEATHER_TRIP_ENABLED` on:
   - `/vedrid` should still default to the one-drive flow.
   - Any trip action should appear only as a secondary/progressive action.
   - No first-screen clutter or mobile overflow.

3. With `WEATHER_PUBLIC_ENABLED=true` and `WEATHER_TRIP_ENABLED=false`:
   - public guests can still use one-drive weather if current public weather behavior allows it.

4. With `WEATHER_PUBLIC_ENABLED=true` and `WEATHER_TRIP_ENABLED=true`:
   - guests may explore the trip conversion only if Claude explicitly implements it;
   - saving/re-opening should still require login in later phases.

5. Confirm no SQL migration is included unless saved trips become explicitly in scope.

## Bottom Line

Feature flagging is a good path if used like this:

```txt
Flag new product UI.
Do not flag a duplicated engine.
Keep one-drive default.
Keep shared core common.
Add campsite as preset later.
```

