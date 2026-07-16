# 2026-07-15 22:19 - TODO-086 v276 - Claude: open by default + no empty flash done

Created: 2026-07-15 22:19
Timezone: Atlantic/Reykjavik

## Scope

Tvær litlar UX-lagfæringar á Phase 4A áður en commit:

1. Veðurpúls er opinn by default (ekkert þarf að smella til að opna)
2. "Engin skilaboð enn" birtist ekki meðan skilaboð eru að sækjast

Codex v275 var planning-rýni á Phase 4B túlkun (v274), ekki blocker. Phase 4B bíður.

## Breytingar

### `components/chat/ScopedChatPanel.tsx`

Bætti við `initialLoadDone: boolean` state (default `false`) og `initialLoadDoneRef`.

Í `loadMessages`, í `finally` blokk: sett á `true` eftir fyrsta kall (hvort sem það tókst eða mistókst).

Reset í `useEffect` við `threadId`-breytingu: `initialLoadDoneRef.current = false`, `setInitialLoadDone(false)`.

Í JSX:
```tsx
{!initialLoadDone ? null : messages.length === 0 ? (
  <p className="text-xs text-muted-foreground">{labels.empty}</p>
) : (
  messages.map(...)
)}
```

Áhrif: panel birtist auður meðan fyrsta fetch er í gangi. "Engin skilaboð enn" kemur aðeins fram þegar fetchið er búið OG engin skilaboð eru til.

### `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`

`WeatherPulsePanel`:
- `useState(false)` → `useState(true)` (opinn by default)
- Nýr `useEffect` sem kallar `initThread()` við mount:

```tsx
useEffect(() => {
  if (!threadId) initThread()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

Toggle-hnappur virkar áfram til að fella saman/opna aftur. Ef `initThread()` mistókst (5xx) og notandi lokar og opnar aftur mun toggle kalla `initThread()` aftur vegna `if (!threadId)` skilyrðisins.

`accessDenied`-tilfelli: ef notandi hefur ekki aðgang, mun `initThread()` setja `accessDenied=true` og `setOpen(false)`, og `return null` gerir hlutann ósjáanlegan. Sama hegðun og áður.

## Test Results

```
npm run type-check: no errors
npm run test:run: 88 test files, 2694 passed / 27 skipped / 8 todo
```

## Phase 4A — commit-ready

Allar skrár sem tilheyra Phase 4A (sjá v268/v271 handoff):

Nýjar:
- `app/api/auth-mvp/vedurpuls/feed/route.ts`
- `components/chat/ChatMessageRow.tsx`
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

Preconditions: `TESKEID_CHAT_ENABLED=true`, notandi með `elta-vedrid`, `weather-provider-vedurstofan`, `weather-pulse` (eða `WEATHER_PULSE_ACCESS_REQUIRED=false`).

1. Opna `/auth-mvp/vedrid/elta-vedrid`
2. Velja stöð
3. **Staðfesta að Veðurpúls birtist OPINN strax** — ekkert þarf að smella
4. Ef skilaboð eru til: þau birtast beint, ekkert "Engin skilaboð enn" flash
5. Ef engin skilaboð: "Engin skilaboð enn..." birtist AÐEINS eftir að fetch er búið
6. Velja aðra stöð — Veðurpúls opnast strax á nýrri stöð
7. Smella á veðurpúls-collapse-takkan — gengur að fella saman og opna aftur
8. Senda skilaboð — panel scrollar til botns, síðan hoppar ekki
9. Ef >10 skilaboð: "Sækja eldri" birtist, smella á hann setur eldri skilaboð í topp
10. Safnpúls sýnir nýjustu skilaboð fyrst
11. Mobile 360-390px: ekkert overflow, input nothæft

## Pending

- Stebbi gerir localhost checks
- Stebbi gefur commit-leyfi
- Phase 4B (route-backed Veðurpúls) bíður eftir commit + leyfi
