# TODO-071 v006 - Claude handoff - status colors done

Created: 2026-07-08 16:00
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review. SQL migration NOT run. No commit/push without explicit approval.

## What caused `Engin gögn` in the departure summary

Source: `SlotDetail` in `DepartureHeatmap.tsx` (line 290-297).

```ts
function slotStatus(c: TravelCandidate): SlotStatus {
  return c.reasonCode === 'no_data' ? 'no_data' : c.status
}
```

When the selected departure candidate has `reasonCode === 'no_data'`, `slotStatus()` returns `'no_data'` and `SlotDetail` renders only the departure/arrival header + "Engin gögn". This is **technically correct**: it means the server could not classify the aggregate weather window for that departure time (e.g., insufficient forecast coverage). It does not mean individual route points have no data.

Individual route points in `RoutePointRow` use `pt.summaryForWindow`, which is computed from the default/overall window, not the selected departure slot's window. So it is expected and correct that a candidate can be `no_data` while individual points still show wind/precip/temp from `summaryForWindow`.

**Decision**: left `SlotDetail`'s `Engin gögn` unchanged. It is correct for the aggregate departure context. No copy change needed.

## What was fixed

Status-aware visual styling added to `RoutePointRow` in `app/auth-mvp/vedrid/FerdalagidClient.tsx`.

### Status-to-color mapping (same tokens as DepartureHeatmap and STATUS_STYLES)

| Status | Left border | Dot |
|---|---|---|
| `graent` | `border-l-[#2d5a27]` | `bg-[#2d5a27]` |
| `gult` | `border-l-amber-500` | `bg-amber-500` |
| `rautt` | `border-l-destructive` | `bg-destructive` |
| no `summaryForWindow` | `border-l-muted-foreground/30` | `bg-muted-foreground/30` |

### Visual treatment

- Cards keep white background (no tint) — calm and compact per Design.md.
- A 2px colored left border (`border-l-2 border-l-[color]`) signals status at a glance.
- A 2px colored dot (`w-2 h-2 rounded-full`) sits before "Punktur x/y" in the heading row.
- A `sr-only` span carries the status label text for screen readers (e.g. "Gott veður", "Óþægilegt", "Hættulegt", "Engin gögn") — color is not the only signal.
- When `summaryForWindow` is absent, "Engin gögn" text is shown in the card body (gray border, gray dot).
- All v004 content preserved: distance from origin, ETA, forecast point distance, forecast time, wind/gust/precip/temp, three links.

## Files changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `RoutePointRow` only

## Files NOT changed

- `components/weather/DepartureHeatmap.tsx` — `SlotDetail` unchanged; "Engin gögn" is correct there
- `components/weather/TravelAuditMap.tsx` — unchanged
- `components/weather/travelAuditMap.helpers.ts` — unchanged
- `messages/is.json` / `messages/en.json` — no new keys; reuses `heatmapNoData`, `heatmapLegendGreen`, `heatmapLegendYellow`, `heatmapLegendRed` from same namespace

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 61 files, 1940 passed, 27 skipped, 8 todo — all green
```

## Remaining ambiguity

The departure slot "Engin gögn" and the individual route point `summaryForWindow` data are from different windows. There is no visual bridge connecting them in the UI. If Stebbi finds it confusing for users to see "Engin gögn" in the departure summary while the point list shows data, a follow-up option is to add a short explanatory sentence in `SlotDetail` when `st === 'no_data'` — something like "Ekki nóg gögn til að meta þennan brottfarartíma." This would not require new message keys if phrased using existing copy. This is deferred and not part of v006.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid`.
2. Calculate a route that produces a mix of statuses.
3. Open `Allir spápunktarnir á leiðinni`.
4. Expected: each `Punktur x/y` card has a 2px left border and a small dot:
   - Dark green for `graent`
   - Amber/orange for `gult`
   - Red for `rautt`
   - Gray for points with no `summaryForWindow`
5. Expected: the colored dot appears immediately before "Punktur x/y" in the header row.
6. Expected: cards with genuinely missing forecast data show "Engin gögn" text (gray card).
7. Expected: all other card content from v004 is intact (distance, ETA, forecast distance, forecast time, weather values, links).
8. Select a departure slot marked as `Engin gögn` in the heatmap.
9. Expected: the departure summary still shows "Engin gögn" — this is correct.
10. Expected: the point list below still shows individual point data with status colors.
11. Test at 360, 390 and 460 px widths.
12. Expected: no horizontal overflow, no text overlap, no card-in-card feeling.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy without separate explicit approval from Stebbi.
