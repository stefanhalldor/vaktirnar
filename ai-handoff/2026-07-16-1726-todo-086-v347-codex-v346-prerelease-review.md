# TODO 086 v347 - Codex review of v346 Claude prerelease

Created: 2026-07-16 17:26
Timezone: Atlantic/Reykjavik
Author: Codex

Reviewed handoff:
- `2026-07-16-1724-todo-086-v346-claude-v345-done-prerelease.md`

Related handoffs:
- `2026-07-16-1712-todo-086-v344-codex-v343-position-and-oxi-review.md`
- `2026-07-16-1716-todo-086-v345-codex-oxi-alternative-route-handoff.md`

## Findings

### No blocking findings

The v345 implementation shape matches the requested model:

- Oxi alternate is triggered by actual route caution id `oxi-axarvegur-939`, not by origin/destination bounds.
- Reyðarfjörður is sent as a `via: true` intermediate, so it is route-shaping only.
- The returned curated route is rechecked with the same caution matcher and suppressed if it still has `oxi-axarvegur-939`.
- Existing base alternatives that already avoid Oxi suppress the extra curated request, limiting extra Google cost and route clutter.

Relevant code:

- `lib/weather/google.server.ts:210` adds `avoid-oxi-via-reydarfjordur`.
- `lib/weather/google.server.ts:274` builds curated request intermediates with `via: true`.
- `lib/weather/google.server.ts:474` triggers caution-based curated rules.
- `lib/weather/google.server.ts:493` validates/suppresses curated routes that still carry the trigger caution.
- `components/weather/RouteSelectionStep.tsx:463` maps `CURATED_AVOID_OXI` to user-facing label.

### Low / Product follow-up: existing non-Öxi Google alternatives are not relabelled

If Google already returns two base routes where one goes via Oxi and another avoids Oxi, the new logic correctly does not make an extra curated request. That follows v345 guidance.

However, the existing non-Oxi Google alternative will still be labelled by the generic label chain (`Önnur leið` / Google route text), not `Til að sleppa við Öxi`.

This is acceptable for this prerelease, but product-wise Stebbi may later want a small enhancement:

- if at least one route has `oxi-axarvegur-939` and another base route avoids it, label the avoiding route more clearly, e.g. `Til að sleppa við Öxi`, without making an extra Google request.

Do not block on this unless Stebbi wants the label immediately.

### Low / QA gate: Oxi detection and Reyðarfjörður route still need real visual verification

The code-level behavior is covered, but the Oxi geometry is still approximate:

- `oxi-axarvegur-939` uses an approximate point/radius.
- `REYDARFJORDUR_VIA` is plausible but still needs visual localhost verification.

The tests prove the logic around the mocked geometry, not that real Google routes are visually correct.

This should be treated as a release QA gate, not a code blocker.

## Commands run

```powershell
npm run test:run -- lib/__tests__/weather-google.test.ts lib/__tests__/weather-route-cautions.test.ts
```

Result:

- Exit code: 0
- 2 test files passed
- 123 tests passed

```powershell
npm run type-check
```

Result:

- Exit code: 0
- TypeScript clean

## Scope / Safety

No SQL changes reviewed in this v346 scope.

No Supabase, RLS, grants, auth, env, Vercel, billing, or deployment changes expected.

The only external-cost concern is an extra Google Routes request when all base routes carry `oxi-axarvegur-939`. The implementation avoids that request when a base route already avoids Oxi, which is good.

## Localhost checks for Stebbi

Before release, Stebbi should test:

1. Open `http://localhost:3004/vedrid`.
2. Route `Höfn -> Egilsstaðir`.
3. Confirm the Oxi route gets `Varasamt með eftirvagna` and Oxi summary text.
4. Confirm `Til að sleppa við Öxi` appears if Google did not already return a non-Oxi alternative.
5. Select `Til að sleppa við Öxi`.
6. Confirm the map route visually goes around the fjords/Reyðarfjörður and not over Road 939.
7. Confirm Reyðarfjörður is not shown as a stop/destination and does not affect stop-time logic.
8. Try `Egilsstaðir -> Höfn`.
9. Try a non-Oxi route and confirm no `Til að sleppa við Öxi` appears.
10. Mobile widths 360, 390, and 546 px: route cards with warning chip and summary should not overflow or become too tall/awkward.

If the route labelled `Til að sleppa við Öxi` still visually goes over Oxi, do not release. Claude should then try the stronger fallback via sequence:

```text
Fáskrúðsfjörður -> Reyðarfjörður
```

## Recommendation

Ready for Stebbi localhost testing.

Do not release solely from unit tests because the correctness depends on real Google route geometry.
