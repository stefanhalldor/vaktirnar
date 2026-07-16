# 2026-07-16 09:41 - TODO-086 v324 - Codex review of v323 prerelease

Relevant handoff: `2026-07-16-0940-todo-086-v323-claude-v321-v322-done-prerelease`

## Findings

### Medium - Departure context text is now much longer than requested

`messages/is.json:770`
`app/auth-mvp/vedrid/FerdalagidClient.tsx:1581-1589`

Stebbi asked to replace the old two-column row:

```text
Brottför    fim. 16. júl kl. 08:25
```

with a single, clear line:

```text
Allur útreikningur miðast við brottför fim. 16. júl kl. 08:25
```

and explicitly noted that it should preferably fit on one line.

v323 instead added:

```text
Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað <b>{departure}</b>. Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma.
```

That is too long for the intended compact result view. It will almost certainly wrap on mobile, and it reads like explanatory copy rather than a crisp selected-state line.

Recommended fix:

```json
"departureCalculationContext": "Allur útreikningur miðast við brottför <b>{departure}</b>"
```

If this still wraps awkwardly at 360 px, use the shorter product-safe version:

```json
"departureCalculationContext": "Miðað við brottför <b>{departure}</b>"
```

Do not include the second sentence. The scrubber is already directly above the text and teaches that the user can select another time.

### Low - The duplicate CTA fix still shows the short full-link in `denied` state

`components/weather/VedurstofanPulseInline.tsx:157-164`

v323 changed:

```tsx
{fullHref && postingAccess !== 'needs-login' && (...)}
```

The v323 handoff says `denied` should show neither link, but this condition still renders `pulseViewMore` when `postingAccess === 'denied'` and `fullHref` exists.

Recommended fix:

```tsx
{fullHref && postingAccess === 'allowed' && (...)}
```

That keeps the intended states:

- public / needs-login: only `Sjá fleiri skilaboð eða segja frá aðstæðum`
- logged-in / allowed: composer + one `Sjá fleiri skilaboð`
- denied: no CTA

This is probably not a common happy-path issue, but it is a mismatch between stated behavior and code.

### No blocker - Ferry and window notes were preserved

`app/auth-mvp/vedrid/FerdalagidClient.tsx:1590-1604`

The old `Brottför` row also contained ferry and best-window notes. v323 moved those below the new context line instead of deleting them. That is the right preservation move.

### No blocker - Public duplicate link should be fixed for the screenshot case

`components/weather/VedurstofanPulseInline.tsx:149-164`

For `postingAccess === 'needs-login'`, the short `Sjá fleiri skilaboð` link is now suppressed. That should remove the two-link screenshot issue for public users.

## Recommended next instruction for Claude Code

```text
Lagfæra bara tvö smáatriði úr v323:

1. Stytta departureCalculationContext í messages/is.json og messages/en.json.
   IS: "Allur útreikningur miðast við brottför <b>{departure}</b>"
   EN: "All calculations are based on departure <b>{departure}</b>"
   Ekki hafa seinni útskýringarsetningu.

2. Í components/weather/VedurstofanPulseInline.tsx:
   Breyta short full-link skilyrðinu úr:
   fullHref && postingAccess !== 'needs-login'
   í:
   fullHref && postingAccess === 'allowed'

Ekki snerta útreikninga, sessionStorage, returnTo, SQL, env, auth eða card-refactor.
```

## Localhost checks for Stebbi

1. Open `/vedrid`, calculate a route, and inspect the scrubber area.
   - Expected: old `Brottför` row is gone.
   - Expected: the new line is concise, roughly:
     `Allur útreikningur miðast við brottför fim. 16. júl kl. 08:25`
   - Expected: no long second sentence.

2. Change selected departure slot.
   - Expected: the context line updates to the new time.

3. Test mobile widths 360 px, 390 px, and 460 px.
   - Expected: no horizontal overflow.
   - Expected: if the text wraps, it does so neatly and does not dominate the result card.

4. Public user, route result, Veðurstofan station with pulse messages:
   - Expected: one CTA only:
     `Sjá fleiri skilaboð eða segja frá aðstæðum`
   - Expected: no short duplicate `Sjá fleiri skilaboð`.

5. Logged-in user, same station:
   - Expected: inline composer visible.
   - Expected: at most one `Sjá fleiri skilaboð` full-pulse link.

No SQL, Supabase, Vercel, env, auth policy, secrets, production data, or user-data changes are needed for this correction.
