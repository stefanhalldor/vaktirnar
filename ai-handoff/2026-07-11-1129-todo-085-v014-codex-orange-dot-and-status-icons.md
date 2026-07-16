# TODO 085 - Orange status dot and non-color status icons

Created: 2026-07-11 11:29
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Post-release UI bug handoff
Related TODO: #85 Wind threshold simplification and fine-grained wind labels
Reviewed release handoff: `2026-07-11-1118-todo-085-v013-claude-released.md`

## Stebbi's Observation

After the v013 release, the ordering is better, but two UI issues remain:

1. `Óþægilegt` is still missing the orange dot in:
   - filter pill
   - scrubber dots
   - map markers
2. The best and worst weather statuses should not rely only on color:
   - `Innan marka` should use a green checkmark in the scrubber and map.
   - `Hættulegt` should use a warning triangle in the scrubber and map.

This is especially important for colorblind users and for quick scanning.

## Likely Root Cause

`lib/weather/windDisplayStatus.ts` currently stores Tailwind class strings such as:

```ts
dotClass: 'bg-orange-500'
borderClass: 'border-orange-500'
chipActiveClass: 'border-orange-500 bg-orange-50 text-orange-700'
```

But `tailwind.config.js` only scans:

```js
content: [
  './pages/**/*.{ts,tsx}',
  './components/**/*.{ts,tsx}',
  './app/**/*.{ts,tsx}',
  './src/**/*.{ts,tsx}',
]
```

It does not scan `./lib/**/*.{ts,tsx}`.

So Tailwind may purge classes that only exist in `lib/weather/windDisplayStatus.ts`. This likely explains why some color classes render and others disappear depending on whether the same class happens to exist elsewhere in scanned files.

Do not fix this by randomly changing colors. Fix the class availability/design boundary.

## Recommended Fix

### 1. Move UI style metadata out of `lib/`

Preferred path:

- Keep `lib/weather/windDisplayStatus.ts` domain-ish:
  - status type
  - ordering
  - classifier helpers
  - optional hex colors if needed for Google Maps
- Move Tailwind class metadata to a scanned UI file, for example:
  - `components/weather/windDisplayStatusUi.ts`

That file can export:

```ts
export const WIND_STATUS_UI_META = {
  ...
}
```

Then update:

- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`

to import UI class metadata from `components/weather/windDisplayStatusUi.ts`.

Alternative minimal fix:

- Add `./lib/**/*.{ts,tsx}` to `tailwind.config.js` content.

But the preferred fix is cleaner because Tailwind UI classes do not really belong in `lib/weather`.

### 2. Use distinct amber vs orange colors

Right now map marker hex colors are not distinct enough:

```ts
'othaegilegt':        '#f59e0b',
'nalgast-othaegindi': '#f59e0b',
```

They should be separate:

- `nalgast-othaegindi`: amber/yellow, e.g. `#f59e0b` or `#fbbf24`
- `othaegilegt`: orange, e.g. `#f97316` or `#ea580c`

For Tailwind classes:

- `nalgast-othaegindi`: `bg-amber-400`, `border-amber-400`, `bg-amber-50`, `text-amber-700`
- `othaegilegt`: `bg-orange-500`, `border-orange-500`, `bg-orange-50`, `text-orange-700`

Verify in browser that the orange dot appears in both pill and scrubber.

### 3. Add non-color icons to scrubber dots

In `DepartureHeatmap`, the scrubber currently renders only colored circles:

```tsx
<span className={`w-4 h-4 rounded-full ${meta.dotClass}`} aria-hidden />
```

Replace with a small `StatusDot` / `WindStatusDot` component with stable dimensions:

- `innan-marka`: green circle with white checkmark.
- `haettulegt`: red circle with white warning triangle or `!`.
- intermediate states: colored circle only, or small emoji if it remains readable.
- `no_data`: muted grey circle/dash.

Use lucide icons if practical:

- `Check`
- `TriangleAlert`

Make sure dots keep fixed dimensions and do not shift the scrubber.

### 4. Add non-color icons to map markers

For Google Maps markers, do not rely only on fill color for best/worst statuses.

Options:

1. Replace `makeRouteSymbolIcon` with a helper that can return a small SVG data URL for `innan-marka` and `haettulegt`:
   - green circle + check
   - red circle + warning triangle / exclamation
   - other statuses can remain normal colored circles
2. Or use Google marker label text for non-origin/destination route points:
   - `✓` for `innan-marka`
   - `!` or `⚠` for `haettulegt`

Be careful not to break origin/destination marker labels. Those already use labels like `Frá` / `Til`.

Recommended minimal approach:

- Keep origin/destination labels unchanged.
- For regular forecast route points, use icon SVG for `innan-marka` and `haettulegt`.
- Keep selection stroke behavior.

### 5. Keep pill labels accessible

Pills already include text and emoji. Keep that.

For `Óþægilegt`, the acceptance criterion is not just "emoji appears"; it needs:

- visible orange dot
- orange active chip background/border
- orange scrubber dot
- orange map marker

## Acceptance Criteria

- `Óþægilegt` pill shows a clearly orange dot.
- `Óþægilegt` active pill has a clear orange border/background treatment.
- `Óþægilegt` scrubber slots render as orange, not amber/yellow and not missing color.
- `Óþægilegt` map markers render as orange, distinct from `Nálgast óþægindi`.
- `Innan marka` scrubber dots show a checkmark, not only green color.
- `Hættulegt` scrubber dots show a warning marker, not only red color.
- `Innan marka` map markers show a checkmark/clear best-status marker where practical.
- `Hættulegt` map markers show a warning marker where practical.
- No layout shift in the scrubber.
- No hviður/gust values are reintroduced.

## Localhost Checks for Stebbi

1. Open `/vedrid` on localhost.
2. Use a route/threshold setup that creates at least:
   - `Innan marka`
   - `Nálgast óþægindi`
   - `Óþægilegt`
   - `Nálgast hættumörk`
   - `Ófullnægjandi gögn`
3. Confirm the `Óþægilegt` pill has an orange dot and orange active treatment.
4. Confirm `Óþægilegt` scrubber dots are orange and visually distinct from `Nálgast óþægindi`.
5. Confirm `Innan marka` scrubber dots include a checkmark.
6. If a route can produce `Hættulegt`, confirm dangerous scrubber dots include a warning triangle / warning marker.
7. Open the map section.
8. Confirm `Óþægilegt` map markers are orange and distinct from near-discomfort markers.
9. Confirm `Innan marka` map markers include a checkmark or other non-color best-status cue.
10. If a route can produce `Hættulegt`, confirm dangerous map markers include a warning marker.
11. Confirm the scrubber does not jump or resize when statuses/icons vary.
12. Confirm no measured hviður/gust values appear in result text, map details, point cards, comparison strip, or drawer.

No SQL, RLS, auth, Supabase, secrets, billing, production data, or deployment changes are involved.

## Óvissa / þarf að staðfesta

- I did not browser-test the released build. The Tailwind purge explanation is based on code inspection of `tailwind.config.js` and `lib/weather/windDisplayStatus.ts`.
- If Claude Code chooses the minimal route of adding `./lib/**/*` to Tailwind content, confirm build size/side effects are acceptable. My preference is moving UI class metadata into `components/weather/`.
