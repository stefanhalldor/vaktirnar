# 2026-07-16 05:50 - TODO-086 v291 - Codex addendum: unify Veðurpúls component and returnTo contract

Created: 2026-07-16 05:50
Timezone: Atlantic/Reykjavik

Context:
- Follows `2026-07-16-0546-todo-086-v290-codex-v289-inline-pulse-review`
- Incorporates Stebbi's clarification after v290

## Stebbi's clarification

Stebbi is not asking for a one-off fix only on `/vedrid`.

The intended direction is:

- `/auth-mvp/vedrid/elta-vedrid` and `/auth-mvp/vedrid` should show the same Veðurpúls behavior.
- The implementation should share one component/adapter as much as possible.
- `returnTo` logic should be common and reusable.
- The visual contract should start from the `/vedrid` route-card context for now.
- It is acceptable if future placements have slight visual variants, but the default should be identical until we have a real reason to diverge.

In short:

> Same logic, same component, same behavior; only controlled visual variants when explicitly needed.

## Findings / required direction

### High - Do not keep separate `/elta-vedrid` and `/vedrid` pulse implementations

Current state appears to have:

- `WeatherPulseSummary` inside `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `VedurstofanPulseInline` inside `components/weather/VedurstofanPulseInline.tsx`

These are now product-wise the same thing:

- public preview
- posting composer for allowed signed-in users
- login/access handling
- latest messages
- full pulse link
- route-aware return behavior

Claude Code should consolidate them.

Recommended target:

- Keep `VedurstofanPulseInline` or rename to something clearer like `VedurstofanPulsePanel`.
- Use it from both:
  - station detail in `/auth-mvp/vedrid/elta-vedrid`
  - Veðurstofan station cards/summaries in `/auth-mvp/vedrid`
- Remove or reduce `WeatherPulseSummary` to a thin wrapper if still needed temporarily.
- Do not duplicate preview fetching, posting access checks, composer logic, or full-link construction in two places.

This still preserves the architecture boundary:

- reusable generic core = Chat
- weather adapter = Veðurpúls
- `/vedrid` and `/elta-vedrid` are consumers of the same adapter

### High - `returnTo` must be a shared contract across all pulse entry points

Every place that links to full pulse should use the same return contract.

Recommended API shape for the shared component:

```ts
type VedurstofanPulsePanelProps = {
  stationId: string
  returnTo?: string
  fullHref?: string
  showFullLink?: boolean
  variant?: 'card' | 'summary'
}
```

Exact prop names can differ, but the responsibilities should be clear:

- The host knows the current product context.
- The shared pulse component knows how to build the full pulse link.
- The full pulse route validates and uses `returnTo`.

Important invariant:

> If a pulse panel is rendered for station X, the full pulse link must always be able to return to station X's original context.

For `/elta-vedrid`:

- `returnTo` should be `/auth-mvp/vedrid/elta-vedrid?stationId=X`
- Build it from the rendered `stationId`, not from possibly stale `useSearchParams()`.

For `/vedrid` route results:

- Start from the route result context.
- If the route result can be URL-backed/restored, pass that as `returnTo`.
- If the route result is not currently restorable, do not show the full link yet in route-result cards.
- Inline preview + inline composer can remain visible in `/vedrid` even if full link is temporarily hidden.

### Medium - The composer is mobile-safe but visually too dominant in compact weather cards

Stebbi's screenshot shows the input and send button overpowering the surrounding text. The previous v288 fix correctly avoided iOS zoom by using `text-base`, but the visual result is too large compared with the pulse preview around it.

Do not solve this by making mobile input text smaller than 16 px.

Recommended approach:

- Keep mobile input at 16 px to avoid iOS zoom.
- Use responsive sizing:
  - mobile: `text-base min-h-10`
  - larger screens: `sm:text-sm` if this matches the surrounding card better
- Make the row visually calmer:
  - softer border/background
  - less dominant send button color, for example secondary/quiet style rather than heavy gray pill
  - shorter placeholder in compact contexts if needed
  - stable 40 px touch target, but visually aligned to nearby content
- Consider a compact variant:

```tsx
variant="compact"
```

where the component still remains accessible but less visually loud.

The goal is not tiny controls. The goal is app-like controls that do not dominate a weather-status card.

### Medium - Start by making `/vedrid` the source of truth for the visual contract

Stebbi wants the look to be exactly the same for now, and to work from the route cards on `/vedrid`.

Recommended sequence:

1. Finalize the panel look in `/vedrid` route-card context.
2. Reuse the exact same panel in `/elta-vedrid`.
3. Only introduce variants later if a specific placement proves it needs one.

This avoids accidental divergence and keeps the feature easier to reason about.

## Suggested implementation plan for Claude Code

Keep this as one narrow refactor pass:

1. Create/keep one shared weather adapter component for Veðurpúls station panels.
2. Move the common behavior into it:
   - public preview load
   - posting access check
   - composer shown only for allowed signed-in users
   - login prompt for anonymous users
   - latest 3 messages
   - full pulse link builder
3. Replace `WeatherPulseSummary` in `/elta-vedrid` with the shared component.
4. Keep `/vedrid` route cards using the same shared component.
5. Add a shared helper for building station return URLs:
   - `/elta-vedrid` always includes `stationId`
   - `/vedrid` only passes a restorable route context if safe
6. Adjust compact visual style without violating mobile input rules.
7. Do not touch SQL, RLS, env vars, feature flags, migrations, or unrelated chat APIs.

## Localhost checks for Stebbi

After Claude Code implements the follow-up:

### `/vedrid` route context

1. Open `/vedrid` or `/auth-mvp/vedrid` with Veðurstofan visible.
2. Build a route that produces Veðurstofan station cards.
3. Confirm the Veðurpúls panel:
   - looks visually balanced inside the card
   - shows latest messages or empty state
   - shows composer only for signed-in users with access
   - does not cause mobile zoom on input focus
4. If `Sjá fleiri skilaboð` is visible:
   - open it
   - tap `Til baka`
   - expected: return to the same route-result context, not a fresh station explorer.

### `/elta-vedrid` station explorer

5. Open `/auth-mvp/vedrid/elta-vedrid`.
6. Select a station.
7. Confirm the Veðurpúls panel is the same component/look as `/vedrid`.
8. Open full pulse and go back.
9. Expected: returns to `/auth-mvp/vedrid/elta-vedrid?stationId=X`, with the same station selected.

### Anonymous behavior

10. Log out or use a private window.
11. Confirm public preview remains visible.
12. Confirm composer is not shown.
13. Confirm login prompt points to `/innskraning`.

## SQL / Supabase

No SQL should be needed for this follow-up.

Do not run migrations.
Do not change RLS, policies, grants, functions, or production data.

## Óvissa / þarf að staðfesta

- It may not yet be possible to restore the full `/vedrid` route result from a URL. If that is true, hide the full pulse link in `/vedrid` cards for now rather than shipping a link that drops context.
- The exact compact styling should be checked on mobile width. Do not reduce mobile input font below 16 px to solve visual density.
