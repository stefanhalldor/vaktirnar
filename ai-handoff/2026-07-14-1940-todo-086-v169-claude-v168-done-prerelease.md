# TODO 086 v169 - Claude Code done, pre-release

Created: 2026-07-14 21:00:00 +00:00
Timezone: Atlantic/Reykjavik

Source handoff reviewed:
- `ai-handoff/2026-07-14-1935-todo-086-v168-codex-v167-review-and-decisions.md`

Mode:
- Execution (Stebbi said: "ef þú hefur engar breytingatillögur þá máttu framkvæma og gera svo handoff")
- No SQL executed. No commit. No push. No Supabase action.

## What Was Done

### Item 1 — Route-layer refetch after manual warm (from v169 spec)

`app/auth-mvp/vedrid/FerdalagidClient.tsx` — `handleRefreshVedurstofan`:

Extended the condition that triggers a travel-layer refetch to include `stillStale` (was `fresh || alreadyFresh` only):

```ts
if (json.status === 'fresh' || json.status === 'alreadyFresh' || json.status === 'stillStale') {
  // refetch /api/teskeid/weather/travel with same route inputs
  // judge UI freshness from new layerAtimeIso
}
```

This ensures users always get the freshest route data after a warm attempt, even when the global conservative check reports `stillStale` due to unrelated stale stations.

### Item 3 — Shared Veðurstofan display model for "Á leiðinni"

Extracted `VedurstofanJourneySummary` component to `components/weather/VedurstofanPointCard.tsx`.

**Problem**: two nearly-identical branches in `FerdalagidClient.tsx` (both-provider mode when Veðurstofan is decisive, and Veðurstofan-only mode) rendered the same ~60 lines of bespoke JSX in the journey summary panel.

**Solution**: New `VedurstofanJourneySummary` export renders the compact structured-summary rows (per Design.md guidance: rows/dividers inside the panel, not a full nested card):
- Status label with icon (using `meta.labelClass`)
- ETA/distance text (`slotDetailWorstAtStart` or `slotDetailWorstDistanceAt`)
- Station name + wind m/s + `vedurstofanForecastUsedAt` forecast row time
- Forecast issue time (`vedurstofanForecastFrom`)
- Provider label (`providerVedurstofanLabel`)
- Disclaimer box (amber, links to umferdin.is)

Props: `station`, `status`, `etaIso`, `ftimeIso`, `windMs`, `originName` — matching `VedurstofanAssessment` fields directly.

In `FerdalagidClient.tsx`, the two duplicate branches collapsed to one:

```tsx
if (
  worstVedurstofanData &&
  (isVedurstofanOnly || (showMetno && showVedurstofan && combinedDecisiveProvider === 'vedurstofan'))
) {
  return (
    <VedurstofanJourneySummary
      station={worstVedurstofanData.station}
      status={worstVedurstofanData.status}
      etaIso={worstVedurstofanData.etaIso}
      ftimeIso={worstVedurstofanData.ftimeIso}
      windMs={worstVedurstofanData.windMs}
      originName={origin?.name ?? ''}
    />
  )
}
```

Import updated: `import { VedurstofanPointCard, VedurstofanJourneySummary } from '@/components/weather/VedurstofanPointCard'`

## What Was NOT Done

### Item 2 — Extra-provider gate

Deferred. Requires two unresolved decisions before implementation:
1. Exact feature key name (Stebbi used "Extra_provider"; Codex recommended `extra-weather-providers` or `weather-extra-providers`)
2. Whether `elta-vedrid` is replaced entirely by the new key or kept as a separate gate

No code written, no SQL migration written.

## Files Changed

- `components/weather/VedurstofanPointCard.tsx` — added `VedurstofanJourneySummary` export
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — updated import, replaced two duplicate Veðurstofan branches with single `VedurstofanJourneySummary` call

## Localhost Checks For Stebbi

(From v168 spec, sections 6-7)

1. Open `/auth-mvp/vedrid`, choose a route with Veðurstofan stations (e.g. Reykjavík to Stóra-Borg).
2. Toggle met.no off and Veðurstofan on.
3. If stale banner shows, click "Sækja ný gögn".
4. Expected: route layer refetches even if global warm response is `stillStale`; stale banner clears only if route stations are now fresh.

5. Compare the same Veðurstofan station in:
   - "Á leiðinni" summary (compact: status, location, station name + wind + forecast time, issue time, provider label, disclaimer)
   - Selected point on map (full VedurstofanPointCard: prev/used/next rows, road distance, source link)
   - "Allir spápunktar" (full VedurstofanPointCard)
6. Expected: same station name, same used forecast time, same forecast issue time, same wind value — compact summary may be visually shorter but must not contradict the full card.

7. Test with both-provider mode (both met.no and Veðurstofan on, Veðurstofan decisive) and Veðurstofan-only mode — both should render identically via the shared component.

## Pending After This

- Extra-provider gate (item 2): needs key name and `elta-vedrid` fate decision from Stebbi before implementation.
- SQL migration for new feature key: to be written only after key name decided; not executed until Stebbi explicitly approves.
