# TODO #70 - Route search overlay loader

Created: 2026-07-10 07:57  
Timezone: Atlantic/Reykjavik

## Context

This supersedes `2026-07-10-0754-todo-070-v010-codex-route-search-loader-handoff.md`.

Stebbi clarified that the desired route-search loading state is **not** a compact loader inside the route options list.

Desired behavior:

> Ég vil að loaderinn komi yfir allan skjáinn eins og við gerum á öðrum stöðum í Teskeiðinni... undir setjum við "Sæki leiðarmöguleika..."
>
> Á ekki að ýta neinu til - þetta kemur bara sem overlay eins og við gerum á öðrum stöðum í lausninni...

So the implementation should be a viewport/app-shell overlay during Google route option fetching. It should not push the map, input fields, route cards, or buttons down.

## Current state

`components/weather/RouteSelectionStep.tsx` currently renders only a tiny text line:

```tsx
{routeOptionsLoading && (
  <p className="text-xs text-muted-foreground py-2">{tf('routeOptionsLoading')}</p>
)}
```

`messages/is.json` already has:

```json
"routeOptionsLoading": "Sæki leiðarmöguleika..."
```

There is already a canonical Teskeið loading component:

- `components/teskeid/TeskeidLoader.tsx`

It renders a large Teskeið logo and a visible text line below it. That is much closer to what Stebbi is asking for than the compact-loader idea in v010.

## Design.md references

Relevant rules read:

- `Design.md` lines 55-58: Teskeið should feel calm, practical, mobile-first, and slightly playful.
- `Design.md` lines 133-147: mobile-first app shell, stable controls, safe-area aware.
- `Design.md` lines 330-347: waiting states must provide visible feedback, be accessible, and must not cause layout shift or overflow.
- `Design.md` lines 390-391 and 439-441: loading states must not make controls jump.
- `Design.md` lines 463-466: verify mobile/desktop, loading/error states, and navigation/pending states.

## Recommended implementation

When `routeOptionsLoading === true`, render a full-screen/app-shell overlay:

- fixed or app-shell absolute overlay, depending on the current layout structure;
- covers the visible app content while route options are fetched;
- centers the canonical Teskeið loader;
- visible text below the loader: `Sæki leiðarmöguleika...`;
- uses `role="status"` and `aria-live="polite"`;
- blocks accidental taps on stale route options while loading;
- does **not** move or resize any underlying content.

Recommended visual direction:

```tsx
{routeOptionsLoading && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-6"
    role="status"
    aria-live="polite"
  >
    <TeskeidLoader
      ideaTitles={[tf('routeOptionsLoading')]}
      loadingLabel={tf('routeOptionsLoading')}
      fallbackIdeaTitle={tf('routeOptionsLoading')}
      intervalMs={2000}
    />
  </div>
)}
```

This is illustrative, not exact required code. Claude Code should fit it to the current component tree and design tokens.

Important:

- If `fixed inset-0` conflicts with app shell/header/nav, use the same overlay pattern already used elsewhere in Teskeið.
- Keep z-index high enough to cover route selection UI.
- Do not introduce layout shift.
- Do not show both the old inline `routeOptionsLoading` text and the overlay.
- Do not add another card inside the route options area.
- Keep existing map and route fields mounted underneath so the screen returns exactly where it was when loading completes.

## Copy

Use the existing Icelandic key if possible:

```json
"routeOptionsLoading": "Sæki leiðarmöguleika..."
```

English existing copy is acceptable:

```json
"routeOptionsLoading": "Fetching route options..."
```

If Claude Code needs a separate aria label, add a narrowly scoped key, but do not add lots of new explanatory text. The visible line should stay short.

## Interaction behavior

During route-options fetch:

- show the overlay as soon as both route endpoints are ready and Google route options are being requested;
- block stale route-option clicks underneath;
- do not show stale options as active while new options are loading;
- hide/skip the old inline loading paragraph;
- keep error/retry/fallback states hidden until loading finishes.

When loading finishes:

- overlay disappears;
- route options render normally;
- selected route state remains valid only for the current origin/destination pair.

If loading fails:

- overlay disappears;
- existing route error/retry/fallback UI appears as it does today.

## Scope

This is UI feedback only.

Do not change:

- route rules;
- Google API request logic;
- curated via route logic;
- Hellisheiði/Hringurinn behavior;
- saved places;
- Supabase;
- analytics;
- auth.

No extra Google calls should be introduced.

## Likely files

Expected files:

- `components/weather/RouteSelectionStep.tsx`
- possibly import `TeskeidLoader` from `components/teskeid/TeskeidLoader`
- possibly `messages/is.json` and `messages/en.json` only if a separate key is truly needed

Do not touch SQL.

## Tests / checks

If there is an easy component test for route-selection loading:

- assert the loading state renders `role="status"`;
- assert `Sæki leiðarmöguleika...` appears;
- assert old inline route-options loading paragraph is not duplicated;
- assert error/retry does not render during active loading.

If testing this component is heavy because of Google Maps/client dependencies, keep the change small and rely on:

- `npm run type-check`
- `npm run build`
- manual localhost checks below

## Supabase / privacy / production notes

No SQL migration expected.

No RLS/auth/grants changes expected.

No production data or user-data changes expected.

No route provider payloads, coordinates, place IDs, or user locations should be logged.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid`.

Recommended checks:

1. Select an origin and destination that trigger route-option fetching, for example `Reykjavík -> Egilsstaðir` or `Reykjavík -> Akureyri`.
2. As soon as both places are selected and Google route options are being fetched, a full-screen/app-shell overlay should appear.
3. Overlay should show the Teskeið loader and the text `Sæki leiðarmöguleika...`.
4. The underlying screen should not jump, resize, or push content down.
5. When route options finish loading, the overlay should disappear and route options should be visible in the same place as before.
6. Try changing origin/destination after options have already loaded:
   - stale options should not be tappable while the new request is loading;
   - overlay should appear again for the new route search.
7. On mobile width around 360-390px:
   - no horizontal overflow;
   - no zoom;
   - overlay is centered and readable;
   - bottom content is not awkwardly shifted.
8. If route fetching fails, existing error/retry/fallback UI should appear after the overlay disappears.

No production or billing-specific testing is needed for this polish. Do not run broad route sweeps just for the loader.

## Suggested next step

Claude Code should implement this as a small UI polish patch.

Treat v010 as obsolete for this specific loader question. The important product decision is:

> Route search loading should be an overlay using the Teskeið loader pattern, not an inline compact loader under the map.

## Óvissa / þarf að staðfesta

Codex has not inspected the exact app-shell stacking context. Claude Code should confirm whether `fixed inset-0 z-50` is appropriate or whether Teskeið already has a preferred overlay wrapper/pattern.

If there is an existing shared overlay component, use that instead of inventing a new one.
