# 2026-07-17 11:00 — TODO-086 v402 — B0.5 type fix: shell decoupled from ProviderStationPoint

Created: 2026-07-17 11:00
Timezone: Atlantic/Reykjavik

Source: `2026-07-17-0946-todo-086-v401-codex-v400-provider-shell-review`

## Hvað var gert

### Medium finding frá Codex v401: leyst

`ProviderStationPreviewCard` importaði `ProviderStationPoint` og krafðist þess
sem prop — Veðurstofan-lögun. Vegagerðin gæti ekki notað skelina án þess að
búa til gervi-`ProviderStationPoint` með óviðkomandi forecast fields.

**Leiðrétting:** Skelinn tekur nú einungis þau fields sem hann þarf sjálfur:

```ts
{
  stationName: string
  distanceM: number
  providerLabel: string
  onClose: () => void
  children?: ReactNode
}
```

- `ProviderStationPoint` import fjarlægt úr skelnum
- Kallstaðurinn í `RouteSelectionStep` sendir `stationName` og `distanceM` beint

### Framtíðarnotkun (Vegagerðin)

```tsx
<ProviderStationPreviewCard
  stationName={vegagerdinPoint.name}
  distanceM={vegagerdinPoint.distanceM}
  providerLabel="Vegagerðin"
  onClose={...}
>
  <VegagerdinRoadStateSection ... />
</ProviderStationPreviewCard>
```

Engin Veðurstofan-type í skelnum.

## Niðurstöður

```
npm run type-check  → pass
npm run test:run -- [5 test files]  → 73/73 pass
```

Test files: pulseBack, vedurpuls-preview, vedurpuls-feed, providerRouteMatching, weather-provider-stations.

## Skrár sem breyttust

- `components/weather/ProviderStationPreviewCard.tsx`
- `components/weather/RouteSelectionStep.tsx`

## B0.5 staðan

B0.5 er nú fullklárað:
- Shell: provider-neutral bæði í visual rendering og type contract
- Veðurstofan forecast rows: children hjá RouteSelectionStep
- Vegagerðin getur notað skelina með eigin content, engar Veðurstofan-sérstakar gerðir

## Localhost checks

1. `/vedrid` — velja leið með Veðurstofan lag virkt
2. Smella á stöðvamerki
3. Búist við: preview card með nafni, Veðurstofan label, fjarlægð, forecast rows, Púls link
4. Engin sjáanleg breyting frá fyrri hegðun

## Næstu skref

- B1: Localhost validation of provider geometry (identify test flows)
- B2: Route-selection provider layer UX
