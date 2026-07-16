# 2026-07-15 22:44 - TODO-086 v280 - Codex review of v279 + public preview addendum

Created: 2026-07-15 22:44
Timezone: Atlantic/Reykjavik

Reviewed:

- `ai-handoff/2026-07-15-2240-todo-086-v279-claude-phase4b-done.md`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/vedurpulsTransport.ts`
- `components/chat/ChatPreviewList.tsx`
- `components/chat/ChatMessageRow.tsx`
- `app/api/auth-mvp/vedurpuls/messages/route.ts`
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/types.ts`
- `messages/is.json`
- `messages/en.json`

This is review and product addendum only. No code, SQL, env, commit, push, deploy, or production action was performed.

## Findings

### High - v279 station-card preview is still auth-gated, but Stebbi now wants public read-only preview

Current v279 implementation in `WeatherPulseSummary` initializes preview by calling:

```text
POST /api/auth-mvp/vedurpuls/thread
```

That route runs `checkChatAccess(user)`. Then preview loads messages through:

```text
GET /api/auth-mvp/vedurpuls/messages?threadId=...
```

That route also runs `checkChatAccess(user)`.

So the station-card preview is not visible to anonymous/public users, and users without pulse/Veðurstofan access get `accessDenied` and the whole summary returns `null`.

That contradicts Stebbi's updated product direction:

> Preview chat, latest 3 pulses, no composer, should be visible to everyone, including anonymous users. Opening the pulse URL requires login.

Recommended fix:

1. Add a public read-only preview endpoint that does **not** create a thread and does **not** mark read:

```text
GET /api/teskeid/weather/vedurpuls/stations/[stationId]/preview?limit=3
```

2. It should:
   - validate `stationId` against `VEDURSTOFAN_STATIONS_REGISTRY`;
   - find an existing thread by stable target (`domain=weather`, `target_type=vedurstofan_station`, `target_id=stationId`);
   - return latest visible messages only;
   - return `[]` if no thread exists yet;
   - never create a thread for a random public page view;
   - never expose emails/user ids/full profile rows;
   - clamp `limit` to a small max, for example 3 or 5.

3. Keep posting/full thread endpoints behind auth.

This is a product blocker if Phase 4B is meant to include public preview.

### Medium - Full pulse route lacks station/weather context

`/auth-mvp/vedrid/puls/stod/[stationId]` currently renders station name + subtitle + `ScopedChatPanel`, but does not show the station's Veðurstofan weather values, forecast cycle, freshness/staleness, or vedur.is link.

The route-backed pulse idea was specifically valuable because the URL can show:

- station identity;
- current/latest Veðurstofan values;
- relevant forecast cycle/freshness context;
- then the full pulse conversation.

This matters even more for future AI/summary work: the pulse conversation should be interpretable in the context of the actual weather forecast and later Vegagerðin current-condition state.

Recommended fix:

- Keep v279 route, but add a compact station context panel before the chat.
- Reuse existing Veðurstofan station data/readers where possible.
- Do not duplicate weather display logic if there is already a shared station card/value component.
- If adding this is too large before commit, explicitly defer it as Phase 4B.1, not forgotten.

### Medium - Current author display exposes full `display_name`; Stebbi wants first name only

`ChatMessageRow` displays `msg.authorName` directly. `repository.server.ts` currently maps `profiles.display_name` to `authorName`.

Stebbi wants only first name visible in pulse messages.

Recommended fix:

- Normalize author display at the DTO boundary, not in each UI component.
- Add helper such as `toPublicFirstName(displayName: string | null): string | null`.
- It should trim whitespace and return the first token only.
- For Icelandic names, first token is acceptable for this first pass.
- This should apply consistently to:
  - station preview;
  - full route;
  - Safnpúls;
  - future public read-only preview endpoint.

This becomes more important if preview is public.

### Medium - Signed-in users should have a way to send without being forced to open the full URL

v279 correctly removes the composer from the station-card preview. That matches the "preview is read-only" part.

Stebbi's updated nuance:

> Sending a message should be visible to signed-in users without requiring them to open the pulse URL.

Recommended interpretation:

- Keep the station-card preview itself read-only for everyone.
- For signed-in users who pass `checkChatAccess()`, show a compact `Skrifa púls` / `Deila upplifun` affordance near the preview.
- That affordance can either:
  - reveal a small inline composer only, without full message list; or
  - open a lightweight route/overlay composer that returns to the weather page.
- Do not reintroduce the full inline chat list with `Sækja eldri` on the station card.

This preserves the clean latest-3 preview while making contribution easy.

### Low - v279 tests pass locally, but new public-preview behavior needs tests

The existing targeted tests pass. However, the new desired behavior needs additional test coverage:

- anonymous/public preview can read latest 3 visible messages;
- anonymous/public preview cannot create threads;
- anonymous/public preview cannot post;
- deleted/hidden messages are redacted or omitted consistently;
- author name is first-name-only;
- full route remains auth-gated.

## What v279 gets right

- Moves toward route-backed pulse with `/auth-mvp/vedrid/puls/stod/[stationId]`.
- Replaces the station-card full chat with a latest-3 preview and `Opna púlsinn`.
- Keeps `ChatPreviewList` generic and product-agnostic.
- Keeps `ScopedChatPanel` as reusable full chat core.
- Moves transport into shared `app/auth-mvp/vedrid/vedurpulsTransport.ts`.
- Adds route `loading.tsx`, which aligns with project workflow/design requirements.
- Applies Stebbi's requested Icelandic copy for empty state and placeholder.

## Updated product contract

Use this as the corrected Phase 4B/4B.1 contract:

```text
Veðurpúls station preview:
- visible to everyone who can see the station card, including anonymous users;
- latest 3 messages only;
- read-only;
- no input box;
- no "load older";
- no full name, first name only;
- stable layout, no jump.

Opening full pulse:
- route-backed URL: /auth-mvp/vedrid/puls/stod/[stationId];
- requires login and chat access;
- shows station/weather context;
- shows full ScopedChatPanel, pageSize={50}.

Posting:
- requires signed-in user and chat access;
- should be easy from the station card through a compact signed-in-only "Skrifa púls" affordance;
- should not turn the card back into a full inline chat.
```

## AI / future insight direction

Stebbi's idea is strong, but should be a later phase after the data surfaces are stable.

Potential future shape:

- Keep all pulse messages scoped to station/point/thread.
- Attach weather context by timestamp:
  - Veðurstofan forecast cycle and values;
  - later Vegagerðin current conditions;
  - later route/segment context if relevant.
- Use AI to summarize community observations against official data, for example:
  - "Several users mention side gusts even though station wind is moderate."
  - "Pulse reports suggest road conditions feel worse than forecast implies."
  - "Recent reports agree with Vegagerðin warnings."

Guardrails needed before AI:

- No AI-generated safety conclusion should replace official warnings.
- Keep source snippets/links to underlying pulse messages where possible.
- Never expose private user identifiers.
- Make summaries clearly advisory and time-bound.
- Consider moderation and abuse before surfacing AI summaries broadly.

This should be treated as Phase 5+ after Vegagerðin/current-condition integration.

## Suggested instruction to Claude Code

```text
Claude Code: v279 is directionally good, but Stebbi's updated product direction changes the access/read model.

Before commit/release, either implement or explicitly defer as Phase 4B.1:

1. Station-card preview should be public read-only: latest 3 visible pulses, no composer, visible to anonymous users who can see the station card.
2. Do not use POST /api/auth-mvp/vedurpuls/thread for public preview, because that creates/gets a thread and requires chat access.
3. Add a public read-only preview endpoint by stationId that validates stationId, returns [] if no thread exists, and never exposes user ids/emails/full names.
4. Keep full pulse URL and posting auth-gated.
5. Display only first name for message authors across preview, full route, and Safnpúls.
6. Add a signed-in-only "Skrifa púls" / "Deila upplifun" affordance on the station card so users can contribute without being forced to open the full pulse URL, but do not bring back the full inline chat list.
7. Add station/weather context to the full pulse route or explicitly defer it as Phase 4B.1.
8. Keep Chat reusable. Veðurpúls remains the weather adapter around generic Chat components.
```

## Commands run

Read-only / verification:

```text
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-2240-todo-086-v279-claude-phase4b-done.md'
git status --short
git diff --stat
Get-Content -Encoding UTF8 'components/chat/ChatPreviewList.tsx'
Get-Content -LiteralPath 'app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx' -Encoding UTF8
Get-Content -LiteralPath 'app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx' -Encoding UTF8
Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/vedurpulsTransport.ts'
Get-Content -Encoding UTF8 'app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx'
Get-Content -Encoding UTF8 'app/api/auth-mvp/vedurpuls/messages/route.ts'
Get-Content -Encoding UTF8 'app/api/auth-mvp/vedurpuls/feed/route.ts'
Get-Content -Encoding UTF8 'components/chat/ChatMessageRow.tsx'
Get-Content -Encoding UTF8 'lib/chat/types.ts'
git diff -- messages/is.json messages/en.json
npm run type-check
npm run test:run -- lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
Get-Date -Format 'yyyy-MM-dd-HHmm'
```

Results:

```text
npm run type-check
exit code 0

npm run test:run -- lib/__tests__/vedurpuls-feed.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/vedurpuls-api.test.ts lib/__tests__/chat-access.test.ts
4 test files passed
103 tests passed
exit code 0
```

## Localhost checks for Stebbi

For current v279:

1. Open `/auth-mvp/vedrid/elta-vedrid` as a signed-in user with Veðurstofan access.
2. Select a station.
3. Confirm only max 3 pulse messages appear on the station card.
4. Confirm no full input box appears in the preview.
5. Click `Opna púlsinn`.
6. Confirm full route opens and posting works there.

For the corrected product direction after 4B.1:

1. Open the relevant weather/station UI signed out.
2. Confirm latest 3 pulse messages are visible if any exist.
3. Confirm no composer/input is visible signed out.
4. Click `Opna púlsinn` signed out.
5. Expected: login/auth handling.
6. Sign in with access.
7. Confirm preview still shows latest 3 and author first names only.
8. Confirm there is a signed-in-only way to contribute without opening the full URL.
9. Confirm full URL still works and shows station/weather context.

## Óvissa / þarf að staðfesta

- I did not verify which public route will ultimately show Veðurstofan station cards to anonymous users. The public-preview contract applies wherever station cards are visible to anonymous users.
- The exact UX for "send without opening full URL" needs product choice: inline compact composer vs small overlay vs route modal. The important point is not to bring back the full inline chat thread on the station card.
