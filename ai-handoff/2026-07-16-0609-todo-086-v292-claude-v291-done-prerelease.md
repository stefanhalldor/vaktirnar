# 2026-07-16 06:09 - TODO-086 v292 - Claude: v290/v291 done + threshold summary removed

Created: 2026-07-16 06:09
Timezone: Atlantic/Reykjavik

Addresses v290 (High + Medium) and v291 (both Highs + Medium) plus a separate localhost request.

## Breytingar

### 1. Sameinað Veðurpúls íhlutur — `VedurstofanPulseInline` er nú eina útfærslan

`WeatherPulseSummary` í `VedurstofanStationExplorerClient.tsx` hefur verið fjarlægð. `VedurstofanPulseInline` tekur við á öllum stöðum:

- `/auth-mvp/vedrid/elta-vedrid` (StationDetail)
- `/auth-mvp/vedrid` travel route cards (VedurstofanPointCard, VedurstofanJourneySummary)

### 2. `returnTo` prop — sameinaður contract

`VedurstofanPulseInline` fær `returnTo?: string` prop:

- **Þegar gefið:** "Sjá fleiri skilaboð" link sýndur með `?returnTo=${encodeURIComponent(returnTo)}`
- **Þegar ekki gefið:** Linkurinn felur sig — örugg sjálfgefna hegðun þegar caller getur ekki tryggt skilvirkt return path

**Í elta-vedrid:** `returnTo` byggt beint frá `station.stationId`, ekki frá `useSearchParams()`:
```tsx
returnTo={`/auth-mvp/vedrid/elta-vedrid?stationId=${station.stationId}`}
```
Þetta lagar v286 "stale URL" vandamálið samhliða!

**Í travel route cards:** engin `returnTo` → "Sjá fleiri skilaboð" sýndur ekki þangað til return path er URL-backed.

### 3. `VedurstofanPulseInline.tsx` — endurbætur

- **30s polling:** preview hlæðist á 30 sekúndna fresti (sama og WeatherPulseFeed), með `cancelled` flag til að koma í veg fyrir memory leak
- **Access check:** tvær aðskildar `useEffect` — ein fyrir preview (með interval), ein fyrir access check (one-time)
- **Responsive input:** `text-base sm:text-sm` — ≥16px á mobile (forðast iOS zoom), `sm:text-sm` á stærra skjá
- **Mýrari senda takki:** `border border-border text-foreground hover:bg-muted` í stað `bg-foreground text-background`
- **`returnTo` í fullHref:** `const fullHref = returnTo ? /...?returnTo=... : null` — link aðeins sýndur þegar returnTo er til

### 4. `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`

- `canPost` prop fjarlægður (VedurstofanPulseInline sér um access check sjálft)
- `currentUrl`, `pathname`, `usePathname` fjarlægð
- `WeatherPulseSummary` function eytt
- Fjarlægðar imports: `ThreadDto`, `AugmentedChatMessage`, `ChatPreviewList`, `VEDURPULS_TRANSPORT`, `usePathname`
- Bætt við: `import { VedurstofanPulseInline }`
- `MessageSquare` og `ChatMessageRow` haldið — notað enn í `WeatherPulseFeed`

### 5. `app/auth-mvp/vedrid/elta-vedrid/page.tsx`

- `checkChatAccess` import fjarlægt
- `canPost` prop fjarlægt frá client component render
- `VedurstofanStationExplorerClient` kallað án props

### 6. `middleware.ts` — `/auth-mvp/*` → `/innskraning`

```ts
url.pathname = pathname.startsWith('/auth-mvp/') ? '/innskraning' : '/login'
```

Lagar v290 Medium: óinnskráðir notendur sem fara á `/auth-mvp/vedrid/puls/stod/[stationId]` lenda nú á `/innskraning`, ekki `/login` (sem redirecta á `/` þegar LEGACY_ENABLED=false).

### 7. `components/weather/DepartureHeatmap.tsx` — threshold summary línur fjarlægðar

Fjarlægðar línurnar sem sýndu "Jafnvindur óþægilegur í {caution} m/s og hættulegur í {red} m/s" (grámaðurinn yfir heatmap chips) — þessar upplýsingar birtast nú í attention box (bláa boxið í FerdalagidClient).

## Skrár breyttar

- `components/weather/VedurstofanPulseInline.tsx` — endurskrifað
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx` — WeatherPulseSummary fjarlægð, VedurstofanPulseInline bætt við
- `app/auth-mvp/vedrid/elta-vedrid/page.tsx` — einlægt
- `middleware.ts` — /auth-mvp/* redirect leiðréttur
- `components/weather/DepartureHeatmap.tsx` — threshold summary línur fjarlægðar

## Type-check

```
npm run type-check: exit 0, no errors
```

## Localhost checks fyrir Stebbi

### Sameinað íhlutur á elta-vedrid

1. Opna `/auth-mvp/vedrid/elta-vedrid`
2. Velja stöð
3. **Búist við:**
   - Header: "Nýjast af staðnum frá notendum Teskeið.is"
   - Preview / empty state
   - Composer (input + Senda) — mýrri stillingur, `text-base sm:text-sm`
   - "Sjá fleiri skilaboð" sést (returnTo er til)
4. Smella á "Sjá fleiri skilaboð"
5. **Búist við:** URL: `/auth-mvp/vedrid/puls/stod/[stationId]?returnTo=%2Fauth-mvp%2Fvedrid%2Felta-vedrid%3FstationId%3D[stationId]`
6. Smella á "Til baka"
7. **Búist við:** Fer til baka á elta-vedrid með stöðina enn valda (v286 fixed!)

### Travel route cards

8. Fara á `/vedrid` eða `/auth-mvp/vedrid` með Veðurstofastöð á leið
9. Smella á versta punkt eða skoða ferðalagspanel
10. **Búist við:** VedurstofanPulseInline sýndur, EN "Sjá fleiri skilaboð" er EKKI sýndur (returnTo ekki gefið)
11. Innskráður notandi getur skrifað beint á spjaldið

### Óinnskráður + middleware

12. Skrá sig út
13. Fara beint á `/auth-mvp/vedrid/puls/stod/2655`
14. **Búist við:** Redirect á `/innskraning` (ekki `/login` eða `/`)

### Threshold summary

15. Fara á `/vedrid`, velja ferð
16. **Búist við:** Heatmap sýnir EKKI gráa threshold textan ("Jafnvindur óþægilegur...") yfir filter chips
17. **Búist við:** Bláa attention boxið í niðurstöðum sýnir enn þessar upplýsingar

## Pending

- Stebbi gerir localhost checks
- Stebbi gefur commit-leyfi
- Low (v290): unit tests fyrir `/access` endpoint
- Low (v291): extract reusable ChatPreviewWithComposer core (deferred)
- "Sjá fleiri skilaboð" á travel route cards: þarf URL-backed route state áður en það er opnað
- Deferred (Phase 4B.2): station/weather context á full pulse route
