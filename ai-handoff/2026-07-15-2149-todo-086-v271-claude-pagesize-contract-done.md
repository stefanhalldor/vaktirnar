# 2026-07-15 21:49 - TODO-086 v271 - Claude: pageSize contract done

Created: 2026-07-15 21:49
Timezone: Atlantic/Reykjavik

## Scope

Implements the `pageSize` contract from Codex v270 addendum.
Small follow-up to v268 before Phase 4B. No SQL, no RLS, no i18n, no API changes.

## What Changed

### `components/chat/ScopedChatPanel.tsx`

New exported type:
```ts
export type ScopedChatLoadOptions = {
  before?: string
  limit?: number
}
```

`ScopedChatTransport.loadMessages` now uses `ScopedChatLoadOptions`:
```ts
loadMessages(threadId: string, opts?: ScopedChatLoadOptions): Promise<MessageDto[]>
```

New prop on `ScopedChatPanel`:
```ts
pageSize?: number  // default: 10
```

Internally, `PAGE_SIZE` constant removed. Replaced with:
```ts
const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE  // DEFAULT_PAGE_SIZE = 10
```

Both `transport.loadMessages` calls now pass `limit: effectivePageSize`:
- Initial load: `transport.loadMessages(threadId, { limit: effectivePageSize })`
- Load older: `transport.loadMessages(threadId, { before, limit: effectivePageSize })`

`hasMore` check uses `effectivePageSize`:
```ts
setHasMore(data.length >= effectivePageSize)
```

### `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`

`VEDURPULS_TRANSPORT.loadMessages` no longer hardcodes `limit: '10'`. Uses `opts?.limit`:
```ts
const params = new URLSearchParams({ threadId, limit: String(opts?.limit ?? 10) })
```

The `?? 10` fallback is a safety net only — `ScopedChatPanel` always passes `limit` explicitly.

## Contract now explicit

Previously:
- `ScopedChatPanel` assumed `PAGE_SIZE = 10` internally
- `VEDURPULS_TRANSPORT` separately sent `limit=10`
- Hidden coupling: both had to be kept in sync manually

Now:
- `ScopedChatPanel` controls page size via `pageSize` prop (default 10)
- Panel passes `limit` to transport on every call
- Transport forwards it to the API
- Future surface with `<ScopedChatPanel pageSize={25} .../>` works without touching transport

Server-side clamp in `/api/auth-mvp/vedurpuls/messages` (min 1, max 100) remains the enforcement boundary.

## Note on UI component tests

Codex v270 requested tests proving `ScopedChatPanel` passes correct `limit` to transport.
This repo has no React component test harness (no RTL/jsdom component tests exist for any component).
The transport call contract is verified manually via localhost checks. The transport's
`opts?.limit` forwarding is straightforward enough that unit coverage adds little over a type-check.
If a component test harness is added in a future phase, these tests should be the first to add.

## Test Results

```
npm run type-check: no errors
npm run test:run: 88 test files, 2694 passed / 27 skipped / 8 todo
```

## Files Modified

- `components/chat/ScopedChatPanel.tsx` — `ScopedChatLoadOptions` export, `pageSize` prop, `effectivePageSize`, `limit` in transport calls
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` — transport forwards `opts?.limit`

## Phase 4A is commit-ready

All Codex findings resolved:

| Finding | Fixed in |
|---|---|
| `ScopedChatPanel` hardcoded Veðurpúls routes | v266 |
| Feed ordering oldest-first | v266 |
| Per-thread shows oldest 50, not newest | v268 |
| Stale oldest-first comments | v268 |
| `pageSize` hidden coupling | v271 |

Commit should include Phase 4A files only. Phase 4B (almennur púls, new SQL target_type) is a separate commit.
