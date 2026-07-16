# 2026-07-15 21:45 - TODO-086 v270 - Codex addendum: reusable chat page size contract

Created: 2026-07-15 21:45
Timezone: Atlantic/Reykjavik

## Context

This is an addendum to:

- `2026-07-15-2143-todo-086-v269-codex-v268-phase4a-final-review.md`

Stebbi confirmed the preferred direction:

> Chat core should have a default `pageSize`, but connector/product adapters should be able to override it.

This matches the bigger product direction:

- **Chat** is the reusable Teskeid core.
- **Veðurpúls** is the first weather-branded use of that core.
- Future surfaces, such as Vegagerdin pulse or general direct chat, should reuse the same core instead of forking chat UI/state logic.

## Recommended follow-up

Before adding the next chat surface, make `pageSize` an explicit contract between `ScopedChatPanel` and the injected transport.

### Proposed contract

In `components/chat/ScopedChatPanel.tsx`:

```ts
export type ScopedChatLoadOptions = {
  before?: string
  limit?: number
}

export type ScopedChatTransport = {
  loadMessages(threadId: string, opts?: ScopedChatLoadOptions): Promise<MessageDto[]>
  markRead(threadId: string): Promise<void>
  sendMessage(threadId: string, body: string): Promise<MessageDto>
}
```

Add a prop:

```ts
interface ScopedChatPanelProps {
  threadId: string
  transport: ScopedChatTransport
  labels: ScopedChatPanelLabels
  pageSize?: number
  pollingIntervalMs?: number
}
```

Then internally:

```ts
const DEFAULT_PAGE_SIZE = 10
const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE

transport.loadMessages(threadId, { limit: effectivePageSize })
transport.loadMessages(threadId, { before, limit: effectivePageSize })

setHasMore(data.length >= effectivePageSize)
```

### Veðurpúls adapter

In `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`, the Veðurpúls transport should use `opts.limit` instead of a hardcoded `10`:

```ts
const params = new URLSearchParams({
  threadId,
  limit: String(opts?.limit ?? 10),
})
```

If Veðurpúls wants the default behavior, it does not need to pass `pageSize`.

If a future surface needs a denser feed, it can use:

```tsx
<ScopedChatPanel pageSize={25} ... />
```

### API safety

Keep the server-side clamp in the message endpoint:

- minimum `1`
- maximum `100`

The client can request a preferred page size, but API/server remains the enforcement boundary for performance and abuse prevention.

## Why this matters

Right now v268 works, but there is a hidden coupling:

- `ScopedChatPanel` assumes `PAGE_SIZE = 10`
- `VEDURPULS_TRANSPORT` separately sends `limit=10`

Those two values must stay aligned for `hasMore` and `Sækja eldri` to behave correctly. Making `limit/pageSize` explicit removes that fragile implicit agreement and keeps the core reusable.

## Tests to add or update

Add focused tests that prove:

1. `ScopedChatPanel` calls `transport.loadMessages(threadId, { limit: pageSize })` on initial load.
2. `ScopedChatPanel` calls `transport.loadMessages(threadId, { before, limit: pageSize })` when loading older.
3. If no `pageSize` prop is provided, it uses the default.
4. Veðurpúls transport forwards `opts.limit` to the API querystring.

If UI component tests are not currently ergonomic in this repo, at minimum add a small unit around a helper that builds the query params, or document why this remains manual-tested for now.

## Localhost checks for Stebbi

After this follow-up:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Open a station with Veðurpúls messages.
3. Confirm the same latest-message behavior remains unchanged.
4. Confirm `Sækja eldri` still appears when there are at least `pageSize` messages.
5. Confirm clicking `Sækja eldri` prepends older messages without page jump.
6. If Claude Code temporarily sets `pageSize={5}` locally for testing, confirm the button appears after 5 messages and older pagination still works. Do not leave that test override committed unless intended.

## Recommendation

This can be a small v271 before Phase 4B or folded into the first Phase 4B prep commit. I would prefer doing it before Phase 4B, because it protects the reusable chat boundary before the next surface arrives.

No SQL, no env, no RLS, no production-data changes should be needed.
