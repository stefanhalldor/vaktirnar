# 2026-07-16 09:23 - TODO-086 v321 - Codex review of v320 duplicate pulse CTA

Relevant handoff: `2026-07-16-0919-todo-086-v320-claude-v319-done-prerelease`

## Findings

### Medium - Public pulse preview renders two links for the same action

`components/weather/VedurstofanPulseInline.tsx:149-164`

When `postingAccess === 'needs-login'` and `returnTo` exists, the component renders both:

- `pulseLoginCta`: `Sjá fleiri skilaboð eða segja frá aðstæðum`
- `pulseViewMore`: `Sjá fleiri skilaboð`

That matches Stebbi's screenshot with two buttons/links. The longer text is the right CTA because it explains both outcomes: public user can see more messages and can log in to report conditions.

Recommended fix:

```tsx
const showFullPulseLink = Boolean(fullHref) && postingAccess !== 'needs-login'
```

Then render the short `pulseViewMore` link only when `showFullPulseLink` is true. In practice:

- Public / needs login: show only `Sjá fleiri skilaboð eða segja frá aðstæðum`
- Logged-in / can post: composer remains visible, and `Sjá fleiri skilaboð` may remain as the full-pulse link
- Direct no-returnTo contexts: unchanged

This should be a tiny conditional rendering change. No SQL, auth, env, sessionStorage, route restore, or card refactor should be touched.

### Low - v320 was broader than the minimal returnTo fix, but not wildly out of scope

`components/weather/VedurstofanPointCard.tsx:112-151`
`app/auth-mvp/vedrid/FerdalagidClient.tsx:1617-1627`

Strictly speaking, v319 only required threading `returnTo` through the map overlay path so all full Veðurstofan cards behaved the same:

- map selected/worst
- all forecast points
- full station cards opened from route context

v320 additionally folded `VedurstofanJourneySummary` into `VedurstofanPointCard` via `variant="compact"`. That is more than the smallest possible change, but it is aligned with the product direction Stebbi has repeated: all Veðurstofan card contexts should share one card API and one display model where practical.

I would not roll this back only because it is bigger. The compact variant explicitly does not render the pulse, which preserves the v304 rule that pulse must not appear in the `Á leiðinni` summary.

### No blocker - returnTo is now correctly threaded into the map overlay

`components/weather/TravelAuditMap.tsx:109-110`
`components/weather/TravelAuditMap.tsx:684-694`
`components/weather/TravelAuditMap.tsx:717-762`
`app/auth-mvp/vedrid/FerdalagidClient.tsx:1842-1845`

This is the actual v319 fix and it looks right: `vedurstofanReturnTo` is passed from the route result into `TravelAuditMap`, then into `OverlayPointDetailsPanel`, and finally into `VedurstofanPointCard`.

That means the full card in the map overlay should now carry the same `returnTo=/auth-mvp/vedrid` contract as the cards in `Allir spápunktar`.

## Scope answer for Stebbi

We did go a little beyond the smallest possible patch, because v320 unified the compact `Á leiðinni` renderer into `VedurstofanPointCard`. But the original intention was still respected:

- `Á leiðinni`: compact Veðurstofan summary, no pulse
- selected/worst map overlay: full Veðurstofan card, pulse with route `returnTo`
- all forecast points: full Veðurstofan card, pulse with route `returnTo`

The duplicate-link bug is not evidence that the returnTo fix was wrong. It is just an overly broad render condition inside `VedurstofanPulseInline`.

## Recommended next instruction for Claude Code

```text
Lagfæra bara duplicate CTA í Veðurpúlsi:

Í components/weather/VedurstofanPulseInline.tsx:
- Þegar postingAccess === 'needs-login' á aðeins að birtast einn linkur:
  "Sjá fleiri skilaboð eða segja frá aðstæðum"
- Ekki birta styttri "Sjá fleiri skilaboð" linkinn á sama tíma.
- Styttri "Sjá fleiri skilaboð" má áfram birtast fyrir innskráðan notanda sem getur skrifað og vill opna fullan púls.

Ekki snerta route restore, sessionStorage, SQL, env, auth eða card-refactor að öðru leyti.
```

## Localhost checks for Stebbi

1. Public user, calculated `/vedrid` route, Veðurstofan card with existing pulse messages:
   - Expected: only one pulse link appears.
   - Expected text: `Sjá fleiri skilaboð eða segja frá aðstæðum`.
   - Expected: clicking it opens login and preserves the pulse URL with route `returnTo`.

2. After login from that public flow:
   - Expected: full pulse page opens.
   - Expected: `Til baka í ferðalagið mitt` is visible and returns to the restored calculated route.

3. Logged-in user, same route card:
   - Expected: compact composer is visible inline.
   - Expected: no duplicate pair of links.
   - Acceptable: a single `Sjá fleiri skilaboð` link remains to open the full pulse.

4. Station explorer `/auth-mvp/vedrid/elta-vedrid`:
   - Expected: no regression in station selection.
   - Expected: if a full pulse link exists there, it returns to the station explorer context, not the route result.

No Supabase, SQL, Vercel, env, auth policy, or production-data testing is needed for this specific fix.
