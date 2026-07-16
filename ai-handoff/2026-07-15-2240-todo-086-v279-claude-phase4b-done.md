# 2026-07-15 22:50 - TODO-086 v279 - Claude: Phase 4B done

Created: 2026-07-15 22:50
Timezone: Atlantic/Reykjavik

## Scope

Phase 4B: route-backed Veðurpúls + station-card preview. Copy changes from v278 already applied in this session.

## Breytingar

### Nýjar skrár

**`app/auth-mvp/vedrid/vedurpulsTransport.ts`**

Flytt `VEDURPULS_TRANSPORT` úr `VedurstofanStationExplorerClient.tsx` í sameigindlega einingu. Bæði `VedurstofanStationExplorerClient` og `VedurstofanPulsClient` nota nú þetta sama transport object.

**`components/chat/ChatPreviewList.tsx`**

Nýr generic lesaðeins-listi:
```tsx
interface ChatPreviewListProps {
  messages: AugmentedChatMessage[]
  emptyLabel: string
  deletedLabel: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
  loaded: boolean  // suppresses empty label until first fetch completes
}
```
Sýnir `null` á meðan `loaded=false` (enginn empty flash). Þegar `loaded=true` og `messages.length=0`: sýnir emptyLabel. Annars: `ChatMessageRow` listi.

**`app/auth-mvp/vedrid/puls/stod/[stationId]/loading.tsx`**

Afrit af `app/auth-mvp/vedrid/loading.tsx` — `TeskeidLoader` með `teskeid.loader` þýðingum.

**`app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`**

Server component. Auth chain:
1. `guardTeskeidSession()` → `{ user }`
2. `guardFeatureAccess(user.email!, 'vedrid')`
3. `guardFeatureAccess(user.email!, 'elta-vedrid')`
4. `checkChatAccess(user)` — ef ekki `'allowed'` → `redirect('/auth-mvp/vedrid/elta-vedrid')`
5. `VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.stationId === stationId)` — ef ekki fundið → `notFound()`
6. Renderar `<VedurstofanPulsClient stationId={...} stationName={...} />`

**`app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`**

Client component. Init thread á mount. Sýnir:
- Til baka-tengill → `/auth-mvp/vedrid/elta-vedrid`
- `stationName` sem heading, `pulseOpen` sem undirtitill
- Loading/error/access-denied states
- `ScopedChatPanel` með `pageSize={50}` og `listClassName="...max-h-[calc(100vh-16rem)]..."` þegar `threadId` er til.

### Breyttar skrár

**`components/chat/ScopedChatPanel.tsx`**

Bætti við `listClassName?: string` prop. Scrollable lista-div notar `listClassName ?? 'flex flex-col gap-2 max-h-56 overflow-y-auto pr-0.5'`. Leyfir full-page pulse route að nota hærri lista á meðan station-card preview (ChatPreviewList) er óháð þessu.

**`app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`**

- Fjarlægt `VEDURPULS_TRANSPORT` const (flutt í `vedurpulsTransport.ts`)
- Fjarlægt `ScopedChatPanel` og `ScopedChatTransport` import
- Bætt við `AugmentedChatMessage` import frá `ChatMessageRow`
- Bætt við `ChatPreviewList` import
- Bætt við `VEDURPULS_TRANSPORT` import frá `vedurpulsTransport`
- **`WeatherPulsePanel` → `WeatherPulseSummary`**: enginn input, sýnir max 3 skilaboð via `ChatPreviewList`, polling 30s, + `Link` → `/auth-mvp/vedrid/puls/stod/${stationId}` með texta `pulseOpenFull`
- `StationDetail` kallar nú `<WeatherPulseSummary>` í stað `<WeatherPulsePanel>`

### Þýðingar (from v278 — already applied)

`messages/is.json`:
```json
"pulseOpenFull": "Opna púlsinn",
"pulseAccessDenied": "Þú hefur ekki aðgang að Veðurpúls.",
"pulseEmpty": "Engar umferðarfréttir ennþá. Vertu fyrst/ur til að deila þinni upplifun af aðstæðunum.",
"pulseInputPlaceholder": "Hjálpaðu öðrum með því að deila þinni upplifun af aðstæðunum"
```

`messages/en.json`:
```json
"pulseOpenFull": "Open the pulse",
"pulseAccessDenied": "You do not have access to Veðurpúls.",
"pulseEmpty": "No traffic reports yet. Be the first to share your experience of the conditions.",
"pulseInputPlaceholder": "Help others by sharing your experience of the conditions"
```

## Test Results

```
npm run type-check: no errors
npm run test:run: 88 test files, 2694 passed / 27 skipped / 8 todo
```

## Commit boundary (Phase 4A + 4B combined)

Nýjar skrár:
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `app/auth-mvp/vedrid/vedurpulsTransport.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/loading.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `components/chat/ChatMessageRow.tsx`
- `components/chat/ChatPreviewList.tsx`
- `components/chat/ScopedChatPanel.tsx`
- `lib/__tests__/vedurpuls-feed.test.ts`

Breyttar:
- `lib/chat/types.ts`
- `lib/chat/repository.server.ts`
- `lib/__tests__/chat-repository.test.ts`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `messages/en.json`
- `messages/is.json`

Ekki í commit: `TODO.md`, `WORKFLOW.md`, `.claude/`, `.obsidian/`, `ai-handoff/`

## Localhost checks fyrir Stebbi

Preconditions: `TESKEID_CHAT_ENABLED=true`, notandi með `elta-vedrid`, `weather-provider-vedurstofan` (+ `WEATHER_PULSE_ACCESS_REQUIRED=false` eða `weather-pulse` row).

### Station-card preview

1. Opna `/auth-mvp/vedrid/elta-vedrid`
2. Velja stöð
3. **Staðfesta: enginn input-kassi á stöðvarkorti**
4. Veðurpúls-haus sýnir `MessageSquare` icon + "Veðurpúls"
5. **Meðan fetch er í gangi: "Sæki..." birtist** (aldrei tómt)
6. Ef skilaboð eru til: max 3 nýjustu birtast (engin "Sækja eldri")
7. Ef engin skilaboð: "Engar umferðarfréttir ennþá..." birtist AÐEINS eftir fetch er lokið
8. Tengill "Opna púlsinn" er alltaf sýnilegur

### Full pulse route

8. Smella á "Opna púlsinn"
9. **Staðfesta: URL breytist í `/auth-mvp/vedrid/puls/stod/[stationId]`**
10. Stöðvarheiti birtist sem heading, "Veðurpúls" sem undirtitill
11. Til baka-tengill → `/auth-mvp/vedrid/elta-vedrid`
12. ScopedChatPanel birtist með input og "Sækja eldri" ef >50 skilaboð
13. Senda skilaboð — scrollar til botns
14. Stöð án skilaboða: "Engar umferðarfréttir ennþá..." birtist rétt
15. Input placeholder: "Hjálpaðu öðrum með því að deila þinni upplifun af aðstæðunum"
16. Mobile 360-390px: ekkert overflow, input nothæft

## Pending

- Stebbi gerir localhost checks
- Stebbi gefur commit-leyfi
