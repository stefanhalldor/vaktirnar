# TODO #70 - Route search loader polish

Created: 2026-07-10 07:54  
Timezone: Atlantic/Reykjavik

## Context

Stebbi wants more visible loader feedback while Google route options are being fetched in Ferðaveðrið:

> Þegar google er að leita að leiðum þá mættum við alveg gera meiri "Loader" fíling í lausnina... setja jafnvel teskeiðarloaderinn upp og setja texta undir að verið sé að leita að leiðum.

Current UI in `components/weather/RouteSelectionStep.tsx` only shows a small text line:

```tsx
{routeOptionsLoading && (
  <p className="text-xs text-muted-foreground py-2">{tf('routeOptionsLoading')}</p>
)}
```

That is technically correct but too quiet, especially now that route search may include curated Hellisheiði/Hringurinn alternatives and can take long enough to feel dead.

## Design.md references

Relevant rules read:

- `Design.md` lines 55-58: mobile-first, calm, practical, slightly playful.
- `Design.md` lines 133-147: mobile-first shell, stable controls, enough safe-area space.
- `Design.md` lines 330-347: visible feedback while waiting for data, loader must be calm, accessible, and must not cause layout shift/overflow/mobile zoom.
- `Design.md` lines 390-391 and 439-441: loading states must not cause layout shift or jumping controls.
- `Design.md` lines 463-466: verify mobile/desktop, loading/error states, navigation/pending states.

## Recommendation

Add a compact route-options loader inside the route-options section, not a full-page loader.

Do **not** use the full `TeskeidLoader` as-is inside this card unless it is made compact. The current `TeskeidLoader` renders a large logo (`160px`/`180px`) and rotating title text; that is good for route segments, but too large under the map and could push route controls too far down on mobile.

Preferred implementation:

- Create or inline a compact `RouteOptionsLoader`.
- Use a small Teskeið visual or spinner.
- Show clear text:
  - Title: `Leita að leiðum`
  - Subtitle: `Sæki leiðir frá Google og ber saman valmöguleika.`
- Optionally show a short route label such as `Reykjavík -> Akureyri`.
- Use `role="status"` and `aria-live="polite"`.
- Keep map visible and keep the layout stable.

This can borrow visual language from `components/weather/WeatherResultLoader.tsx`, which already has:

- `role="status"`
- calm spinner
- border/card surface
- short loading steps

## Proposed component shape

Either add a local helper in `RouteSelectionStep.tsx`:

```tsx
function RouteOptionsLoader({ title, subtitle, routeLabel }: {
  title: string
  subtitle: string
  routeLabel?: string
}) {
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-border bg-card p-4">
      ...
    </div>
  )
}
```

Or extract to:

```txt
components/weather/RouteOptionsLoader.tsx
```

Keep it compact:

- max one card surface;
- no nested card;
- `p-3` or `p-4`;
- small spinner/logo around `32-44px`;
- text `text-sm` and `text-xs`;
- no horizontal overflow at 360px.

## Suggested UI copy

Add messages under `teskeid.vedrid.ferdalagid`:

Icelandic:

```json
"routeOptionsLoadingTitle": "Leita að leiðum",
"routeOptionsLoadingSubtitle": "Sæki leiðir frá Google og ber saman valmöguleika.",
"routeOptionsLoadingRouteLabel": "{origin} → {destination}"
```

English:

```json
"routeOptionsLoadingTitle": "Looking for routes",
"routeOptionsLoadingSubtitle": "Fetching Google routes and comparing options.",
"routeOptionsLoadingRouteLabel": "{origin} → {destination}"
```

Existing key `routeOptionsLoading` can remain for fallback or tests, but the UI should use the richer title/subtitle.

If Claude Code wants to make the loader mention Hringurinn later, keep it generic for now. Avoid over-promising while route rules are still changing.

## Interaction behavior

When `routeOptionsLoading === true`:

- show the compact loader below `routeOptionsTitle`;
- hide route option buttons until real options exist;
- keep error/retry hidden while loading;
- keep the map visible;
- keep origin/destination fields usable if they already are, but avoid confusing stale route options;
- do not show fallback button during active loading.

If route options were previously loaded and the user changes origin/destination:

- clear stale options as current code likely already does;
- show loader for the new pair;
- do not let a stale selected route visually remain active.

## Optional visual detail

If using Teskeið branding:

- Prefer a mini Teskeið mark or small pulsing spoon/logo if an existing small logo component is easy to use.
- Do not import the full route-segment `TeskeidLoader` without sizing changes.
- A simple primary spinner like `WeatherResultLoader` is acceptable if a mini-logo adds churn.

Tone should be practical, not cute:

- Good: `Leita að leiðum`
- Good: `Sæki leiðir frá Google og ber saman valmöguleika.`
- Avoid long explanations or in-app documentation.

## Tests

If there is an existing component test harness for weather route selection, add coverage:

1. when `routeOptionsLoading` is true:
   - loader title appears;
   - loader has `role="status"`;
   - error/retry/fallback controls are not shown.
2. when loading finishes with route options:
   - route buttons render normally.
3. when loading finishes with error:
   - retry/fallback state still works.

If `RouteSelectionStep` is too Google Maps-heavy to test quickly, do not build a big test harness just for this polish. In that case:

- keep the implementation small;
- rely on existing type-check/build;
- document manual localhost checks clearly.

## Supabase / privacy / production notes

No SQL migration expected.

No RLS/auth/grants changes expected.

No production data or analytics changes expected.

No extra Google API calls should be introduced by this UI change. This is only visual feedback for an existing request.

Do not log route names, coordinates, place IDs, or provider payloads.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid`.

Recommended checks:

1. Pick a route that takes noticeable time, for example `Reykjavík -> Akureyri` or `Reykjavík -> Egilsstaðir`.
2. After selecting both places, route-options loading should show a visible compact loader:
   - title like `Leita að leiðum`;
   - subtitle explaining that routes are being fetched/compared;
   - no tiny lonely text-only state.
3. Confirm the loader does not push the map or controls into an awkward mobile layout at roughly 360-390px width.
4. Confirm route options replace the loader when the request finishes.
5. Confirm error/retry/fallback still appears if route fetching fails.
6. Change origin or destination after options load.
   - Expected: stale route options clear or stop looking selectable;
   - loader appears for the new pair.
7. On mobile, check no horizontal overflow and no text overlap.

No production/billing-specific testing is required beyond normal localhost route searches. Do not run broad route sweeps just for this loader polish.

## Suggested next step

Claude Code should implement this as a small UI polish patch after the current route-rule cleanup/Hringurinn work is in a stable state, or in parallel only if it does not touch the same route-registry files.

Preferred changed files:

- `components/weather/RouteSelectionStep.tsx`
- optionally `components/weather/RouteOptionsLoader.tsx`
- `messages/is.json`
- `messages/en.json`
- optional focused test file if an existing harness is nearby

## Óvissa / þarf að staðfesta

Codex did not inspect every existing test around `RouteSelectionStep`; Claude Code should decide whether adding automated UI tests is low-risk.

If Claude Code wants to reuse `TeskeidLoader`, it may need a compact variant. Do not make the route-options area huge just to reuse the full-page loader.
