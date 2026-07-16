# 2026-07-15 18:22 — TODO-086 v239 — Veðurpúls on Elta veðrið lab, built on reusable Chat

This handoff updates and sharpens:

- `ai-handoff/2026-07-15-1552-todo-086-v227-codex-vedurpuls-product-handoff.md`

Context from Stebbi:

- The big weather release is now deployed.
- Next target is to start testing Veðurpúls.
- Stebbi is considering using the existing `Elta veðrið` station-validation surface as the first lab for Veðurpúls.
- Product goal: users can click a weather station, open a pulse/chat thread, write observations, and see the same pulse dynamically wherever that station appears.
- Later, this should move naturally to Vegagerðin live/current points once Vegagerðin data is integrated.

## Executive Summary

Codex recommendation:

Use the existing `Elta veðrið` area as the **lab context**, but do **not** keep the new product tied to the old `elta-vedrid` name.

Build:

```text
Reusable core: Chat
Weather product wrapper: Veðurpúls
First route: /auth-mvp/vedrid/vedurpuls
First target type: vedurstofan_station
First integration point: existing Elta veðrið / Veðurstofan station data
```

Keep `/auth-mvp/vedrid/elta-vedrid` only as:

- legacy internal station validation route, or
- redirect/alias later if Stebbi wants that.

Do not rename `WEATHER_ELTA_VEDRID_FLAG` into a chat flag. It already means "Elta veðrið station validation view" and should not become the product flag for reusable chat.

## Product Decision

### Yes: start from the Elta veðrið surface

It is a good first place to test because:

- all Veðurstofan stations are already visible there;
- station IDs are stable targets;
- the surface is already feature-gated;
- it is a natural place to let testers compare official data and human observations;
- later `/vedrid` trip summaries can reuse the same station thread.

### But: create a new Veðurpúls route/name

Recommended route:

```text
/auth-mvp/vedrid/vedurpuls
```

Reason:

- `elta-vedrid` describes validation/research.
- `vedurpuls` describes the product users will understand.
- The old name should not leak into the future chat architecture.

Possible transition:

1. Keep `/auth-mvp/vedrid/elta-vedrid` working for now.
2. Add `/auth-mvp/vedrid/vedurpuls` as the new feature surface.
3. Share station list/map/freshness components where possible.
4. Later decide whether `/elta-vedrid` redirects to `/vedurpuls` or remains as an internal admin/test view.

## Naming Rules

Important:

```text
Reusable technical core = Chat
Weather branded usage = Veðurpúls
```

Do not name generic DB tables, core repository modules, or reusable components after `Púls`.

Preferred code/DB naming:

```text
teskeid_chat_threads
teskeid_chat_messages
teskeid_chat_read_cursors
teskeid_chat_message_reports

lib/chat/*
components/chat/*
```

Weather-specific wrapper naming:

```text
components/weather/pulse/*
app/auth-mvp/vedrid/vedurpuls/*
```

Feature key/product naming:

```text
weather-pulse
Veðurpúls
```

## Feature Flags And Access

Do **not** reuse:

- `WEATHER_ELTA_VEDRID_FLAG`
- `WEATHER_TRIP_FLAG`
- `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`

Recommended new env flags:

```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Recommended feature key:

```text
weather-pulse
```

Phase 1 access contract:

To see/use Veðurpúls on Veðurstofan stations, user must have:

1. authenticated session;
2. base weather access according to `WEATHER_ENABLED`;
3. Veðurstofan provider access via `weather-provider-vedurstofan`;
4. Veðurpúls access via `weather-pulse`;
5. `TESKEID_CHAT_ENABLED=true`.

If `WEATHER_PULSE_ACCESS_REQUIRED=false` later, then all eligible weather/provider users can access Veðurpúls. For v1 keep it restricted.

Admin UI should get a new access panel:

```text
Veðurpúls
Stjórnar hverjir mega prófa Veðurpúls þegar WEATHER_PULSE_ACCESS_REQUIRED=true.
feature_key = weather-pulse
```

## Core Concept

Every chat thread belongs to a stable scoped target.

For Veðurpúls v1:

```ts
{
  domain: 'weather',
  targetType: 'vedurstofan_station',
  targetId: stationId,
  provider: 'vedurstofan',
  title: stationName,
  lat,
  lon,
}
```

Example:

```text
domain: weather
target_type: vedurstofan_station
target_id: 31392
provider: vedurstofan
target_name: Hellisheiði
```

Critical behavior:

If a user posts in the Hellisheiði thread from `/auth-mvp/vedrid/vedurpuls`, the same message should be visible when Hellisheiði appears:

- in the station lab list;
- as selected point;
- as worst point;
- under all Veðurstofan points along a route;
- later in any station details view.

Same target, same thread, all surfaces.

## Data Model Direction

Write, but do not run without explicit Stebbi approval:

```text
sql/78_teskeid_chat_core.sql
```

It may include the `weather-pulse` feature key constraint update, or that can be a separate migration. If separate, keep migration numbering clean.

Recommended tables:

```text
teskeid_chat_threads
teskeid_chat_messages
teskeid_chat_read_cursors
teskeid_chat_message_reports
```

### `teskeid_chat_threads`

Fields:

- `id uuid primary key`
- `domain text not null`
- `target_type text not null`
- `target_id text not null`
- `provider text`
- `target_name text not null`
- `lat numeric(9,6)`
- `lon numeric(9,6)`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `last_message_at timestamptz`
- `message_count integer not null default 0`
- `is_archived boolean not null default false`
- unique `(domain, target_type, target_id)`

### `teskeid_chat_messages`

Fields:

- `id uuid primary key`
- `thread_id uuid not null references public.teskeid_chat_threads(id)`
- `user_id uuid not null references auth.users(id)`
- `body text not null`
- `message_kind text not null default 'chat'`
  - allowed values: `chat`, `field_report`, `measurement_report`, `system`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`
- `deleted_by uuid`
- `hidden_at timestamptz`
- `hidden_by uuid`
- `hidden_reason text`

Constraints:

- trimmed body length at least 1
- max body length, e.g. 1000 chars
- no anonymous author

### `teskeid_chat_read_cursors`

Purpose:

- unread counts;
- "new in pulse" marker;
- later inbox/product-level pulse summaries.

Fields:

- `thread_id`
- `user_id`
- `last_read_message_id`
- `last_read_at`
- primary/unique `(thread_id, user_id)`

### `teskeid_chat_message_reports`

Purpose:

- moderation from day one.

Fields:

- `message_id`
- `reporter_user_id`
- `reason`
- `body`
- `created_at`
- unique `(message_id, reporter_user_id)`

## Security And RLS

Recommended v1:

```text
service-role only tables + server APIs
```

Reason:

- Access rules are actively evolving.
- Feature flags and provider gates are server-side.
- We do not want client table grants or broad RLS until the data model is proven.

SQL rules:

- enable RLS on all chat tables;
- revoke all from `PUBLIC`, `anon`, `authenticated`;
- grant only to `service_role`;
- no direct client table reads/writes in v1.

API rules:

- no anonymous write;
- no emails in DTOs;
- no message bodies in logs;
- no private route origin/destination in chat metadata;
- no user GPS/location stored in chat metadata;
- stable provider target only, not per-user route target.

Moderation:

- support report message in v1;
- support hidden/deleted fields in schema even if admin UI is minimal at first;
- never make user posts look like official warnings.

## API Direction

Preferred generic routes:

```text
/api/teskeid/chat/threads
/api/teskeid/chat/threads/:threadId/messages
/api/teskeid/chat/threads/:threadId/read-cursor
/api/teskeid/chat/messages/:messageId/report
```

Weather facade is acceptable if it delegates to generic chat services:

```text
/api/teskeid/weather/pulse/...
```

Either way, keep core logic in:

```text
lib/chat/types.ts
lib/chat/access.server.ts
lib/chat/repository.server.ts
lib/chat/adapters/weather.server.ts
```

Validation:

- authenticated user;
- `TESKEID_CHAT_ENABLED=true`;
- weather access;
- `weather-provider-vedurstofan` access;
- `weather-pulse` access;
- target exists in `vedurstofan_stations`;
- body length;
- message kind;
- rate limit per user/thread;
- no duplicate rapid spam.

## Realtime / Dynamic Updates

Stebbi wants:

> if written in one place, it appears dynamically everywhere.

V1 should deliver this without overexposing database tables.

Recommended implementation:

1. optimistic send in the active panel;
2. refetch active thread after successful send;
3. `refetch on focus`;
4. short polling while panel is open, e.g. every 10-20 seconds;
5. lightweight thread summary polling on pages that show many station cards;
6. later upgrade to Supabase Realtime once RLS/client grants are deliberately reviewed.

If Claude Code wants to use realtime immediately, it must explicitly explain:

- whether it uses Postgres Realtime table subscriptions or broadcast;
- what grants/RLS are required;
- why no user can subscribe to threads they should not see;
- how message bodies are protected.

Do not casually add authenticated table grants just to get realtime.

## UI / Product UX

Design.md requirements:

- mobile-first;
- no mobile zoom on composer;
- `textarea`/input text at least 16px;
- no horizontal overflow;
- no card-inside-card clutter;
- clear pending/loading state;
- accessible focus and touch targets.

Recommended pattern:

- station card shows compact Veðurpúls entry point:
  - label: `Veðurpúls`
  - optional count: `3`
  - optional latest snippet if space allows;
- click opens panel/sheet;
- mobile: full-screen or near-full-screen sheet;
- desktop: drawer/modal panel;
- do not render full thread inside every weather card.

Panel header:

```text
Veðurpúls
Hellisheiði · Veðurstofan
```

Safety note:

```text
Athugasemdir frá notendum, ekki opinber mæling.
```

Empty state:

```text
Enginn púls hér enn.
Segðu frá ef veðrið hér stemmir ekki við það sem þú sérð.
```

Composer placeholder:

```text
Hvað sérðu eða finnurðu hér?
```

Quick chips / report modes:

- `Hviður`
- `Vindur stemmir ekki`
- `Úrkoma`
- `Færð`
- `Betra en spáin`
- `Annað`

Avoid:

- long educational text inside every card;
- forum-like walls of text in route result;
- making posts look official;
- using red/alert styling unless reporting/moderation state requires it.

## Reusing Elta veðrið Components

Claude Code should inspect current `/auth-mvp/vedrid/elta-vedrid` implementation and reuse only the parts that are genuinely shared:

Reusable:

- station list/map;
- station card shell if clean enough;
- station metadata display;
- Veðurstofan freshness/read model;
- manual refresh button/state if extracted cleanly;
- provider/status badges.

Do not reuse by copy-paste:

- feature gate naming;
- page title/route name;
- one-off state handling that belongs in shared hooks;
- UI that locks the new product into "validation view" wording.

Desired shared components/hooks:

```text
components/weather/vedurstofan/VedurstofanStationList.tsx
components/weather/vedurstofan/VedurstofanFreshnessPanel.tsx
components/weather/pulse/WeatherPulseButton.tsx
components/weather/pulse/WeatherPulsePanel.tsx
components/chat/ScopedChatPanel.tsx
components/chat/ScopedChatComposer.tsx
components/chat/ScopedChatMessageList.tsx
lib/weather/vedurstofanFreshness.ts
lib/chat/*
```

If the existing Elta veðrið page is too tangled, create `/vedurpuls` cleanly and leave `/elta-vedrid` alone for now.

## Integration With `/auth-mvp/vedrid`

Do not make MET/Yr sampled route points chat targets in v1.

Use Veðurpúls only where the route result has stable Veðurstofan station targets:

- Veðurstofan worst point card;
- Veðurstofan selected point card;
- Veðurstofan cards under all points;
- station summaries for stations near selected route.

If a route includes six Veðurstofan stations, the route summary may show:

```text
Veðurpúls á leiðinni
6 stöðvar · 2 með nýjum athugasemdum
```

Clicking opens a list/sheet of the station pulse threads.

Important:

- Same station thread must be reused everywhere by `target_id`.
- Posting from route card updates the station page view and vice versa.
- Thread summary should be lightweight so route calculation does not become slow.

## Manual Veðurstofan Refresh

Stebbi wants `/vedurpuls` to be able to hand-trigger Veðurstofan data just like `/vedrid`.

Requirement:

- Do not duplicate refresh logic.
- Extract and reuse the same freshness/refresh component and API calls already used by `/auth-mvp/vedrid`.
- Same cooldown/run-state rules.
- Same access rules.
- Same stale-data copy.

On `/vedurpuls`, the refresh panel can sit above the station list:

```text
Veðurstofugögn
Síðasta spá frá kl. 18:00 · síðast sótt kl. 18:08
[Sækja ný gögn]
```

Only show manual refresh to users with Veðurstofan provider access.

## Implementation Phases For Claude Code

### Phase 0 — plan only

Claude Code should first reply with a concise implementation plan before coding.

Must answer:

- route strategy: new `/vedurpuls` vs redirect from `/elta-vedrid`;
- exact env flags;
- exact feature key;
- SQL migration shape;
- whether realtime is polling-first or direct Supabase Realtime;
- which existing Elta veðrið components will be reused/extracted.

### Phase 1 — SQL and access, no UI yet

Write but do not run:

- chat core migration;
- feature key constraint update for `weather-pulse`;
- tests/static checks for migration;
- guard/access helpers for chat/weather-pulse.

No direct client table grants.

### Phase 2 — generic chat repository/API

Implement:

- create/get thread by target;
- list messages;
- post message;
- report message;
- read cursor;
- rate limit;
- DTOs that hide emails/private data.

Add tests for:

- no anonymous post;
- no access without `weather-pulse`;
- no access without Veðurstofan provider access;
- stable target validation;
- message length;
- report uniqueness;
- no email in response.

### Phase 3 — reusable Chat UI

Implement:

- `ScopedChatPanel`;
- message list;
- composer;
- optimistic/pending send;
- error retry;
- polling/refetch while open;
- mobile keyboard checks.

Use Teskeið design tokens and Design.md rules.

### Phase 4 — Veðurpúls route

Add:

```text
/auth-mvp/vedrid/vedurpuls
```

Use:

- Veðurstofan station list/map;
- freshness/manual refresh;
- WeatherPulseButton/Panel per station.

Feature gate:

- signed in;
- base weather available;
- Veðurstofan provider access;
- `weather-pulse`.

### Phase 5 — integrate into route summary

Add lightweight Veðurpúls entry points to Veðurstofan cards in `/auth-mvp/vedrid`.

Do not make this a full chat feed inside the route summary.

### Phase 6 — review and release gate

Before release:

- Codex review;
- SQL approved/run by Stebbi only;
- typecheck/test/build;
- localhost checks below;
- explicit deploy approval.

## Localhost Checks For Stebbi

### Access and routing

1. Sign in as user without `weather-pulse`.
2. Open `/auth-mvp/vedrid`.
3. Expected: weather works as before; Veðurpúls controls are hidden.
4. Try `/auth-mvp/vedrid/vedurpuls`.
5. Expected: blocked/redirected with friendly behavior.

6. Sign in as user with:
   - `weather-provider-vedurstofan`
   - `weather-pulse`
7. Open `/auth-mvp/vedrid/vedurpuls`.
8. Expected: station list/map opens.
9. Expected: station cards have Veðurpúls entry point.

### Posting and same-thread behavior

1. Open Hellisheiði in `/vedurpuls`.
2. Post a short message.
3. Reload page.
4. Expected: message persists.
5. Open a route where Hellisheiði appears as a Veðurstofan point.
6. Open Veðurpúls from that card.
7. Expected: same message appears.

### Station isolation

1. Post on Hellisheiði.
2. Open Sandskeið.
3. Expected: Hellisheiði message does not appear on Sandskeið.

### Dynamic behavior

1. Open same station in two browser sessions with access.
2. Post in browser A.
3. Expected: browser B sees it after polling/refetch without full page reload.

### Refresh behavior

1. On `/vedurpuls`, use `Sækja ný gögn`.
2. Expected: same cooldown/run-state behavior as `/auth-mvp/vedrid`.
3. Expected: no refresh spam.
4. Expected: stale/new-cycle copy matches the existing weather flow.

### Moderation/reporting

1. Report a message.
2. Expected: report succeeds once.
3. Expected: repeated report is handled gracefully.
4. Expected: no email/user private data exposed.

### Mobile

Test at 360px, 390px, and 460px:

1. Open Veðurpúls panel.
2. Focus composer.
3. Type and send.
4. Expected:
   - no mobile zoom;
   - no horizontal overflow;
   - send button reachable above keyboard;
   - panel can close;
   - focus state visible;
   - loading state does not shift layout badly.

### Regression

1. Public `/vedrid` still works.
2. Signed-in `/auth-mvp/vedrid` still shows saved places.
3. Users without Veðurstofan provider access still get MET/Yr base weather.
4. Existing `Elta veðrið` route still behaves as intended, or redirects intentionally if that was part of the implementation plan.

## Security Review Checklist

Claude Code must explicitly verify:

- no anon writes;
- no direct authenticated table grants unless separately reviewed;
- RLS enabled on all chat tables;
- no emails in message DTOs;
- no message bodies in server logs;
- no private route origin/destination stored in chat metadata;
- no user GPS stored;
- rate limit on posting;
- report/moderation path exists;
- feature access tested for positive and negative cases.

## Open Decisions For Stebbi

1. Should `/auth-mvp/vedrid/elta-vedrid` remain visible after `/vedurpuls` exists?

Codex recommendation: keep it for internal validation until Veðurpúls is stable, then decide.

2. Should users without `weather-pulse` see read-only pulse counts?

Codex recommendation: no for v1. Keep it hidden until moderation/trust is proven.

3. Should `WEATHER_PULSE_ACCESS_REQUIRED=false` eventually open it to all Veðurstofan-provider users?

Codex recommendation: yes, but not in v1.

4. Should this be marketed publicly immediately?

Codex recommendation: only after the feature is either open broadly or the Facebook text clearly says selected users are testing it.

## Commands Run By Codex

Read-only:

```powershell
Get-Date -Format 'yyyy-MM-dd-HHmm'
Get-ChildItem -File 'ai-handoff' | Select-Object Name,Length | Sort-Object Name | Select-Object -Last 30
Get-Content -Encoding UTF8 'Design.md'
Get-Content -Encoding UTF8 'ai-handoff/2026-07-15-1552-todo-086-v227-codex-vedurpuls-product-handoff.md'
rg -n "elta-vedrid|vedurpuls|Veðurpúls|WEATHER_ELTA_VEDRID_FLAG|feature_access|weather-provider-vedurstofan" app components lib messages sql .env.example
```

Changed:

- Added this handoff file only.

Not run:

- tests
- typecheck
- build
- dev server
- migrations
- Supabase commands
- commit/push/deploy

