# TODO 086 v359 - Codex release review of v358 date-label fix

Created: 2026-07-16 21:12
Timezone: Atlantic/Reykjavik
Author: Codex
Related handoffs:
- `2026-07-16-2041-todo-086-v357-codex-v356-date-format-review.md`
- `2026-07-16-2050-todo-086-v358-claude-v357-done-prerelease.md`

## Findings

1. **Medium: not every weather date formatter follows the new Icelandic month contract**

   v358 correctly updates the main summary/card path:

   - `components/weather/travelAuditMap.helpers.ts`
   - `components/weather/DepartureHeatmap.tsx`
   - `components/weather/VedurstofanPointCard.tsx`

   But there are still user-facing weather date paths with old or browser-dependent month labels:

   - `app/auth-mvp/vedrid/FerdalagidClient.tsx:2191-2240` uses `CMP_IS_MONTH = ['jan', 'feb', 'mar', ... 'júl', ...]` for the origin/destination comparison table.
   - `app/auth-mvp/vedrid/FerdalagidClient.tsx:2280-2293` uses `toLocaleDateString(... month: 'short')` for best/return window ranges, which can drift from Stebbi's product-specific list.
   - `lib/weather/travel.ts:310-327` still has `mar.`, `apr.`, `jún.`, `júl.`, `ágú.` for deterministic text/window output.

   This is not necessarily a blocker for v358 if the release scope is only the summary sentence, scrubber label and combined met.no/Veðurstofan cards. It is a blocker if the requirement is "all weather UI date labels now follow the new list".

2. **Low: comments still document the old output**

   These are not runtime bugs, but they will mislead the next person:

   - `components/weather/VedurstofanForecastRows.tsx:25`
   - `components/weather/travelAuditMap.helpers.ts:196`
   - `components/weather/travelAuditMap.helpers.ts:217`
   - `components/weather/ForecastDrawer.tsx:21`

   Not a release blocker, but worth cleaning while touching date helpers.

3. **Low/mobile: always-date-aware Veðurstofan rows need localhost visual confirmation**

   `components/weather/VedurstofanPointCard.tsx` now always passes `showDate` for prev/used/next forecast rows. The row uses `flex-wrap`, so it should wrap rather than overflow, but longer labels such as `fim. 17. september kl. 15:00` need actual mobile visual testing at 360-390 px.

## Release recommendation

**Conditional green.**

I would allow this to go out only if Stebbi accepts that v358 fixes the visible summary/scrubber/card issue but does not yet unify every date formatter in the weather product.

If Stebbi wants the new month contract to be complete across all weather surfaces before release, ask Claude Code for one small follow-up before release:

- Update `CMP_IS_MONTH` in `FerdalagidClient.tsx`.
- Replace the local `formatWindowRange()` Icelandic `Intl short` path with the product month list.
- Update `lib/weather/travel.ts` `IS_MONTHS`.
- Update stale comments.
- Add or update a focused test where practical.

## Verification run by Codex

- `npm run type-check` -> pass
- `npm run test:run -- lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/chat-format.test.ts` -> pass, 95 tests

## Localhost checks for Stebbi

Before release, test these on localhost:

1. Open `/vedrid` at 360-390 px mobile width.
2. Pick a route and departure tomorrow or later.
3. Confirm the scrubber day label says `júlí`, `júní`, `ágúst`, etc. according to the new list.
4. Confirm the summary sentence says e.g. `sunnudaginn 19. júlí kl. 10:00`.
5. Confirm met.no worst/selected/all point cards show the new date labels.
6. Confirm Veðurstofan worst/selected/all station cards show date-aware `Brottfarartími`, ETA, `Spá gefin út`, and forecast rows.
7. Confirm no horizontal overflow in the Veðurstofan forecast rows.
8. Optional but recommended: open "Fyrir þá sem eru að elta veðrið" / comparison area and check whether old month labels remain there. If they do, decide whether that is acceptable for this release.

No SQL, RLS, Supabase, auth, env or production-data behavior is touched by v358.

## Notes

The current worktree also has untracked handoff files and `.claude/` / `.obsidian/`. Do not include those accidentally in any commit unless Stebbi explicitly wants them committed.
