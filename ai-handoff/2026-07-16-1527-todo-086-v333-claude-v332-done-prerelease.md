# TODO-086 v333 - Claude: v332 framkvæmt, tilbúið til prerelease

Created: 2026-07-16 15:27
Timezone: Atlantic/Reykjavik

TODO atriði: #086 (Veðurpúls / chat-core)

---

## Hvað var samþykkt

Stebbi sendi v332 handoff (`2026-07-16-1456-todo-086-v332-codex-v331-chat-core-realtime-addendum.md`) með `Workflow` og gaf framkvæmdarleyfi.

---

## Hvað var gert

### 1. Route Safnpúls titill uppfærður

- `messages/is.json`: `safnpulsRouteTitle` → `"Nýjast frá notendum Teskeið.is"`
- `messages/en.json`: `safnpulsRouteTitle` → `"Latest from Teskeið.is users"`

### 2. Nýr shared hook: `useChatPreview`

Ný skrá: `components/chat/useChatPreview.ts`

- Tekur `url` og `pollingIntervalMs` (sjálfgefið 30 000 ms)
- Sækir preview við mount, síðan polling
- Hlustnar á `teskeid:pulse:refresh` custom window event og endursækir strax þegar það berst (same-tab refresh eftir send)
- Endurræsir effect þegar `url` breytist

### 3. `ScopedChatTransport` fékk `subscribe?`

`components/chat/ScopedChatPanel.tsx`:

- Nýr optional aðili á transport: `subscribe?(threadId: string, onNewMessage: () => void): () => void`
- Panel kallar `transport.subscribe?.(threadId, loadMessages)` eftir initial load
- Polling heldur áfram sem fallback óháð Realtime
- Unsubscribe kallað í cleanup

### 4. Supabase Realtime í `vedurpulsTransport`

`app/auth-mvp/vedrid/vedurpulsTransport.ts`:

- Innflutt `createClient` frá `@/lib/supabase/client`
- Útfærð `subscribe` með `postgres_changes` á `teskeid_chat_messages`, filter `thread_id=eq.${threadId}`
- Re-fetch frá server við event (treystir ekki Realtime payload — tryggir RLS, hidden/deleted state)
- `removeChannel` í unsubscribe fallback

### 5. `VedurstofanPulseInline` endurskipulagt

`components/weather/VedurstofanPulseInline.tsx`:

- Handvirk preview `useEffect` + polling fjarlægð
- Notar nú `useChatPreview({ url: .../preview })` í staðinn
- `handleSend` sendir `window.dispatchEvent(new Event('teskeid:pulse:refresh'))` eftir send í stað handvirkrar re-fetch — þetta hreyfast bæði inline preview og route Safnpúls í sama glugga

### 6. `VedurstofanRoutePulseSummary` — cap + polling + event

`components/weather/VedurstofanRoutePulseSummary.tsx`:

- `MAX_STATION_IDS = 40` fasti bætt við með skýringu
- Sendir aðeins fyrstu 40 stöðvar í leiðarröð í POST (kemur í veg fyrir stöðugan 400 á löngum leiðum)
- 30 s polling bætt við
- Hlustnar á `teskeid:pulse:refresh` og endursækir strax

### 7. Hólmavík tests í `weather-google.test.ts`

`lib/__tests__/weather-google.test.ts`:

6 nýjar prófanir undir `// ── Curated Vestfirðir / Hólmavík route`:

1. Reykjavík → Ísafjörður kveikir `CURATED_VIA_HOLMAVIK`
2. Curated beiðni notar rétt `HOLMAVIK_VIA` hnit (lat 65.703, lon -21.685) með `via: true`
3. Reykjavík → Akureyri kveikir EKKI `CURATED_VIA_HOLMAVIK`
4. Stutt ferð til Ísafjarðar (< 180 km) gerir enga curated beiðni
5. `CURATED_VIA_HOLMAVIK` er kæft þegar grunnleið fer þegar um Hólmavík (og curated er ekki hraðari)
6. `CURATED_VIA_HOLMAVIK` er haldið þegar grunnleið fer EKKI um Hólmavík

**Tæknilegt athugasemd:** `COORDS_VIA_HOLMAVIK` er 37 punkta fylki (37 × 5 000 m = 185 km > `minFastestRouteDistanceM: 180 000`) þar sem punkt nr 18 er nákvæmlega við `HOLMAVIK_VIA`. Þetta er nauðsynlegt þar sem prófunin þarf bæði nóg fjarlægð til að kveikja regluna OG nánd til að kveikja duplicate-filter.

---

## Skrár breyttar

- `messages/is.json`
- `messages/en.json`
- `components/chat/useChatPreview.ts` (ný skrá)
- `components/chat/ScopedChatPanel.tsx`
- `app/auth-mvp/vedrid/vedurpulsTransport.ts`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/weather/VedurstofanRoutePulseSummary.tsx`
- `lib/__tests__/weather-google.test.ts`

---

## Skipanir keyrðar

- `npx tsc --noEmit` — hreint, engar villur
- `npx vitest run lib/__tests__/weather-google.test.ts` — 93/93 prófanir standast
- `npx vitest run` (full suite) — 2 803 prófanir standast; 2 pre-existing failures í `weather-travel-api.test.ts` (SUPABASE_SERVICE_ROLE_KEY ekki sett í prófunarumhverfi, staðfest með git stash að þessar bilanir eru ekki frá þessum breytingum)

---

## Hvað var EKKI gert

- Engin SQL eða migration
- Engar env-breytingar
- Engar Supabase policy-breytingar
- Engar breytingar á veðurútreikningum eða scoring
- Enginn commit, push, deploy

---

## Óvissa / þarf að staðfesta

### A. HOLMAVIK_VIA hnit óstaðfest

`HOLMAVIK_VIA = { lat: 65.703, lon: -21.685 }` er merkt "verify visually before release" í kóðanum. Þetta er á Route 61 en hefur ekki verið staðfest á localhost. Stebbi þarf að skoða á korti hvort þetta sé á réttum stað á leiðinni gegnum Hólmavík.

### B. Hólmavík uppruni-umfang er þrengra en hugsanlega æskilegt

Núverandi regla krefst uppruna í `CAPITAL_AREA_BOUNDS`. Þetta leysir Reykjavík → Ísafjörður en v332 benti á að Stebbi gæti hafa meint víðara umfang. Þetta er skráð sem v1 og þarf staðfestingu frá Stebba áður en breytt er.

### C. Realtime publication config óstaðfest

`subscribe` í transport notar `postgres_changes` á `teskeid_chat_messages`. Þetta krefst að taflan sé birt í Supabase Realtime publication. Þarf að staðfesta í Supabase Console að þetta virki í raun á dev/prod. Ef það virkar ekki, heldur polling áfram sem fallback — engin UX-breyting, en Realtime virkar einfaldlega ekki.

---

## Localhost checks fyrir Stebbi

### 1. Route Safnpúls titill

- Opna `/vedrid`, reikna leið með nokkrum Veðurstofan-stöðvum
- Ef skilaboð eru á stöðvum á leiðinni: titillinn á að vera `Nýjast frá notendum Teskeið.is`
- Á ensku: `Latest from Teskeið.is users`

### 2. Same-tab refresh eftir send

- Innskráður notandi, stöðvarkort á leiðinni opið
- Skrifaðu skilaboð og sendu
- **Búist við:** bæði stöðvarkortið og route Safnpúls uppfærast strax án page reload — af `teskeid:pulse:refresh` event

### 3. Cross-tab Realtime

- Opna `/auth-mvp/vedrid/puls/stod/[stationId]` í tveimur gluggum (eða tveimur vöfrum)
- Í öðrum glugganum: sendu skilaboð á púls-síðuna
- **Búist við:** fyrsti glugginn uppfærist sjálfkrafa (Supabase Realtime subscription í `ScopedChatPanel`). Ef Realtime er ekki stillt í Supabase, kemur uppfærslan þess í stað í næstu polling-hringrás (15 s)

### 4. Leiðar með > 40 stöðvar

- Finna leið sem skilar mörgum Veðurstofan-stöðvum (t.d. langa leið þvert yfir landið)
- **Búist við:** route Safnpúls hverfur EKKI (cap við 40 stöðvar í leiðarröð, ekki 400-villa)
- Ef áður hvarf route Safnpúls á langri leið er þetta lagfæring

### 5. Hólmavík valkostur

- Reykjavík → Ísafjörður: `Gegnum Hólmavík` valkostur á að koma fram í Route Selection
- Reykjavík → Akureyri: `Gegnum Hólmavík` á EKKI að koma fram
- Ef Google grunnleið fer þegar um Hólmavík-göngin: duplicate filter á að kæfa curated

### 6. Polling fallback

- Í þriðja glugga (ekki innskráður): opna stöðvarkort með skilaboðum
- Bíddu 30 sek: route Safnpúls á að endurhlaðast (polling á 30 s)
- Sannreyna að engin villur séu í console

### 7. Engar regressions

- Stöðvarkort án skilaboða (og án innskráðs notanda) á enn að fela Veðurpúls hlutann
- `Sjá fleiri skilaboð` hlekkurinn hlær pending-stíl meðan á hleðslu stendur
- Spágildi á púls-síðunni (`/puls/stod/[stationId]`) birtast enn rétt

---

## Næstu skref

Þetta fer til Codex eða Stebba til prerelease-yfirferðar. Hólmavík hnit þarf sérstaklega að skoða á korti.
