# TODO 085 - Codex review of v015 release

Created: 2026-07-11 12:05
Timezone: Atlantic/Reykjavik
Agent: Codex
Type: Release review
Related TODO: #85 Wind threshold simplification and fine-grained wind labels
Reviewed handoff: `2026-07-11-1142-todo-085-v015-claude-released.md`

## Findings

No blocking findings found in code review.

The v015 implementation addresses the issue from v014 in the right place:

- Tailwind class metadata moved from `lib/weather/windDisplayStatus.ts` to `components/weather/windStatusUi.ts`, which is inside Tailwind's scanned `components/` tree.
- `lib/weather/windDisplayStatus.ts` now keeps only domain/display identifiers and hex map colors.
- `Óþægilegt` marker color is now distinct orange: `#f97316`.
- Scrubber dots now render non-color cues for the endpoints of the scale:
  - `innan-marka`: green circle with white check icon.
  - `haettulegt`: red circle with white warning icon.
- Map markers now add non-color labels on non-endpoint markers:
  - `innan-marka`: `✓`
  - `haettulegt`: `!`
- Origin/destination map labels are intentionally not touched in the update effect.

## Minor Note

`components/weather/TravelAuditMap.tsx` clears non-endpoint marker labels using:

```ts
marker.setLabel('' as unknown as google.maps.MarkerLabel)
```

This is not release-blocking because type-check passes and an empty label should render as no visible label. If this area is touched again, prefer a cleaner helper or `null` if the Google Maps typings allow it in this project.

## Verification Run By Codex

Commands run:

```bash
npm run type-check
npm run test:run -- lib/__tests__/weather-wind-distance.test.ts
npm run test:run
```

Results:

- `npm run type-check`: exit 0
- `npm run test:run -- lib/__tests__/weather-wind-distance.test.ts`: exit 0, 1 file passed, 9 tests passed
- `npm run test:run`: exit 0, 69 files passed, 2129 tests passed, 27 skipped, 8 todo

## Release Recommendation

This is good to keep released, assuming the production/Vercel deployment itself is green and Stebbi's browser check confirms the visual treatment.

The important browser check is visual rather than TypeScript:

- `Óþægilegt` must be orange in pill, scrubber dot, and map marker.
- `Nálgast óþægindi` must remain amber/yellow and visually distinct from orange.
- `Innan marka` and `Hættulegt` must have non-color cues in scrubber/map.

## Localhost Checks for Stebbi

1. Open `/vedrid`.
2. Use a route and thresholds that produce at least:
   - `Innan marka`
   - `Nálgast óþægindi`
   - `Óþægilegt`
   - `Ófullnægjandi gögn`
3. Confirm the pill row remains ordered safe to dangerous:
   - `Innan marka`
   - `Nálgast óþægindi`
   - `Óþægilegt`
   - `Nálgast hættumörk`
   - `Hættulegt`
   - `Ófullnægjandi gögn`
4. Confirm the `Óþægilegt` pill has an orange dot and orange active state.
5. Confirm `Óþægilegt` scrubber dots are orange and distinct from amber/yellow `Nálgast óþægindi`.
6. Confirm `Innan marka` scrubber dots show a white checkmark.
7. If a route can produce `Hættulegt`, confirm dangerous scrubber dots show a warning icon.
8. Open the map section.
9. Confirm `Óþægilegt` map markers are orange and distinct from `Nálgast óþægindi`.
10. Confirm `Innan marka` non-endpoint map markers show `✓`.
11. If a route can produce `Hættulegt`, confirm dangerous non-endpoint map markers show `!` or equivalent warning cue.
12. Confirm origin/destination marker labels (`Frá`/`Til`) are unchanged.
13. Confirm no measured hviður/gust values appear in result text, map details, point cards, comparison strip, or drawer.

No SQL, RLS, auth, Supabase, secrets, billing, production data, or deployment changes are involved in this review.

## Óvissa / þarf að staðfesta

- I did not run a browser screenshot check. The final color/icon verdict depends on Stebbi's localhost or production visual check.
- I did not verify Vercel deployment status. Claude's handoff says Vercel was deploying; Stebbi/Claude should confirm the deployment is green before considering the release fully closed.
