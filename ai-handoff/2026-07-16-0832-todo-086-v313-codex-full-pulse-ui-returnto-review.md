# 2026-07-16 08:32 — Codex review: full pulse UI consistency and return flow

Created: 2026-07-16 08:32  
Timezone: Atlantic/Reykjavik  
Relevant TODO: `todo-086`  
Context: Stebbi localhost-tested public -> login -> full station pulse from `/vedrid`.

## Findings

### High — public -> login -> full pulse loses route context before “Til baka í ferðaveðrið”

Observed by Stebbi:

- Public user starts from a calculated `/vedrid` route.
- User clicks pulse CTA from a Veðurstofan station card.
- Login lands correctly on `/auth-mvp/vedrid/puls/stod/32097`.
- But the URL in the screenshot has no `?returnTo=...`.
- Clicking `Til baka í ferðaveðrið` sends user to `/auth-mvp/heim`, not back to the route result context.

Relevant code:

- `components/weather/VedurstofanPulseInline.tsx:110-116`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx:17-30`
- `components/teskeid/TeskeidLoginForm.tsx:122-126`
- `app/auth-mvp/minn-profill/page.tsx:100-111`

Likely causes to verify:

1. `returnTo` may not be present in the public card CTA href, or it may be dropped through nested `next` encoding.
2. If the user does not have a completed profile, `TeskeidLoginForm` sends them to `/auth-mvp/minn-profill` without preserving `nextHref`; profile save then sends to `/auth-mvp/heim`.

Recommended fix:

- Preserve the full pulse destination and `returnTo` through login:
  - Public CTA should generate a `next` similar to:
    - `/auth-mvp/vedrid/puls/stod/32097?returnTo=%2Fauth-mvp%2Fvedrid`
  - Login page URL should contain that nested next safely encoded.
  - After login, the final full pulse URL should still include `?returnTo=%2Fauth-mvp%2Fvedrid`.
- Preserve `nextHref` through incomplete-profile flow:
  - `TeskeidLoginForm` should send incomplete profile users to `/auth-mvp/minn-profill?next=<safeNext>`.
  - `minn-profill` should validate `next` with the same safe-next helper and redirect there after profile save.
  - If no safe next exists, fallback remains `/auth-mvp/heim`.
- Do not allow arbitrary external return URLs. Keep the existing internal `/auth-mvp/vedrid...` restriction.

Manual browser check after fix:

- Inspect the public CTA href before login.
- Confirm full pulse URL after login includes `returnTo`.
- Click `Til baka í ferðaveðrið` and confirm `/auth-mvp/vedrid` restores the public-calculated route via sessionStorage.

### Medium — full pulse page does not share the same compose UI contract as station cards

Stebbi specifically wants this to stay on the reusable chat track:

- reusable core = chat
- Veðurpúls is the first product use of that chat core
- inline station cards and full pulse page should not drift into separate UI implementations

Current split:

- Full page uses `components/chat/ScopedChatPanel.tsx`.
- Inline station cards use `components/weather/VedurstofanPulseInline.tsx`.
- Both use the same backend/domain idea, but the compose UI differs:
  - Full page has larger input/button styling and long placeholder.
  - Inline card has smaller/tighter compose styling and compact placeholder.

Recommended fix:

- Extract a shared generic chat composer component, for example:
  - `components/chat/ScopedChatComposer.tsx`
  - props: `value`, `onChange`, `onSend`, `disabled`, `sending`, `placeholder`, `sendLabel`, `variant`
  - variants: `compact` for station cards, `focus` or `full` for the full pulse page
- Use this shared composer from both:
  - `ScopedChatPanel`
  - `VedurstofanPulseInline`
- Keep the component product-agnostic. It should not know about Veðurstofan or weather.
- Veðurpúls-specific wording stays in `messages/is.json` and `messages/en.json`.

This keeps the reusable Teskeið chat core healthy while still allowing full-page pulse to have a slightly roomier layout.

### Medium — full pulse placeholder should use the same short wording as the station-card composer

Observed in screenshot:

- Full route placeholder text overflows/truncates visually:
  - `Hjálpaðu öðrum með því að deila þinni upplifun af aðstæ...`
- Stebbi wants it to say the same thing as the station-card composer.

Current messages:

- `pulseInputPlaceholder`: `Hjálpaðu öðrum með því að deila þinni upplifun af aðstæðunum`
- `pulseInputPlaceholderCompact`: `Hvernig eru aðstæður?`

Recommended fix:

- Use `pulseInputPlaceholderCompact` on the full pulse route too, unless Stebbi explicitly chooses a third full-page phrase.
- Do not reduce input font below 16px on mobile just to fit long placeholder text. `Design.md` says mobile `input/textarea/select` text should be at least 16px to avoid unwanted mobile zoom.
- If full-page pulse needs a more explanatory prompt, put it as normal text above the input, not as a long placeholder.

### Low — full pulse can be larger than inline, but it still needs visual consistency

Stebbi is okay with the full pulse page being larger because it has full focus. But it should still feel like the same Teskeið chat surface.

Guidance:

- Keep input and send button aligned in height.
- Keep send button text size, radius, border/background and disabled state aligned with the shared composer variant.
- Avoid the current feeling that the compose box and button are from a different UI scale than nearby text.
- Make sure the send button width does not jump between `Senda` and loading state.

## Design.md alignment

Relevant rules checked:

- Inputs must not cause mobile zoom; keep mobile font size >= 16px.
- Placeholder is not a label; use short placeholder text.
- Controls must not overflow or visually dominate compact cards.
- Navigation/back flows should preserve context and show predictable return behavior.
- Reusable components should be preferred over one-off UI drift.

## Commands run by Codex

Read-only inspection plus this review file:

- `rg -n "Vedurpuls|Veðurpúls|pulse|placeholder|Senda|returnTo|..." ...`
- Targeted reads of:
  - `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
  - `components/chat/ScopedChatPanel.tsx`
  - `components/weather/VedurstofanPulseInline.tsx`
  - `components/weather/VedurstofanPointCard.tsx`
  - `components/teskeid/TeskeidLoginForm.tsx`
  - `app/auth-mvp/minn-profill/page.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `messages/is.json`
  - `messages/en.json`
  - relevant `Design.md` sections
- `Get-Date -Format 'yyyy-MM-dd HH:mm'`

No product code, SQL, env, Supabase, commit, push or deploy changes were made by Codex.

## Suggested next step for Claude Code

Make a focused v314 patch:

1. Fix login/profile/returnTo preservation so full pulse returns to the exact route-result context.
2. Extract or introduce a shared chat composer used by both full pulse and inline station-card pulse.
3. Make full pulse use the same short placeholder as station-card pulse.
4. Keep mobile input font at least 16px; solve placeholder fit primarily with shorter copy, not tiny font.
5. Run targeted type-check/tests.

Do not broaden into new pulse features, moderation, AI summary, or Vegagerðin in this patch.

## Localhost checks for Stebbi

1. Public route-result flow:
   - Open `/vedrid`.
   - Calculate a route with Veðurstofan stations visible.
   - Click `Sjá fleiri skilaboð eða segja frá aðstæðum` from a station pulse preview.
   - Expected: login flow lands on the full pulse URL with the station open.
   - Expected: URL or internal state preserves return context.

2. Back from full pulse:
   - Click `Til baka í ferðaveðrið`.
   - Expected: returns to `/auth-mvp/vedrid` with the same route result restored, not `/auth-mvp/heim`.
   - Expected: same origin/destination/result context is visible.

3. Incomplete-profile flow:
   - Test with a user missing display name if possible.
   - Expected: after setting profile name, user continues to the intended full pulse/route context, not home.

4. Full pulse compose UI:
   - Open `/auth-mvp/vedrid/puls/stod/<stationId>`.
   - Expected: compose box/button look related to the inline station-card composer.
   - Expected: placeholder fits and uses the same short wording as station cards.
   - Expected: send button state does not resize or jump.

5. Mobile width:
   - Test around 360px, 390px, and 546px viewport width.
   - Expected: no horizontal overflow, no placeholder clipped awkwardly, no mobile zoom caused by input focus.

## Uncertainty / needs confirmation

- I did not browser-inspect the actual public CTA href. Claude Code should verify whether `returnTo` is missing at CTA generation time or lost during login/profile redirects.
- I inferred the incomplete-profile risk from code inspection. It may not be the exact path Stebbi hit, but it is a real context-loss path and should be fixed or explicitly deferred.
