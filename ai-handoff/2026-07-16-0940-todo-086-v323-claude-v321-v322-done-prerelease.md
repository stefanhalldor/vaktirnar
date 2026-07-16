# 2026-07-16 09:40 - TODO-086 v323 - Claude: v321/v322 done, prerelease

Created: 2026-07-16 09:40
Timezone: Atlantic/Reykjavik

Implements: `2026-07-16-0923-todo-086-v321-codex-v320-prerelease-review.md` (duplicate CTA fix)
Implements: `2026-07-16-0926-todo-086-v322-codex-departure-context-line-handoff.md` (departure context line)
Additional: Stebbi request — bold the departure time in the context line

## What Changed

### 1. `components/weather/VedurstofanPulseInline.tsx` (v321)

Fixed duplicate CTA shown when `postingAccess === 'needs-login'` AND `fullHref` existed.

The short `pulseViewMore` link is now suppressed when `postingAccess === 'needs-login'` because the longer login CTA (`pulseLoginCta`) already handles the full-pulse navigation:

```tsx
// before
{fullHref && (
  <Link href={fullHref} ...>{t('pulseViewMore')}</Link>
)}

// after
{fullHref && postingAccess !== 'needs-login' && (
  <Link href={fullHref} ...>{t('pulseViewMore')}</Link>
)}
```

Behaviour table:

| State | Links shown |
|---|---|
| `needs-login` | Only `pulseLoginCta` ("Sjá fleiri skilaboð eða segja frá aðstæðum") |
| `allowed` (logged in) | Composer + `pulseViewMore` ("Sjá fleiri skilaboð") |
| `denied` | Neither link |

### 2. `messages/is.json` + `messages/en.json` (v322)

New key added after `heatmapTitle` under `teskeid.vedrid.ferdalagid`:

```json
"departureCalculationContext": "Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað <b>{departure}</b>. Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma."
```

English:

```json
"departureCalculationContext": "All calculations below are based on your planned departure at <b>{departure}</b>. Select another departure time above if you plan to leave at a different time."
```

Uses next-intl rich text: `<b>` tag wraps the dynamic `{departure}` value, rendered as `<strong className="font-semibold">`.

### 3. `app/auth-mvp/vedrid/FerdalagidClient.tsx` (v322)

**Removed:** The `{/* Brottför */}` section — a two-column grid row showing the selected departure time as a label + value.

**Added:** A departure context sentence shown above the journey summary grid, inside the same condition (`!hasNoActiveProvider && (isVedurstofanOnly ? referenceDepartureIso : activeOutboundCandidate)`):

```tsx
{/* ── Journey summary ── */}
{!hasNoActiveProvider && (isVedurstofanOnly ? referenceDepartureIso : activeOutboundCandidate) && (
  <>
    {/* Departure context line */}
    <p className="text-sm text-foreground leading-snug">
      {tf.rich('departureCalculationContext', {
        departure: formatCompactDateTime(
          isVedurstofanOnly ? referenceDepartureIso! : activeOutboundCandidate!.departureIso,
          locale,
        ),
        b: (chunks) => <strong className="font-semibold">{chunks}</strong>,
      })}
    </p>
    {/* Ferry / window notes — preserved from Brottför section, now standalone */}
    {!isVedurstofanOnly && ferrySelection && (
      <p className="text-xs text-muted-foreground">
        {tf('ferryResultNote', { portName: ferrySelection.ferryPort.name })}
      </p>
    )}
    {!isVedurstofanOnly && result.travelPlan?.outbound.windowMode && result.travelPlan.outbound.bestWindow && (
      <p className="text-xs text-muted-foreground">
        {tf('bestWindowLabel')}: {formatWindowRange(...)}
      </p>
    )}
    {!isVedurstofanOnly && result.travelPlan?.return?.bestWindow && (
      <p className="text-xs text-muted-foreground">
        {tf('returnWindowLabel')}: {formatWindowRange(...)}
      </p>
    )}

    <div className="border-y border-border/70 divide-y divide-border/60">
      {/* Á leiðinni */}
      ...
    </div>
  </>
)}
```

The ferry note, best outbound window note, and return window note were moved from inside the Brottför `<section>` to standalone `<p>` elements directly below the context line. They are only shown in the relevant flows (`!isVedurstofanOnly && ferrySelection`, etc.).

**Structural note:** The outer wrapper changed from `<div className="border-y...">` to `<>` (React Fragment) so that the context line and notes can appear outside the bordered grid. The `border-y` div now opens inside the fragment and closes at the same place as before (before the comparison section).

## Translation key note

`departureCalculationContext` uses `tf.rich()` with:
- `{departure}` — the formatted date/time string (e.g. "fim. 16. júl kl. 08:25")
- `<b>` tag — rendered as `<strong className="font-semibold">`

The `{departure}` inside `<b>` is valid next-intl usage: ICU parameters are interpolated inside rich tags. TypeScript type-check passes clean.

## Type Check

`npx tsc --noEmit` — clean, no errors.

## Files Changed

- `components/weather/VedurstofanPulseInline.tsx` — suppress `pulseViewMore` link when `needs-login`
- `messages/is.json` — add `departureCalculationContext`
- `messages/en.json` — add `departureCalculationContext`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — remove Brottför section, add departure context line + notes above grid

## Files NOT Changed

- SQL, env, auth, sessionStorage restore, pulse logic, card variants — no changes
- `VedurstofanPointCard.tsx` — no changes
- `TravelAuditMap.tsx` — no changes

## Localhost Checks For Stebbi

### 1. Departure context line

1. Open `/vedrid` and calculate a route.
2. Look below the departure scrubber (heatmap pills).
   - Expected: one sentence appears, e.g. "Allar útreiknaðar upplýsingar hér að neðan taka nú mið af því að þú ætlir að leggja af stað **fim. 16. júl kl. 08:25**. Veldu annan brottfarartíma..."
   - Expected: the departure time ("fim. 16. júl kl. 08:25") is bold.
   - Expected: the old two-column "Brottför" row is gone.
3. Click a different slot in the scrubber.
   - Expected: the sentence updates to the new departure time.
4. Test at 360px and 390px mobile width.
   - Expected: text wraps naturally, no horizontal overflow.

### 2. Ferry and window notes preserved

If testing a ferry route:
- Expected: ferry note ("Ganga frá Seyðisfirði" or similar) still appears below the context line.

If the result has a best window:
- Expected: "Besti tími til brottfarar" note still appears.

### 3. Duplicate CTA fix (public user)

1. Public user, calculated route, Veðurstofan station card with at least one existing pulse message.
2. Inspect the inline pulse section.
   - Expected: only ONE link visible: "Sjá fleiri skilaboð eða segja frá aðstæðum".
   - Expected: the shorter "Sjá fleiri skilaboð" is NOT shown at the same time.
3. Click "Sjá fleiri skilaboð eða segja frá aðstæðum".
   - Expected: login flow opens with the pulse URL in `next` and `returnTo=/auth-mvp/vedrid`.

### 4. Logged-in user — no regression

1. Logged-in user, same route.
2. Inspect the inline pulse section.
   - Expected: composer is visible.
   - Expected: "Sjá fleiri skilaboð" link appears (separate from login CTA).
   - Expected: NOT a duplicate of the login CTA.

### 5. No regression — Á leiðinni compact card

1. Veðurstofan-only or Veðurstofan-decisive route.
2. Inspect "Á leiðinni" section.
   - Expected: compact card still shows station name, wind badge, disclaimer.
   - Expected: compact card does NOT show pulse.
   - Expected: the departure context sentence appears ABOVE the bordered grid (not inside the "Á leiðinni" row).

### 6. Veðurstofan-only mode

1. Test with Veðurstofan-only provider.
2. Departure context line must reflect `referenceDepartureIso`, not `activeOutboundCandidate.departureIso`.
   - Expected: sentence still shows the correct departure time.

## Óvissa / þarf að staðfesta

- The second sentence "Veldu annan brottfarartíma hér að ofan ef þú stefnir á að leggja af stað á öðrum tíma." is shown even when the scrubber has only one slot (so user can't change it). Stebbi should confirm whether this is acceptable or if the second sentence should be conditional on `outboundDisplayCandidates.length > 1`.
- Rich text with `{departure}` inside `<b>` tag: type-check passes. If runtime behavior looks unexpected, fallback is to split into two keys (Pre/Post) with JSX bold in between.
