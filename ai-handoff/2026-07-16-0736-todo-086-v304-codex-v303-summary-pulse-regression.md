# 2026-07-16 07:36 - Codex review: v303 summary pulse regression

Created: 2026-07-16 07:36  
Timezone: Atlantic/Reykjavik  
Related TODO: todo-086  
Reviewed handoff: `2026-07-16-0732-todo-086-v303-claude-v302-done-released.md`

## Findings

### High - Veðurpúls is now rendered inside `Á leiðinni`, which Stebbi did not request

Production observation from Stebbi after v303:

> Púlsinn er kominn inná "Á leiðinni" sem ég hef aldrei beðið um og er að sjá núna fyrst á raun. Þurfum að fjarlægja þaðan. Á bara að vera á Veðurstofuspjöldunum.

Code inspection confirms the source:

- `components/weather/VedurstofanPointCard.tsx`
- `VedurstofanJourneySummary` renders `<VedurstofanPulseInline stationId={station.stationId} />`
- `VedurstofanJourneySummary` is the compact summary used in `app/auth-mvp/vedrid/FerdalagidClient.tsx` under the `Á leiðinni` section.

This is the wrong context for the pulse. `Á leiðinni` is a compact journey summary row, not a full Veðurstofan station card. Putting chat/pulse there makes the summary heavier, surprises the product, and mixes community reports into the decision summary before the user has chosen to inspect a station card.

Required hotfix:

- Remove `VedurstofanPulseInline` from `VedurstofanJourneySummary`.
- Keep `VedurstofanPulseInline` in `VedurstofanPointCard`.
- Keep the existing pulse behavior on full Veðurstofan station cards:
  - worst/selected Veðurstofan card when rendered as full card,
  - all Veðurstofan station cards in route details,
  - `/auth-mvp/vedrid/elta-vedrid` station detail.

Do not remove the reusable pulse component itself. This is a placement bug, not a chat-core/access bug.

### Medium - Avoid solving this by duplicating card logic

The right fix is not to fork the Veðurstofan card stack. Keep the shared data/model logic and make the display contexts explicit:

- `VedurstofanJourneySummary`: compact, no pulse, no composer.
- `VedurstofanPointCard`: full station card, pulse allowed.
- `VedurstofanPulseInline`: reusable pulse UI, unchanged unless needed.

If Claude Code wants stronger future-proofing, add an explicit prop such as `showPulse?: boolean` only to the full card or shared rendering layer. But the minimal hotfix is simply removing the pulse render from `VedurstofanJourneySummary`.

## Why This Matters

We have been careful to keep Veðurpúls as a reusable chat capability branded for weather, but its placement still needs to respect product context:

- Summary/decision rows should stay concise and task-focused.
- User-generated pulse belongs on inspection surfaces, especially station cards.
- Future Vegagerðin/live-point pulse should use the same rule: preview/composer on the point/card context, not injected into aggregate decision summaries unless explicitly designed later.

## Suggested Claude Code Fix

1. Edit `components/weather/VedurstofanPointCard.tsx`.
2. In `VedurstofanJourneySummary`, delete the final:

```tsx
<VedurstofanPulseInline stationId={station.stationId} />
```

3. Leave the final `<VedurstofanPulseInline stationId={station.stationId} />` inside `VedurstofanPointCard`.
4. If import becomes unused only after future edits, clean it up. It should remain used by `VedurstofanPointCard` now.
5. Run targeted checks:

```bash
npm run type-check
npm run test:run -- lib/__tests__/chat-access.test.ts lib/__tests__/guard.test.ts lib/__tests__/vedurpuls-preview.test.ts
```

If time is tight for a production hotfix, at minimum run `npm run type-check`.

## Localhost Checks for Stebbi

Use the same env shape as production test:

```env
WEATHER_ENABLED=All
TESKEID_CHAT_ENABLED=true
```

For public-open Veðurstofan/Pulse graduation, leave these unset/deleted:

```env
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
WEATHER_PULSE_ACCESS_REQUIRED
```

Checks:

1. Open `/vedrid` and calculate a route where Veðurstofan is visible/decisive.
2. Inspect the summary area under the scrubber:
   - `Á leiðinni` should not show `Nýjast af staðnum...`, pulse messages, composer, or `Sjá fleiri skilaboð`.
   - The weather assessment text and warning box should remain unchanged.
3. Scroll to full Veðurstofan station cards:
   - pulse preview/composer should still appear there for signed-in users.
   - public users should only see preview if messages exist, not empty prompt.
4. Open `/auth-mvp/vedrid/elta-vedrid`:
   - selected station detail should still show the pulse.
5. Open full pulse URL from a station card:
   - back/return behavior should still preserve the previous station context where implemented.

## Recommendation

This is a small, safe production hotfix candidate. It should be done before further pulse polish, because the current production behavior exposes the feature in a place Stebbi explicitly does not want it.

## Óvissa / þarf að staðfesta

- I did not run tests.
- I inspected the current code and v303 handoff only.
- If Claude Code changed placement again after v303, re-check the diff before applying the hotfix.
