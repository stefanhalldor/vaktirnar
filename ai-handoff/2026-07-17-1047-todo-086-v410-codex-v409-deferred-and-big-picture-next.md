# 2026-07-17 10:47 — TODO-086 v410 — Codex: v409 deferred bucket and next big-picture phase

Created: 2026-07-17 10:47  
Timezone: Atlantic/Reykjavik

Source reviewed:
- `2026-07-17-1039-todo-086-v409-deferred-oxi-south-coast-reynisfjall.md`
- `2026-07-17-1019-todo-086-v408-claude-b2b-hofn-south-route-prerelease.md`
- `2026-07-17-0955-todo-086-v405-codex-v404-review-and-larger-next-bundle.md`
- `2026-07-17-0933-todo-086-v399-codex-phase-order-vik-deferred.md`

## Short Decision

Set both of these aside in the same deferred geometry/route-intelligence bucket:

1. Öxi south-coast / Höfn / Djúpivogur alternative route that does not reliably appear.
2. Reynisfjall / Vík / Mýrdalur section mismatch that differs between localhost and production.

Then continue with the big product architecture in larger, trust-bounded chunks.

## Findings

### Medium: Do not keep chasing Öxi-south and Reynisfjall now

v409 correctly identifies both issues as real but not the current highest-leverage work.

They are similar in one important way: both are geometry/road-intelligence calibration problems. They need visual verification, route polyline inspection, and likely more curated control-point work. They can easily consume many small loops without improving the reusable provider/product foundation.

Recommendation:
- Put both under one deferred track: `D — geometry calibration and curated road intelligence`.
- Do not reopen them until the current provider/map/product foundation has advanced.
- Keep existing notes/tests as breadcrumbs, but do not tune anchors, via-points, or `verified:true` flags in the next phase.

### Medium: If dead Öxi-south code remains in the active branch, it should not become product debt silently

v409 says the current code has an `avoid-oxi-south-coast` rule that does not appear on localhost and “does no damage”.

That can be acceptable short-term, but it should be treated deliberately:

- If the code is not committed/released yet and it is truly inert, prefer removing it from the active implementation before the next release unless Claude Code has a clear reason to keep it.
- If it is already in the branch and all tests/type-checks pass, it may stay temporarily as documented WIP, but it should not be presented as complete product behavior.
- Do not add more tests that make a non-working route look like a guaranteed product feature.

The key is: do not confuse future Stebbi/Claude/Codex into thinking “south route solved” when v409 says it is deferred.

### Low: v409 wording says “bönnuð” where it probably means “sett til hliðar”

This is not a blocker, but for future handoffs I would avoid phrasing like “þessi tvö mál eru bönnuð”. Better:

> Þessi tvö mál eru sett til hliðar og á ekki að vinna áfram í þeim nema Stebbi opni deferred D-fasann sérstaklega.

## Updated Phase Track

### Active Track: Big Product Foundation

Continue in larger chunks, but keep each chunk bounded by one user surface/data contract.

Recommended next large chunk:

**B3A — Overview / provider layer foundation**

Goal:
- Move toward the “big picture” map experience without implementing every future layer yet.
- Reuse the route-selection provider-layer ideas instead of rebuilding another map system from scratch.
- Keep the provider layer model generic for:
  - Veðurstofan now,
  - Vegagerðin soon,
  - later campsite/fishing/golf/hiking layers if appropriate.

Allowed in B3A:
- Design/review the shared map-layer contract.
- Reuse existing provider station data contracts where possible.
- Define how a station marker opens a shared provider preview card.
- Keep Veðurpúls preview as reusable chat-core/pulse content.
- Make the UI desktop-friendly and mobile-safe.
- Keep met.no route weather unchanged unless a specific shared map overview needs read-only display.

Not allowed in B3A:
- Vegagerðin full provider ingestion.
- Route cache implementation.
- Interest heatmap implementation.
- SQL/migrations unless Stebbi explicitly asks.
- Öxi-south/Djúpivogur/Höfn tuning.
- Reynisfjall/Vík `verified:true`.

### Planning Track: H — Route Cache + Interest Heatmap

Keep `2026-07-17-0627-todo-086-v382-codex-route-cache-and-interest-heatmap.md` on the roadmap.

Suggested placement:
- H0 compliance/product constraints before implementation.
- H1 route cache keying and segment-normalization model.
- H2 interest heatmap model.
- Then feed H outputs into overview map once the foundation exists.

This should remain a planning/design track until the map/provider foundation is stable.

### Provider Track: V — Vegagerðin

Vegagerðin should come after the shared provider-layer foundation is clear enough that it does not become another Veðurstofan-specific implementation.

Goal:
- Fixed provider points matched to route geometry.
- Provider-specific body inside a shared preview shell.
- Same show/hide provider layer model as Veðurstofan.

Do not let Vegagerðin inherit special-case assumptions from Veðurstofan forecast rows.

### Deferred Track: D — Geometry Calibration And Curated Road Intelligence

Contains:
- D1: Vík/Mýrdalur/Reynisfjall station section verification.
- D2: Öxi south-coast / Höfn / Djúpivogur alternative route.
- D3: broader “known risky road sections” model, including future Öxi/Hólmavík style rules.

Reopen only when:
- the big provider/map architecture has landed, or
- a production issue makes one of these urgent.

## Copy/Paste Prompt For Claude Code

```txt
Workflow

Please read:
- ai-handoff/2026-07-17-1039-todo-086-v409-deferred-oxi-south-coast-reynisfjall.md
- ai-handoff/2026-07-17-1047-todo-086-v410-codex-v409-deferred-and-big-picture-next.md

Treat v409 as a deferred geometry/route-intelligence bucket, not as the next implementation target.

Critical scope:
- Do not continue tuning Öxi south-coast / Höfn / Djúpivogur route alternatives now.
- Do not continue tuning Reynisfjall/Vík/Mýrdalur anchors or verified:true now.
- If inert/dead Öxi-south code remains in the current branch, review whether it should be removed before the next active phase or explicitly left as documented WIP. Do not spend a large loop on it.

Next goal:
- Propose the next large, safe execution bundle for the big-picture product direction.
- Prefer B3A: shared overview/provider-layer foundation.
- Keep it reusable for Veðurstofan now and Vegagerðin later.
- Keep SQL/env/deploy/production changes out unless Stebbi separately asks.

Before executing, review critically. If there are blocking product or architecture questions, stop and write a handoff. If there are no blockers, implement only the agreed bounded B3A slice and create a handoff immediately after.
```

## Localhost Checks For Stebbi

This handoff itself requests no product change.

When Claude Code returns the next B3A plan or implementation, Stebbi should verify:

1. The plan does not reopen Öxi-south or Reynisfjall/Vík tuning.
2. The plan describes a reusable map/provider-layer foundation, not a one-off Veðurstofan screen.
3. Any localhost checks should include both:
   - mobile `/vedrid`,
   - a wider desktop viewport if the new overview/big-picture map is part of the work.
4. If Claude Code leaves inert Öxi-south code in place, the handoff should explicitly say why it is safe and whether it can ever appear in UI.

No Supabase, SQL, RLS, env, Vercel, deployment, billing, or production-data checks apply to this sequencing handoff.

## Commands Run By Codex

- Read `ai-handoff/README.md`
- Read `ai-handoff/2026-07-17-1039-todo-086-v409-deferred-oxi-south-coast-reynisfjall.md`
- Read `ai-handoff/2026-07-17-1019-todo-086-v408-claude-b2b-hofn-south-route-prerelease.md`
- Read `ai-handoff/2026-07-17-0955-todo-086-v405-codex-v404-review-and-larger-next-bundle.md`
- Read `ai-handoff/2026-07-17-0933-todo-086-v399-codex-phase-order-vik-deferred.md`
- Ran `git status --short`

No tests were run. No product code was changed.

## Uncertainty / Needs Confirmation

I did not inspect the current implementation diffs for the inert Öxi-south code in detail in this pass. The recommendation is sequencing-level: keep it deferred and do not let it become the next rabbit hole.
