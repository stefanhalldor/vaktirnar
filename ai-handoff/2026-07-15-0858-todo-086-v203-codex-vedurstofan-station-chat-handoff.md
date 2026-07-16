# Codex handoff: weather chat per Veðurstofan station, then Vegagerðin points

Created: 2026-07-15 08:58
Timezone: Atlantic/Reykjavik
Updated: 2026-07-15 14:15 - added reusable Teskeið chat-core direction

TODO reference: todo-086 / TODO #89

Related context:

- `TODO.md` #89 currently says first chat target should be live Vegagerðin points after Vegagerðin is in.
- Stebbi has now clarified the product sequence:
  1. Build the chat now on **Veðurstofan station points** so users can test chat and report suspicious measurements/forecast values.
  2. While that is being tested, implement Vegagerðin.
  3. Move or extend the same chat system to **Vegagerðin live points** once they are available.
- No shortcuts: the chat should be excellent, secure, reusable, mobile-friendly, and future-proof.
- There is a strong working chat implementation in `C:\Users\Lenovo\Documents\UmonnunIS`, including realtime subscription/broadcast patterns.

## Executive Summary

Do not build a throwaway `vedurstofan_chat_messages` feature that must be rewritten for Vegagerðin.

**2026-07-15 14:15 product clarification from Stebbi:** do not even think of this as only a reusable *weather* chat layer. Build a reusable Teskeið scoped-chat core that weather uses first. The same core should later be usable, with only domain-specific adapters and small UI tone changes, for e.g. Bókhaldsvinkill, direct person-to-person chat, item-specific chat, provider-point chat, or other future Teskeiðar.

So the preferred architecture is:

```text
Reusable Teskeið chat core
  -> weather point adapter: Veðurstofan station, later Vegagerðin live point
  -> future adapter: bookkeeping/accounting context
  -> future adapter: direct user-to-user thread
  -> future adapter: item/project/task-specific thread
```

The first product surface is still Veðurstofan station chat, but the database/service/component names should not unnecessarily lock the core to weather if the extra generality is clean.

Build the reusable core around a generic target abstraction:

```ts
domain: 'weather' | 'direct' | 'bookkeeping' | 'loans' | 'teskeid'
target_type: 'vedurstofan_station' | 'vegagerdin_point' | 'road_segment' | 'direct_conversation' | 'bookkeeping_context' | 'loan_item' | 'custom'
target_id: string
provider?: 'vedurstofan' | 'vegagerdin' | 'metno' | 'teskeid'
```

Phase 1 target is `vedurstofan_station` using `vedurstofan_stations.station_id`.

Phase 2 target is `vegagerdin_point` after the live Vegagerðin layer exists.

Later, both station/point threads can be linked to canonical road segments without rewriting the chat UI, API, moderation, realtime, or read-state model. Later non-weather domains should likewise reuse the same message list, composer, realtime/polling, read cursors, moderation/reporting, and basic access-check pattern.

## 2026-07-15 Addendum: Reusable Teskeið Chat Core

This addendum supersedes any interpretation that the first implementation should create a narrowly weather-only component.

### Product intent

Build one excellent scoped-chat primitive for Teskeið:

- `ScopedChatPanel` or `TeskeidChatPanel`
- `useScopedChat` / `useTeskeidChat`
- generic API/service layer for thread/message/read/report mechanics
- domain adapters for weather, and later for other products

Weather should be the first consumer because Veðurstofan stations are stable, concrete targets and users can immediately help validate data. But the underlying chat primitive should not be named or shaped so narrowly that Bókhaldsvinkill or a future direct `Spjall` feature needs a second implementation.

### Core vs adapter split

The chat core should own:

- message list rendering
- composer
- optimistic sending
- pagination / `loadMore`
- read cursor
- realtime broadcast subscription and polling fallback
- dedupe by message id
- report/hide/delete hooks
- empty/loading/error states
- mobile full-screen sheet behavior
- safe-area and keyboard behavior
- accessibility
- generic moderation/report flow

Domain adapters should own:

- what target types exist
- how a target is validated
- what access policy applies
- what contextual metadata is attached to a message/report
- labels/copy tone
- provider badges
- whether a `measurement_report` action is available
- how the chat entry point appears on domain cards

For weather Phase 1, the adapter should validate `target_type='vedurstofan_station'` and `target_id=station_id`.

For Vegagerðin, the adapter should validate `target_type='vegagerdin_point'` and the stable live point id.

For future direct chat, the adapter should validate participants/conversation membership.

For Bókhaldsvinkill, the adapter should validate the relevant bookkeeping/accounting context and user/company membership.

### Naming recommendation

Prefer generic names for the core:

```text
teskeid_chat_threads
teskeid_chat_messages
teskeid_chat_read_cursors
teskeid_chat_message_reports
```

or:

```text
scoped_chat_threads
scoped_chat_messages
scoped_chat_read_cursors
scoped_chat_message_reports
```

Avoid `weather_chat_*` if Claude Code can keep the generic model clean without adding too much complexity.

Weather-specific names can still exist in adapter/helper files:

```text
lib/chat/adapters/weather.server.ts
components/weather/chat/WeatherPointChatButton.tsx
```

But the reusable UI and service primitives should live in generic paths if practical:

```text
components/chat/ScopedChatPanel.tsx
components/chat/ScopedChatButton.tsx
components/chat/useScopedChat.ts
lib/chat/types.ts
lib/chat/access.server.ts
lib/chat/repository.server.ts
lib/chat/adapters/weather.server.ts
```

This does not mean building every future domain now. It means keeping the core model and component boundaries honest.

### Generic thread contract

Recommended internal target shape:

```ts
type ChatDomain = 'weather' | 'direct' | 'bookkeeping' | 'loans' | 'teskeid'

type ChatTarget = {
  domain: ChatDomain
  targetType: string
  targetId: string
  title: string
  subtitle?: string
  provider?: string
  lat?: number | null
  lon?: number | null
  metadata?: Record<string, unknown>
}
```

For Veðurstofan:

```ts
{
  domain: 'weather',
  targetType: 'vedurstofan_station',
  targetId: stationId,
  title: stationName,
  provider: 'vedurstofan',
  lat,
  lon,
}
```

For future direct chat:

```ts
{
  domain: 'direct',
  targetType: 'direct_conversation',
  targetId: conversationId,
  title: displayNameOrConversationTitle,
}
```

The core should not need to know what Veðurstofan, Vegagerðin, Bókhaldsvinkill, or direct chat means. It should only know: thread, messages, sender, read cursor, moderation state, and UI state.

### UI tone variants

The same chat component should allow small tone/context differences:

- Weather station: `Segðu frá ef veðrið hér stemmir ekki við það sem þú sérð.`
- Vegagerðin live point: `Segðu frá núverandi aðstæðum við þennan punkt.`
- Direct chat: no measurement-report mode, simpler composer.
- Bókhaldsvinkill: likely more formal labels, possibly attachment/document actions later.

This should be driven by props/config, not forked components:

```ts
type ScopedChatConfig = {
  title: string
  subtitle?: string
  emptyStateTitle: string
  emptyStateBody: string
  composerPlaceholder: string
  enabledMessageKinds: Array<'chat' | 'measurement_report' | 'system'>
  reportPresets?: Array<{ key: string; label: string }>
  showProviderBadge?: boolean
}
```

### Avoid overbuilding

Reusable does not mean implementing every future use case now.

Phase 1 should still be small:

- one generic core;
- one weather adapter;
- one target type: `vedurstofan_station`;
- text messages;
- measurement report;
- read cursor;
- realtime/poll fallback;
- moderation/report endpoint.

Defer:

- direct chat participants model;
- accounting/company membership model;
- attachments;
- reactions;
- replies;
- rich text;
- media uploads.

But avoid decisions that force a rewrite when those arrive.

## Product Goal

The first release is not a generic social chat. It is a practical, point-scoped weather discussion/reporting layer:

- users can say "this looks wrong here";
- users can add short observations about the station area;
- Stebbi can test chat UX and realtime behavior with real weather context;
- the system gathers useful feedback while Veðurstofan and Vegagerðin integrations are still being hardened.

In UI copy, avoid implying user chat is official data. It should be framed as user feedback/observations attached to a weather point.

## Read-Only Repo Findings

### Current Teskeið chat patterns

Files inspected:

- `components/chat/ChatView.tsx`
- `components/chat/MessageInput.tsx`
- `app/api/chats/[id]/messages/route.ts`
- `sql/61_loan_chat_messages_in_history.sql`
- `lib/loans/actions.ts`
- `lib/loans/history.server.ts`
- `lib/loans/guard.ts`

Findings:

- The legacy/general chat UI uses a browser Supabase realtime subscription directly on `messages`.
- The general `app/api/chats/[id]/messages/route.ts` uses the user Supabase client and currently looks more legacy-like.
- Loan chat is safer architecturally:
  - message table is service-role only;
  - insert is validated through a server action/RPC;
  - body length is constrained;
  - message body is not logged into recent events;
  - access is checked server-side before inserts/reads.
- The loan chat currently does not appear to be the reusable high-polish chat UX. It is more of a scoped history-row chat.

### UmönnunIS reusable chat pattern

Files inspected read-only:

- `C:\Users\Lenovo\Documents\UmonnunIS\hooks\useChatState.ts`
- `C:\Users\Lenovo\Documents\UmonnunIS\components\ChatPanel.tsx`
- `C:\Users\Lenovo\Documents\UmonnunIS\app\api\circles\[circleId]\chat\route.ts`
- `C:\Users\Lenovo\Documents\UmonnunIS\app\api\circles\[circleId]\chat\report\route.ts`
- `C:\Users\Lenovo\Documents\UmonnunIS\app\api\circles\[circleId]\chat\read-cursor\route.ts`
- `C:\Users\Lenovo\Documents\UmonnunIS\sql\supabase-migration-chat-messages.sql`

Good ideas to reuse conceptually:

- one hook as source of truth for message state;
- initial load with enough messages to cover unread context;
- `loadMore` pagination;
- read cursor per user/context;
- realtime/broadcast for instant updates;
- polling fallback to catch missed realtime events;
- optimistic send;
- dedupe by message id;
- report message flow;
- mobile full-screen chat panel with safe-area and keyboard handling;
- reply/reactions can exist, but should not block weather chat MVP unless Stebbi wants them immediately.

Important difference:

- Umönnun is private/circle-based and encrypted in places.
- Weather point chat is intentionally more public/community-oriented inside a feature-gated weather experience.
- Do not copy Umönnun SQL/RLS blindly. Adapt the shape and security model to Teskeið and weather targets.

### Current feature flags

Files inspected:

- `lib/loans/guard.ts`
- `sql/76_feature_access_weather_provider_vedurstofan.sql`

Existing relevant feature:

- `weather-provider-vedurstofan`
  - global kill switch: `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`
  - per-user gate via `feature_access`
  - provider-specific by design

Recommendation:

- Weather chat should get its own explicit feature key if it needs to be tested with a different audience:
  - proposed key: `weather-station-chat`
  - env: `WEATHER_STATION_CHAT_ENABLED=true`
- Phase 1 access should require both:
  - normal weather access,
  - Veðurstofan provider access or `weather-station-chat` access, depending on Stebbi's desired test group.

Best practical gate for first implementation:

```text
WEATHER_ENABLED=true
WEATHER_STATION_CHAT_ENABLED=true
feature_access row for weather-station-chat
```

and optionally require `weather-provider-vedurstofan` too while chat is only shown on Veðurstofan cards.

Do not reuse `WEATHER_ELTA_VEDRID_FLAG` for this. It is station explorer/validation specific and will confuse later rollout.

## Recommended Data Model

Updated recommendation after Stebbi's reusable-component clarification:

- Prefer a generic migration name such as `sql/78_teskeid_scoped_chat.sql` or `sql/78_teskeid_chat.sql`.
- Prefer generic tables such as `teskeid_chat_threads`, `teskeid_chat_messages`, `teskeid_chat_read_cursors`, and `teskeid_chat_message_reports`.
- Weather-specific behavior should live in adapters and metadata, not in table names, if this can be done cleanly.

If Claude Code determines that `weather_chat_*` is materially simpler, that should be called out as a conscious tradeoff before implementation. Default direction is generic core.

### `teskeid_chat_threads`

One thread per stable target, across domains. Phase 1 only creates/uses weather station targets.

Suggested columns:

```sql
CREATE TABLE public.teskeid_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('weather', 'direct', 'bookkeeping', 'loans', 'teskeid')),
  target_type text NOT NULL,
  target_id text NOT NULL,
  provider text,
  target_name text NOT NULL,
  lat numeric(9, 6),
  lon numeric(9, 6),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  UNIQUE (domain, target_type, target_id)
);
```

Notes:

- Phase 1 should only allow `domain='weather'` with `target_type='vedurstofan_station'` through the weather adapter/API validation.
- `target_id` is `vedurstofan_stations.station_id` for phase 1.
- For Vegagerðin, it should be the stable live point/station id, not a route-generated id.
- `lat/lon` are denormalized for UI/debug convenience; canonical location remains in the provider table.
- Future domains can reuse the table without adding columns, as long as target access validation is adapter-specific.

### `teskeid_chat_messages`

One row per message/report.

Suggested columns:

```sql
CREATE TABLE public.teskeid_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.teskeid_chat_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  message_kind text NOT NULL DEFAULT 'chat'
    CHECK (message_kind IN ('chat', 'measurement_report', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  hidden_at timestamptz,
  hidden_by uuid,
  hidden_reason text,
  CONSTRAINT teskeid_chat_messages_body_length
    CHECK (char_length(trim(body)) BETWEEN 1 AND 1000)
);
```

Metadata should capture weather context for report messages:

```ts
type WeatherChatMeasurementReportMetadata = {
  targetType: 'vedurstofan_station' | 'vegagerdin_point'
  targetId: string
  provider: 'vedurstofan' | 'vegagerdin'
  stationName?: string
  atimeIso?: string | null
  forecastTimeIso?: string | null
  measuredAtIso?: string | null
  displayedValues?: {
    windMs?: number | null
    windDirectionText?: string | null
    gustMs?: number | null
    precipitationMmPerHour?: number | null
    temperatureC?: number | null
    weatherText?: string | null
  }
  routeContext?: {
    distanceFromOriginM?: number | null
    distanceFromRouteM?: number | null
    etaIso?: string | null
  }
  reportType?: 'wrong_wind' | 'wrong_precipitation' | 'wrong_temperature' | 'wrong_location' | 'other'
}
```

Do not store full origin/destination text or user GPS location in message metadata unless Stebbi approves a separate privacy review.

### `teskeid_chat_read_cursors`

Optional but recommended if the chat is meant to feel finished.

```sql
CREATE TABLE public.teskeid_chat_read_cursors (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.teskeid_chat_threads(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);
```

This enables unread badges later without retrofitting.

### `teskeid_chat_message_reports`

Recommended before opening beyond Stebbi/testers.

```sql
CREATE TABLE public.teskeid_chat_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.teskeid_chat_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_user_id)
);
```

## RLS, Grants, and Realtime Decision

This is the most important architectural decision.

### Option A: direct postgres_changes realtime

Pros:

- closer to current simple Supabase realtime patterns;
- easy client subscription filtered by `thread_id`;
- low UI latency.

Cons:

- requires `authenticated` SELECT grants/RLS on chat tables;
- weather chat becomes visible to all users who satisfy the RLS rule;
- feature access checks in RLS are awkward because `feature_access` is currently service-role only.

If choosing Option A, make the product decision explicit:

> Weather point chat is public to authenticated users who can access the weather/chat feature. It is not private user data.

RLS minimum:

- no anon access;
- authenticated can select non-hidden, non-deleted messages;
- authenticated can insert only with `user_id = auth.uid()`;
- authenticated can update/delete only own messages if allowed;
- admin/moderation changes happen through service-role API.

### Option B: server API plus realtime broadcast

Pros:

- keeps chat tables service-role only, like loan chat;
- all reads/writes go through server access checks;
- aligns with no-leak posture from loans;
- easier to enforce per-user feature access exactly.

Cons:

- more code;
- client cannot rely on table `postgres_changes`;
- needs server broadcast on successful insert plus polling fallback.

This is closer to UmönnunIS:

- server inserts message;
- server sends a realtime broadcast event;
- client receives event and refetches latest messages;
- 3 to 10 second polling fallback catches missed events.

### Codex recommendation

For no-shortcuts quality, use **Option B**.

Reason:

- weather chat starts under per-user feature flag;
- feature access currently lives behind service-role lookup;
- this avoids opening a public table policy just to get realtime;
- it reuses the robust UmönnunIS mental model: broadcast + refetch + polling fallback.

Implementation detail:

- Tables can be service-role only with RLS enabled and no broad client grants.
- API validates auth, feature access, and target access.
- Client uses authenticated API calls.
- Client subscribes to a broadcast topic like:

```text
weather-chat:{threadId}
```

After receiving `new_message`, refetch latest messages for that thread.

If Claude Code strongly prefers `postgres_changes`, it must document the exact RLS/publicness decision before implementation.

## API Shape

For the reusable core, prefer a generic route group:

```text
GET  /api/teskeid/chat/threads?domain=weather&targetType=vedurstofan_station&targetId=31392
GET  /api/teskeid/chat/threads/:threadId/messages?limit=50&before=...
POST /api/teskeid/chat/threads/:threadId/messages
POST /api/teskeid/chat/threads/:threadId/read-cursor
POST /api/teskeid/chat/messages/:messageId/report
DELETE or PATCH /api/teskeid/chat/messages/:messageId
```

It is acceptable to expose a weather-specific façade if it keeps the weather UI simpler:

```text
GET  /api/teskeid/weather/chat/threads?targetType=vedurstofan_station&targetId=31392
GET  /api/teskeid/weather/chat/threads/:threadId/messages?limit=50&before=...
POST /api/teskeid/weather/chat/threads/:threadId/messages
POST /api/teskeid/weather/chat/threads/:threadId/read-cursor
POST /api/teskeid/weather/chat/messages/:messageId/report
DELETE or PATCH /api/teskeid/weather/chat/messages/:messageId
```

But the internal service/repository should still be generic. The weather route should call the generic chat service with `domain='weather'`.

Simpler first shape is also acceptable:

```text
GET  /api/teskeid/chat?domain=weather&targetType=...&targetId=...
POST /api/teskeid/chat
```

but do not let that create vague code. Internally still use thread/message services.

Validation requirements:

- authenticated user required;
- `WEATHER_ENABLED` true;
- chat feature enabled;
- user has relevant per-user feature access;
- target exists:
  - phase 1: `vedurstofan_stations.station_id`;
  - phase 2: Vegagerðin point registry/cache table when available;
- `body.trim()` length 1 to 1000;
- `message_kind` allowlist only;
- report metadata shape validated;
- rate limit by user and by thread.

Rate limit recommendation:

- chat messages: 10 per minute per user, 60 per hour per user;
- measurement reports: 5 per hour per user;
- one exact duplicate body per target per short window should be rejected or silently deduped.

Never log message body, email, auth token, or raw route data.

## Reusable Client Architecture

Create a hook inspired by UmönnunIS, adapted to Teskeið:

```ts
useScopedChat({
  domain: 'weather',
  targetType,
  targetId,
  provider,
  enabled,
})
```

Weather-specific wrappers can exist:

```ts
useWeatherPointChat(args) {
  return useScopedChat({ domain: 'weather', ...args })
}
```

But the core hook should be generic if practical.

Return:

```ts
{
  thread,
  messages,
  loading,
  hasMore,
  loadingMore,
  unreadCount,
  sending,
  error,
  sendMessage,
  sendMeasurementReport,
  reportMessage,
  markAsRead,
  loadMore,
  refresh,
}
```

Implementation expectations:

- initial fetch loads latest 50 messages;
- `loadMore` loads older messages;
- send is optimistic or immediately appends returned row;
- duplicate handling by message id;
- broadcast subscription refetches only the affected thread;
- fallback polling every 5 to 10 seconds while panel is open;
- refetch on window focus after backgrounding;
- abort/cancel stale fetches on target change.

## UI Placement

Do not put a full chat thread inside every station card in the "Allir spápunktar" list. That will get noisy and expensive.

Use a clear affordance on each Veðurstofan station card:

- compact button/link: `Spjall`
- optional count/unread badge when available
- secondary quick action: `Tilkynna mælingu`

When clicked, open a dedicated panel/sheet:

- mobile: full-screen or near-full-screen sheet, app-like, safe-area aware;
- desktop: centered panel or right-side drawer;
- header: station name, provider badge, source/time context;
- tabs or mode switch:
  - `Spjall`
  - `Tilkynna mælingu`
- message list with date separators and timestamps;
- composer pinned at bottom;
- no horizontal overflow;
- textarea/input font size at least 16px on mobile;
- send button with icon and pending state;
- visible failed-send retry.

Suggested empty state:

```text
Engin skilaboð enn.
Segðu frá ef veðrið hér stemmir ekki við það sem þú sérð.
```

Suggested context copy:

```text
Þetta eru athugasemdir frá notendum, ekki opinber mæling.
```

Measurement report quick chips:

- `Vindur stemmir ekki`
- `Úrkoma stemmir ekki`
- `Hiti stemmir ekki`
- `Staðsetning/punktur virðist röng`
- `Annað`

Report composer should auto-include the station/weather metadata, but not show a scary technical dump.

## Integration Points in Current Weather UI

Likely files to inspect/change during implementation:

- `components/weather/VedurstofanPointCard.tsx`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

Important:

- This must tie into the shared provider card effort from v202.
- Worst, selected, and all-points cards should expose the same chat entry point when they represent a stable weather target.
- For MET/Yr route points, do not enable weather chat yet unless there is a stable target id. Route-sampled MET/Yr points are not a good community thread key.
- For Veðurstofan, `station_id` is stable and good.
- For Vegagerðin, use the stable station/live point id when it exists.

## Moderation and Trust

Before opening this broadly, include:

- report message endpoint;
- soft-delete or hide message support;
- admin-only hide path, even if admin UI comes later;
- no markdown/HTML rendering in message body for MVP;
- React text rendering only, no `dangerouslySetInnerHTML`;
- linkification can wait. If implemented, use safe `rel="noopener noreferrer"` and do not auto-embed previews;
- message body max length;
- no attachments in first version unless Stebbi explicitly approves a separate media/privacy plan.

Display names:

- Do not show email addresses.
- Use existing profile display name if available.
- Fallback can be "Notandi" plus short stable suffix if needed.

Privacy:

- Weather chat is point-scoped, not route-scoped.
- Do not store the user's origin/destination, full route polyline, precise location, or search text in chat records.
- Message metadata may store only the provider point context and weather values being discussed.

## Future Move to Vegagerðin

When Vegagerðin points are available:

1. Add `target_type='vegagerdin_point'`.
2. Add provider adapter that maps Vegagerðin point id/name/lat/lon to the generic `ChatTarget`.
3. Reuse the same hook and panel.
4. Show chat entry point on Vegagerðin point cards first.
5. Keep Veðurstofan station chat as fallback/secondary if useful.
6. Later add `road_segment` as canonical target if we build a road-segment registry.

Do not migrate old Veðurstofan messages automatically to Vegagerðin unless there is a high-confidence mapping. Safer first step:

- keep Veðurstofan threads;
- create Vegagerðin threads;
- optionally show a small "Tengt Veðurstofustöð" link later.

## Suggested Implementation Phases for Claude Code

### Phase 0 - preflight review

Read:

- `WORKFLOW.md`
- `Design.md`
- this handoff
- relevant current weather card files
- current loan chat SQL/action files
- UmönnunIS chat hook/panel/API files listed above

Return a short implementation plan before coding if Stebbi wants an extra checkpoint.

### Phase 1 - schema and service layer

Create a generic scoped-chat migration, preferably `sql/78_teskeid_scoped_chat.sql`:

- `teskeid_chat_threads`
- `teskeid_chat_messages`
- `teskeid_chat_read_cursors`
- `teskeid_chat_message_reports`
- RLS enabled on all tables
- service-role only if using API+broadcast approach
- no anon access
- no broad client grants unless explicitly choosing postgres_changes with documented RLS
- indexes:
  - `(target_type, target_id)` unique on threads
  - `(thread_id, created_at DESC, id DESC)` on messages
  - `(user_id, thread_id)` on cursors
  - `(message_id, reporter_user_id)` on reports
- triggers for `updated_at`

Also add feature key migration if using a new key:

- recommended key: `weather-station-chat`
- update `feature_access` check constraint
- update admin feature access UI/API/tests
- update `checkFeatureAccess`

Do not run SQL. Stebbi runs migrations manually after review.

### Phase 2 - API routes

Add API routes under `/api/teskeid/chat`, or a weather façade under `/api/teskeid/weather/chat` that delegates to the generic service.

Use server-side auth and `checkFeatureAccess`.

Add a generic service module, with weather adapter helpers:

- `lib/chat/types.ts`
- `lib/chat/access.server.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/rateLimit.server.ts` if no existing reusable limiter fits
- `lib/chat/adapters/weather.server.ts`

Endpoints should return sanitized rows only:

```ts
type ScopedChatMessageDto = {
  id: string
  threadId: string
  body: string
  messageKind: 'chat' | 'measurement_report' | 'system'
  createdAt: string
  sender: {
    userId: string
    displayName: string
    isCurrentUser: boolean
  }
  metadata?: WeatherChatMeasurementReportMetadata
  deleted: boolean
  hidden: boolean
}
```

### Phase 3 - realtime hook and chat panel

Build reusable UI, plus weather-specific thin wrappers if helpful:

- `components/chat/ScopedChatPanel.tsx`
- `components/chat/ScopedChatButton.tsx`
- `components/chat/useScopedChat.ts`
- `components/weather/chat/WeatherPointChatButton.tsx` as a small adapter/wrapper
- `components/weather/chat/WeatherMeasurementReportForm.tsx` only if weather reporting needs domain-specific UI

Borrow concepts from UmönnunIS:

- bottom/full-screen mobile panel;
- safe-area handling;
- scroll to bottom;
- load older;
- unread marker optional;
- report message sheet;
- polling fallback.

Keep MVP lean:

- text messages;
- measurement report quick action;
- report inappropriate message;
- no images/audio/reactions/replies unless Stebbi asks.

### Phase 4 - integrate with Veðurstofan cards

Add the chat button to Veðurstofan station cards in:

- selected card
- worst card
- all-points list cards

Only when:

- user has chat feature access;
- station has stable `stationId`;
- provider is Veðurstofan.

Pass current weather context for measurement report metadata:

- station id/name;
- displayed forecast row/time;
- atime;
- selected ETA;
- displayed wind/precip/temp/weather values;
- distance from route if available.

### Phase 5 - tests and manual QA

Automated tests:

- SQL static tests for new migration:
  - RLS enabled;
  - no anon grants;
  - service_role grants only if API+broadcast approach;
  - constraints/checks/indexes present.
- API tests:
  - unauthenticated cannot read/post;
  - user without feature cannot read/post;
  - invalid target rejected;
  - valid Veðurstofan station creates or reuses thread;
  - body trimmed and length constrained;
  - report endpoint rate-limited;
  - soft-deleted/hidden messages are not returned as normal content.
- Hook/component tests if existing test style supports it:
  - empty state;
  - send pending/error state;
  - report mode captures metadata.

Manual tests are in the `Localhost checks for Stebbi` section.

## Important Open Decisions for Stebbi

1. Should weather chat be visible to every user with Veðurstofan provider access, or should it have a separate per-user feature flag?

   Codex recommendation: separate `weather-station-chat` feature key, at least while testing.

2. Should the first chat be called `Spjall`, `Athugasemdir`, or `Tilkynningar` in the UI?

   Codex recommendation: use `Spjall` for the panel and `Tilkynna mælingu` for the report action. This keeps both use cases clear.

3. Should messages be public to all authenticated weather/chat testers, or only to users with the same provider feature?

   Codex recommendation: feature-gated public community thread, not private route data.

4. Do we want reactions/replies in v1?

   Codex recommendation: no. Keep v1 excellent with text, reports, realtime, pagination, read state, and moderation.

## Localhost Checks for Stebbi

After Claude Code implements this, Stebbi should test on localhost with at least two browser sessions or two users.

### Access and feature gate

1. Use a user with `vedrid`, `weather-provider-vedurstofan`, and the new chat feature if added.
2. Open `/auth-mvp/vedrid`.
3. Calculate a route that shows Veðurstofan stations.
4. Expected:
   - Veðurstofan station cards show a clear `Spjall` or `Tilkynna mælingu` entry point.
   - MET/Yr route-sampled cards do not show chat unless a stable target has explicitly been designed.
5. Sign in as a user without chat feature access.
6. Expected:
   - chat entry points are hidden or disabled;
   - direct API calls return 401/403.

### Basic chat

1. Open chat on one Veðurstofan station, e.g. Hellisheiði.
2. Send a short message.
3. Expected:
   - send has visible pending state;
   - message appears without page reload;
   - reload keeps the message;
   - no email address is shown.
4. Open another Veðurstofan station.
5. Expected:
   - Hellisheiði message does not appear on the other station.

### Realtime

1. Open the same station chat in two browser sessions.
2. Send a message in browser A.
3. Expected:
   - browser B sees the new message within a few seconds without manual refresh.
4. Put browser B in background for a short time, return.
5. Expected:
   - fallback refresh catches missed messages.

### Measurement report

1. On a station card, click `Tilkynna mælingu`.
2. Select a reason like `Vindur stemmir ekki`.
3. Add a short note and submit.
4. Expected:
   - the report appears as a message/report in that station's thread;
   - displayed context is understandable;
   - it does not store or show origin/destination or precise user location.

### Moderation and abuse states

1. Try sending an empty message.
2. Expected: rejected client-side or 400.
3. Try sending a message over max length.
4. Expected: rejected with friendly error.
5. Report a message.
6. Expected: report action confirms success and cannot be spammed repeatedly.

### Mobile behavior

1. Test at 360 to 460 px width.
2. Open chat panel.
3. Focus composer.
4. Expected:
   - no browser zoom;
   - no horizontal overflow;
   - send button remains reachable;
   - safe-area/browser chrome does not cover the input;
   - scrolling remains stable.

### Regression checks

1. Recalculate route with Veðurstofan off.
2. Expected: existing MET/Yr flow still works.
3. Recalculate route with Veðurstofan on.
4. Expected:
   - weather calculations do not change because of chat;
   - chat does not block route result loading;
   - no extra upstream calls to Veðurstofan are triggered by opening chat.

## Supabase Notes

If Claude Code writes SQL:

- SQL must be written only, not run.
- Include clear comments:
  - what tables are added;
  - which grants are given;
  - whether realtime publication is changed;
  - rollback.
- If using broadcast-only approach, no realtime publication change is needed for message tables.
- If using `postgres_changes`, SQL must explicitly mention `ALTER PUBLICATION supabase_realtime ADD TABLE ...` and why that is safe.
- RLS must not be weakened on existing tables.
- No client/anon access to service-only weather product tables.

## Security Checklist

Claude Code should explicitly verify:

- no message body in logs;
- no user email in message DTO;
- no route origin/destination in metadata;
- no anonymous read/write;
- authenticated direct API still checks feature access;
- rate limits exist;
- hidden/deleted messages are filtered;
- report endpoint does not leak message body back to unintended users;
- any admin/moderation path is service-role only;
- no `dangerouslySetInnerHTML`;
- no raw metadata dump in UI.

## Commands Run By Codex

Read-only:

- `rg -l "chat|realtime|postgres_changes|channel|subscribe" app components lib sql -g "*.ts" -g "*.tsx" -g "*.sql"`
- `Get-ChildItem -File 'sql' | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 25`
- `Get-ChildItem -Force 'C:\Users\Lenovo\Documents\UmonnunIS' | Select-Object Name,Length`
- `Get-Content -Encoding UTF8 'components/chat/ChatView.tsx'`
- `Get-Content -Encoding UTF8 'components/chat/MessageInput.tsx'`
- `Get-Content -LiteralPath 'app/api/chats/[id]/messages/route.ts'`
- `Get-Content -Encoding UTF8 'sql/61_loan_chat_messages_in_history.sql'`
- `Get-Content -Encoding UTF8 'lib/loans/history.server.ts'`
- `Get-Content -Encoding UTF8 'C:\Users\Lenovo\Documents\UmonnunIS\hooks\useChatState.ts'`
- `Get-Content -Encoding UTF8 'C:\Users\Lenovo\Documents\UmonnunIS\components\ChatPanel.tsx'`
- `Get-Content -Encoding UTF8 'C:\Users\Lenovo\Documents\UmonnunIS\sql\supabase-migration-chat-messages.sql'`
- `Get-Content -LiteralPath 'C:\Users\Lenovo\Documents\UmonnunIS\app\api\circles\[circleId]\chat\route.ts'`
- `Get-Content -LiteralPath 'C:\Users\Lenovo\Documents\UmonnunIS\app\api\circles\[circleId]\chat\report\route.ts'`
- `Get-Content -LiteralPath 'C:\Users\Lenovo\Documents\UmonnunIS\app\api\circles\[circleId]\chat\read-cursor\route.ts'`
- `Get-Content -Encoding UTF8 'lib/loans/guard.ts'`
- `Get-Content -Encoding UTF8 'sql/76_feature_access_weather_provider_vedurstofan.sql'`
- `Select-String -Path 'TODO.md' -Pattern 'spjall|Veðurstof|Vegager' -Context 3,8 -Encoding UTF8`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Changed:

- Added this handoff file only.
- 2026-07-15 14:15 update: amended this same handoff, at Stebbi's request, to make the chat architecture a reusable Teskeið scoped-chat core with weather as the first adapter/consumer.

Not run:

- tests
- typecheck
- lint
- migrations
- dev server
- Supabase commands
