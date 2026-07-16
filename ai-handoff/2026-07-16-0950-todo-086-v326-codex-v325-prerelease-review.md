# 2026-07-16 09:50 - TODO-086 v326 - Codex review of v325 prerelease

Relevant handoff: `2026-07-16-0948-todo-086-v325-claude-v324-done-prerelease`

## Findings

### High - `<br/>` is not interpreted by the rich text formatter

`messages/is.json:770`
`messages/en.json:766`
`app/auth-mvp/vedrid/FerdalagidClient.tsx:1582-1589`

v325 uses:

```json
"... <b>{departure}</b>.<br/>Veldu annan ..."
```

and passes:

```tsx
br: () => <br />,
```

But the underlying formatter does **not** treat self-closing `<br/>` as a rich-text tag here. I verified locally with `intl-messageformat`:

```text
A <b>{x}</b>.<br/>B -> A BOLD(X).<br/>B
```

So the UI is likely to render literal text `<br/>` instead of a line break.

Recommended fix:

Use an explicit open/close tag:

```json
"departureCalculationContext": "Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað <b>{departure}</b>.<br></br>Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma."
```

The same local formatter test confirms this works:

```text
A <b>{x}</b>.<br></br>B -> A BOLD(X).<BR>B
```

Even safer alternative: do not put the line break in the message. Split the text into two translation keys and render two `<p>` elements. That gives better spacing control and avoids rich self-closing tags entirely.

Do not release until this is fixed or verified in browser.

### Low - New long departure formatter should get a tiny unit test

`components/weather/travelAuditMap.helpers.ts:220-234`
`lib/__tests__/travelAuditMap.helpers.test.ts`

`formatLongDepartureDateTime()` is new user-visible formatting logic with hand-written Icelandic weekday case. There is already a helper test file for this module. Add small tests for at least:

- `2026-07-17T04:00:00Z`, locale `is`: `föstudaginn 17. júl kl. 04:00`
- `2026-07-18T04:00:00Z`, locale `is`: `laugardaginn 18. júl kl. 04:00`
- maybe one English smoke test

This is not a release blocker if Stebbi needs the UI quickly, but it is cheap protection for a hand-written Icelandic formatter.

### Low - English phrasing may be slightly awkward

`messages/en.json:766`
`components/weather/travelAuditMap.helpers.ts:233`

English currently becomes roughly:

```text
All calculations below are based on your planned departure at Friday 17 Jul 04:00.
```

Natural English would be closer to:

```text
All calculations below are based on departure on Friday 17 Jul at 04:00.
```

Not urgent for the Icelandic-first release, but worth cleaning if touching the key anyway.

### No blocker - Duplicate CTA condition is now correct

`components/weather/VedurstofanPulseInline.tsx:149-164`

The full pulse short link now renders only when:

```tsx
fullHref && postingAccess === 'allowed'
```

That matches the intended matrix:

- public / needs-login: only `Sjá fleiri skilaboð eða segja frá aðstæðum`
- logged-in / allowed: composer + one `Sjá fleiri skilaboð`
- denied / unknown: no extra CTA

## Recommended next instruction for Claude Code

```text
Laga v325 áður en localhost/release:

1. Í messages/is.json og messages/en.json:
   Breyta <br/> í <br></br> í departureCalculationContext,
   eða skipta þessu í tvö translation keys og tvö <p> elements.

2. Ef notuð er <br></br> leiðin:
   halda br: () => <br /> í tf.rich().

3. Bæta litlu unit testi fyrir formatLongDepartureDateTime í lib/__tests__/travelAuditMap.helpers.test.ts:
   - is föstudaginn
   - is laugardaginn
   - optional en smoke test

Ekki snerta útreikninga, sessionStorage, returnTo, pulse access, SQL, env eða auth.
```

## Localhost checks for Stebbi

1. Open `/vedrid`, calculate a route, inspect the departure context text.
   - Expected: there is a real line break.
   - Expected: literal `<br/>` is **not** visible.
   - Expected: departure date is bold and uses long Icelandic weekday, e.g. `föstudaginn`.

2. Click several scrubber times across different days.
   - Expected: weekday changes correctly.
   - Expected: no stale date/time after selecting a new slot.

3. Test mobile widths 360 px, 390 px, and 460 px.
   - Expected: no horizontal overflow.
   - Expected: text does not dominate the whole card too aggressively.

4. Public user with pulse messages:
   - Expected: only `Sjá fleiri skilaboð eða segja frá aðstæðum` appears.
   - Expected: no duplicate `Sjá fleiri skilaboð`.

5. Logged-in user with pulse access:
   - Expected: composer appears.
   - Expected: only one short `Sjá fleiri skilaboð` link appears if full-pulse link is available.

No SQL, Supabase, Vercel, env, auth policy, secrets, production data, or user-data changes are needed for this correction.
