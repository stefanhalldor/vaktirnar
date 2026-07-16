# TODO 086 v105 - Codex review of v104 Veðurstofan travel layer design

Created: 2026-07-13 18:43  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Reviewed handoff: `2026-07-13-1840-todo-086-v104-claude-vedurstofan-travel-layer-design.md`

## Verdict

v104 is directionally good and much better aligned with Stebbi's latest product direction than v101.

The important refinement: do not let "max-blending" silently replace the existing travel-weather result. Future-proof and user-friendly means the API and UI should carry two clear layers:

1. MET/Yr baseline: current source of truth.
2. Veðurstofan experimental layer: optional additive context, and optionally an "augmented" assessment when the user/flag chooses to include it.

That gives the user more safety and more transparency without creating new direct Google or met.no cost.

## Findings / concerns

### Medium - "Max-blending" must not become an invisible behavior change

v104 says: "Blending regla: hækkun einungis. `max(MET/Yr, Veðurstofan)` per gildi per punkt. Veðurstofan getur bara hækkað viðvörn/mat, aldrei lækkað það."

This is a good safety rule for an opt-in experimental layer. But it is risky if it silently changes the normal route result.

Recommendation:

- Keep baseline result untouched.
- Add `vedurstofanLayer` / `augmentedResult` as separate response fields.
- UI can show "Grunnmat: MET/Yr" and "Með Veðurstofu (í prófun)" without pretending the experimental result is the canonical truth.
- If toggle is off/hidden, UI must render exactly the same baseline behavior as before.

This preserves user trust and makes future provider strategy cleaner: later we can let the user choose MET/Yr only, Veðurstofan only, blended, or best-available without rewriting the whole contract.

### Medium - Do not build a full UI layer before the API contract is stable

The best next implementation step should be API/data-contract first, not a large visual layer.

Reason:

- The current UI is already dense.
- If response shape changes again, UI work gets churned.
- Tests are easier at the API/helper layer.
- No extra Google/met.no cost is introduced if we keep the existing single route request and single MET/Yr fetch path.

Recommended next phase:

1. Add gated API response fields for baseline + Veðurstofan overlay metadata.
2. Add blending helper with tests.
3. Add minimal UI toggle only after response contract is proven.

### Low - Temperature and observations should not be blended into scoring yet

Claude's D proposal is right:

- Blend `wind_speed_ms`.
- Blend `precipitation_mm_per_hour`.
- Display `temperature_c`, but do not use it for status/scoring yet.
- Do not use observations/gusts in route scoring until time semantics are clear.

This keeps the math explainable.

## Decisions A-D

### A. Feature flag scope

Codex recommendation: A1 + A3.

Use both:

- Per-user `elta-vedrid` access for validation users.
- Server-side rollout flag, e.g. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, default false.

Why:

- Per-user flag controls who can see/test it.
- Server flag gives fast environment-level rollback.
- This does not create direct provider cost.
- It prevents accidental broad rollout while the 34 unavailable stations are still being classified.

Do not expose this to all `vedrid` users yet. Later, after validation, it should become a normal `vedrid` capability, not permanently stuck as `elta-vedrid`.

### B. Toggle/endurreikning

Codex recommendation: B1, but only for users/environments where the layer is enabled.

Return both:

- `baselineResult`: MET/Yr only
- `augmentedResult`: MET/Yr plus Veðurstofan max-blend
- `vedurstofanLayer`: station rows, freshness, source notes, missing/unavailable metadata

Why B1:

- Instant toggle.
- No extra API call.
- No extra Google or met.no request.
- `checkTravelWeather` is deterministic in-memory logic over already-fetched points. Running it twice for gated users is acceptable.

Guardrail:

- If the layer is disabled, do not compute the augmented result.
- If product-table data is missing/stale/unavailable, return baseline as before and mark the layer unavailable/partial.

### C. Max-blending time matching

Codex recommendation: C1 for first implementation.

Use nearest Veðurstofan forecast row within ±1.5h of the MET/Yr hour.

Reasons:

- Simple and easy to test.
- No fake precision from interpolation.
- Lower risk of over-warning whole 3h windows.
- Works naturally with Veðurstofan's 3h forecast cadence.

Must include metadata:

- matched Veðurstofan forecast time
- MET/Yr hour
- offset minutes
- station id/name
- stale/ok status

If later we discover C1 under-represents risk, C3 can be added as a stricter mode.

### D. Fields

Codex recommendation:

- Use `wind_speed_ms` for blended assessment.
- Use `precipitation_mm_per_hour` for blended assessment.
- Show `temperature_c` as context only.
- Do not blend `wind_direction_text`.
- Do not use gust/observation data for scoring until observations are separately implemented and time semantics are explicit.

## Future-proof response shape

Prefer a response that can grow into multi-provider weather without another rewrite:

```ts
{
  result: DeterministicResult,              // backwards-compatible baseline for existing UI
  weatherLayers?: {
    baseline: {
      provider: 'metno',
      result: DeterministicResult
    },
    vedurstofan?: {
      enabled: boolean
      experimental: true
      status: 'available' | 'partial' | 'unavailable' | 'disabled'
      result?: DeterministicResult          // augmented result, if available
      points?: VedurstofanPointLayer[]
      disclaimerKey: string
    }
  }
}
```

If changing top-level shape is too risky, keep existing `result` shape unchanged and add an optional `travelPlan.vedurstofanLayer` plus `travelPlan.augmentedWithVedurstofan`. The key point is: existing consumers must not break.

## Cost guardrails

This architecture is good on cost if implemented carefully:

- Do not add new Google route/map calls for the layer.
- Do not add new met.no calls for the layer.
- Read Veðurstofan from Supabase product tables only.
- Compute augmented result in memory.
- Make UI toggle client-side over data already returned.

The only extra per-request work for enabled users should be:

- one Supabase product-table read for nearby station IDs
- in-memory blending
- a second `checkTravelWeather` call

That is acceptable for the validation cohort.

## UI guidance from Design.md

Design.md points that matter here:

- Mobile-first, app-like, no dashboard-heavy UI.
- Use toggles/segmented controls for binary or few-option settings.
- Avoid cards inside cards.
- Keep compact operational UI dense but clear.
- All user text belongs in `messages/is.json` and `messages/en.json`.
- Touch targets should be at least 40x40px.
- Loading and toggles must not cause layout shift.

Recommendation for first UI:

- A compact toggle row near the existing route/weather display controls:
  - label: `Veðurstofan (í prófun)`
  - state: on/off
  - small status text: `Bætir við samanburði, breytir ekki grunnspá MET/Yr nema þú sýnir prófunarlagið.`
- When layer is shown, add a small non-card notice:
  - `Veðurstofugögn eru í prófun. MET/Yr er áfram grunnspáin. Vegagerðin er ekki komin inn.`
- Do not add a big explanatory panel unless needed.

## Is v101 a good foundation?

Partly yes.

Good:

- Product-table read in `Promise.all` is the right direction.
- Fail-open behavior is right.
- Removing live Veðurstofan user-request calls is right.

Needs adjustment before commit:

- Add A1 + A3 guard before reading or returning the layer broadly.
- Keep baseline result unchanged.
- Do not remove tests that proved old fail-open behavior unless replaced by stronger product-table tests.
- Return explicit layer metadata instead of only mutating route points.

## Recommended next step

Codex recommends this exact next step for Claude Code:

1. Do not build the full UI yet.
2. Stabilize API/helper layer first:
   - server flag + per-user/access guard
   - product-table read only when enabled
   - helper to max-blend wind/precip by nearest ±1.5h
   - return baseline + optional augmented/layer metadata
   - tests for no extra provider calls, fail-open, stale/unavailable, and "Veðurstofan only raises"
3. Then do a small UI pass with show/hide toggle and disclaimer.

This is the best balance of future-proof, user-friendly, and cost-conscious.

## Suggested instruction to Claude Code

```text
Claude Code, rýndu v105 Codex review áður en þú framkvæmir næsta TODO 086 skref.

Stefna:
- Veðurstofan á að koma inn í ferðaveðrið sem auka/prófunarlag, ekki sem replacement.
- MET/Yr grunnurinn á að haldast óbreyttur.
- Ekki búa til auka Google eða met.no köll.
- Veðurstofan er lesin úr Supabase product tables.
- Toggle á að vera instant/client-side yfir gögnum sem API skilar nú þegar.

Framkvæmdu næst API/helper grunn, ekki stórt UI:
1. Settu Veðurstofan travel layer bakvið bæði:
   - per-user elta-vedrid access, og
   - server flag t.d. VEDURSTOFAN_TRAVEL_LAYER_ENABLED default false.
2. Haltu núverandi response/backwards compatibility þannig að núverandi UI brotni ekki.
3. Skilaðu baseline MET/Yr result óbreyttu.
4. Bættu við optional Veðurstofan layer/augmented result aðeins þegar flag/access leyfir.
5. Max-blending:
   - wind_speed_ms og precipitation_mm_per_hour eingöngu
   - nearest Veðurstofan forecast_time innan ±1.5h
   - Veðurstofan má bara hækka mat/viðvörun, aldrei lækka
   - temperature aðeins til sýnis
6. Fail-open:
   - tóm/stale/unavailable product table má ekki brjóta ferðaveður
   - ef layer vantar gögn á baseline að vera eins og áður
7. Tests:
   - layer disabled => no product-table read and baseline unchanged
   - layer enabled => product-table read, augmented result optional
   - Veðurstofan raises warning when higher
   - Veðurstofan never lowers warning
   - stale/unavailable/missing data fail-open
   - no extra Google/met.no calls for toggle/layer

Ekki commit-a, push-a, deploya, breyta Supabase/migrations, eða invoke-a production cron nema Stebbi biðji sérstaklega um það.
```

## Localhost checks for Stebbi

After Claude Code completes the API/helper phase:

1. With `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` off:
   - run a normal travel-weather route
   - verify UI/result behaves exactly like before
   - verify no Veðurstofan layer appears

2. With the layer enabled for Stebbi's user:
   - run the same route
   - verify baseline result still appears
   - verify Veðurstofan layer metadata is present
   - verify no extra Google/met.no delay or route lookup happens from toggling

3. Later UI phase:
   - confirm `Veðurstofan (í prófun)` toggle works instantly
   - confirm disclaimer is visible
   - confirm text says Vegagerðin is not included yet
   - test mobile widths around 360, 390, and 460px for overflow/control wrapping

Do not test production cron or production route behavior without explicit approval.
