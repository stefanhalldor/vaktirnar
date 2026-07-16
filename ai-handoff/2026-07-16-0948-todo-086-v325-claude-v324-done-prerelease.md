# 2026-07-16 09:48 - TODO-086 v325 - Claude: v324 done, prerelease

Created: 2026-07-16 09:48
Timezone: Atlantic/Reykjavik

Implements: `2026-07-16-0941-todo-086-v324-codex-v323-prerelease-review.md`

Stebbi overrides Codex text suggestion: keep both sentences but add linebreak between them and use full weekday name with proper Icelandic accusative case.

## What Changed

### 1. `components/weather/travelAuditMap.helpers.ts`

Added `CDT_IS_WEEKDAY_LONG` — full definite accusative weekday names for Icelandic:

```ts
const CDT_IS_WEEKDAY_LONG = ['sunnudaginn', 'mánudaginn', 'þriðjudaginn', 'miðvikudaginn', 'fimmtudaginn', 'föstudaginn', 'laugardaginn']
```

Added `formatLongDepartureDateTime(isoString, locale)` export:
- IS: `"föstudaginn 17. júl kl. 04:00"` (full definite weekday, no period after it)
- EN: `"Friday 17 Jul 04:00"` (Intl weekday: 'long')

`formatCompactDateTime` is unchanged.

### 2. `messages/is.json` + `messages/en.json`

Added `<br/>` between the two sentences in `departureCalculationContext`:

```json
"departureCalculationContext": "Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað <b>{departure}</b>.<br/>Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma."
```

The rendered output at runtime will be:

```
Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað föstudaginn 17. júl kl. 04:00.
Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma.
```

with the departure time bolded.

### 3. `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Import updated to include `formatLongDepartureDateTime`.

`tf.rich()` call updated:
- `formatCompactDateTime` → `formatLongDepartureDateTime`
- Added `br: () => <br />` handler for the `<br/>` tag in the message

```tsx
{tf.rich('departureCalculationContext', {
  departure: formatLongDepartureDateTime(
    isVedurstofanOnly ? referenceDepartureIso! : activeOutboundCandidate!.departureIso,
    locale,
  ),
  b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
  br: () => <br />,
})}
```

### 4. `components/weather/VedurstofanPulseInline.tsx` (v324 low finding)

`pulseViewMore` link condition tightened: only shown when user can actually post.

```tsx
// before
{fullHref && postingAccess !== 'needs-login' && (...)}

// after
{fullHref && postingAccess === 'allowed' && (...)}
```

Final CTA matrix:

| `postingAccess` | Links shown |
|---|---|
| `needs-login` | `pulseLoginCta` only |
| `allowed` | Composer + `pulseViewMore` |
| `denied` | Neither |
| `unknown` | Neither |

## Type Check

`npx tsc --noEmit` — clean.

## Files Changed

- `components/weather/travelAuditMap.helpers.ts` — add `CDT_IS_WEEKDAY_LONG`, `formatLongDepartureDateTime`
- `messages/is.json` — add `<br/>` in `departureCalculationContext`
- `messages/en.json` — add `<br/>` in `departureCalculationContext`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — use `formatLongDepartureDateTime`, add `br` handler
- `components/weather/VedurstofanPulseInline.tsx` — `postingAccess === 'allowed'` condition

## Localhost Checks For Stebbi

### 1. Departure context line — full weekday + linebreak

1. Open `/vedrid`, calculate a route, select a Friday slot.
   - Expected first line: "Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað **föstudaginn 17. júl kl. 04:00**."
   - Expected second line: "Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma."
   - Expected: linebreak between the two sentences (not a period-space on same line).
   - Expected: departure time is bold.
2. Select a Saturday slot.
   - Expected: "laugardaginn", not "lau." or "Saturday".
3. Select a Thursday slot.
   - Expected: "fimmtudaginn".

### 2. Mobile width

1. Test at 360px, 390px, 460px.
   - Expected: no horizontal overflow.
   - Expected: text wraps naturally over multiple lines if needed.

### 3. Duplicate CTA — denied state

1. Set up a scenario where `postingAccess === 'denied'` (e.g. remove chat feature flag).
   - Expected: no CTA shown (neither login nor view-more).
2. Public user, `needs-login`.
   - Expected: only `pulseLoginCta`.
3. Logged-in with access.
   - Expected: composer + `pulseViewMore`.

## Óvissa / þarf að staðfesta

- "unknown" state (initial mount before access check completes) also suppresses `pulseViewMore` with `=== 'allowed'`. This is correct — we don't show the link until we know the user can post. No change from before for this case.
- The `<br/>` renders as a hard line break inside the `<p>`. Stebbi should verify this looks as intended vs. two separate `<p>` elements (spacing differs).
