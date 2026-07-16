# v242 Claude handoff — Veðurpúls Phase 1 lokið

Created: 2026-07-15 19:00
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Tests: 86 skrár, 2607 próf — öll ganga
TypeCheck: hreinn

---

## Staða

Phase 1 er lokið. Engin kóðabreyting á UI, engar API routes, ekkert SQL keyrt.

SQL 78 og 79 eru skrifaðar en ÓKEYRÐAR — Stebbi keyrir þær sjálfur í Supabase.

---

## Hvað var gert í Phase 1

### Nýjar skrár

| Skrá | Tilgangur |
|------|-----------|
| `sql/78_teskeid_chat_core.sql` | 4 töflur, RLS service-role-only, message_count trigger |
| `sql/79_feature_access_weather_pulse.sql` | Bætir weather-pulse við feature_access CHECK constraint |
| `lib/chat/types.ts` | ChatThread, MessageDto, ThreadSummaryDto, CreateMessageInput, ReportMessageInput |
| `lib/chat/access.server.ts` | `checkChatAccess(user)` — 5 access layers |
| `lib/chat/repository.server.ts` | getOrCreateThread, listMessages, postMessage, markRead, reportMessage, getThreadSummary |
| `lib/chat/adapters/weather.server.ts` | `buildWeatherStationTarget(stationId)` — validerar gegn registry |
| `lib/__tests__/chat-access.test.ts` | 10 próf — öll access layers, positive og negative |
| `lib/__tests__/chat-repository.test.ts` | 12 próf — með mocked admin client |

### Breyttar skrár

| Skrá | Breyting |
|------|----------|
| `lib/loans/guard.ts` | `weather-pulse` case bætt við (TESKEID_CHAT_ENABLED + WEATHER_PULSE_ACCESS_REQUIRED) |
| `app/api/admin/feature-access/route.ts` | `'weather-pulse'` bætt í ALLOWED_FEATURES |
| `app/(admin)/admin/page.tsx` | Veðurpúls hluti bætt við admin UI, type union uppfærður |
| `lib/__tests__/sql-migration.test.ts` | SQL 78 og 79 static tests bætt við |
| `lib/__tests__/feature-access-api.test.ts` | weather-pulse API próf bætt við |

---

## SQL migrations (Stebbi keyrir í Supabase)

### Röð

1. `sql/78_teskeid_chat_core.sql` — fyrst
2. `sql/79_feature_access_weather_pulse.sql` — á eftir

### Preflight áður en SQL 78 er keyrt

```sql
-- Staðfesta að töflurnar séu ekki þegar til
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'teskeid_chat_%';
```

Búist við: tómt (engar línur). Ef töflur eru þegar til er eitthvað skrýtið.

### Preflight áður en SQL 79 er keyrt

```sql
-- Staðfesta núverandi feature keys í feature_access
select distinct feature_key
from public.feature_access
order by 1;
```

Búist við að sjá einungis: umonnun, tengsl, facebook-oauth, vedrid, ferdalagid, elta-vedrid, weather-provider-vedurstofan.
Ef einhver annar lykill er til þarf að uppfæra SQL 79 áður en hún er keyrð.

### Staðfesting eftir SQL 78

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'teskeid_chat_%'
order by 1;
```

Búist við: 4 línur (teskeid_chat_message_reports, teskeid_chat_messages, teskeid_chat_read_cursors, teskeid_chat_threads).

```sql
select trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and trigger_name = 'teskeid_chat_messages_after_insert';
```

Búist við: 1 lína.

### Staðfesting eftir SQL 79

```sql
select distinct feature_key
from public.feature_access
-- Nota constraint sem við keyrðum:
-- Lína hér að neðan er ekki gild SQL, heldur manual check:
-- Fara í Table Editor → feature_access og skoða CHECK constraint
-- EÐA:
select constraint_name, check_clause
from information_schema.check_constraints
where constraint_schema = 'public'
  and constraint_name = 'feature_access_feature_key_check';
```

Búist við að sjá 'weather-pulse' meðal gilda í check_clause.

---

## Access contract (innleitt)

```
checkChatAccess(user) → ChatAccessResult

1. user?.email         → 'no-session'   ef null/engin email
2. TESKEID_CHAT_ENABLED=true            → 'chat-disabled' ef ekki
3. resolveAuthenticatedWeatherShellAccess(user).mode !== 'blocked'
                                        → 'no-weather' ef blocked
4. checkFeatureAccess(..., 'weather-provider-vedurstofan')
                                        → 'no-vedurstofan' ef false
5. WEATHER_PULSE_ACCESS_REQUIRED === 'false' → 'allowed' (graduated)
   ELSE checkFeatureAccess(..., 'weather-pulse')
                                        → 'no-pulse' ef false
   → 'allowed'
```

Mikilvægt: `resolveAuthenticatedWeatherShellAccess` krefst EKKI private `vedrid` feature row í `WEATHER_ENABLED=All` mode.

---

## Ný Vercel env vars (bæta við þegar tilbúið að kveikja)

```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```

Bæta EKKI við í Vercel fyrr en Phase 4 er tilbúið og SQL hefur verið keyrt. Í bili á þetta að vera óstillt (= chat-disabled).

---

## Phases eftir

### Phase 2 — Chat API routes (næst eftir SQL)

Keyra SQL 78 og 79 fyrst. Svo:

```
app/api/teskeid/chat/threads/route.ts
app/api/teskeid/chat/threads/[threadId]/messages/route.ts
app/api/teskeid/chat/threads/[threadId]/read-cursor/route.ts
app/api/teskeid/chat/messages/[messageId]/report/route.ts
```

Hverri route: `checkChatAccess` + `buildWeatherStationTarget` validation + rate limit á POST.

Prófanir: anon blocked, no weather-pulse blocked, body length, report uniqueness, no email in DTO.

### Phase 3 — Chat UI components

```
components/chat/ScopedChatPanel.tsx
components/chat/ScopedChatComposer.tsx    — textarea 16px+, quick chips
components/chat/ScopedChatMessageList.tsx
components/weather/pulse/WeatherPulseButton.tsx
components/weather/pulse/WeatherPulsePanel.tsx
```

Polling 15 sek á opnum panel. Optimistic send.

### Phase 4 — Integration á /elta-vedrid (fyrsta contextið)

Stebbi vill sjá Veðurpúls efst á veðurspjaldi hverrar Veðurstofan stöðvar á `/elta-vedrid`.

`WeatherPulseButton` á hvern station card í `VedurstofanStationExplorerClient.tsx`.
Opens `WeatherPulsePanel` → `ScopedChatPanel` með `buildWeatherStationTarget(stationId)`.

Feature gate: aðeins sýnilegt ef `checkChatAccess` → 'allowed'.

### Phase 5 — Integration í route summary (/auth-mvp/vedrid)

Létt pulse entry points á Veðurstofan cards í FerdalagidClient.
"Veðurpúls á leiðinni — 6 stöðvar · 2 með nýjum athugasemdum"

### Phase 6 — Codex review + release

Codex review, SQL keyrt (78, 79), typecheck/test/build, localhost checks, explicit approval.

---

## Localhost checks (Phase 1 — engin UI enn)

- Engar UI breytingar í Phase 1
- Keyra `npm run type-check` — á að vera hreinn
- Keyra `npm run test:run` — 86 skrár, 2607 próf á að ganga
- Fara á `/admin` → staðfesta að "Veðurpúls" hluti sýnist undir Feature Access
- Reyna að gefa `teskeid@gottvibe.is` `weather-pulse` aðgang í admin → á að virka eftir SQL 79

---

## Hvað er EKKI í Phase 1

- Engar API routes
- Engin UI
- Engin SQL keyrsla (Stebbi keyrir)
- Engar `/vedurpuls` síður
- Ekkert Vercel env breitt við
