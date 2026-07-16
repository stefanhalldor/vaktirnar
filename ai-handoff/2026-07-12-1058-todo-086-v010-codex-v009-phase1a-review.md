# TODO 086 - Codex review of Claude v009 Phase 1A Veðurstofan XML parser

Created: 2026-07-12 10:58
Timezone: Atlantic/Reykjavik
Author: Codex
Type: Prerelease review

Reviewed:
- `ai-handoff/2026-07-12-1056-todo-086-v009-claude-phase1a-done.md`
- `lib/weather/providers/vedurstofanXml.ts`
- `lib/__tests__/weather-vedurstofan-xml.test.ts`

No app code was changed by Codex. No SQL, Supabase, env, commit, push or deploy changes were made by Codex.

## Findings

No blocking findings.

The Phase 1A slice is appropriately small: parser + fixture tests only. It does not call the network, does not integrate with `/vedrid`, does not touch `route.ts`, does not touch `assessment.ts`, and does not write to Supabase.

### P3 - XML entity decoding is not handled yet

Reference: `lib/weather/providers/vedurstofanXml.ts:103-107`

The helper returns raw tag text and does not decode common XML entities such as `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`.

This is not a blocker for Phase 1A because the probed `forec` station forecast fields were simple text values. But before any Veðurstofan text is shown directly in UI, add a tiny `decodeXmlEntities()` helper and fixture test.

Important: do not overreact by adding a full XML dependency yet unless real responses prove the schema is more complex than the current parser handles.

### P3 - `rawR` is parsed raw value, not original raw text

Reference: `lib/weather/providers/vedurstofanXml.ts:52-53`, `lib/weather/providers/vedurstofanXml.ts:185-193`

`rawR` preserves the parsed numeric value after decimal-comma conversion. It does not preserve the original string, e.g. `"0,6"`.

This is fine for current audit/use, but if Claude Code later wants exact source-value debugging, add a separate `rawRText` field rather than changing `rawR` semantics after consumers exist.

## What Looks Good

- Parser is dependency-free and does not make network requests.
- Missing optional fields become `null`, not `0`.
- Forecast rows with invalid/missing `ftime` are skipped with parse errors instead of throwing.
- Multi-station XML is supported.
- `R` is treated as `mm/klst` per official docs.
- `FG`/`FX` are parsed only if present and clearly documented as not for scoring/user-facing thresholds.
- The `id` vs `valid` attribute issue is handled by attribute matching from the station opening tag.
- Tests cover the important shape: single station, multiple stations, decimal comma, nullable fields, optional gust fields and malformed input.

## Verification Run By Codex

```text
npm run test:run -- lib/__tests__/weather-vedurstofan-xml.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       28 passed (28)
Exit code   0
```

```text
npm run type-check
```

Result:

```text
tsc --noEmit
Exit code 0
```

`git status --short` showed a very dirty worktree with many unrelated modified/untracked files. This review only covers the Phase 1A parser and test files named above.

## Recommendation

Phase 1A is good enough to keep and proceed to Phase 1B.

Recommended next implementation slice, with explicit Stebbi permission:

```text
Claude Code, framkvæmdu Phase 1B: station mapping skeleton for Veðurstofan.
```

Phase 1B should remain small:

- Add curated station list.
- Add nearest/approved station mapping function.
- Add longitude sign guard test.
- Add known coordinate tests for Hellisheiði, Garðabær, Egilsstaðir, Höfn.
- No fetch/cache yet.
- No route integration yet.
- No UI yet.

## Localhost checks for Stebbi

Nothing user-visible changed in this Phase 1A parser slice.

Optional check:

1. Open `/vedrid` on localhost.
2. Reikna eina leið.
3. Expected: behavior is unchanged from before Phase 1A.
4. There should be no live calls to `xmlweather.vedur.is` during normal navigation.

No Supabase, auth, RLS, SQL, deployment, billing, secrets or user-data behavior changed in Phase 1A.

## Óvissa / þarf að staðfesta

- This review did not inspect unrelated dirty worktree files.
- Phase 1B station curation still needs careful source validation and WGS84 longitude sign tests.
- Phase 1C still needs cache TTL, batching cap and fail-open behavior before any live Veðurstofan calls are introduced.
