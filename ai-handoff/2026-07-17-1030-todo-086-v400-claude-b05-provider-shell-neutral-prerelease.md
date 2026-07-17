# 2026-07-17 10:30 — TODO-086 v400 — B0.5: provider shell truly neutral, prerelease

Created: 2026-07-17 10:30
Timezone: Atlantic/Reykjavik

Source: `2026-07-17-0933-todo-086-v399-codex-phase-order-vik-deferred`

## Hvað var gert

### B0.5: ProviderStationPreviewCard — truly provider-neutral shell

**Vandamál:** `ProviderStationPreviewCard` sagðist vera provider-neutral en innihélt
Veðurstofan-bundnar forecast rows beint í skelnum (importaði `ForecastRowLine` og
`selectUpcomingRows` frá `VedurstofanForecastRows` og notaði `station.forecastRows`).
Vegagerðin gæti ekki notað skelina án þess að erfa Veðurstofan-format.

**Leiðrétting:** Forecast rows eru nú provider-specific content sem kemur sem children.
Skelinn inniheldur aðeins: header (nafn, provider label, fjarlægð, loka-takki) + children.

### Breytingar

**`components/weather/ProviderStationPreviewCard.tsx`:**
- Fjarlægt import: `ForecastRowLine`, `selectUpcomingRows` frá `VedurstofanForecastRows`
- Fjarlægt `locale` prop (var einungis notað fyrir forecast rows)
- Fjarlægt `rows` útreikningur og forecast rows JSX block
- Fjarlægt `stationPreviewNoData` fallback (færist til kallstaðar)
- Children slot nú merktur sem "forecast rows, road conditions, Púls links, etc."

**`components/weather/RouteSelectionStep.tsx`:**
- Bætt við import: `ForecastRowLine`, `selectUpcomingRows` frá `VedurstofanForecastRows`
- Bætt við: `selectedStationRows` útreikningur við hliðina á `selectedStation` state
- `ProviderStationPreviewCard` call: fjarlægt `locale` prop, forecast rows + noData
  fallback + `VedurstofanPulseInline` eru nú öll sem children

### Framtíðarnotkun (Vegagerðin)

```tsx
// Vegagerðin — sama skelinn, önnur provider-specific content:
<ProviderStationPreviewCard station={s} providerLabel="Vegagerðin" onClose={...}>
  <VegagerdinRoadStateSection stationId={s.stationId} />
  <VegagerdinPulseInline stationId={s.stationId} returnTo={returnTo} />
</ProviderStationPreviewCard>
```

## Niðurstöður

```
npm run type-check  → pass
npm run test:run -- [3 test files]  → 61/61 pass
```

## Skrár sem breyttust

- `components/weather/ProviderStationPreviewCard.tsx`
- `components/weather/RouteSelectionStep.tsx`

## Localhost checks fyrir Stebbi

1. Opna `/vedrid`, velja leið með Veðurstofan lag virkt.
2. Smella á stöðvamerki á kortinu.
3. Búist við: preview card opnast með stöðvanafni, provider label, fjarlægð, forecast rows og Púls link.
4. Búist við: engin sjáanleg breyting frá fyrri hegðun — þetta er eingöngu innra skipulagsbreyting.

## Eftirstandandi (óbreytt)

- Vík/Mýrdalur `verified:true`: frestað (sjá v398/v399)
- B1 — Localhost validation of provider geometry
- B2 — Route-selection provider layer UX
- B3 — Iceland overview / status map
- V — Vegagerðin provider
