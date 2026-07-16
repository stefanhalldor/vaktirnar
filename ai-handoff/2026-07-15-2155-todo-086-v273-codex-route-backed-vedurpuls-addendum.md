# 2026-07-15 21:55 - TODO-086 v273 - Codex addendum: route-backed Veðurpúls

Created: 2026-07-15 21:55
Timezone: Atlantic/Reykjavik

## Context

This addendum builds on:

- `2026-07-15-2151-todo-086-v272-codex-v271-pagesize-and-pulse-access-review.md`

Stebbi has not sent v272 to Claude Code yet.

New product direction from Stebbi:

- Veðurpúls should have its own URL so a user can be sent directly to a specific pulse.
- The pulse URL should also show the relevant Veðurstofan station/weather values.
- Station cards should show only a small preview, likely latest 3 pulses.
- Full pulse view can show the latest 50 messages.
- New pulse updates should arrive realtime without making the surrounding weather UI jump.
- It may be useful to create system messages/events when Veðurstofan forecast values change.

## Recommended product shape

Use a route-backed full pulse view.

Recommended route shape:

```text
/auth-mvp/vedrid/puls/stod/[stationId]
```

Examples:

```text
/auth-mvp/vedrid/puls/stod/31392
/auth-mvp/vedrid/puls/stod/31488
```

Why route-backed instead of only inline overlay:

- Direct links work.
- Users can share a specific station pulse.
- Login can redirect back to the exact station pulse.
- Safnpúls can link to a station thread.
- Later Vegagerdin points can use the same pattern.
- The UI can still look like a full-screen overlay/mobile app screen even if it is route-backed.

## Station card behavior

On each Veðurstofan station card:

- show latest 3 pulse messages only;
- keep the preview height stable;
- avoid auto-scrolling the whole card;
- if realtime brings in a new message, either:
  - replace the preview list in place with latest 3; or
  - show a small "Nýr púls" affordance that the user taps to refresh/open;
- add a clear button/link: `Opna Veðurpúls`.

Do not keep the current inline mini-chat as the final shape if it causes layout movement or hides the route-backed full experience.

## Full pulse route behavior

The full station pulse page should include:

1. Station identity:
   - station name
   - station id
   - distance/route context if opened from a route
   - link to vedur.is when available

2. Current/latest Veðurstofan data:
   - latest forecast rows relevant to the station
   - forecast cycle time / `atime`
   - fetched/updated metadata if available
   - same staleness language/rules as the weather UI

3. Full chat/pulse thread:
   - latest 50 messages by default;
   - `Sækja eldri` if there are more;
   - realtime subscription for new messages;
   - posting available only to signed-in users who pass `checkChatAccess()`;
   - report/delete/hidden redaction as already planned.

## Reusable chat architecture

Keep the reusable split:

- `ChatPreviewList` or similar generic component:
  - renders latest N messages;
  - no weather terms;
  - stable height option;
  - can be used on station cards, future Vegagerdin cards, and other Teskeid contexts.

- `ScopedChatPanel` / `ChatThreadView`:
  - full thread behavior;
  - page size configurable;
  - load older;
  - send message;
  - realtime optional or injected;
  - no weather terms.

- Veðurpúls wrapper:
  - owns `vedurpuls` routes;
  - owns Veðurstofan station context;
  - owns weather copy and labels;
  - injects transport/scope/labels into chat core.

Do not duplicate a separate weather-only chat UI if the generic chat core can do it with props/transport.

## Realtime recommendation

For previews:

- Subscribe to new messages for the relevant thread(s).
- Keep preview capped to 3 messages.
- Avoid scroll-to-bottom behavior in preview.
- If a new message arrives while the user is reading, prefer a small non-jumpy indicator over moving focus.

For full route:

- Realtime can append new messages at the bottom.
- If user is near bottom, auto-scroll within the message container.
- If user has scrolled up, show "Nýr púls" / "New messages" affordance instead of forcing scroll.

This pattern avoids the weather page jumping while still making pulse feel live.

## System messages / weather value changes

Stebbi's idea is promising, but it needs a careful data model so we do not flood chat threads.

Recommended first implementation:

- Do not insert a system message for every tiny forecast change.
- Start with a lightweight, deduplicated system event only when a meaningful change happens, for example:
  - wind category changes across user thresholds;
  - station becomes stale/fresh again;
  - Veðurstofan publishes a new forecast cycle for that station;
  - weather status changes from "innan marka" to "nálgast óþægindi", "óþægilegt", or "hættulegt".

Current `ChatMessageKind` already includes `system`, but before using it heavily:

- define exactly who creates system messages;
- make them idempotent per station + cycle + event type;
- keep message body deterministic and short;
- consider storing structured metadata later if we need richer rendering;
- ensure system messages cannot be spoofed by users. User POST already blocks `system`, which is good.

Potential first system message copy:

```text
Veðurstofan birti nýja spá fyrir Hellisheiði kl. 18:00.
```

Potential threshold message:

```text
Vindur fór úr „nálgast óþægindi“ í „óþægilegt“ í nýjustu spá.
```

I recommend treating system messages as Phase 4C or later, after route-backed pulse and preview are stable.

## Access model

Stebbi's preferred model:

```text
Veðurpúls = authenticated user + base weather access + Veðurstofan provider access + TESKEID_CHAT_ENABLED=true
```

That means:

```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=false
```

The existing `checkChatAccess()` already supports this model:

- public/anonymous users still fail with `no-session`;
- users without Veðurstofan provider access still fail with `no-vedurstofan`;
- the separate `weather-pulse` per-user row is skipped only when `WEATHER_PULSE_ACCESS_REQUIRED=false`.

Do not remove the `weather-pulse` feature key immediately. It is still useful as a temporary testing gate and rollback lever while the product settles.

## Suggested next Claude Code scope

Do not mix this into the already commit-ready Phase 4A unless Stebbi wants to reopen it.

Recommended next phase:

### Phase 4B - Route-backed Veðurpúls

1. Keep current reusable chat core.
2. Add route-backed station pulse page:

```text
/auth-mvp/vedrid/puls/stod/[stationId]
```

3. Reuse existing Veðurstofan station/weather fetchers where possible.
4. Render station/weather context at top.
5. Render reusable full chat view below.
6. On station cards, replace inline full chat with latest-3 preview + `Opna Veðurpúls`.
7. Keep all API access through `checkChatAccess()`.
8. Do not add system weather-change messages yet unless Stebbi explicitly scopes that in.

### Phase 4C - Realtime and system events

1. Add realtime subscription to preview/full route.
2. Add non-jumpy "new pulse" behavior.
3. Decide whether weather value changes should become system messages.
4. If yes, implement idempotent system-event generation.

## Localhost checks for Stebbi

For Phase 4B route-backed pulse:

1. Open `/auth-mvp/vedrid/elta-vedrid`.
2. Select a Veðurstofan station.
3. Confirm the station card shows only latest 3 pulse messages, not the full thread.
4. Click `Opna Veðurpúls`.
5. Confirm URL changes to a direct station pulse URL.
6. Refresh the URL directly and confirm it still opens the same station pulse.
7. Confirm station/weather values are visible at top of the pulse page.
8. Confirm latest 50 pulse messages are shown in the full route.
9. Send a pulse message and confirm it appears without page jump.
10. Copy URL, open in a new tab while logged in, and confirm direct navigation works.
11. Open same URL logged out; expected: login/auth handling, not public pulse access.
12. Log in as a user without Veðurstofan provider access; expected: no pulse access.

For later realtime:

1. Open same station pulse in two browsers/users.
2. Send a message in one.
3. Confirm the other receives it without manual refresh.
4. Confirm station card preview does not jump the whole weather layout.

## Recommendation

Send Claude Code v272 plus this v273 addendum before asking for more implementation.

Main instruction to Claude Code:

> Keep Phase 4A commit small if it is already ready. Treat route-backed Veðurpúls, latest-3 previews, realtime, and system weather events as the next separate phase. Do not fork chat UI. Keep Chat reusable and make Veðurpúls a product adapter around it.

## Óvissa / þarf að staðfesta

- Exact final URL can be adjusted, but it should be route-backed and auth-aware.
- Need to confirm whether route-backed pulse should live under `/auth-mvp/vedrid/...` only, or later also expose a friendly `/vedrid/puls/...` entry that redirects signed-in users.
- System weather-change messages need separate rules before implementation to avoid noisy threads.
