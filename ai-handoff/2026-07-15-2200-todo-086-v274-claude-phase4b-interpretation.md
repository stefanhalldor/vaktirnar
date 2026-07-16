# 2026-07-15 22:00 - TODO-086 v274 - Claude: túlkun á framhaldi (Phase 4B plan)

Created: 2026-07-15 22:00
Timezone: Atlantic/Reykjavik

Þetta er ekki framkvæmdarskjal. Það er túlkun mín á þeim gögnum sem hafa borist:
v264-v273, Stebbi-leiðbeiningar, og núverandi stöðu kóðans.
Framkvæmdarleyfi þarf sérstaklega frá Stebbi áður en eitthvað er breytt.

---

## 1. Núverandi staða

### Phase 4A — commit-ready, ÓCOMMITTAÐ

Typecheck: ✓ Tests: 88 skrár, 2694 standast.

**Ócommittaðar skrár sem EIGA að vera í Phase 4A commit:**

Nýjar skrár:
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `components/chat/ChatMessageRow.tsx`
- `components/chat/ScopedChatPanel.tsx`
- `lib/__tests__/vedurpuls-feed.test.ts`

Breyttar skrár:
- `lib/chat/types.ts`
- `lib/chat/repository.server.ts`
- `lib/__tests__/chat-repository.test.ts`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `messages/en.json`
- `messages/is.json`

**Skrár sem EÁ að vera í Phase 4A commit:**
- `TODO.md`, `WORKFLOW.md` (aðskildar, commits-a þegar Stebbi vill)
- `.claude/`, `.obsidian/`, `ai-handoff/` directories

**Localhost checklist fyrir Stebbi (v272):**

Preconditions: `TESKEID_CHAT_ENABLED=true`, notandi með `elta-vedrid`, `weather-provider-vedurstofan`, `weather-pulse`. `display_name` í `profiles` til að sjá höfundanöfn.

1. Opna `/auth-mvp/vedrid/elta-vedrid`
2. Velja stöð
3. Staðfesta að Veðurpúls birtist EFST á stöðvarspjaldinu (ekki neðst)
4. Opna Veðurpúls — staðfesta að nýjustu 10 skilaboðin birtast (ekki elstu)
5. Ef >10 skilaboð: staðfesta að "Sækja eldri" hnappur birtist efst
6. Smella á "Sækja eldri" — staðfesta að eldri skilaboð birtast á undan, síðan hoppar ekki til botns
7. Senda skilaboð — staðfesta að panel scrollar til botns, síðan hoppar EKKI
8. Staðfesta að höfundanafn og 24h tímastimpill sjást
9. Opna Safnpúls — staðfesta að nýjustu skilaboð birtast fyrst
10. Prófa mobile 360-390px — ekkert overflow, input nothæft
11. Notandi án `weather-pulse` — Veðurpúls og Safnpúls eru falin

---

## 2. Aðgangsstýring — ákvörðun Stebbi

Tvær stillingar til að velja á milli. Engar kóðabreytingar þarf — bara `.env`:

**Stilling A: Stjórnað próf (núverandi)**
```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=true
```
Krefst `weather-pulse` feature_access röðar per notanda. Heppilegt á meðan við erum að prófa.

**Stilling B: Opið fyrir alla Veðurstofan-notendur**
```env
TESKEID_CHAT_ENABLED=true
WEATHER_PULSE_ACCESS_REQUIRED=false
```
`weather-pulse` per-user röð er sniðgenginn. Allir sem hafa `weather-provider-vedurstofan` komast inn.

Samkvæmt v272: báðar stillingar ganga án kóðabreytinga. Stilling B opnar Veðurpúls fyrir alla sem hafa Veðurstofan-aðgang — Stebbi þarf að ákveða hvenær.

`weather-pulse` feature key er engu að síður nytsamleg sem "kill switch" til að loka leið fyrir einstaklinga eða meðan við settum upprunalega.

---

## 3. Phase 4B — Túlkun mín á skipulagi

### 3.1 Kjarnamarkmiðið

Veðurpúls fær eigin URL. Stöðvarspjöld sýna aðeins stutta preview (3 nýjustu), með hnappi til að fara á heila pulse-síðu.

### 3.2 Ný route

```
/auth-mvp/vedrid/puls/stod/[stationId]
```

Dæmi:
```
/auth-mvp/vedrid/puls/stod/31392
/auth-mvp/vedrid/puls/stod/31488
```

Þetta þarf:
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx` — Next.js server component (auth check)
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` — client component

### 3.3 Ný generic component: `ChatPreviewList`

**Skrá:** `components/chat/ChatPreviewList.tsx`

Sýnir N nýjustu skilaboð (stillt með `count` prop, default 3). Ekkert weather-tengt. Engin send-input. Mögulega hægur poll (30s). Stöðug hæð, engin automatic scroll.

```tsx
interface ChatPreviewListProps {
  messages: AugmentedChatMessage[]
  deletedLabel: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
  emptyLabel: string
}
```

Þetta er lesaðeins útgáfa af `ChatMessageRow` listanum úr `ScopedChatPanel` — en án input og send-logic.

### 3.4 Breyting á stöðvarspjaldi

`WeatherPulsePanel` í `VedurstofanStationExplorerClient.tsx` er endurskipulögð:

**Núverandi:** inline full chat panel (opna/loka toggle, 10 skilaboð, Sækja eldri, input)

**Phase 4B:** preview + link

```tsx
function WeatherPulseSummary({ stationId, stationName }: { ... }) {
  // 1. Init thread (sama og núna)
  // 2. Poll latest 3 messages via loadMessages(threadId, { limit: 3 })
  // 3. Render ChatPreviewList með 3 skilaboðum
  // 4. Link: "Opna Veðurpúls" → /auth-mvp/vedrid/puls/stod/[stationId]
}
```

Þetta þýðir að `WeatherPulsePanel` er skipt út fyrir `WeatherPulseSummary` á stöðvarspjaldinu. `ScopedChatPanel` heldur áfram að vera notað á fullu pulse-route.

### 3.5 Fullu pulse-route layout

```
/auth-mvp/vedrid/puls/stod/[stationId]
─────────────────────────────────────────
← Elta Veðrid

[stöðvarheiti] ● [staða]

[Nýjustu veðurgögn — sama og á stöðvarspjaldi]
  - atime (forecast cycle time)
  - vindur, hiti, úrkoma (latest row)
  - staleness indicator

─────────────────────────────────────────
[Veðurpúls — ScopedChatPanel pageSize={50}]
  [Sækja eldri] (ef þarf)
  skilaboð...
  skilaboð...
  [input box]
  [Senda]
─────────────────────────────────────────
```

### 3.6 Veðurgögn á pulse-route

**Vandinn:** Núverandi `/api/teskeid/weather/vedurstofan/stations` skilar ÖLLUM stöðvum (dýrt að sækja allt fyrir eina stöð).

**Lausn sem ég mæli með:** Ný einstaklingsenda:
```
/api/teskeid/weather/vedurstofan/stations/[stationId]
```

Sama auth-check og `/stations` (vedrid + elta-vedrid), en skilar einungis einni stöð. Notar sama `buildStationExplorerResponse` / `readVedurstofanProductForStations` kóðann en filterar á einni stöð.

**Varaúrræði ef við viljum ekki nýja route strax:** Sækja thread-gögn úr thread DTO (þar er `target_name` og `lat/lon`) og sýna minnsta stöðvarinfo (nafn, hlekkur á vedur.is). Veðurgögn bíða þar til dedikuð route er til.

Ég mæli með nýrri route — stöðvargögnin eru mikilvæg samhengi á pulse-síðunni.

### 3.7 Transport á pulse-route

`VEDURPULS_TRANSPORT` er þegar module-level constant. Á pulse-route mun `VedurstofanPulsClient` nota sama transport (eða sameina í `@/lib/chat/vedurpuls.transport.ts` ef við viljum deila á milli síðna).

Til að hafa `pageSize={50}` á fullu síðunni:
```tsx
<ScopedChatPanel
  threadId={threadId}
  transport={VEDURPULS_TRANSPORT}
  labels={panelLabels}
  pageSize={50}
/>
```

Engin kóðabreyting á `ScopedChatPanel` eða transport — þetta gengur þegar.

### 3.8 Auth á pulse-route

`page.tsx` (server component) gerir:
1. `checkChatAccess(user)` — sama gate og Veðurpúls API
2. Ef `no-session` → redirect til login með `callbackUrl=/auth-mvp/vedrid/puls/stod/[stationId]`
3. Ef `no-pulse` / `no-vedurstofan` → 403 page eða redirect til `/auth-mvp/vedrid`
4. Ef `allowed` → render `VedurstofanPulsClient`

---

## 4. Hvað er EKKI í Phase 4B

### Phase 4C — Realtime

Supabase Realtime subscriptions á `teskeid_chat_messages` — bíður til Phase 4C.

Í Phase 4B: poll (15s eins og núna á panel, 30s á preview/Safnpúls).

### Phase 4C — "Nýr púls" affordance

Þegar nýtt skilaboð berst á meðan notandi er að lesa eldri skilaboð — "Nýr púls" hnappur neðst í stað þess að skrolla með valdi. Þetta þarf realtime og er Phase 4C.

### Phase 4C — System messages / veðurbreytingar

Hugmyndin um sjálfkrafa skilaboð þegar `windCategory` breytist o.fl. er mjög góð, en þarf sér reglur (idempotency, hverjir senda, hvenær). Ekki í Phase 4B.

### Safnpúls á nýrri route

`WeatherPulseFeed` er áfram á `/auth-mvp/vedrid/elta-vedrid` (yfir summary strip). Safnpúls-link á fullu pulse-route bíður.

---

## 5. Opnar spurningar — þarf svar frá Stebbi

### 5.1 Access model (v272)
- Stilling A (WEATHER_PULSE_ACCESS_REQUIRED=true, per-user `weather-pulse`) eða
- Stilling B (WEATHER_PULSE_ACCESS_REQUIRED=false, allir Veðurstofan-notendur)?

Þetta er env-breyting, engin kóðabreyting. Má gera hvenær sem er.

### 5.2 Stöðvargögn á pulse-route
- Vil Stebbi veðurgögn (spá, atime, staleness) á fullu pulse-route?
- Ef já: við þurfum nýja `/api/.../stations/[stationId]` route. Má ég gera það?
- Ef nei (bara nafn + hlekkur): mun einfaldara, notum `target_name` úr thread.

### 5.3 URL-form
- `/auth-mvp/vedrid/puls/stod/[stationId]` — samþykkt?
- Eða `/auth-mvp/vedrid/elta-vedrid/puls/[stationId]` (innan explorer)?

Ég mæli með fyrri möguleikann — standalone route er auðveldara að deila og nota sem callback.

### 5.4 Veðurpúls á stöðvarspjaldi eftir Phase 4B
- Hverfa inline chat alveg og skipta út fyrir preview + link?
- Eða halda báðum (inline toggle + link)?

Ég mæli með að skipta út — v273 segir "Do not keep the current inline mini-chat as the final shape if it causes layout movement."

### 5.5 Safnpúls á pulse-route
- Á Safnpúls að vera hlekk/button á pulse-route?
- Eða heldur hún einungis til húsa á explorer-síðunni?

---

## 6. Ráðlagður commit-sequence

```
1. Commit Phase 4A (hér og nú, eftir localhost checks)
   Files: sjá §1

2. Env-breyting (Stilling A eða B) — aðskilin, Stebbi ákveður

3. Phase 4B commit (eftir framkvæmdarleyfi)
   - Ný route: /auth-mvp/vedrid/puls/stod/[stationId]
   - Ný component: ChatPreviewList
   - Ný API route: /api/teskeid/weather/vedurstofan/stations/[stationId]
   - Modified: VedurstofanStationExplorerClient (preview í stað inline chat)
   - Modified: messages/en.json, messages/is.json

4. Phase 4C commit (síðar)
   - Realtime
   - "Nýr púls" affordance
   - System messages
```

---

## 7. Yfirlit yfir hlutverkaskiptingu eftir Phase 4B

```
components/chat/
  ChatMessageRow.tsx        ← generic row (committed in 4A)
  ChatPreviewList.tsx       ← generic N-message preview (4B)
  ScopedChatPanel.tsx       ← generic full panel (committed in 4A)

app/auth-mvp/vedrid/
  elta-vedrid/
    VedurstofanStationExplorerClient.tsx
      WeatherPulseSummary   ← 3-message preview + link (4B, replaces WeatherPulsePanel)
      WeatherPulseFeed      ← Safnpúls (committed in 4A, unchanged in 4B)
  puls/stod/[stationId]/
    page.tsx                ← server component, auth check (4B)
    VedurstofanPulsClient.tsx ← full pulse view, station context (4B)

app/api/auth-mvp/vedurpuls/
  thread/, messages/, read/, report/, feed/   ← all committed in 4A, unchanged

app/api/teskeid/weather/vedurstofan/
  stations/route.ts         ← existing, all stations
  stations/[stationId]/route.ts ← new in 4B (single station)

lib/chat/
  types.ts, repository.server.ts, api.server.ts, access.server.ts  ← committed in 4A
```

---

## 8. Hvernig Phase 4B verður framkvæmd þegar Stebbi gefur leyfi

Tillaga að röð:

1. `/api/teskeid/weather/vedurstofan/stations/[stationId]` route (server, auth-gated, single station)
2. `components/chat/ChatPreviewList.tsx` (generic, no weather terms)
3. `WeatherPulseSummary` í `VedurstofanStationExplorerClient.tsx` (replace WeatherPulsePanel)
4. `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx` (server component, auth)
5. `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx` (full view)
6. i18n keys
7. Tests
8. Handoff

Allt í einni Phase 4B commit.
