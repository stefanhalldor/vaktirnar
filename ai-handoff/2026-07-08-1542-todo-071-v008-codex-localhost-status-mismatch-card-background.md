# TODO-071 v008 - Codex addendum - localhost status mismatch and card backgrounds

Created: 2026-07-08 15:42
Timezone: Atlantic/Reykjavik
Author: Codex
Relevant TODO: #71 - Veður: allir spápunktar og fjarlægð frá vegi
Builds on:
- `ai-handoff/2026-07-08-1600-todo-071-v006-claude-v005-status-colors-done.md`
- `ai-handoff/2026-07-08-1540-todo-071-v007-codex-v006-review.md`
Status: Ready for Claude Code follow-up. Codex changed only this handoff file.

## New localhost evidence from Stebbi

Stebbi tested on localhost and saw:

- the heatmap/filter pills still show `Engin gögn`;
- the selected departure detail box also says `Engin gögn`;
- but `Allir spápunktarnir á leiðinni` shows point cards that are all green in the visible sample, with no gray/no-data point card;
- the current 2px left border/dot is too subtle. Stebbi says it would be better if the whole card had a colored background.

This is stronger evidence that the current wording is misleading in product terms. Even if the aggregate candidate status is technically "no data for assessment", users read `Engin gögn` as "there are no weather data", which conflicts with the green point rows.

## Decision

Do not keep defending `Engin gögn` as the main visible wording for aggregate departure candidates.

The UI should distinguish:

1. **No/insufficient aggregate assessment for a departure time**  
   This belongs to the heatmap pill and selected slot detail. It should not say simply `Engin gögn`.

2. **A route forecast point truly has no usable forecast summary**  
   This can still be gray and say `Engin gögn` or a similarly clear no-data label.

These are different states and need separate copy keys.

## Requested v009 implementation scope

### 1. Rename the aggregate no-data pill/slot copy

In `components/weather/DepartureHeatmap.tsx`, the `no_data` candidate/slot status should use new message keys instead of reusing `heatmapNoData`.

Recommended Icelandic copy:

- pill/legend label: `Ómetnir tímar` or `Ófull gögn`
- selected slot detail: `Ekki nóg gögn til að meta þennan brottfarartíma.`

Codex preference:

- use `Ómetnir tímar` for the pill, because it explains that these are time slots that could not be assessed;
- use the fuller sentence in the selected slot detail.

Recommended English:

- pill/legend label: `Not assessed`
- selected slot detail: `Not enough data to assess this departure time.`

Keep real point-level no-data copy separate, for example:

- `pointNoData`: `Engin gögn`
- English: `No data`

Do not change the weather algorithm or thresholds for this step.

### 2. Make point-card coloring more obvious with soft full-card backgrounds

In `app/auth-mvp/vedrid/FerdalagidClient.tsx`, update `RoutePointRow` so status styling is not just a left border/dot.

Use a calm, readable full-card tint:

- green: very light green background, stronger green border/dot/badge
- yellow/orange: very light amber background, amber border/dot/badge
- red: very light destructive/red background, red border/dot/badge
- no-data: muted gray background, muted border/dot/badge

Do not use heavy saturated cards. The long list should become easier to scan, not visually loud.

Suggested shape:

- `bg-[#2d5a27]/5 border-[#2d5a27]/35`
- `bg-amber-50 border-amber-300`
- `bg-destructive/5 border-destructive/30`
- `bg-muted/40 border-muted-foreground/20`

Use actual project tokens/classes if there is a closer established pattern.

### 3. Add a visible compact status label on each point card

The v006 `sr-only` status label is good for screen readers, but status color still needs a visible text signal for sighted users.

Add a small visible badge next to `Punktur x/y`:

- `Gott veður`
- `Óþægilegt`
- `Hættulegt`
- `Engin gögn` for true point-level missing data only

Keep the badge compact so the long list does not become too noisy.

### 4. Be explicit in the Claude handoff about the two windows

The next Claude handoff should explicitly say:

- heatmap no-assessment status is about whether that departure time can be classified;
- route point rows may show forecast summaries from a different/default window;
- the UI copy now avoids implying that all weather data are absent.

## Files to inspect/change

Likely changed:

- `components/weather/DepartureHeatmap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`

Inspect if needed:

- `lib/weather/types.ts`
- `components/weather/travelAuditMap.helpers.ts`
- `Design.md`

## Design constraints

Follow `Design.md`:

- mobile-first 360-460 px;
- status colors cannot be the only meaning;
- cards should remain calm, compact and readable;
- avoid heavy decorative blocks;
- no horizontal overflow;
- no card-in-card feeling.

This change is allowed to make cards more visibly tinted than v006, because Stebbi's localhost read is that the current left-border treatment is too subtle.

## Tests

Run:

```bash
npm run type-check
npm run test:run
```

Update tests if there are existing message-key or component tests affected by new translation keys. Do not add brittle full-page snapshots unless the repo already uses that pattern.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid`.
2. Calculate a route like Garðabær -> Akranes that previously showed `Engin gögn` pills while point rows were green.
3. Expected: the heatmap/filter pill no longer says simply `Engin gögn`; it uses the new aggregate wording, e.g. `Ómetnir tímar`.
4. Select one of those gray/no-assessment departure slots.
5. Expected: the selected slot detail explains that there are not enough data to assess that departure time.
6. Open `Allir spápunktarnir á leiðinni`.
7. Expected: point cards have soft full-card status backgrounds, not only a thin left border.
8. Expected: green point cards visibly read as green, but remain calm and readable.
9. Expected: each card has a compact visible status label, not color alone.
10. Expected: true point-level missing-data cards, if any, are gray and still say `Engin gögn`.
11. Expected: all existing point details remain: distance, ETA, forecast distance from road, forecast time, wind/precip/temp and links.
12. Test mobile widths 360, 390 and 460 px.
13. Expected: no horizontal overflow, no text overlap, no excessively loud color blocks.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy is part of these checks.

## Recommendation

Treat this as the remaining #71 polish before calling the point-list work done. The underlying data distinction may be technically valid, but the current wording and visual treatment do not pass Stebbi's localhost product test.
