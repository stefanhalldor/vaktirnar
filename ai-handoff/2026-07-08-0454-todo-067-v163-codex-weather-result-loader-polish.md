# TODO-067 v163 - Weather result loader polish

Created: 2026-07-08 04:54
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Handoff/plan. No code, SQL, migration, commit, push, deploy, or production change performed by Codex.

## Context

Stebbi saw the Ferðaveðrið result-loading screen in production/local testing and said:

> Það vantar meiri "loader" fíling í þessa skjámynd

Current loading state on the result step is visually too flat:

- route summary is shown;
- then a plain bordered card says `Sæki veðurspá...`;
- there is no strong sense that the app is actively calculating.

This can make the flow feel stalled, especially because weather/route requests may take several seconds.

## Relevant design guidance

`Design.md` requires visible app-like feedback while waiting:

- Loading state must be visible when user waits for data.
- Loader should be calm and accessible (`role="status"` or equivalent).
- Loading state must not cause layout shift, horizontal overflow, or mobile zoom.
- Controls and page layout must not jump while loading.

This is not a full route-segment loader problem. It is an in-flow client-side calculation state inside:

`app/auth-mvp/vedrid/FerdalagidClient.tsx`

Current code around lines 805-809:

```tsx
{loading && (
  <div className="bg-card border border-border rounded-xl px-4 py-6 text-center">
    <p className="text-sm text-muted-foreground">{tf('submitting')}</p>
  </div>
)}
```

## Goal

Make the result loading state feel alive, trustworthy, and app-like without pretending to have real progress.

The user should immediately understand:

- Teskeið is fetching route/weather data;
- this may take a moment;
- the app has not frozen;
- the result will appear in the same place.

## Recommended implementation

Create a small focused component, for example:

`components/weather/WeatherResultLoader.tsx`

or keep it local in `FerdalagidClient.tsx` if Claude Code thinks the component would be too small. Prefer a component if it keeps the result step readable.

Suggested UI:

- Card with `role="status"` and `aria-live="polite"`.
- Top row: small animated spinner/ring + main text.
- Show current route summary context if available, for example `Garðabær → Egilsstaðir`.
- Add 3 short loading cues as muted rows:
  - `Sæki leið og spápunkta`
  - `Ber saman vind, hviður og úrkomu`
  - `Leita að besta brottfarartíma`
- Use subtle animation only:
  - spinner or pulsing dot
  - optional shimmer line
  - no fake progress percentage
- Respect `prefers-reduced-motion`; if simple Tailwind animation is used, keep it minimal and acceptable.

Possible visual structure:

```tsx
<div role="status" aria-live="polite" className="bg-card border border-border rounded-xl p-4">
  <div className="flex items-center gap-3">
    <span className="h-8 w-8 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
    <div>
      <p className="text-sm font-medium text-foreground">{tf('loadingTitle')}</p>
      <p className="text-xs text-muted-foreground">{tf('loadingSubtitle')}</p>
    </div>
  </div>
  ...
</div>
```

Do not use the full `TeskeidLoader` logo component here unless it is scaled way down. The full logo loader is good for route-level loading, but this is an inline result calculation inside an already loaded screen.

## Copy

All text must be in `messages/is.json` and `messages/en.json`.

Suggested Icelandic keys under `teskeid.vedrid.ferdalagid`:

```json
"resultLoadingTitle": "Reikna ferðaveðrið...",
"resultLoadingSubtitle": "Sæki leið, spápunkta og veðurspá.",
"resultLoadingStepRoute": "Sæki leið og spápunkta",
"resultLoadingStepWeather": "Ber saman vind, hviður og úrkomu",
"resultLoadingStepWindow": "Leita að besta brottfarartíma"
```

English:

```json
"resultLoadingTitle": "Calculating travel weather...",
"resultLoadingSubtitle": "Fetching the route, forecast points and weather data.",
"resultLoadingStepRoute": "Fetching route and forecast points",
"resultLoadingStepWeather": "Checking wind, gusts and precipitation",
"resultLoadingStepWindow": "Looking for the best departure window"
```

Keep existing `submitting` if it is still used on buttons. Do not overload the same key for the richer result loader.

## Implementation notes

- Keep the top action buttons hidden while loading, as today.
- Keep route summary visible above the loader.
- Do not show `Byrja aftur` during loading unless there is a real cancel behavior.
- Do not invent cancellability if the current API request cannot be cancelled safely.
- Ensure the loader card height is stable enough that the result appearing after it does not feel jumpy.
- Avoid wide decorative elements that can overflow at 360px.
- Use semantic Teskeið tokens/classes, not old violet/gray UI primitives.
- The loader must still look okay on desktop at the narrow app width.

## Tests

Add at least one focused test if existing test setup can render `FerdalagidClient` loading state or the new component:

- loader renders `role="status"`;
- primary loading title appears;
- loading copy comes from translation keys.

If component tests would be disproportionately heavy, at minimum add a small component test for `WeatherResultLoader`.

Run:

- `npm run type-check`
- `npm run test:run`
- `npm run build`

## Localhost checks for Stebbi

Setup:

- logged in with `vedrid` access;
- weather feature enabled;
- Google Maps key can be valid or invalid, but this check is about the result-loading state.

Steps:

1. Open `/auth-mvp/vedrid`.
2. Choose `Frá` and `Til`.
3. Continue through the flow until `Reikna ferðina`.
4. Click `Reikna ferðina`.
5. Expected: result step shows route summary and a richer loader card immediately.
6. Expected: loader has visible activity, not only a static sentence.
7. Expected: no horizontal overflow at 360px wide viewport.
8. Expected: no mobile zoom or text overlap.
9. Expected: when result arrives, normal result view replaces loader cleanly.
10. Test a slower network profile if possible. The loader should still feel intentional after several seconds.

Regression checks:

- error state still appears if the API fails;
- result state still appears after success;
- `Breyta forsendum`, `Byrja aftur`, heatmap, audit map and result details still behave as before after loading completes;
- English locale has no missing keys.

## Commands run by Codex

Read-only inspection:

- Read `ai-handoff/README.md`
- Searched `Design.md` for loader/loading guidance
- Searched app for loader/loading usage with `rg`
- Read relevant `FerdalagidClient.tsx` result loading block
- Read `components/teskeid/TeskeidLoader.tsx`
- Read `components/ui/Button.tsx`
- Ran `Get-Date -Format "yyyy-MM-dd HH:mm"` immediately before creating this file

