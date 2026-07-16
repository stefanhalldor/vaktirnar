# TODO-086 v334 - Codex review of v333 chat-core realtime prerelease

Created: 2026-07-16 15:31
Timezone: Atlantic/Reykjavik

Reviewed handoff:
- `2026-07-16-1527-todo-086-v333-claude-v332-done-prerelease.md`

Mode:
- Review only.
- Codex did not change product code, SQL, env, migrations, commits, pushes, deployment, Supabase data, or production.

## Findings

### 1. High: DB Realtime subscribe likely does not work without explicit Supabase publication/RLS work

`app/auth-mvp/vedrid/vedurpulsTransport.ts:29` subscribes directly to Postgres changes on `public.teskeid_chat_messages`.

But `sql/78_teskeid_chat_core.sql:81-85` enables RLS, revokes all from `anon` and `authenticated`, and grants access only to `service_role`. I also found no migration that adds `teskeid_chat_messages` to `supabase_realtime`; the old realtime publication in `sql/01_schema.sql:248-251` only adds `messages` and `chats`.

Impact:
- The full pulse page may still only update through polling, not Realtime.
- If someone later "fixes" this by broad grants/policies, that could leak chat payloads across threads or users.

Recommendation:
- Do not treat DB Realtime as verified until Supabase config and RLS are intentionally designed.
- Keep polling fallback.
- If true Postgres Realtime is required, create a separate reviewed plan/migration for:
  - publication membership,
  - narrow RLS/policies or another safe invalidation mechanism,
  - payload exposure analysis,
  - public vs authenticated behavior.
- Safer architecture may be server-mediated invalidation/broadcast rather than direct broad table subscription, especially because this chat core is intended to become reusable outside Veðurpúls.

### 2. Medium: Shared preview surfaces are still not Realtime by default

`components/chat/useChatPreview.ts:25-49` implements:
- initial fetch,
- interval polling,
- same-tab `teskeid:pulse:refresh` custom event.

It does not subscribe to Supabase Realtime. Therefore:
- station-card previews and route-level Safnpúls update immediately only after a send in the same tab,
- other browser tabs/users update only on the 30s polling cadence,
- this does not fully satisfy Stebbi's clarified requirement that the shared chat-core foundation should provide realtime/live behavior by default wherever the chat core is used.

This may be acceptable as an incremental fallback, but should be documented as "polling + same-tab refresh", not true Realtime.

Recommendation:
- Either accept this as a staged implementation and update the handoff wording, or add a real shared preview subscription/invalidation design.
- Keep it in shared chat primitives, not in weather-only components.

### 3. Medium: `useChatPreview` can show stale messages when `url` changes or the new fetch fails

`components/chat/useChatPreview.ts:22-33` keeps the previous `messages` and `loaded` state when the `url` changes. The effect re-runs, but it does not reset `loaded` to `false` or clear messages before fetching the new URL.

Impact:
- In station explorer flows where the same component instance changes station, old station messages can briefly show under the newly selected station.
- If the new fetch fails, stale messages can remain indefinitely.

Recommendation:
- At effect start, reset `loaded` and clear messages, or add an option to preserve previous messages only when the caller explicitly wants stale-while-revalidate.
- For this product surface, correctness matters more than avoiding a small loading gap.

### 4. Medium/Residual: Long-route cap avoids 400 but can hide later station messages

`components/weather/VedurstofanRoutePulseSummary.tsx:26-28` caps the route preview to the first 40 stations in route order. This is better than silently sending >40 and getting a 400, but it means:
- stations after the first 40 are never checked,
- if only later stations have messages, the route-level summary can still hide even though relevant route pulse exists.

v332 allowed either chunking or a conscious cap, so this is not a blocker if Stebbi accepts the tradeoff. But it should be considered a deliberate product limitation.

Recommendation:
- Prefer chunking when convenient.
- If keeping the cap, add/keep a clear product note and localhost check for long routes.

### 5. Low/Medium: Hólmavík tests cover Ísafjörður but not the other named destinations from v332

The new tests around `lib/__tests__/weather-google.test.ts:1004-1077` are useful and targeted.

However, v332 asked for Reykjavík -> Bolungarvík/Súðavík coverage too. The current test additions cover:
- Ísafjörður,
- Akureyri negative,
- short trip negative,
- duplicate suppression,
- curated kept when base route is not near Hólmavík.

They do not cover Bolungarvík or Súðavík.

Recommendation:
- Add at least one more destination inside `WESTFJORDS_NORTH_BOUNDS`, preferably Bolungarvík or Súðavík, or explicitly document that Ísafjörður is the representative test for the bounds.

## Confirmed Good

- Route summary title was updated in both message files:
  - `messages/is.json`: `Nýjast frá notendum Teskeið.is`
  - `messages/en.json`: `Latest from Teskeið.is users`
- `ScopedChatPanel` remains transport-driven and product-agnostic; the subscribe function is optional.
- Full thread panel still has polling fallback.
- `VedurstofanPulseInline` now uses a shared preview hook instead of hand-rolled per-component polling.
- Same-tab refresh after send should now wake both inline preview and route summary.
- Hólmavík tests add meaningful coverage for the main route rule.
- No SQL/env/RLS/deploy work was done in v333, which is consistent with the handoff scope.

## Commands run by Codex

- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
- `Get-Content -Encoding UTF8 'ai-handoff/README.md'`
- `Get-Content -Encoding UTF8 'ai-handoff/2026-07-16-1527-todo-086-v333-claude-v332-done-prerelease.md'`
- `git status --short`
- Read numbered contents of:
  - `components/chat/useChatPreview.ts`
  - `components/chat/ScopedChatPanel.tsx`
  - `app/auth-mvp/vedrid/vedurpulsTransport.ts`
  - `components/weather/VedurstofanPulseInline.tsx`
  - `components/weather/VedurstofanRoutePulseSummary.tsx`
  - `app/api/teskeid/weather/vedurpuls/route-preview/route.ts`
  - relevant excerpts from `lib/__tests__/weather-google.test.ts`
  - relevant excerpts from `lib/weather/google.server.ts`
  - relevant excerpts from `sql/78_teskeid_chat_core.sql`
  - relevant excerpts from `sql/01_schema.sql`
- `npm run type-check` -> passed
- `npm run test:run -- lib/__tests__/weather-google.test.ts` -> passed, 93 tests

Codex did not run the full test suite.

## Recommendation

Do not block this solely because previews use polling; that is probably safe enough for a prerelease/local test loop.

But do not describe this as "Realtime solved everywhere" yet. I would ask Claude Code for a small follow-up before release if the acceptance criterion is true realtime:

1. Fix `useChatPreview` stale-state-on-url-change.
2. Update wording/docs/handoff to say previews are polling + same-tab refresh unless true Realtime is implemented.
3. Decide explicitly whether DB Realtime for `teskeid_chat_messages` is in scope now. If yes, make it a separate security-reviewed SQL/RLS/publication task. If no, leave it as polling fallback and test that behavior.

## Localhost checks for Stebbi

Before release:

1. Open `/vedrid`, calculate a route with Sandskeið and Kauptún or other Veðurstofan station cards that have pulse messages.
2. Confirm route-level title is exactly `Nýjast frá notendum Teskeið.is`.
3. As an authenticated user, post a message on a station card.
4. Expected:
   - station card updates immediately,
   - route-level summary updates immediately in the same tab.
5. Open the same full pulse page in two browser windows.
6. Post a message in one window.
7. Expected:
   - if Realtime works, the other window updates quickly,
   - if not, it should update through 15s polling.
   - If neither happens, this is a blocker.
8. In `/auth-mvp/vedrid/elta-vedrid`, select one station with messages and then quickly select another station.
9. Expected:
   - messages from the first station should not appear under the second station, even briefly if the network is slow.
10. Test a long route with many Veðurstofan stations.
11. Expected:
   - route Safnpúls does not fail from a 400,
   - be aware only first 40 stations are checked unless Claude chunks.
12. Test Hólmavík:
   - Reykjavík -> Ísafjörður shows `Gegnum Hólmavík`.
   - Reykjavík -> Akureyri does not.
   - Visual map check confirms `HOLMAVIK_VIA` lands on the intended Route 61/Hólmavík corridor.
13. Do not casually change Supabase realtime/RLS/publication settings during localhost testing; that needs explicit SQL/security review.

## Óvissa / þarf að staðfesta

- I did not inspect Supabase dashboard Realtime publication settings; I only checked repo SQL.
- It is possible production has manual Supabase Realtime config not represented in `sql/`, but relying on manual config should be documented.
- I did not verify browser behavior; the stale-preview finding is based on React state flow in `useChatPreview`.
