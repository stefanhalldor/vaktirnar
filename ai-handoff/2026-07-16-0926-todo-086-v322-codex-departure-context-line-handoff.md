# 2026-07-16 09:26 - TODO-086 v322 - Codex handoff: departure context line above journey summary

## Goal

Replace the current structured-summary row:

```text
Brottför    fim. 16. júl kl. 08:25
```

with one clearer context line near the departure scrubber:

```text
Allur útreikningur miðast við brottför fim. 16. júl kl. 08:25
```

This should make it more obvious that all route weather, map coloring, worst point, Veðurstofan rows, and destination summary are based on the selected departure time.

## Design.md notes

Read and follow `Design.md`, especially:

- mobile-first layout
- no horizontal overflow
- text must not wrap/overflow awkwardly inside controls or compact panels
- app text should be clear, practical, and not hero-scale inside app surfaces
- structured summary panels should avoid repeating selected state immediately below the control that selected it

This change is exactly about removing a repeated structured row immediately under the scrubber and replacing it with a clearer single context line.

## Current code location

Primary file:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Current area:

- `FerdalagidClient.tsx:1577-1605`
- The visible `Brottför` row is the first section in the journey summary grid.

Relevant translation keys:

- `messages/is.json`
  - `sectionDeparture`
  - likely add new key near existing weather result keys
- `messages/en.json`
  - same key in English

## Required implementation

### 1. Add a new i18n key

Add a key under `teskeid.vedrid.ferdalagid`, near the existing heatmap / section keys.

Suggested Icelandic:

```json
"departureCalculationContext": "Allur útreikningur miðast við brottför {departure}"
```

Suggested English:

```json
"departureCalculationContext": "All calculations are based on departure {departure}"
```

Use the same formatted departure value currently shown in the `Brottför` row:

```ts
formatCompactDateTime(
  isVedurstofanOnly ? referenceDepartureIso! : activeOutboundCandidate!.departureIso,
  locale,
)
```

### 2. Render the new context line after the scrubber

Place the new line close enough to the scrubber that it clearly explains the selected slot.

Preferred placement:

- after `<DepartureHeatmap />`
- before the journey summary grid (`border-y ... divide-y ...`)

Suggested style:

```tsx
<p className="text-sm font-medium text-foreground leading-snug whitespace-normal sm:whitespace-nowrap">
  {tf('departureCalculationContext', { departure: formattedDeparture })}
</p>
```

However, avoid horizontal overflow on mobile. If the full text wraps badly at 360 px, use a responsive variant:

- desktop/tablet: `Allur útreikningur miðast við brottför fim. 16. júl kl. 08:25`
- narrow mobile: `Miðað við brottför fim. 16. júl kl. 08:25`

If using responsive text, make both variants translation keys, not hardcoded strings.

Do not use viewport-based font scaling.

### 3. Remove the old visible Brottför row

Remove the visible `Brottför` section from the summary grid:

```tsx
<section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
  <p>{tf('sectionDeparture')}</p>
  ...
</section>
```

Important: check whether any supporting details currently inside that row still need a home:

- ferry note
- best outbound window note
- return best window note

Do not silently delete meaningful product information. If those notes are still used in real flows, move them below the new context line as muted helper text, or confirm with Stebbi before dropping them.

For the common non-ferry route in the screenshot, the old row should be gone entirely.

### 4. Keep all calculations unchanged

This is display-only.

Do not change:

- selected departure logic
- scrubber selection
- `referenceDepartureIso`
- `activeOutboundCandidate`
- provider comparison
- Veðurstofan/met.no calculations
- sessionStorage restore
- pulse returnTo
- SQL/env/auth

## Scope guard

This should be a small UI/microcopy change only.

Do not refactor `DepartureHeatmap`, provider logic, card variants, or pulse behavior while doing this.

## Localhost checks for Stebbi

1. Open `/vedrid` and calculate a route.
2. On the result step, inspect the departure scrubber area.
   - Expected: the old two-column `Brottför` row below the scrubber is gone.
   - Expected: one clear sentence appears: `Allur útreikningur miðast við brottför ...`.
   - Expected: the date/time matches the selected scrubber slot.
3. Click another departure time in the scrubber.
   - Expected: the sentence updates to the newly selected departure time.
   - Expected: map, worst point, and summaries still update as before.
4. Test at mobile widths around 360 px, 390 px, and 460 px.
   - Expected: no horizontal overflow.
   - Expected: text does not collide with chips, scrubber, or the summary sections.
   - Acceptable: one tasteful line wrap on the narrowest screen only if it still looks intentional.
5. Test with Veðurstofan-only / met.no-only / both providers if available.
   - Expected: the line always uses the same departure time as the active calculation.
6. If ferry routes are supported in the selected test route:
   - Verify that any previously visible ferry context was not accidentally lost.

No SQL, Supabase, Vercel, env, auth, secrets, production data, or user-data changes are required for this task.
