# TODO-071 v001 - Codex handoff: forecast point detail cards

Created: 2026-07-08 14:35  
Timezone: Atlantic/Reykjavik  
Relevant TODO: #71 Veður: allir spápunktar og fjarlægð frá vegi

## Goal

Update the Ferðaveðrið result UI so forecast-point detail cards consistently show the full useful point context:

- point index,
- departure time,
- estimated time at distance from origin,
- distance from road to the met.no forecast point,
- forecast hour used,
- weather values,
- unchanged links.

This should apply both to the main `Mest krefjandi á leiðinni` point card and to every `Punktur x/y` detail card under the forecast-point explainer/list.

## Stebbi's Requested Copy / Layout

Current card example:

```text
Mest krefjandi á leiðinni
Punktur 26/58
Brottfarartími: kl. 14:27
Áætlaður tími 17 km frá Garðabæ: kl. 14:43
Veðurspá á þessum stað kl. 15:00
Vindur: 4 m/s · Úrkoma: 0,2 mm/klst · Hiti: 11°C
```

Desired card:

```text
Mest krefjandi á leiðinni
Punktur 26/58
Brottfarartími: kl. 14:27
Áætlaður tími 17 km frá Garðabæ: kl. 14:43
Spápunktur um X m frá veginum.
Veðurspá á þessum stað kl. 15:00
Vindur: 4 m/s · Úrkoma: 0,2 mm/klst · Hiti: 11°C
```

Keep the links unchanged:

- `Skoða veðurspá`
- `Opna á korti`
- `Hrá met.no gögn`

The detail cards under the point list may keep their titles as `Punktur x/y`, but should use the same information order and completeness.

## Explainer / Section Rename

Current UI:

- Short text above drawer: `Reiknað úr veðurspá og leið, ekki giskað af gervigreind.`
- Drawer title: `Hvernig er þetta metið?`
- Drawer body: `Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.`

Requested:

- Replace the short text above the drawer with the longer deterministic explanation body.
- Rename the drawer/section title to `Allir spápunktarnir á leiðinni`.
- Make the section more visible than the current small muted text-link drawer.

Suggested Icelandic messages:

```json
"howAssessedShort": "Veðurmatið er reiknað úr leiðinni, tímasetningu og veðurspá á punktum meðfram leiðinni. Gervigreind tekur ekki ákvörðunina sjálf. Hún má hjálpa okkur að orða niðurstöðuna, en vindur, hviður, úrkoma, tími og staðsetning ráða matinu.",
"howAssessedTitle": "Allir spápunktarnir á leiðinni",
"forecastPointDistanceMeters": "Spápunktur um {meters} m frá veginum.",
"forecastPointDistanceKilometers": "Spápunktur um {kilometers} km frá veginum."
```

Keep or remove `howAssessedBody` only after checking how the component should render. Do not leave duplicate identical explanatory paragraphs in the open drawer.

English copy should be updated in `messages/en.json` with the same meaning.

## Current Code Pointers

Likely files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/weather/types.ts`
- `messages/is.json`
- `messages/en.json`

Observed current code:

- `FerdalagidClient.tsx:927-949` renders the deterministic explainer and the route point list.
- `TravelAuditMap.tsx:566-752` renders `PointDetailsPanel`, including links.
- `TravelAuditMap.tsx:716-734` already has forecast-point distance logic, but it is currently late in the card and appears conditional on `summary.hasSeparateForecastPoint`.
- `DepartureHeatmap.tsx:299-327` renders the selected slot's most challenging point summary, but currently only shows distance/time and weather values.
- `messages/is.json:677-679` and `messages/en.json:673-675` contain the current explainer strings.
- `messages/is.json:703-705` and `messages/en.json:699-701` contain existing forecast-point distance strings.

Important nuance:

- The screenshot/request appears to target the link-bearing card rendered by `TravelAuditMap.PointDetailsPanel`.
- There is also a selected-slot summary in `DepartureHeatmap`. If it represents the same `Mest krefjandi` concept, keep it coherent or avoid making the two summaries contradict each other.
- `CandidateDisplayPoint` currently includes route index, forecast time, weather values, distance from origin and route fraction, but not forecast-point distance from road. If `DepartureHeatmap` needs the same road-distance line, either derive it from the matching route weather point by `routeIndex`, pass a lookup prop, or add the needed field in a careful API-compatible way.

## Implementation Guidance

1. Read `Design.md` before editing UI. Relevant rules: mobile-first, cards for repeated items, no card-in-card bloat, text hierarchy, no horizontal overflow, all user-facing copy in messages.

2. Prefer a shared small formatter/render helper for point metadata instead of maintaining two divergent copies. The goal is consistency between:
   - the main highlighted/worst point detail card,
   - manually selected map point details,
   - each `Punktur x/y` row/card in the all-points section.

3. Reorder `PointDetailsPanel` so forecast-point distance appears before `Veðurspá á þessum stað kl. HH:MM`.

4. Show forecast-point distance whenever `forecastDistanceFromRouteM` is available, not only when a separate forecast marker is displayed. Stebbi explicitly wants the distance back.

5. Use Stebbi's requested wording:
   - `Spápunktur um X m frá veginum.`
   - For kilometers, keep a natural equivalent.
   - Decide whether very small distances should be `0 m`, rounded meters, or `nánast á veginum`; if unsure, prefer the numeric line because Stebbi asked for `X m`.

6. Do not change the three point links or their destinations.

7. Make `Allir spápunktarnir á leiðinni` more visible. A good first pass:
   - keep it as a disclosure/button if necessary,
   - make the title text `text-sm font-medium text-foreground`,
   - give the section a clearer top border/spacing,
   - avoid a large marketing-style block or nested card.

8. Avoid introducing new route/weather calculations. This is presentation and data plumbing only.

9. Do not touch SQL, Supabase, RLS, auth, saved places, provider selection, Mapbox, or route ETA logic in this pass.

## Data / Edge Cases

Handle:

- origin and destination points,
- manually selected point,
- worst point,
- green selected departure where the map defaults to worst route point,
- return leg if the same components are used,
- missing `forecastDistanceFromRouteM`,
- point distance under 50 m,
- kilometer distances,
- no forecast data / `no_data` candidates,
- mobile widths 360, 390 and 460 px.

If a point lacks weather values, do not fake them. Keep the card honest and compact.

## Suggested Test Coverage

Add focused tests only where the repo already has useful nearby coverage. Useful checks:

- message key snapshots or render test verifies `howAssessedTitle` now says `Allir spápunktarnir á leiðinni` in Icelandic;
- `PointDetailsPanel`/map helper renders forecast distance before forecast time when `forecastDistanceFromRouteM` exists;
- detail card keeps the three links;
- no duplicate deterministic explainer text appears when the section is expanded.

If component-level testing is too heavy for this UI, manual localhost checks below are acceptable, but run `npm run type-check` and the relevant test suite.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid`.
2. Calculate a route that shows `Mest krefjandi á leiðinni`.
3. Expected: the card shows:
   - `Punktur x/y`,
   - `Brottfarartími: kl. ...`,
   - `Áætlaður tími N km frá ...: kl. ...`,
   - `Spápunktur um X m frá veginum.`,
   - `Veðurspá á þessum stað kl. ...`,
   - `Vindur ... · Úrkoma ... · Hiti ...`.
4. Expected: `Spápunktur um X m frá veginum.` appears before `Veðurspá á þessum stað kl. ...`.
5. Expected: `Skoða veðurspá`, `Opna á korti` and `Hrá met.no gögn` still appear and open the same destinations as before.
6. Open the renamed `Allir spápunktarnir á leiðinni` section.
7. Expected: the section is visibly easier to find than the old `Hvernig er þetta metið?` drawer.
8. Expected: the explanatory text above it is the longer deterministic explanation, not the short `Reiknað úr...` sentence.
9. Select several `Punktur x/y` detail cards.
10. Expected: each point card uses the same information structure as the main card where data is available, including forecast-point distance from road.
11. Test mobile widths around 360-460 px.
12. Expected: no horizontal overflow, no clipped links, no card-in-card visual clutter and no text overlap.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy is part of these checks.

