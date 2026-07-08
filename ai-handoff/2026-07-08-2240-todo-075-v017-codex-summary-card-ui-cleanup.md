# Codex handoff: TODO #75 v017 - cleanup of top travel summary UI

Created: 2026-07-08 22:40  
Timezone: Atlantic/Reykjavik  
Context: Stebbi reviewed Claude v015/v014 UI on localhost and the current result is visually cluttered.

## Stebbi's feedback

The current UI is too messy:

- The old selected-slot detail box under the scrubber must go away from this top result card.
- The green status dot under `BROTTFÖR` is redundant because the selected slot in the scrubber already communicates the chosen status.
- Section hierarchy is too weak; headings fade into the background.
- The departure time in the `Brottför` section is visually too large/heavy compared with the rest.
- Icelandic weekday names should be lowercase when used mid-sentence, e.g. `mið. 8. júl kl. 23:30`, not `Mið. 8. júl kl. 23:30`.
- The whole block should feel mobile-friendly and product-polished, closer to a train/flight booking or weather summary card, not a debug panel.

## Design constraints

I read `Design.md` for this UI review. Keep the change aligned with:

- mobile-first, calm, practical app UI
- no unnecessary cards inside cards
- clear typography hierarchy
- no visual clutter or duplicated state
- status colors cannot be the only carrier of meaning
- text must fit cleanly at 360, 390 and 460 px widths

Do not start TODO #75 Phase 2 here. This handoff is only about cleaning the top result card and the current v015 regressions.

## Current code hotspots

- `app/auth-mvp/vedrid/FerdalagidClient.tsx:830-958`
  - passes `DepartureHeatmap`
  - renders the new `Brottför`, `Á leiðinni`, `Áfangastaður` sections
- `components/weather/DepartureHeatmap.tsx:229-232`
  - always renders `SlotDetail` when a scrubber slot is selected
  - this is the old box Stebbi marked in red
- `components/weather/DepartureHeatmap.tsx:322-338`
  - has correct route ETA calculation for the worst/display point
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:892-901`
  - currently uses forecast bucket time as if it were route ETA
- `components/weather/travelAuditMap.helpers.ts:196-208`
  - current compact date formatting capitalizes Icelandic weekday names

## Required v017 changes

### 1. Remove the old selected-slot detail box from the top result card

Do not render `SlotDetail` under the scrubber in the main top summary card.

Preferred implementation:

- Add `showSelectedDetail?: boolean` prop to `DepartureHeatmap`.
- Default it to `true` so existing/detail uses are not accidentally changed.
- Pass `showSelectedDetail={false}` for the top outbound scrubber in `FerdalagidClient.tsx`.
- Leave the return heatmap behavior unchanged unless it creates the same bad duplicate in localhost review.

This removes the red-marked old box without deleting the reusable detail behavior everywhere.

### 2. Redesign the summary beneath the scrubber as one compact journey summary

Keep the three conceptual parts, but make them visually coherent and scan-friendly:

- `Brottför`
- `Á leiðinni`
- `Áfangastaður`

Avoid the current weak uppercase-muted labels plus loose paragraphs. Recommended shape:

- one lightweight summary block inside the existing outer result card
- use internal dividers or row spacing, not separate nested card boxes
- section labels should be easier to see: `text-[11px] font-semibold text-foreground/70` or similar
- body text should be consistent, mostly `text-xs`/`text-sm`, not one oversized departure line
- keep the section labels short and stable

The UI should read more like:

```text
Brottför
mið. 8. júl kl. 22:34

Á leiðinni
Gott ferðaveður m.v. valin veðurmörk.
Mest krefjandi er 42 km frá Garðabæ, kl. 23:16.
Vindur: 9,1 m/s · Úrkoma: 0,2 mm/klst · Hiti: 9,4°C

Áfangastaður
Komutími mið. 8. júl kl. 23:30, spáin þar kl. 00:00:
Vindur: 7,9 m/s · Úrkoma: 0 mm/klst · Hiti: 9,7°C
Skoða spána á áfangastað betur
```

This is not final copy law, but it shows the desired density and hierarchy.

### 3. Remove the green dot/status row from `Brottför`

The selected scrubber circle already carries the chosen departure status.

Do not render:

- small green/yellow/red dot
- redundant “Gott ferðaveður...” row directly under the departure time

If the overall status sentence is kept, move it into `Á leiðinni` as plain text or a subtle text line, not as a colored-dot row. This makes it a trip condition statement, not a duplicate scrubber legend.

### 4. Fix the route ETA vs forecast-hour bug from v016

In `Á leiðinni`, the `kl. HH:mm` in `Mest krefjandi er ...` must be the estimated time the traveller reaches the point, not `displayPoint.forecastTimeIso`.

Use the same logic as `SlotDetail`:

- departure time
- arrival time
- `dp.routeFraction`
- `leg === 'return' ? 1 - dp.routeFraction : dp.routeFraction`

If useful, extract a helper for candidate display-point ETA so both `SlotDetail` and the top summary share it.

Keep forecast bucket wording separate if shown:

- route ETA: `Mest krefjandi er 42 km frá Garðabæ, kl. 23:16.`
- forecast bucket: `Veðurspáin þar er kl. 23:00.` only if needed

### 5. Use correct Icelandic origin wording

Do not pass raw `origin?.name` into `frá {origin}`.

Use the same dative/place helper that `SlotDetail` uses (`getOriginDisplay(...)`) or extract/share it safely. Expected examples:

- `frá Garðabæ`
- `frá Akranesi`
- `frá Akureyri`

### 6. Handle first-point wording

If the most demanding point is the first point / `distKm === 0`, do not suppress the line.

Use copy along these lines:

`Mest krefjandi er við upphaf ferðarinnar, kl. HH:mm.`

Add translations in `messages/is.json` and `messages/en.json`.

### 7. Add inline lowercase Icelandic date formatting

Current `formatCompactDateTime` returns `Mið. 8. júl kl. 22:34` for Icelandic.

That is fine for standalone labels if desired, but not inside a sentence. Add one of these:

- `formatCompactDateTime(..., { casing: 'sentence' | 'standalone' })`
- or a separate `formatInlineDateTime(...)`

Use lowercase Icelandic weekday at least in sentence contexts:

- `Komutími mið. 8. júl kl. 23:30, spáin þar kl. 00:00:`
- `Brottför: mið. 8. júl kl. 22:34` if used inline

Standalone lines may be either capitalized or lowercased, but be consistent and natural.

### 8. Keep the disclaimer below the summary

The Vegagerðin disclaimer is still useful. Keep it after the compact summary, but make sure it does not feel like part of the three-row itinerary.

## Scope guardrails

Do not:

- implement Phase 2 trend arrows
- add night filters
- redesign the drawer
- change SQL, Supabase, RLS, auth, usage tracking, billing, secrets or deployment
- commit, push or deploy unless Stebbi explicitly asks for that separately

## Suggested implementation order

1. Add optional `showSelectedDetail` prop and hide old detail box in the top card.
2. Refactor the top summary markup into a small local render block or local component in `FerdalagidClient.tsx`.
3. Fix route ETA, dative origin and first-point copy while touching `Á leiðinni`.
4. Add lowercase inline date helper and update the relevant strings.
5. Run `npm run type-check`.
6. Run the focused/existing test command Claude Code normally uses for this area, or full `npm run test:run` if cheap.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` on localhost with an authenticated user.
2. Run a route that crosses midnight, e.g. Garðabær -> Akranes or Akureyri -> Garðabær.
3. Select a departure time in the scrubber.
4. Expected: the old bordered selected-slot detail box under the scrubber is gone from the top card.
5. Expected: the area under the scrubber reads as one compact, polished travel summary with `Brottför`, `Á leiðinni`, `Áfangastaður`.
6. Expected: no redundant green/yellow/red dot appears under `Brottför`.
7. Expected: the section hierarchy is clear at mobile width without feeling like three separate debug panels.
8. Expected: the most demanding point time matches the route ETA shown in detail contexts, not just the forecast bucket hour.
9. Expected: Icelandic inline dates use lowercase weekday names in sentences, e.g. `Komutími mið. 8. júl kl. 23:30...`.
10. Expected: common place wording reads naturally, e.g. `frá Garðabæ`.
11. Regression check: sticky day marker in the scrubber still works and stays inside the scrubber row.
12. Regression check: the destination forecast drawer still opens from `Skoða spána á áfangastað betur`.

