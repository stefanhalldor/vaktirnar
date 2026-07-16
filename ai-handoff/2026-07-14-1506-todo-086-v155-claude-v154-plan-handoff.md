# TODO 086 v155 - Claude handoff: v154 plan presented, awaiting Stebbi decisions

Created: 2026-07-14 15:06 Atlantic/Reykjavik
Agent: Claude Code

## Session Summary

This session implemented the three map issues Stebbi reported after v147:

- **v148**: Map pill counts include all providers; Veðurstofan stations clickable; decisive provider drives the map card; `OverlayPointDetailsPanel` added.
- **v149** (Codex review): Found that filtering a status could leave the overlay card showing a hidden station.
- **v150**: Fixed `toggleMapStatus` overlay handling; added visibility check in auto-select effect.
- **v151** (Codex review): Found that `selectionResetSignal` (slot change) still selected hidden overlay stations.
- **v152**: Extracted `overlayIsVisible(p, filter)` helper; applied consistently in all four places (marker update, auto-select, toggleMapStatus, selectionResetSignal).
- **v153** (Codex review): No blocking findings. Low note on hardcoded strings in overlay tooltip/panel. Ready for Stebbi localhost check.
- **v154** (Codex plan): Detailed plan for Phase A (freshness), Phase B (provider selector), Phase C (cleanup).

v154 plan was presented to Stebbi. Implementation permission not yet granted.

## Two Decisions Awaiting Stebbi

### 1. Grace window for Veðurstofan cycle freshness

Veðurstofan forecasts update on a 3-hour cadence. Current behavior uses `fetchedAtIso + 4h TTL`, so stale cycles can be served as fresh.

Options:
- **5 minutes** — strict. Old cycle is stale 5 min after the next cycle boundary.
- **10 minutes** — Codex recommendation. Allows brief provider publication delay.
- **15 minutes** — more forgiving, but risks showing 2+ hour old forecasts.

Stebbi's preferred grace window: **?**

### 2. Public behavior when Veðurstofan is stale

When the cached Veðurstofan cycle is outdated:

- Option A (Codex recommendation): exclude stale Veðurstofan from public calculation silently; keep met.no running; show stale/unavailable status in the provider selector.
- Option B: exclude from calculation AND show an explicit warning to the user in the route result.
- Option C: allow stale data with a visible timestamp label (debug-only for now).

Stebbi's preferred stale behavior: **?**

## Next Step (Phase A) — Awaiting Permission

Once Stebbi answers the two decisions above and grants permission, Claude Code should:

1. Read `lib/weather/providers/vedurstofan.server.ts` and the cron warmer.
2. Add `isVedurstofanCycleFresh(payload, now)` helper (cycle-aware, not TTL-only).
3. Update `expiresAtIso` to be based on `atimeIso + cadence + grace`, not `fetchedAtIso + 4h`.
4. Make the warmer force a live fetch when the cached cycle is outdated.
5. Gate stale Veðurstofan data out of public travel calculations.
6. Add focused tests for: fresh cycle, stale cycle, recent fetch + old atime, warmer bypass.
7. Type-check, then handoff. Do NOT touch Phase B or Phase C yet.

## Phase B (Provider Selector) — Separate Step After Phase A

After freshness is reliable, redesign the provider selector:

- "Sannreynt" section: met.no, default on, toggle enabled
- "Í prófunum" section: Veðurstofan, toggle enabled (feature-flag gated), shows stale/unavailable state
- "Væntanlegt" section: Vegagerðin, toggle disabled (coming soon stub)

All text to `messages/is.json` + `messages/en.json`. Mobile-first, no horizontal overflow. Use `WeatherProviderSelector` component — provider-neutral enough for Vegagerðin.

## Phase C (Follow-Ups) — After Phase B

- Localize hardcoded `"spá kl."` / `"m/s"` strings in overlay tooltip and `OverlayPointDetailsPanel`.
- Normalize provider identity to `provider:id` composite key before Vegagerðin data arrives.
- Add vedur.is station links in the overlay detail panel.

## What NOT To Do

- No SQL migrations.
- No Supabase writes.
- No deploy, commit, or push.
- No live Veðurstofan calls from user-facing travel API.
- No Vegagerðin data ingestion yet.

## Current Uncommitted Changes

All changes from v142-v152 are uncommitted on `main`. Files modified:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/__tests__/weather-travel.test.ts`
- `lib/weather/travel.ts`
- `lib/weather/types.ts`
- `messages/en.json`
- `messages/is.json`

New files (untracked):
- `lib/weather/providerComparator.ts`
- `lib/__tests__/weather-provider-comparator.test.ts`
- `lib/__tests__/weather-vedurstofan-blend.test.ts` (modified from original)
- `.claude/` directory
- `ai-handoff/` entries v154+

Type-check: exit 0. Tests: 131 passed + 5 skipped (136 total).
