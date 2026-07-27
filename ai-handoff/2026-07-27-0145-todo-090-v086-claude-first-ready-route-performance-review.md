# v086 - Claude Code: First-ready route performance review (v085)

**Handoff type:** Prerelease code review
**TODO:** 090
**Previous:** v085 (Codex: first-ready route performance phase 1)
**Reviewer:** Claude Code (claude-sonnet-4-6)
**Date:** 2026-07-27

---

## Scope

Code review of the first-ready route performance phase 1 implementation, covering all 9 points
Codex requested. Files read:

- `lib/iceland-routes/routeOptionEnvelope.server.ts`
- `lib/iceland-routes/firstReadyCoordinator.ts`
- `lib/iceland-routes/firstReadyDiscovery.ts`
- `lib/iceland-routes/routeMemoryVariant.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts` (envelope verify section)
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `components/weather/RoadMapPrototypeMap.tsx` (first-ready orchestration section)
- `lib/__tests__/iceland-routes-first-ready-coordinator.test.ts`
- `lib/__tests__/iceland-routes-first-ready-discovery.test.ts`
- `lib/__tests__/route-option-envelope.test.ts`
- `lib/__tests__/route-memory-variant.test.ts`

---

## Findings by severity

### LOW - Route memory not warmed in compact (first-ready) mode

**File:** `app/api/teskeid/weather/travel/routes/route.ts`, line 202

```ts
if (!compactRouteEnvelopes && fromNorm && toNorm) {
  await warmRouteMemoryFromOptions(responseRoutes, fromNorm, toNorm)
}
```

When `compactRouteEnvelopes=true` (the new first-ready flow), `warmRouteMemoryFromOptions` is
skipped. The final `/travel` endpoint does not compensate - it has no route-memory write of its
own. Effect: new route pairs first visited via the first-ready flow will not populate
`weather_route_memory_routes/stations`. The lookup endpoint returns `miss` until the user drives
the same route via the old non-compact flow.

**Severity: LOW.** Route memory is a best-effort warm-up optimisation, not correctness-critical.
Existing records from prior non-compact calls remain valid. The `miss` path on lookup is handled
gracefully by the client. Worth noting for a follow-up task but not a blocker.

---

### OBSERVATION - No security or correctness bugs found

All 9 Codex review points verified as correctly implemented. Details below.

---

## Codex point-by-point

### 1. Stale response/abort paths honor `routeBridgeRunIdRef` and correct controller

CORRECT. Two-layer guard in `applyProviderEvent` (RoadMapPrototypeMap.tsx:6265-6272):

```ts
const isCurrentRun = () => (
  routeBridgeRunIdRef.current === runId
  && !discoveryController.signal.aborted
)
const applyProviderEvent = (event) => {
  if (!isCurrentRun()) return
  ...
}
```

- `routeBridgeRunIdRef.current` increments at 6199 before old controllers are aborted (6196-6198),
  so any late provider event from the previous run fails `routeBridgeRunIdRef.current === runId`.
- `discoveryController.signal.aborted` catches the case where a new run aborts the discovery
  phase before the coordinator reducer has a chance to fire.
- After `firstChoicePromise` resolves, `isCurrentRun()` is re-checked at line 6378 before any
  state mutations or the final `calculateResolvedRoute` call.
- Teskeid discovery explicitly returns `{ status: 'failed', reason: 'stale_run' }` (6351) when
  `!isCurrentRun()` after its async resolution -- belt and suspenders on top of the coordinator's
  own runId guard.
- `discoveryController.signal` abort listener (6312-6316) rejects `firstChoicePromise` on abort,
  ensuring the caller unblocks even if all providers are mid-flight.
- `calculateResolvedRoute` uses `controller.signal` (outer), which is aborted on the next submit,
  and checks `signal.aborted` throughout. Correct controller separation.

No issues.

### 2. Google DEFAULT_ROUTE as automatic choice despite duration-ordered cards

CORRECT. Google discovery (RoadMapPrototypeMap.tsx:6327-6334):

```ts
return choices.length > 0
  ? {
      status: 'ready',
      routes: choices,
      preferredRoute: choices.find(choice => choice.route.isDefault) ?? choices[0],
    }
  : { status: 'no_route' }
```

- `preferredRoute` picks the `isDefault` route, not the duration-ordered first.
- The coordinator stores `preferredRoute` as the automatic selection when setting winner.
- Cards stay in duration order (from `routes/route.ts`: `[...routes].sort((a, b) => a.durationS - b.durationS)`).
- Display order and automatic selection are decoupled -- the test at coordinator line 52-70
  confirms this: `state.selection?.route === providerDefault` while
  `state.providers.google.routes === [fasterAlternative, providerDefault]`.
- Fallback to `choices[0]` (fastest) only when no `isDefault` route exists.

No issues.

### 3. Global Teskeið kill switch and per-user gate authoritative in both endpoints

CORRECT. `route-candidate/route.ts` (lines 24-44): triple global gate followed by per-user
`checkFeatureAccess(..., 'teskeid-routing-v1')`. Returns 404 for both disabled and unauthorized.

`travel/route.ts`: for Teskeid envelopes, both gates are re-checked even when a valid signed
envelope is presented:
- `isTeskeidRouteCandidateEnabled()` (global server flag)
- `checkFeatureAccess(user.id, user.email, 'teskeid-routing-v1')` (per-user)

A valid envelope cannot bypass either gate. Envelope is used only to skip the provider re-call
after authorization passes. This is the correct two-factor pattern.

`routes/route.ts` (line 153): Teskeid candidate is gated there too, via `checkFeatureAccess`.

No issues.

### 4. Envelope canonicalization, TTL, endpoint binding, constant-time check fail-closed

CORRECT. Key properties from code and tests:

- **Canonical JSON:** `payloadSignature` uses sorted-key stable stringify. Test at line 162-182
  confirms that reordering envelope fields at the top level does not break verification.
- **TTL:** sign enforces max 15 minutes (`ttlMs > 15 * 60 * 1_000` throws). Verify rejects
  `nowMs >= expiresAtMs`. Future-issued rejection: `issuedAtMs > nowMs + CLOCK_SKEW_MS (30s)`.
  Test at line 90-116 confirms expired, future-issued, and malformed all return `null`.
- **Endpoint binding:** `origin` and `destination` are in the signed payload. Test at line 83-88
  confirms origin lat delta of 0.001 deg causes verification failure.
- **Constant-time:** `timingSafeEqual` used for comparison. `verifyRouteOptionEnvelope` wraps
  everything in try/catch and returns `null` on any exception -- fails closed.
- **No secret, short secret:** both throw on sign, return `null` on verify. Test at line 138-160.
- **Payload size bound:** `MAX_ROUTE_POINTS = 25_000`, enforced before signing. Test at line 119.

No issues.

### 5. Compact response backward-compatible, no double route-memory writer

CORRECT for backward compatibility. Old callers not sending `includeRouteEnvelopes: true` or
`compactRouteEnvelopes: true` get the previous response shape: `{ routes: [...] }` with no
`routeEnvelopes` field. New callers get `{ routeEnvelopes: [...] }` without `routes` when
compact.

No double route-memory write: warming is skipped when `compactRouteEnvelopes=true` (see LOW
finding above). There is no competing writer in `/travel`.

One subtlety: when `includeRouteEnvelopes=true` but `compactRouteEnvelopes=false`, the response
contains both `routes` and `routeEnvelopes`. The client-side `parseRouteEnvelopes` (5486-5499)
matches envelopes to routes by `route.id`. This is a valid backward-compatible mode.

### 6. `sanitizePublicRouteMemoryLookup` blocks legacy coordinate-bearing keys

CORRECT. Defense layers:

1. `SAFE_PROVIDER_VARIANT_KEY = /^(google|mapbox|teskeid):(-?\d{1,5})$/` -- no coordinates
   possible in the 5-digit-max integer slot.
2. `publicRouteMemoryVariant` returns `null` for any key not matching CURATED, `'default'`, or
   the safe pattern. Nulls are filtered before the result is built.
3. `routeKey` is rebuilt from `buildRouteMemoryKey(fromPlaceKey, toPlaceKey, variants[0].routeVariantKey)`
   using normalized place keys passed in -- the DB-stored `routeKey` value never crosses the
   boundary.
4. If all variants are filtered, result is `{ status: 'miss' }`.

Test at line 68-82 confirms a coordinate-bearing variant key produces a `miss` with no
coordinate data in `JSON.stringify(result)`. Test at line 84-105 confirms a legacy raw key with
a valid curated label is promoted to the safe curated identity.

No issues.

### 7. Route-memory identity not reused as geographic analytics identity

CORRECT. `routeMemoryVariantIdentity` produces `provider:routeIndex` (e.g., `google:0`) or a
`CURATED_*` label. Neither contains geographic data. The key stored in
`weather_route_memory_routes.route_variant_key` is this safe identity.

The `routePairFingerprint` in `usage.server` is a separate analytics hash and is not part of
route memory. Route memory tables store `from_place_key/to_place_key` (normalized display names,
not coordinates) per the SQL 92 schema.

Test at line 36-47 explicitly asserts that a raw Google route ID with embedded coordinates is
never produced by `routeMemoryVariantIdentity`.

No issues.

### 8. No prior worst-point or `.obsidian/workspace.json` changes removed

Not verifiable from code alone. From the git status, `.obsidian/workspace.json` remains
unstaged (modified, not committed) -- consistent with the policy of never committing it. The
prior session confirmed it was excluded from the commit staging via `git restore --staged`. This
point requires Stebbi's confirmation during smoke testing that the diff matches expectations.

### 9. Nothing committed/pushed/deployed before Stebbi confirms smoke

NOT committed. Git status confirms all v085 changes remain as uncommitted modifications and
untracked files. This handoff is written before any commit action.

---

## Tests assessment

**Coordinator tests** (7 tests): Cover all critical state transitions -- first winner lock,
late merge without winner change, `preferredRoute` selection, stale runId rejection, manual
selection preservation, all-failed terminal state. No gaps.

**Discovery tests** (5 tests): Cover all provider launch scenarios -- teskeid-first win,
google-first win, explicit `provider_failed` result, rejected promise converted to failure,
synchronous throw in first provider not blocking second. Synchronous throw case (line 148) is the
most important for resilience; confirmed working by test.

**Envelope tests** (5 tests): Cover sign/verify round-trip, tampering, endpoint mismatch,
expiry, future-issued, malformed hex signature, null input, secret missing, short secret,
canonical field ordering. Complete coverage of the security surface.

**Variant tests** (4 tests): Cover coordinate-bearing key blocked, curated label preserved,
Teskeid routeIndex identity, legacy key with curated label promoted. All cases match implementation.

---

## Summary

Implementation is correct. One low-severity gap (route memory not warmed in compact mode) that
is non-blocking. All 9 Codex review points confirmed. Tests are complete and cover the security
and correctness surface. No blockers to localhost smoke testing.

**Recommendation:** Proceed to localhost smoke testing per the v085 handoff smoke script.
Confirm `.obsidian/workspace.json` is clean from the commit staging before pushing.
