# TODO-086 v332 - Codex addendum: chat-core realtime contract + missing v330 findings

Created: 2026-07-16 14:56
Timezone: Atlantic/Reykjavik

Source context:
- Follow-up to `2026-07-16-1451-todo-086-v331-codex-v330-route-pulse-realtime-title-handoff.md`.
- Stebbi clarified that realtime should not be solved as a one-off weather patch. It should be part of the shared reusable chat-core foundation by default wherever Teskeið uses the chat core.
- Stebbi also asked whether all findings from Codex's first review message were included in v331. Short answer: not all of them were explicit enough. This v332 consolidates the missing points.

This is handoff only. Codex did not change product code, SQL, env, migrations, commits, pushes, deployment, Supabase data, or production.

## Key correction to v331

v331 suggested polling as a "short safe fix" for the route pulse summary. That is acceptable as a fallback, but it should not become the architectural endpoint.

The intended direction is:

- The reusable Teskeið chat core should support live updates by default.
- Product-specific surfaces such as Veðurpúls, route-level Safnpúls, station-card previews, full station pulse pages, and future non-weather chat/pulse contexts should inherit that behavior from shared chat primitives or hooks.
- Weather should be the first consumer of the reusable chat core, not a parallel bespoke implementation.

## Current state observed in code

`components/chat/ScopedChatPanel.tsx` currently:
- loads messages through injected `transport.loadMessages`,
- polls on `pollingIntervalMs` with default `15_000`,
- does not accept or manage a Supabase Realtime subscription,
- has no generic "message inserted" subscription contract.

`components/weather/VedurstofanPulseInline.tsx` currently:
- loads station preview with `fetch`,
- polls every 30 seconds,
- refreshes immediately after its own successful send,
- is still weather-specific rather than using a generic preview live-update primitive.

`components/weather/VedurstofanRoutePulseSummary.tsx` currently:
- fetches route-preview once on mount,
- does not poll,
- does not subscribe,
- therefore misses messages posted after initial load.

## Required architecture direction

### 1. Chat-core should own live update behavior

Severity: High / architecture

Claude Code should avoid fixing route Safnpúls by adding a third separate refresh pattern.

Instead, introduce or extend shared chat primitives so all chat consumers can use the same live behavior:

- Full thread panel:
  - `ScopedChatPanel` should support live update by default.
  - It can keep polling as fallback, but Realtime should be the primary path when available.
  - It must remain product-agnostic: no `weather`, `vedurstofan`, or route-specific assumptions inside the core component.

- Preview surfaces:
  - There should be a reusable preview/live hook or helper for:
    - one target/thread preview,
    - multiple target/thread previews grouped by target, as needed for route Safnpúls.
  - Weather components should pass target identity and labels, not implement separate fetch/subscription semantics per component.

Possible shape, not mandatory:

```ts
type ScopedChatLiveOptions = {
  enabled?: boolean
  pollingFallbackMs?: number
}

type ScopedChatPreviewTarget = {
  domain: string
  targetType: string
  targetId: string
}
```

Important: do not overbuild a full chat platform now. The goal is a small reusable live-update contract that weather can use immediately and future Teskeið chat contexts can reuse.

### 2. Realtime should gracefully fall back to polling

Severity: High

Supabase Realtime can fail because of network, channel auth, browser sleep, or deployment config. The UX should not depend solely on Realtime.

Recommended behavior:
- subscribe to relevant `teskeid_chat_messages` inserts when possible,
- refresh from server on insert rather than trusting payload shape for all UI,
- keep a slower polling fallback,
- debounce route-level refresh when multiple messages arrive quickly,
- never leak private data through client-side channel filters.

For route Safnpúls, the hard part is that route starts from station IDs while messages are keyed by `thread_id`.

Safe approaches:
- Route-preview endpoint can return thread IDs for stations that already have threads, and the client subscribes to those thread IDs.
- If thread IDs are not available or a new thread is created while the page is open, use fallback polling plus same-tab custom event after post.
- Do not subscribe broadly to all chat messages unless RLS and payload exposure are clearly safe.

### 3. Route-level Safnpúls should use the shared live-preview contract

Severity: High

Expected route summary behavior:
- title: `Nýjast frá notendum Teskeið.is`,
- hidden when no messages exist on route stations,
- shows the latest messages per route station in route order,
- updates when a new message is posted on any station included in the route,
- does not jump the layout aggressively,
- keeps `returnTo`,
- remains read-only preview; compose remains on station card or full pulse page for authenticated users.

## Consolidated findings from the first Codex v330 review

These were not all explicit enough in v331. Include them in Claude Code's next pass.

### A. Route-scoped Safnpúls can disappear silently on long routes

Severity: Medium

`VedurstofanRoutePulseSummary.tsx` sends all `orderedStations` in one request, but `app/api/teskeid/weather/vedurpuls/route-preview/route.ts` rejects more than 40 station IDs.

Risk:
- long route returns more than 40 Veðurstofan stations,
- endpoint responds 400,
- client swallows the error,
- route Safnpúls disappears even when messages exist.

Fix:
- chunk station IDs in the client/shared preview fetcher and merge results, or
- consciously cap in route order with a named constant and comment.

Do not let this fail invisibly.

### B. Hólmavík curated route needs targeted tests

Severity: Medium

The broader `weather-google.test.ts` passing proves existing route logic did not regress, but it does not prove the new `CURATED_VIA_HOLMAVIK` rule behaves correctly.

Add focused tests for:
- Reykjavík -> Ísafjörður includes `CURATED_VIA_HOLMAVIK`,
- Reykjavík -> Bolungarvík/Súðavík includes it if they are in scope,
- Reykjavík -> Akureyri does not include it,
- base route already near Hólmavík suppresses duplicate curated route,
- curated request uses the intended `HOLMAVIK_VIA` coordinates.

### C. Hólmavík origin scope may be narrower than Stebbi's product intent

Severity: Medium / product scope

Current rule appears to target capital-area origin. That solves Reykjavík -> Ísafjörður, but Stebbi's original phrasing was closer to "when going to Ísafjörður / northern-western Westfjords, give the option to go through Hólmavík."

Claude Code should either:
- broaden the origin scope deliberately, or
- document v1 as capital-area-origin only and ask Stebbi to confirm before widening.

Be careful with this because route suggestions are safety-adjacent.

### D. Route Safnpúls placement is accepted for now

Severity: Low / UX

Original review noted that route Safnpúls was not literally under "Mest krefjandi". Stebbi now says this placement is actually better than expected.

Keep current placement unless Stebbi later asks to move it.

## Recommended next Claude Code task

Implement one focused pass:

1. Update the route summary title:
   - IS: `Nýjast frá notendum Teskeið.is`
   - EN: `Latest from Teskeið.is users`

2. Add a reusable chat-core live-update contract:
   - full `ScopedChatPanel` gets live update support by default if feasible,
   - preview surfaces get a shared hook/helper instead of each product rolling its own refresh,
   - keep polling fallback.

3. Move route Safnpúls onto that shared live-preview contract:
   - route summary updates after station-card/full-pulse posts,
   - supports multi-station route previews,
   - handles >40 stations safely.

4. Add/adjust tests:
   - unit test for any new chat preview grouping/chunking helper,
   - targeted Hólmavík route tests,
   - if a hook is introduced, at least test pure helper behavior; do not make the phase huge with brittle browser-like tests unless already established.

5. Keep scope tight:
   - no SQL unless absolutely required,
   - no env changes,
   - no RLS weakening,
   - no changes to weather scoring/calculation,
   - no redesign of the full pulse page.

## Files likely involved

Likely:
- `components/chat/ScopedChatPanel.tsx`
- a new shared chat hook/helper, likely under `components/chat/` or `lib/chat/`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/weather/VedurstofanRoutePulseSummary.tsx`
- `messages/is.json`
- `messages/en.json`

Possibly:
- `app/api/teskeid/weather/vedurpuls/route-preview/route.ts`
- `lib/chat/repository.server.ts`
- `lib/weather/google.server.ts`
- `lib/__tests__/weather-google.test.ts`

Avoid unless clearly justified:
- `sql/`
- auth guard files
- feature flag model
- Supabase policies/grants
- deployment or Vercel config

## Security and privacy notes

- Public preview is okay only if it returns the same public-safe fields as current single-station previews.
- Do not expose full names beyond the current intended display behavior.
- Do not subscribe the public client to a broad unfiltered messages stream if payloads could include data from unrelated chat contexts.
- If adding Realtime for public previews, verify that RLS/publication behavior cannot leak hidden/deleted/private messages.
- Prefer server re-fetch after a realtime notification over trusting client payload for display.

## Commands run by Codex for this addendum

Read-only:
- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-16-1451-todo-086-v331-codex-v330-route-pulse-realtime-title-handoff.md'`
- `Get-Content -Encoding UTF8 'components/chat/ScopedChatPanel.tsx'`
- `Get-Content -Encoding UTF8 'components/weather/VedurstofanRoutePulseSummary.tsx'`

No tests were run.

## Localhost checks for Stebbi

After Claude Code implements this:

1. Open `/vedrid`, calculate a route with several Veðurstofan stations and some existing pulse messages.
2. Confirm the route summary title is `Nýjast frá notendum Teskeið.is`.
3. Confirm route Safnpúls is hidden when there are no messages on any route station.
4. As an authenticated user, post a new message on a station card that is included in the route.
5. Expected:
   - the station card updates,
   - the route summary updates without page reload,
   - update happens through the shared chat-core live behavior or shared preview hook, not a one-off route hack.
6. In a second browser/session, post a message to the same station's full pulse page.
7. Expected:
   - first browser updates through realtime or fallback polling.
8. Test a route likely to include more than 40 Veðurstofan stations.
9. Expected:
   - route Safnpúls does not disappear because of a 400 from `route-preview`,
   - either chunking works or a deliberate cap behaves consistently.
10. Test Hólmavík route:
   - Reykjavík -> Ísafjörður should show `Gegnum Hólmavík`,
   - Reykjavík -> Akureyri should not,
   - if Google already returns a Hólmavík-like base route, duplicate should be suppressed.
11. Public user:
   - can see public-safe preview messages,
   - cannot compose,
   - sees no empty pulse box when there are no messages.
12. Mobile width around 390px:
   - no horizontal overflow,
   - refresh does not cause disruptive layout jump,
   - `Sjá fleiri skilaboð` / full pulse return path still works.

## Answer to Stebbi's question

No, v331 did not contain every item from the first Codex review message. It included the route realtime gap, title change, Kauptún verification, >40-station risk, and the updated placement decision. It did not explicitly preserve the Hólmavík test coverage finding or the Hólmavík origin-scope concern. This v332 addendum consolidates those missing points and adds the stronger chat-core realtime requirement.
