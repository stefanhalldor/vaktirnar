# 2026-07-17 09:33 — TODO-086 v399 — Codex phase order: defer Vík/Mýrdalur section work

Created: 2026-07-17 09:33  
Timezone: Atlantic/Reykjavik  

## Stutt samantekt

Stebbi wants `2026-07-17-0930-todo-086-v398-claude-vik-sections-deferred-verified-handoff` placed behind the current weather phases from the latest handoffs. I agree.

The Vík/Mýrdalur station mismatch is real and should not be forgotten, but it is not the next execution step. The v398 code path is intentionally safe for production because the new Vík route-control sections remain `verified:false`. That means production should not change until we explicitly revisit, visually verify, and flip those sections.

## Decision

Defer Vík/Mýrdalur route-control verification and `verified:true` activation until after the current provider/map/product phase train.

Do not spend the next implementation cycle on:

- tuning the Vík/Mýrdalur anchors again,
- flipping `ring-road-vik-west` or `ring-road-vik-east` to `verified:true`,
- increasing the global station-distance threshold,
- special-casing Vík station IDs in UI or provider matching.

Keep the v398 tests and `verified:false` definitions as a preserved work-in-progress, but move on.

## Why This Is The Right Order

The current active work is bigger than Vík:

- provider matching should remain generic for fixed providers like Veðurstofan and later Vegagerðin,
- preview cards should become reusable provider shells,
- route-selection provider layer UX should stabilize,
- the overview/status-map and route-cache/interest heatmap need a clean place in the roadmap,
- Vegagerðin should build on the shared fixed-provider model rather than inherit temporary Veðurstofan-specific hacks.

If we keep chasing one Vík corridor now, we risk polishing a local exception before the shared model is fully settled.

## Updated Phase Order

### B0.5 — Provider Preview Component Cleanup

Continue with the reusable provider preview shell before adding more provider-specific UI.

Goal:

- one shared shell for station/provider preview cards,
- Veðurstofan forecast rows as provider-specific content,
- Vegagerðin current/road-state content later as provider-specific content,
- Púls preview/links reused through the shared chat-core/pulse components.

### B1 — Localhost Validation Of Provider Geometry

Validate that current fixed-provider matching behaves well with the 1 km threshold on representative routes.

This includes general geometry validation, but not final Vík route-control activation.

### H0/H1/H2 — Route Cache + Interest Heatmap Planning

Preserve `2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap` in the roadmap:

- H0: Google/data compliance check for route cache.
- H1: shared route cache design.
- H2: route interest event model.

This should happen as planning/design before the big overview map, but it should not be mixed into small geometry fixes.

### B2 — Route-Selection Provider Layer UX

Improve route-selection provider layers:

- show/hide Veðurstofan,
- later show/hide Vegagerðin,
- station click opens shared provider preview shell,
- preview shows latest provider values and one relevant Púls preview.

### B3 — Iceland Overview / Status Map

Build the broader entry view for users who want a national overview before choosing a route.

This is the natural place for:

- country-wide provider layers,
- common/cached routes,
- later campgrounds, fishing rivers, golf courses, hiking routes, etc.,
- route-interest heatmap once the data model is ready.

### V — Vegagerðin Provider

Implement Vegagerðin on the same fixed-provider route matching and preview-shell model.

Do not model Vegagerðin as Veðurstofan forecast rows. It should be its own provider-specific body inside the shared shell.

### Deferred V — Vík/Mýrdalur Route-Control Verification

After the above phases, revisit v398:

- reproduce the real Vík/Mýrdalur route cases,
- confirm whether `ring-road-vik-west` and `ring-road-vik-east` fire correctly on localhost,
- confirm the expected stations:
  - Reykjavík → Egilsstaðir: Vatnsskarðshólar, Reynisfjall, Mýrdalssandur.
  - Höfn → Þorlákshöfn: Vatnsskarðshólar, Reynisfjall, Mýrdalssandur.
  - Vík → Hella: Vatnsskarðshólar + Reynisfjall, not Mýrdalssandur.
  - Egilsstaðir → Reykjavík: same corridor in reverse.
- only then consider `verified:true`.

## Notes On v398 Handoff Hygiene

v398 itself is directionally fine as a deferred handoff, but it has minor documentation hygiene issues:

- filename time is `0930`, title says `10:00`,
- `Created:` line lacks HH:MM,
- it says the work was committed + pushed, so do not casually rewrite history to clean this up.

These are not blockers for moving on.

## Recommended Next Step For Claude Code

Do not execute the Vík deferred work now.

Next implementation step should be B0.5/B1 scope, depending on what is already complete in the current branch:

1. Confirm the shared provider preview shell is truly provider-neutral.
2. Confirm route-selection provider preview uses that shell.
3. Keep Veðurstofan-specific forecast rows and Púls content as children/content.
4. Do not touch SQL, Supabase, env, deploy, route cache, overview map, Vegagerðin, or Vík `verified:true` in this small step unless Stebbi explicitly asks.
5. After implementation, create a new handoff with exact files changed, commands run, and localhost checks.

If Claude Code sees that B0.5 is already complete, the next small step is B1 validation/documentation: identify the concrete localhost flows Stebbi should test before route-selection/provider-layer UX work continues.

## Localhost Checks For Stebbi

No product change is requested by this handoff alone.

When Claude Code finishes the next B0.5/B1 implementation or validation step, Stebbi should test:

1. Open `http://localhost:3004/vedrid`.
2. Use an account/state where Veðurstofan is visible, if testing provider previews.
3. Select a normal route with Veðurstofan stations.
4. Click station/provider previews on the route-selection step, worst point, selected point, and all-points list where relevant.
5. Expected result: the same reusable preview/card behavior appears in each context, while provider-specific content still differs naturally.
6. Regression watch: Púls links, return-to behavior, public/auth behavior, and met.no cards should not change unexpectedly.

For the deferred Vík issue specifically, Stebbi does not need to retest now unless Claude Code explicitly reopens that phase. When reopened later, use the Vík/Mýrdalur route list in the deferred section above.

## Óvissa / þarf að staðfesta

I have not re-read every post-v398 implementation file in code. This handoff is a sequencing decision based on the latest handoff set, especially v381, v383, v397, and v398.

Confidence: high on phase-order recommendation; medium on exact current completeness of B0.5 because that depends on the latest unreviewed code state.
