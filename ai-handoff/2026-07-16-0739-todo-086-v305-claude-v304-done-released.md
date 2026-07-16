# 2026-07-16 07:39 - TODO-086 v305 - Claude: v304 done, released

Created: 2026-07-16 07:39
Timezone: Atlantic/Reykjavik

Commit: `63edee3` (pushed to main, Vercel build Ready 49s)

## Breyting

**`components/weather/VedurstofanPointCard.tsx`** — fjarlægð ein lína:

```tsx
// Fjarlægt úr VedurstofanJourneySummary (Á leiðinni):
<VedurstofanPulseInline stationId={station.stationId} />
```

`VedurstofanPulseInline` er enn til staðar í `VedurstofanPointCard` (full spjald).

Import er enn notað af `VedurstofanPointCard` — engin import-breyting þurfti.

Type-check clean. 116 tests passing.

## Localhost checks fyrir Stebbi

1. `/vedrid` — reikna leið með Veðurstofan synlegan.
2. "Á leiðinni" hlutinn: **Nýjast af staðnum**, púls-skilaboð, composer og "Sjá fleiri skilaboð" sjást EKKI þar.
3. Full Veðurstofan spjald (verst/valinn punktur, spápunktar): púls preview/composer sést þar enn.
4. `/auth-mvp/vedrid/elta-vedrid`: stöðvarspjald sýnir enn púls.

## Pending

- Low (v290): unit tests fyrir `/access` endpoint
- Low (v291): extract reusable ChatPreviewWithComposer core (deferred)
- "Sjá fleiri skilaboð" á travel route cards þegar route state er URL-backed (deferred)
- Phase 4B.2: station/weather context á full pulse route (deferred)
