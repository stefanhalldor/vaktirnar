# TODO-071 v009 - Claude handoff - aggregate copy + card backgrounds done

Created: 2026-07-08 16:55
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Awaiting Stebbi localhost review. No commit/push without explicit approval.

## What was changed

### 1. Aggregate no-data copy separated from point-level no-data

Two new message keys added to `messages/is.json` and `messages/en.json`:

| Key | Icelandic | English |
|---|---|---|
| `heatmapNotAssessed` | Ómetnir tímar | Not assessed |
| `heatmapNotAssessedDetail` | Ekki nóg gögn til að meta þennan brottfarartíma. | Not enough data to assess this departure time. |

`heatmapNoData` ("Engin gögn" / "No data") is kept exclusively for point-level truly missing forecast data.

**What changed where:**
- `DepartureHeatmap.tsx` filter chip for `no_data` status: `heatmapNoData` → `heatmapNotAssessed`
- `DepartureHeatmap.tsx` SlotDetail body for `no_data` slot: `heatmapNoData` → `heatmapNotAssessedDetail`
- `TravelAuditMap.tsx` map pill for `no_data` status: `heatmapNoData` → `heatmapNotAssessed`

Result: selecting a departure slot that could not be assessed now reads "Ekki nóg gögn til að meta þennan brottfarartíma." rather than simply "Engin gögn". The pill/filter chip reads "Ómetnir tímar". Point-level "Engin gögn" text is only shown when a route point genuinely has no `summaryForWindow`.

### 2. Soft full-card backgrounds on RoutePointRow

`FerdalagidClient.tsx` — `RoutePointRow` now uses a soft full-card background and matching full border:

| Status | Card class |
|---|---|
| `graent` | `bg-[#2d5a27]/5 border-[#2d5a27]/35` |
| `gult` | `bg-amber-50 border-amber-300` |
| `rautt` | `bg-destructive/5 border-destructive/30` |
| no `summaryForWindow` | `bg-muted/40 border-muted-foreground/20` |

No left-border-only approach; the whole card is softly tinted so status is visible at a glance without being loud.

### 3. Visible compact status badge

The previous `sr-only` status label and dot are replaced by a single visible compact badge next to "Punktur x/y":

| Status | Badge class |
|---|---|
| `graent` | `bg-[#2d5a27]/10 text-[#2d5a27]` |
| `gult` | `bg-amber-100 text-amber-700` |
| `rautt` | `bg-destructive/10 text-destructive` |
| no data | `bg-muted text-muted-foreground` |

Badge text: "Gott veður" / "Óþægilegt" / "Hættulegt" / "Engin gögn". The badge is `text-[10px] px-1.5 py-0.5 rounded` — compact and readable on mobile.

## Two-window distinction (for the record)

- **Departure slot / heatmap**: classified against a specific candidate window. `no_data` / "Ómetnir tímar" means the server could not assess that departure time (e.g. insufficient forecast coverage).
- **Route point rows**: show `summaryForWindow` which is the default/overall window assessment for each point. These are independent of which departure slot is selected. They can be green even when the selected slot is "Ómetnir tímar".

The new copy makes this distinction implicit to users without requiring a technical explanation.

## Files changed

- `messages/is.json` — 2 new keys
- `messages/en.json` — 2 new keys
- `components/weather/DepartureHeatmap.tsx` — filter chip + SlotDetail body
- `components/weather/TravelAuditMap.tsx` — map pill
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `RoutePointRow` (card class, badge, removed dot+sr-only)

## Commands run

```
npm run type-check  # exit 0
npm run test:run    # 62 files, 1952 passed, 27 skipped, 8 todo — all green
```

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid`.
2. Calculate a route that previously showed "Engin gögn" pills (e.g. Garðabær → Akranes).
3. Expected: filter chip for the gray/no-assessment status reads "Ómetnir tímar", not "Engin gögn".
4. Select one of those departure slots.
5. Expected: selected slot detail reads "Ekki nóg gögn til að meta þennan brottfarartíma."
6. Open `Allir spápunktarnir á leiðinni`.
7. Expected: green cards have a soft green background tint and show "Gott veður" badge.
8. Expected: amber cards have soft amber background and show "Óþægilegt" badge.
9. Expected: if any cards are truly missing forecast data, they are muted gray and show "Engin gögn" badge.
10. Expected: all point details from v004 are intact: distance, ETA, forecast distance, forecast time, wind/precip/temp, links.
11. Expected: the long list is easier to scan — cards are distinct by color without being loud.
12. Test mobile widths 360, 390 and 460 px.
13. Expected: no horizontal overflow, no text overlap, badge text does not wrap awkwardly.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy without separate explicit approval from Stebbi.
