# TODO 078 - Product flow model addendum: one weather-trip engine, simple modes

Created: 2026-07-11 07:31  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Product/architecture addendum for Claude Code  
Related TODO: #78 Tjaldferð / camping-trip weather product discovery  
Builds on:

- `2026-07-10-2026-todo-078-v006-codex-future-proof-shared-weather-core.md`

Status: Planning/handoff only. No implementation approval implied.

## Stebbi's New Question

While Claude Code works elsewhere, Stebbi wants to harden the future-proof direction:

Should the new camping/trip product stay in one flow where the current Ferðaveðrið can gradually stack more trip structure, such as extra destinations and campsites?

Or should it be separate inside `/vedrid`, for example:

- `Einn akstur`
- `Ferðalagið`

## Codex Recommendation

Use **one underlying trip/route-weather model**, but expose it through **two simple product modes**:

1. `Einn akstur`
   - the current Ferðaveðrið mental model;
   - one origin;
   - one destination;
   - one selected route;
   - departure-time weather assessment;
   - fastest path to value.

2. `Ferðalagið`
   - the expanded trip model;
   - multiple stops;
   - campsite stops;
   - stay windows;
   - return/home legs;
   - re-checking a saved itinerary later.

This should not be two engines and it should not become two forks.

The product surface can have modes, but the domain model should be shared.

## Why Not Only One Giant Flow?

If the current simple Ferðaveðrið flow is turned directly into a multi-stop itinerary builder, it risks becoming heavy for the common use case.

Many users just want:

> "Can I drive from A to B at this time?"

That should stay extremely fast.

The "add more stops / campsite / return home" affordances can exist, but they should be progressive, not forced.

## Why Not Two Separate Products?

If `Tjaldferð` becomes completely separate from `Veðrið`, we risk:

- duplicate route selection UI;
- duplicate Google route option handling;
- duplicate route weather assessment;
- divergent fixes;
- inconsistent labels/statuses;
- future work landing in one place but not the other.

This is exactly the fork risk v006 was trying to avoid.

Therefore:

- Product modes may differ.
- Core route/trip/weather primitives must be shared.

## Recommended Product Shape

### Public/simple entry

Default `/vedrid` remains equivalent to `Einn akstur`.

It should feel like the current product:

- pick `Frá`;
- pick `Til`;
- choose route;
- see best/worst departure windows and weather along the route.

### Progressive expansion

From `Einn akstur`, later affordances can appear:

- `Bæta við áfangastað`
- `Bæta við gistingu`
- `Skoða sem ferðalag`
- `Vista ferð` for logged-in users

These should not be in Phase 0.5/0.6. They are product direction.

### Full trip mode

`Ferðalagið` is the expanded mode.

It can live:

- under `/vedrid` as a mode/tab/segmented control later, or
- as a direct hidden route during early development, e.g. `/auth-mvp/tjaldferd`, while still using the same components/core.

Codex preference:

- early prototype may use a hidden route for development isolation;
- final product should feel like part of Veðrið, not a disconnected app.

Potential final labels:

- `Einn akstur`
- `Ferðalag`

Avoid making "Tjaldferð" the only product label if the underlying capability will support non-camping multi-stop trips too. Campsites can be a preset/use case inside `Ferðalag`.

## Domain Model Direction

Use a single model that can represent both simple and complex trips:

```ts
type WeatherTrip = {
  mode: 'single_drive' | 'multi_stop_trip'
  origin: TripPlace
  stops: TripStop[]
  returnToOrigin?: boolean
  routeProfile: RouteProfile
  thresholdProfile: ThresholdProfile
}

type TripStop = {
  id: string
  place: TripPlace
  kind: 'destination' | 'campsite' | 'home' | 'waypoint'
  stayWindow?: StayWindow
}
```

Then:

- current Ferðaveðrið is a `WeatherTrip` with one stop and no stay window;
- camping trip is a `WeatherTrip` with campsite stops and stay windows;
- future saved trip is the same object persisted with snapshots and re-check history.

Do not force current UI to expose all of this now.

## Route/Weather Core Direction

This addendum reinforces v006:

```txt
Shared core
  assessRouteLeg()
  assessForecastWindow()
  aggregateTripAssessment()

Product adapters
  SingleDriveAdapter
  MultiStopTripAdapter
  CampingStayAdapter

UI modes
  Einn akstur
  Ferðalag
```

`Einn akstur` should call the same route-leg assessment that `Ferðalag` later calls for each leg.

## UI Architecture Direction

Create components around the generic trip structure, not around a one-off camping fork.

Possible future components:

```txt
components/weather/trip/TripPlacePicker.tsx
components/weather/trip/TripStopList.tsx
components/weather/trip/TripLegSummary.tsx
components/weather/trip/TripAssessmentSummary.tsx
components/weather/trip/SingleDriveForm.tsx
components/weather/trip/MultiStopTripForm.tsx
```

Do not implement these names blindly. They are directional.

Important: a shared component is only valuable if it keeps the simple flow simple. Do not make `Einn akstur` render a complex multi-stop list with one item unless the UI stays as clean as today.

## Suggested Navigation / IA Direction

For now:

- keep current `/vedrid` and `/auth-mvp/vedrid`;
- if prototyping, use hidden flagged route only;
- no public nav yet.

Later:

Inside Veðrið, use a simple segmented control or entry choice:

```txt
Einn akstur | Ferðalag
```

`Einn akstur` is default.

`Ferðalag` opens the richer builder.

If campsites become a marketed use case, the home card can say something like:

- `Tjaldferð`

but the link can still enter the `Ferðalag` mode with a campsite preset:

```txt
/vedrid?mode=ferdalag&preset=tjald
```

Exact URL can be decided later. The point is: product entry can be specific, engine stays generic.

## Phase Recommendation

### Phase 0.5 / 0.6

Do not build mode UI yet.

Focus on:

- shared core seam;
- characterization tests;
- existing Ferðaveðrið uses the seam.

### Phase 0.7 hidden prototype

Allow a hidden route if useful:

- `/auth-mvp/tjaldferd`

But require:

- uses shared route/weather core;
- uses generic trip model concepts;
- no duplicated route weather logic;
- no SQL;
- no public nav.

### Phase 1 product UI

Decide whether to surface as:

- `/vedrid` with `Einn akstur | Ferðalag`, or
- separate visible card linking into the `Ferðalag` mode.

By Phase 1, Codex preference is to make it feel like one Veðrið product with modes.

## Design.md Notes

Relevant Design.md constraints:

- Mobile-first at 360-460 px.
- Do not make the simple flow feel like an enterprise dashboard.
- Use segmented controls only for genuinely mutually exclusive modes.
- Avoid nested cards.
- Keep primary action obvious.
- Stable controls, no horizontal overflow.
- New UI text belongs in `messages/is.json` and `messages/en.json`.

For this product question, that means:

- `Einn akstur | Ferðalag` is acceptable if it stays compact.
- Do not show a huge multi-step builder before the user has chosen `Ferðalag`.
- Do not bury the current fast route flow.
- Multi-stop/campsite controls should be progressive disclosure.

## Concrete Guidance For Claude Code

When revising the plan, Claude Code should not frame the future as:

```txt
Ferðaveðrið route
Tjaldferð route
two separate systems
```

Frame it as:

```txt
Shared WeatherTrip model and route/weather assessment
Mode 1: Einn akstur
Mode 2: Ferðalag
Camping: preset/use case inside Ferðalag
```

Claude Code should explicitly answer:

1. What is the minimal shared trip data model that supports current `Einn akstur` without overcomplicating it?
2. How can current Ferðaveðrið remain visually/simple-flow identical while internally becoming a one-leg trip?
3. Which components are safe to share now, and which should stay product-specific until proven?
4. Would a temporary hidden `/auth-mvp/tjaldferd` route create fork risk, and what guardrails prevent that?
5. When should `/vedrid` show a mode switch, if ever?

## Suggested Message To Claude Code

```md
Claude Code, bættu þessari vörustefnu inn í TODO #78 planið:

Við viljum ekki fork-a Ferðaveðrið og Tjaldferð. Undirliggjandi model á að vera eitt shared WeatherTrip/route-weather kerfi.

UI má samt vera með einföldum modes:
- `Einn akstur` = núverandi Ferðaveðrið default, einfalt A -> B.
- `Ferðalag` = stækkaður multi-stop builder með möguleika á fleiri áfangastöðum, tjaldsvæðum, stay windows og síðar saved re-check.

Camping/Tjaldferð ætti helst að vera preset/use case inni í `Ferðalag`, ekki sér route-weather engine. Hidden route fyrir prototype er í lagi tímabundið ef hún notar shared trip model og shared weather core.

Ekki byggja mode UI strax ef Phase 0.5/0.6 er bara shared core extraction. En planið þarf að vera future-proof þannig að current Ferðaveðrið geti orðið one-leg WeatherTrip án þess að notandinn finni fyrir flækjustigi.

Skilaðu uppfærðu plani með:
- shared trip model direction
- hvernig `Einn akstur` mappar á one-leg trip
- hvernig `Ferðalag` mappar á multi-stop trip
- hvernig tjaldsvæði verða stop/preset, ekki fork
- hvaða UI kemur síðar og hvað á alls ekki að koma í Phase 0.5/0.6
- Localhost checks for Stebbi.
```

## Localhost Checks For Stebbi

This is a planning addendum; no app behavior changes yet.

When Claude Code returns a revised plan, Stebbi should verify:

1. It keeps `Einn akstur` simple and equivalent to current Ferðaveðrið.
2. It describes `Ferðalag` as an expansion of the same model, not a separate engine.
3. It treats campsites as stops/presets/use cases, not a whole fork.
4. It does not propose visible mode UI before shared core extraction is proven.
5. It includes Design.md mobile-first constraints for any future mode switch.
6. It keeps `/vedrid` future-friendly without requiring all current users to understand multi-stop planning.

## Bottom Line

Best direction:

- one shared engine/model;
- two user-facing modes when needed;
- current `Einn akstur` remains fast and default;
- `Ferðalag` grows into multi-stop/camping/saved-trip behavior;
- Tjaldferð is a preset/use case, not a fork.

