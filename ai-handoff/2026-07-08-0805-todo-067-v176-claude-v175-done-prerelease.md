# TODO-067 v176 - Claude handoff - v175 + disclaimer + map panel defaults

Created: 2026-07-08 08:05
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Implementation complete. Ready for Codex prerelease review.

## Context

Reviewed and completed:

- `ai-handoff/2026-07-08-0741-todo-067-v175-codex-v174-prerelease-polish-review.md`

Battery died mid-execution on v175. On restart, confirmed v175 changes were already fully written to disk. Then implemented two additional changes requested by Stebbi:

1. Disclaimer text updated with road-conditions link
2. Map point detail panel defaults to worst point on route

## Changes in this session

### 1. Disclaimer text replaced with road-conditions context

**`messages/is.json`** — `weatherDisclaimer` key:

Old:
```
Þetta er veðurmat, ekki umferðar- og farartrygging.
```

New (with rich text link tag):
```
Þetta er veðurspá og við búum á Íslandi. Fylgist vel með færðinni til öryggis, t.d. á <link>vef Vegagerðarinnar</link>.
```

**`messages/en.json`** — `weatherDisclaimer` key:

Old:
```
This is a weather assessment, not a traffic or travel guarantee.
```

New:
```
This is a weather forecast and we live in Iceland. Keep an eye on road conditions for safety, e.g. on the <link>Road Administration website</link>.
```

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`** — disclaimer render:

Changed from `{tf('weatherDisclaimer')}` to `tf.rich()` with a link renderer pointing to `https://umferdin.is` (opens in new tab, `rel="noopener noreferrer"`, underline style).

### 2. Map point panel title renamed

**`messages/is.json`** — `worstPointTitle`:
```
"Versti punktur" → "Mest krefjandi á leiðinni"
```

**`messages/en.json`** — `worstPointTitle`:
```
"Worst point" → "Most demanding on the route"
```

### 3. Map panel defaults to worst point on route

**`components/weather/travelAuditMap.helpers.ts`** — `initialSelectedIndex`:

Added optional `activeCandidate?: TravelCandidate` third parameter. Priority order is now:

1. `highlightedIssue` lat/lon match — slot-specific worst point for non-green slots
2. `activeCandidate.worstWind/worstGust/worstPrecip.routeIndex` — slot's worst metric point, works for green slots too
3. `pt.isHighlightedIssue` — server-flagged worst point for the default analysis window
4. `summaryForWindow?.status === 'rautt'` fallback
5. `summaryForWindow?.status === 'gult'` fallback
6. Destination
7. Index 0

Key insight: for a green slot, `highlightedIssue` is undefined (candidateToIssue returns undefined for green), but `worstWind?.routeIndex` still points to the windiest/most demanding point even when below threshold. This is the fix that makes the map panel default to the correct point.

**`components/weather/TravelAuditMap.tsx`** — all three `initialSelectedIndex` call sites updated to pass `activeCandidate`.

**`components/weather/TravelAuditMap.tsx`** — `panelTitle` logic and badge condition:

Panel now shows "Mest krefjandi á leiðinni" (and the red badge) whenever:
- the auto-selected point has `rautt` or `gult` status, **or**
- the point is the `highlightedIssue` point

Previously only `isHighlighted` (exact coordinate match with `highlightedIssue`) triggered the worst-point title.

## Files changed

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `messages/is.json`
- `messages/en.json`

## No changes to

- SQL, RLS, auth, env, Supabase, migrations, deployment
- API routes or server logic
- `lib/weather/travel.ts`, `lib/weather/types.ts`

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost with a long route such as `Garðabær → Egilsstaðir`.

1. Combined card disclaimer now reads: `Þetta er veðurspá og við búum á Íslandi. Fylgist vel með færðinni til öryggis, t.d. á vef Vegagerðarinnar.` — "vef Vegagerðarinnar" is a clickable link to `https://umferdin.is`.
2. On a route with red or yellow points: the map panel below the map auto-selects the worst point and shows the badge `Mest krefjandi á leiðinni` in red.
3. On a fully green route: the map panel shows the destination with the plain title `Veðurspá á leiðinni`.
4. Clicking a different point on the map still changes the panel to `Valin veðurspá`.
5. Selecting a new heatmap slot resets the map panel back to the worst point.
6. No horizontal overflow at 360px mobile.
