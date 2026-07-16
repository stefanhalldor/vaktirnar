# v240 Claude handoff — Veðurpúls Phase 0 plan

Created: 2026-07-15 18:35
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Status: Plan samþykkt, engin kóðabreyting

---

## Samhengi

Útgáfa #86 (full Veðrið release, 63 skrár) var gefin út í dag og staðfest í production.
Næsta verkefni er Veðurpúls — chat/pulse feature á Veðurstofan stöðvar.

Codex spec: `ai-handoff/2026-07-15-1822-todo-086-v239-codex-vedurpuls-on-elta-vedrid-handoff.md`

---

## Ákvarðanir (Phase 0)

### Route

```
/auth-mvp/vedrid/vedurpuls   ← ný leið, sjálfstæð
/auth-mvp/vedrid/elta-vedrid ← haldist óbreytt sem innra validation view
```

Engin redirect í v1.

### Env flags (nýir)

```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Ekki endurnota: `WEATHER_ELTA_VEDRID_FLAG`, `WEATHER_TRIP_FLAG`, `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED`.

### Feature key

```
weather-pulse
```

### Realtime: polling-first

Ekkert Supabase Realtime í v1. Engar authenticated table grants.
- Optimistic send í active panel
- Refetch þráðar eftir send
- Short polling 15 sek meðan panel er opinn
- `refetchOnWindowFocus`

### Access contract (full stack)

```
authenticated session
+ TESKEID_CHAT_ENABLED=true
+ base weather (WEATHER_ENABLED)
+ weather-provider-vedurstofan (feature_access row)
+ weather-pulse (feature_access row)
```

---

## SQL migrations (skrifa, EKKI keyra — Stebbi keyrir sjálfur)

### sql/78_teskeid_chat_core.sql

Stofnar 4 töflur:

| Tafla | Tilgangur |
|-------|-----------|
| `teskeid_chat_threads` | Eitt thread per stable target (domain+target_type+target_id) |
| `teskeid_chat_messages` | Skilaboð, soft-delete, hidden, message_kind |
| `teskeid_chat_read_cursors` | Unread counts per user/thread |
| `teskeid_chat_message_reports` | Moderation frá upphafi |

RLS enabled á öllum. Grant einungis `service_role`. Ekkert til `anon` eða `authenticated`.

### sql/79_feature_access_weather_pulse.sql

Bætir `weather-pulse` við `feature_access_feature_key_check` constraint (idempotent).

**Keyrsluröð:** 78 fyrst, svo 79.

---

## Library/component structure (markmið)

```
lib/chat/
  types.ts                        — ChatThread, ChatMessage, CreateMessageInput, DTOs
  access.server.ts                — checkChatAccess() — validates öll access layers
  repository.server.ts            — getOrCreateThread, listMessages, postMessage, markRead, reportMessage
  adapters/weather.server.ts      — buildWeatherStationTarget() — stationId → ThreadTarget

app/api/teskeid/chat/
  threads/route.ts                — GET (find/create by target), POST
  threads/[threadId]/messages/route.ts
  threads/[threadId]/read-cursor/route.ts
  messages/[messageId]/report/route.ts

components/chat/
  ScopedChatPanel.tsx
  ScopedChatComposer.tsx          — textarea 16px+, quick chips, send
  ScopedChatMessageList.tsx

components/weather/pulse/
  WeatherPulseButton.tsx          — compact entry point á station card (count badge)
  WeatherPulsePanel.tsx           — sets weather context á ScopedChatPanel

app/auth-mvp/vedrid/vedurpuls/
  page.tsx                        — server component, access gate
  VedurpulsClient.tsx             — station list + freshness + pulse per station
```

### Nöfn (naming rules)

```
Core DB/lib = chat (generic)
Weather branding = Veðurpúls / pulse
Feature key = weather-pulse
DB tables = teskeid_chat_*
```

---

## Phases

### Phase 1 — SQL + access, engin UI (NÆSTA SKREF)

Skrifa:
- `sql/78_teskeid_chat_core.sql`
- `sql/79_feature_access_weather_pulse.sql`
- `lib/chat/types.ts`
- `lib/chat/access.server.ts`
- `lib/chat/repository.server.ts`
- `lib/chat/adapters/weather.server.ts`
- Prófanir fyrir öll access layers (positive + negative)
- Static SQL tests (`lib/__tests__/sql-migration.test.ts` viðbætur)

Ekki keyra SQL. Ekki nota UI. Fá Stebbi til að keyra SQL áður en Phase 2.

### Phase 2 — Chat API

- `app/api/teskeid/chat/threads/route.ts`
- `app/api/teskeid/chat/threads/[threadId]/messages/route.ts`
- `app/api/teskeid/chat/threads/[threadId]/read-cursor/route.ts`
- `app/api/teskeid/chat/messages/[messageId]/report/route.ts`
- Prófanir: anon blocked, no weather-pulse blocked, body length, report uniqueness, no email in DTO

### Phase 3 — Chat UI components

- `ScopedChatPanel`, `ScopedChatComposer`, `ScopedChatMessageList`
- Polling, optimistic send, error retry
- Mobile: 360px/390px/460px, engin horizontal overflow, engin zoom á composer

### Phase 4 — Veðurpúls route

- `/auth-mvp/vedrid/vedurpuls/page.tsx` + `VedurpulsClient.tsx`
- Station list + freshness panel (endurnotað frá elta-vedrid/vedurstofan)
- `WeatherPulseButton` + `WeatherPulsePanel` per station

### Phase 5 — Integration í route summary

- Létt pulse entry points á Veðurstofan cards í `/auth-mvp/vedrid`
- "Veðurpúls á leiðinni — 6 stöðvar · 2 með nýjum athugasemdum"
- Ekki full chat feed innan route summary

### Phase 6 — Review + release

- Codex review
- SQL keyrt af Stebbi (78, 79)
- typecheck / test:run / build
- Localhost checks (sjá v239 handoff)
- Explicit deploy approval frá Stebbi

---

## Admin UI (bæta við í Phase 4 eða 5)

Nýr hluti á `/admin` síðu:

```
Veðurpúls
Stjórnar hverjir mega prófa Veðurpúls þegar WEATHER_PULSE_ACCESS_REQUIRED=true.
feature_key = weather-pulse
```

---

## Hvað er EKKI í v1

- Supabase Realtime (polling nægir)
- Authenticated table grants
- Read-only pulse counts fyrir notendur án `weather-pulse`
- `WEATHER_PULSE_ACCESS_REQUIRED=false` graduation
- MET/Yr sampled points sem chat targets (einungis Veðurstofan stations)
- Public marketing fyrr en feature er stable

---

## Opnar spurningar (svarað)

1. `/elta-vedrid` heldur áfram — já, óbreytt sem innra validation view
2. Read-only counts falið í v1 — já
3. Phases í röð — Phase 1 fyrstur áður en áfram

---

## Næstu skref fyrir Claude Code

**Byrja á Phase 1.** Þarf framkvæmdarleyfi frá Stebbi.

Phase 1 afurðir:
1. `sql/78_teskeid_chat_core.sql` — chat töflur
2. `sql/79_feature_access_weather_pulse.sql` — feature key constraint
3. `lib/chat/types.ts` — types + DTOs
4. `lib/chat/access.server.ts` — `checkChatAccess()`
5. `lib/chat/repository.server.ts` — DB operations
6. `lib/chat/adapters/weather.server.ts` — weather station target builder
7. Prófanir (SQL static + access unit tests)

Engin UI. Engin API routes. Engin SQL keyrsla.
