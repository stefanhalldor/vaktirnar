# 2026-07-16 09:40 - TODO-086 v314 - Claude: v312+v313 done, prerelease

Created: 2026-07-16 09:40
Timezone: Atlantic/Reykjavik

Commit: ekki enn — Stebbi prófar localhost fyrst.

## Breytingar

### 1. Route restore race — loks lagfært (v312 High)

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**:

Kjarnavilluna í v311: route-clear effect keyrði á initial mount þegar `origin = null, destination = null` (state ekki kominn úr restore ennþá). Þar sem null !== restored coords, brást checkið og result var eytt + sessionStorage hreinsuð.

Ný rök í route-clear effect:
- Ef `restoredCoordsRef.current !== null` en hnit eru ekki tilbúin (undefined) → `return` án þess að hreinsa refinn. Effect keyrir aftur eftir re-render.
- Ef hnit eru tilbúin og stemma við ref → hreinsa ref, sleppa clear (niðurstöður í lagi).
- Ef hnit eru tilbúin en stemma EKKI við ref → hreinsa ref, keyra clear (genuín breyting).

### 2. Ferry port sessionStorage ógildun (v312 Medium)

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**:

`handleFerryPortSelected` kallaði þegar `setResult(null)` en hreinsaði ekki `ROUTE_RESTORE_KEY`. Bætt við `sessionStorage.removeItem(ROUTE_RESTORE_KEY)` þar.

Route selection handler (`onRouteSelected`) uppfærður úr `setSelectedRouteId` í inline handler sem kallar líka `sessionStorage.removeItem(ROUTE_RESTORE_KEY)`.

### 3. Shared chat composer (v313 Medium)

**`components/chat/ScopedChatComposer.tsx`** (nýtt):

- Einn generískur compose component með `variant?: 'compact' | 'full'`.
- `compact`: sama stíll og inline stöðvarspjald (sm:text-sm, ghost button, border/60).
- `full`: sama stíll og full panel (text-base, dark bg-foreground button).
- Sendingarmerki: nota `disabled` state í stað `'...'` texta — lagar width-jump.

**`components/chat/ScopedChatPanel.tsx`**:
- Flytur nú inn `ScopedChatComposer` og notar hann í stað innbyggðs compose block.

**`components/weather/VedurstofanPulseInline.tsx`**:
- Flytur nú inn `ScopedChatComposer` og notar hann með `variant="compact"`.
- Fjarlægt gamalt inline compose block með `{sending ? '...' : t('pulseSend')}`.

### 4. Full pulse placeholder (v313 Medium)

**`app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`**:

Breytt frá `t('pulseInputPlaceholder')` yfir í `t('pulseInputPlaceholderCompact')` — sama stutt texti og á stöðvarspjöldum. Kemur í veg fyrir klipping og mobile zoom.

### 5. minn-profill nextHref varðveisla (v313 High)

**`components/teskeid/TeskeidLoginForm.tsx`**:

Þegar notandi hefur ekki display_name, var redirect til `/auth-mvp/minn-profill` án þess að bera `nextHref` með sér. Lagfært:
```ts
router.push(hasName
  ? (nextHref ?? '/auth-mvp/heim')
  : `/auth-mvp/minn-profill${nextHref ? `?next=${encodeURIComponent(nextHref)}` : ''}`
)
```

**`app/auth-mvp/minn-profill/page.tsx`**:

- Bætt við `import { resolveSafeLoginNext } from '@/lib/auth/loginNext'`.
- `handleSave` les nú `?next=` úr `window.location.search`, staðfestir með `resolveSafeLoginNext`, og redirectar þangað eftir vistun (fallback `/auth-mvp/heim`).

---

## Type-check

`npx tsc --noEmit` — hreint, engar villur.

---

## Þekktar takmarkanir / eftir

- **Low (v312)**: `VedridClient.tsx` er dáinn kóði og hefur enn bakör í header. Ekkert þangað vísar — gáð gott vandkvæði.
- Threshold breytingar ógilda ekki sessionStorage (enn). Fylgt verður eftir ef þörf.
- Draw/detail drawer staða er ekki geymd.

---

## Localhost checks fyrir Stebbi

### Restore flow (v312)
1. Reikna leið → sjá niðurstöður → endurhlaða → sömu niðurstöður koma aftur.
2. Breyta origin eða destination eftir restore → endurhlaða → gamalt result kemur EKKI aftur.
3. Breyta ferry port → endurhlaða → gamalt result kemur EKKI aftur.

### Login/pulse return flow (v313)
4. Public user á `/vedrid` → niðurstöður með Veðurstofan stöð → smella á "Sjá fleiri skilaboð eða segja frá aðstæðum".
5. Klárar login (ef nýr notandi, fylla inn nafn í minn-profill) → ætti að lenda á réttri pulse stöð.
6. Smella "Til baka í ferðaveðrið" → `/auth-mvp/vedrid` → niðurstöður endurheimt.

### UI (v313)
7. Full pulse compose box: stutt placeholder "Hvernig eru aðstæður?" — klippist ekki.
8. Inline stöðvarspjald og full pulse: sama "Senda" button stíll (compact variant).
9. Mobile width ~360-390px: engin lárétt overflow.

---

## Pending

- Commit og push þegar Stebbi staðfestir localhost.
- Low (v290): unit tests fyrir `/access` endpoint.
- Phase 4B.2: station/weather context á full pulse route.
