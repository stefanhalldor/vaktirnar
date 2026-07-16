# Codex handoff: reusable Teskeið chat core, first branded as Veðurpúls

Created: 2026-07-15 15:52
Timezone: Atlantic/Reykjavik
Updated: 2026-07-15 15:58 - clarified that the reusable core is chat, while Púls is product-language
Updated: 2026-07-15 16:00 - tightened language: reusable core is Chat; Púls/Veðurpúls must not be treated as the core

TODO reference: todo-086 / TODO #89

Builds on:

- `ai-handoff/2026-07-15-0858-todo-086-v203-codex-vedurstofan-station-chat-handoff.md`
- Stebbi's Facebook launch/post draft for Veðurpúls
- Design rules in `Design.md`
- Workflow rules in `WORKFLOW.md`

## Executive Summary

This should no longer be framed as only "chat per Veðurstofan station".

Stebbi wants a reusable Teskeið chat core that can power scoped discussion, short observations, and feedback in many contexts.

The reusable technical core is:

```text
Chat
```

The weather product can brand its use of that chat core as:

```text
Veðurpúls
```

Product meaning:

- reusable core = generic scoped `Chat` infrastructure and components.
- `Púls` is not the reusable core and should not drive DB/core code naming.
- `Veðurpúls` = weather-specific product branding for a chat thread attached to stable weather/road/weather-station targets.
- First target: Veðurstofan stations, because they already exist as stable entities and need user validation/feedback.
- Next target: Vegagerðin live points, because they better represent current conditions.
- Later target: canonical road segments.
- Future non-weather targets: loan items, bookkeeping contexts, direct user conversations, projects/tasks, or other Teskeiðar.

Do not build a throwaway weather-only chat. Also do not overbuild every future domain now. Build one excellent reusable chat core with a small weather adapter first, then brand that weather surface as Veðurpúls.

## Product Framing

Stebbi's Facebook draft is useful as a product brief:

> The goal is not only to show forecast tables. The goal is to put weather in context.

Veðurpúls is meant to capture short, useful, human observations such as:

- "Var að keyra yfir Hellisheiði með hjólhýsi. Ég myndi ekki leggja af stað núna."
- "Það eru lúmskar hliðarhviður hérna þó veðurstöðin sýni ekkert sérstakt."
- "Vegurinn er mun betri en ég bjóst við."

This is not official weather data and should never be presented as such. It is community context around official/provider data.

Recommended product copy direction:

- Primary UI name in weather: `Veðurpúls`
- Generic reusable technical name: `Chat`
- Short explanatory copy:

```text
Veðurpúls er stuttar athugasemdir frá notendum um veður og aðstæður við þennan punkt.
```

Safety/trust copy:

```text
Þetta eru athugasemdir frá notendum, ekki opinber mæling.
```

Measurement/report prompt:

```text
Segðu frá ef veðrið hér stemmir ekki við það sem þú sérð.
```

Avoid wording that says user posts "decide" whether a trip is safe. They can help users notice context, but official data and user judgment still matter.

## Naming Recommendation

Use product-friendly naming in UI:

- `Veðurpúls`
- Later potentially `Vegapúls` if Vegagerðin/road-segment usage grows enough to deserve its own label.

For code/database, keep the reusable core honest and unsurprising:

### Preferred: `teskeid_chat_*` for DB/core code, `Veðurpúls` for weather UI

Reason:

- The reusable core is chat/scoped conversation infrastructure.
- `Púls`/`Veðurpúls` are product-language labels on top of Chat, not the core itself.
- Keeping DB/core names as `chat` avoids future confusion if the same core powers direct chat, loan-item chat, bookkeeping chat, or other non-weather discussion.

```text
teskeid_chat_threads
teskeid_chat_messages
teskeid_chat_read_cursors
teskeid_chat_message_reports
```

Suggested code paths:

```text
components/chat/ScopedChatPanel.tsx
components/chat/ScopedChatButton.tsx
components/chat/useScopedChat.ts
lib/chat/types.ts
lib/chat/access.server.ts
lib/chat/repository.server.ts
lib/chat/adapters/weather.server.ts
components/weather/pulse/WeatherPulseButton.tsx
components/weather/pulse/WeatherPulsePanel.tsx
```

Weather-specific wrappers can use `pulse` in the path/name because they are product-facing weather components. The shared core should stay `chat`.

## Core Architecture

Use the same target abstraction as v203. In core code, use chat naming; in weather UI/product copy, surface it as Veðurpúls:

```ts
type ChatDomain = 'weather' | 'direct' | 'bookkeeping' | 'loans' | 'teskeid'

type ChatTarget = {
  domain: ChatDomain
  targetType: string
  targetId: string
  title: string
  subtitle?: string
  provider?: 'vedurstofan' | 'vegagerdin' | 'metno' | 'teskeid' | string
  lat?: number | null
  lon?: number | null
  metadata?: Record<string, unknown>
}
```

Phase 1 target:

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

Phase 2 target:

```ts
{
  domain: 'weather',
  targetType: 'vegagerdin_point',
  targetId: stableVegagerdinPointId,
  title: pointName,
  provider: 'vegagerdin',
  lat,
  lon,
}
```

The core must not know provider-specific rules. Provider/domain adapters validate the target and attach relevant metadata.

## Data Model Direction

Prefer migration:

```text
sql/78_teskeid_chat_core.sql
```

Do not run SQL without Stebbi's explicit approval.

Recommended tables:

```text
teskeid_chat_threads
teskeid_chat_messages
teskeid_chat_read_cursors
teskeid_chat_message_reports
```

Recommended fields are the same shape as v203, with product naming adjusted:

### `teskeid_chat_threads`

- `id uuid primary key`
- `domain text not null`
- `target_type text not null`
- `target_id text not null`
- `provider text`
- `target_name text not null`
- `lat numeric(9,6)`
- `lon numeric(9,6)`
- `metadata jsonb not null default '{}'`
- `created_at`, `updated_at`
- `last_message_at`
- `message_count`
- `is_archived`
- unique `(domain, target_type, target_id)`

### `teskeid_chat_messages`

- `id uuid primary key`
- `thread_id uuid references teskeid_chat_threads(id)`
- `user_id uuid references auth.users(id)`
- `body text not null`
- `message_kind text not null`
  - recommended values: `chat`, `field_report`, `measurement_report`, `system`
- `metadata jsonb not null default '{}'`
- `created_at`, `updated_at`
- soft moderation fields:
  - `deleted_at`, `deleted_by`
  - `hidden_at`, `hidden_by`, `hidden_reason`
- body length constraint, e.g. trimmed 1 to 1000 chars

### `teskeid_chat_read_cursors`

- per user/thread read cursor
- enables later unread badge and "nýtt í púlsi"

### `teskeid_chat_message_reports`

- moderation/reporting before opening broadly
- unique `(message_id, reporter_user_id)`

## Security and Access Model

Codex still recommends the safer v203 Option B:

```text
service-role tables + server APIs + realtime broadcast/poll fallback
```

Reason:

- Feature access is server-side.
- Weather provider access is per user.
- Public/auth weather access is currently being actively refined.
- Direct `authenticated` table grants/RLS for message tables creates more leak surface.

Minimum rules:

- No anonymous write.
- No public client table access unless explicitly reviewed.
- User must be authenticated to post.
- User must have the relevant feature/provider access to see/use Veðurpúls in Phase 1.
- Do not show emails in message DTOs.
- Do not log message bodies.
- Do not store route origin/destination or user GPS location in chat metadata.
- Veðurpúls threads attach to a stable provider point, not to a user's private route.

## Feature Flags

Use a dedicated feature flag/key. Do not reuse:

- `WEATHER_ELTA_VEDRID_FLAG`
- `WEATHER_TRIP_FLAG`
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`

Recommended:

```text
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```

or, if Stebbi prefers product-brand naming for the global master switch:

```text
WEATHER_PULSE_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Codex preference:

- `TESKEID_CHAT_ENABLED` = global master switch for the reusable chat core.
- `WEATHER_PULSE_ACCESS_REQUIRED` = whether weather usage is restricted per user.
- feature key in `feature_access`: `weather-pulse`

Access in Phase 1:

```text
Weather base access
+ Veðurstofan provider access
+ Weather Pulse access
= can see/use Veðurpúls on Veðurstofan stations
```

Reason:

- Stebbi can let a small group test Veðurpúls without exposing it to everyone who can see base weather.
- Later Vegagerðin can use the same chat core but a separate provider/domain feature key if needed.

## Product UX

Do not render full chat threads inside every weather card. It will be noisy and heavy.

Recommended pattern:

- On stable weather point cards, show a small `Veðurpúls` action.
- Open a sheet/panel:
  - mobile: full-screen or near-full-screen bottom sheet
  - desktop: drawer or modal panel
- Header:
  - station/point name
  - provider badge
  - short context: e.g. `Veðurstofan`, `Hellisheiði`
- Body:
  - message list
  - date separators
  - short system note that this is user input
- Composer:
  - text input at least 16px on mobile
  - submit button with pending state
  - failed-send retry
- Secondary action:
  - `Tilkynna mælingu`
  - quick chips like `Vindur stemmir ekki`, `Hviður`, `Úrkoma`, `Færð`, `Annað`

Avoid:

- long explanatory text inside the route result
- map clutter
- making user posts look like official warnings
- storing rich route context

## Facebook Ad -> Product Requirements

Stebbi's proposed Facebook copy should guide launch positioning:

1. Veðurpúls should be visible enough that users understand they can give feedback inside the weather flow.
2. First invitation should be specific:
   - "Prófaðu Veðurpúlsinn á teskeid.is/vedrid"
   - "Segðu frá því sem þú sérð"
   - "Hvað virkar? Hvað vantar?"
3. The UI should support short practical posts, not long forum threads.
4. User posts should be tied to a point/station so context is preserved.
5. Later, when Vegagerðin is in, the same chat core should power a weather/road branded surface closer to "nústaðan" through Vegagerðin live points.

Suggested launch copy inside product:

```text
Nýtt: Veðurpúls
Deildu stuttri athugasemd um veður eða aðstæður við þennan punkt.
```

Suggested empty state:

```text
Enginn púls hér enn.
Segðu frá ef veðrið hér stemmir ekki við það sem þú sérð.
```

Suggested footer note:

```text
Veðurpúls er frá notendum Teskeiðar og kemur ekki í stað opinberra gagna.
```

## Implementation Phases for Claude Code

### Phase 0 - confirm scope

Claude Code should first reply with a short plan before coding, because this touches:

- Supabase schema
- feature flags
- auth/access
- realtime/polling
- UI patterns
- moderation/reporting

### Phase 1 - reusable chat core schema and access

Write, but do not run, SQL migration for the reusable chat core. Weather UI can call the weather-specific surface Veðurpúls, but schema/core code should make clear this is generic scoped chat.

Required:

- RLS enabled
- service-role only unless a deliberate RLS/client-realtime decision is made
- no anon grants
- report/moderation table
- read cursor table
- updated_at triggers
- useful indexes
- comments explaining that this is reusable Chat, not weather-only chat

Add feature key:

```text
weather-pulse
```

Only if `feature_access` CHECK constraint requires it.

### Phase 2 - server API and repository

Add generic server modules:

- `lib/chat/types.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/access.server.ts`
- `lib/chat/adapters/weather.server.ts`

Routes can be generic:

```text
/api/teskeid/chat/threads
/api/teskeid/chat/threads/:threadId/messages
/api/teskeid/chat/threads/:threadId/read-cursor
/api/teskeid/chat/messages/:messageId/report
```

or weather façade routes delegating to generic chat services:

```text
/api/teskeid/weather/pulse/...
```

API must validate:

- authenticated user
- reusable chat enabled
- weather access
- Veðurstofan provider access
- weather-pulse feature access
- stable target exists
- message length/type
- rate limit

### Phase 3 - realtime UX

Use UmönnunIS as inspiration:

- broadcast/refetch or polling fallback
- optimistic send
- dedupe
- refetch on focus
- load older
- read cursor
- visible failed-send retry

Do not require direct Postgres realtime table grants unless Claude Code explicitly explains and reviews RLS impact.

### Phase 4 - Weather adapter UI

Add Veðurpúls entry points to stable Veðurstofan station cards:

- worst point card if provider target is Veðurstofan
- selected point card if provider target is Veðurstofan
- all-points Veðurstofan station cards

Do not add chat to route-sampled MET/Yr points yet. They are not stable community targets.

Use shared card logic where possible. Do not fork three separate weather-card implementations again.

### Phase 5 - moderation and release readiness

Before exposing beyond Stebbi/test users:

- report message works
- message body not logged
- no email display
- no anonymous access
- no route data leakage
- rate limits
- hidden/deleted handling
- mobile keyboard/safe-area checked
- feature gate verified with multiple users

## Open Product Decisions

1. Should the UI action say `Veðurpúls`, `Opna Veðurpúls`, or `Spjall`?

   Codex recommendation: use `Veðurpúls` as the user-facing action. Inside the panel, use `Spjall`/`Tilkynna` as modes if needed.

2. Should the generic feature be called `Púls` everywhere in admin/feature flags?

   Codex updated recommendation: no. The generic/core feature should be `Chat`. Use `Veðurpúls` as weather product copy and keep domain-specific feature key `weather-pulse` for rollout.

3. Should users be able to post only while signed in?

   Codex recommendation: yes. Public/signed-out users may read only if Stebbi later wants that, but v1 should require login to post.

4. Should signed-out users see Veðurpúls?

   Codex recommendation: not in v1. Keep it feature-gated and authenticated while moderation/trust is tested.

5. Should Veðurpúls posts be visible to everyone with weather-pulse access or only same provider-access group?

   Codex recommendation: visible to authenticated users with `weather-pulse` and relevant provider access.

## Localhost Checks for Stebbi

After Claude Code implements this, Stebbi should test:

### Feature access

1. Start as user with base weather, Veðurstofan provider, and weather-pulse access.
2. Open `/auth-mvp/vedrid`.
3. Calculate route with Veðurstofan stations.
4. Expected:
   - Veðurstofan station cards show `Veðurpúls`.
   - MET/Yr route points do not show Veðurpúls.
5. Sign in as user without weather-pulse.
6. Expected:
   - Weather still works according to current weather access rules.
   - Veðurpúls entry points are hidden or disabled.

### Posting

1. Open Veðurpúls on Hellisheiði or Sandskeið.
2. Post a short message.
3. Expected:
   - message appears with pending/sent state;
   - no email is visible;
   - reload keeps it;
   - another station does not show the same message.

### Realtime

1. Open same station with two logged-in browser sessions.
2. Post in browser A.
3. Expected:
   - browser B sees it within a few seconds or after polling fallback.

### Measurement/condition report

1. Use `Tilkynna mælingu` or the equivalent quick action.
2. Choose a reason like wind/gust/conditions.
3. Submit short note.
4. Expected:
   - report is attached to the same station/thread;
   - UI makes it clear this is user observation;
   - no private route/origin/destination data is shown or stored.

### Moderation and abuse

1. Try empty message.
2. Try too-long message.
3. Try rapid repeated messages.
4. Report a message.
5. Expected:
   - friendly validation/rate-limit behavior;
   - report succeeds once and does not leak private data.

### Mobile

1. Test 360px, 390px, and 460px widths.
2. Open Veðurpúls panel.
3. Focus composer.
4. Expected:
   - no mobile zoom;
   - no horizontal overflow;
   - composer remains reachable;
   - safe-area/browser chrome does not cover send controls.

### Regression

1. Turn Veðurstofan provider off for user.
2. Expected:
   - MET/Yr weather still works;
   - Veðurpúls for Veðurstofan disappears.
3. Open public `/vedrid`.
4. Expected:
   - no private Veðurpúls write controls unless explicitly designed later.

## Notes for Facebook Launch

Do not post the Facebook ad until:

- feature flags are correct in production;
- Veðurpúls is tested on localhost and production by Stebbi;
- moderation/reporting exists;
- at least one non-Stebbi test user can use it;
- public users still get stable base weather;
- users without provider/chat access do not see broken or misleading controls.

Suggested launch CTA:

```text
Prófið Veðrið og Veðurpúlsinn á teskeid.is/vedrid og segið ykkar skoðun inni í Veðurpúlsinum sjálfum.
```

But if Veðurpúls is still per-user gated, the public ad should either wait or say it is being tested with selected users.

## Commands Run by Codex

Read-only:

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-15-0858-todo-086-v203-codex-vedurstofan-station-chat-handoff.md`
- `Get-ChildItem -File ai-handoff | Sort-Object Name | Select-Object -Last 20 Name,Length`
- `Get-Content -Encoding UTF8 Design.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Select-String -Path TODO.md -Pattern '#89|spjall|Veðurpúls|Púls|Veðurstof|Vegager' -Context 2,6 -Encoding UTF8`
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

Changed:

- Added this handoff file only.
- 2026-07-15 15:58 update: clarified that reusable core should be named/implemented as chat, while `Púls` is product-language and `Veðurpúls` is the weather-specific surface.
- 2026-07-15 16:00 update: corrected language again: reusable core is `Chat`; `Púls`/`Veðurpúls` must not be treated as the core.

Not run:

- tests
- typecheck
- dev server
- migrations
- Supabase commands
- commit/push/deploy

## Óvissa / þarf að staðfesta

- Exact feature flag names. Codex now recommends `TESKEID_CHAT_ENABLED` + `WEATHER_PULSE_ACCESS_REQUIRED` + feature key `weather-pulse`, but Stebbi should approve before implementation.
- Whether signed-out users should ever read Veðurpúls. Codex recommends no for v1.
- Whether the Facebook launch should wait until feature is open broadly, or be framed as selected-user testing.
