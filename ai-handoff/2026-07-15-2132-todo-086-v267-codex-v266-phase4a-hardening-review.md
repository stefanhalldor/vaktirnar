# 2026-07-15 21:32 - TODO-086 v267 - Codex review of v266 Phase 4A hardening

Created: 2026-07-15 21:32
Timezone: Atlantic/Reykjavik

## Findings

### High - Per-thread chat still fetches the oldest 50 messages, not the latest 50

`lib/chat/repository.server.ts:125` says `listMessages` lists messages oldest-first, and the query does `.order('created_at', { ascending: true }).limit(...)` at `lib/chat/repository.server.ts:139-140`. The station panel calls `/api/auth-mvp/vedurpuls/messages?threadId=...&limit=50` without a cursor in `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx:21-22`.

That means a busy station thread with more than 50 messages will show the first 50 historical messages and hide the newest/current discussion. This is separate from the Safnpuls feed bug, which v266 did fix by changing `getFeedMessages` to newest-first.

Recommended fix before commit if we want Phase 4A to be genuinely hardened:

- Keep the panel display oldest-to-newest within the visible window.
- Fetch the latest N rows for an initial thread load, probably via descending query and reverse in the repository or a dedicated `listLatestMessages` option.
- Add a unit test proving initial per-thread load returns the current/latest 50, not the first 50 ever written.
- Keep `before` semantics clear for older-message pagination later.

This is not an auth, RLS, or data-leak blocker, but it is a core product correctness issue for a reusable chat component.

### Low - Feed comments still say oldest-first after the newest-first fix

The runtime feed query is now newest-first in `lib/chat/repository.server.ts:321-328`, but comments still say oldest/chronological:

- `lib/chat/repository.server.ts:293-297`
- `app/api/auth-mvp/vedurpuls/feed/route.ts:11-13`

This should be cleaned up in the same small follow-up so the contract is not misleading for Claude Code or future Codex reviews.

## What v266 fixed well

- The v265 architecture blocker is fixed: `components/chat/ScopedChatPanel.tsx` now accepts a required `transport` prop and no longer hardcodes Veðurpúls API routes.
- Veðurpúls-specific fetches now live in `VedurstofanStationExplorerClient.tsx` via `VEDURPULS_TRANSPORT`, which keeps the reusable chat panel product-agnostic.
- Safnpúls feed ordering is now newest-first in `getFeedMessages`.
- The feed endpoint still scope-checks server-side through `WEATHER_PULSE_SCOPE`; the client does not supply arbitrary thread lists.
- `authorName` is added without exposing `user_id` or email in DTOs. It only returns `profiles.display_name`, and profile lookup degrades to `null` on errors.
- The scroll-jump fix in `ScopedChatPanel` is directionally right: it scrolls the message container, not the whole page.

## Commands run

```powershell
npm run type-check
```

Result: passed.

```powershell
npm run test:run -- lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
```

Result: 4 test files passed, 102 tests passed.

## SQL / Supabase / RLS

No SQL migration was added in v266.

The reviewed code still uses existing `teskeid_chat_*` tables and service-role repository helpers. I did not see a new RLS weakening, broad grant, or direct client access to chat tables.

Main Supabase-related note: `fetchProfileMap()` uses service role to read `profiles.display_name`. That is acceptable for chat display if `display_name` is intended to be public in this chat context. It does not expose emails or user IDs in client DTOs.

## Recommendation

Do one small v268 follow-up before commit:

1. Fix per-thread initial message loading so the chat panel shows the latest/current messages.
2. Add the missing repository/API tests for that contract.
3. Update stale oldest-first comments for Safnpúls/feed.

After that, Phase 4A should be commit-ready from Codex's perspective, assuming only the listed files are included and no unrelated changes are staged.

## Localhost checks for Stebbi

Preconditions:

- `TESKEID_CHAT_ENABLED=true`
- Signed-in user has `elta-vedrid`, `weather-provider-vedurstofan`, and `weather-pulse`
- User has a `display_name` in `profiles` if author names should be visible

Checks:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Open Safnpuls and confirm newest messages appear at the top.
3. Select a station and open Veðurpúls near the top of the station card.
4. Send a message and confirm the page itself does not jump.
5. Confirm the message list scrolls inside the panel.
6. Confirm the author name appears next to the timestamp when `display_name` exists.
7. Confirm timestamps use 24-hour format.
8. Test mobile width around 360-390px: no horizontal overflow, no tiny input text.
9. Log in as a user without `weather-pulse`: Veðurpúls and Safnpuls should not show.

Extra check after v268:

- Seed or create more than 50 messages in one station thread and confirm the station panel opens on the newest/current messages, not the oldest historical messages.

Do not casually test by changing Supabase policies, deleting chat rows, or adding broad feature access on production.

## Óvissa / þarf að staðfesta

I did not inspect every route in the full Veðurpúls stack again, only the files touched or implicated by v266 and the earlier v265 blockers. Confidence is high for the two reviewed blockers and medium for broader product behavior until Stebbi does the localhost checks.
