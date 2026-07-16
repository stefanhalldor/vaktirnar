# TODO 078 - Addendum: one entry, one-leg trips, and upgrading a drive into Ferðalagið

Created: 2026-07-11 07:37  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Type: Product/architecture handoff update for Claude Code  
Related TODO: #78 Tjaldferð / Ferðalagið / shared route-weather core  
Builds on:

- `2026-07-10-2026-todo-078-v006-codex-future-proof-shared-weather-core.md`
- `2026-07-11-0731-todo-078-v007-codex-product-flow-model-addendum.md`

Status: Planning/handoff only. No implementation approval implied.

## Stebbi's Updated Direction

Stebbi is leaning toward **one entry point** rather than asking users to choose between separate products too early.

The product thought:

- The user enters Veðrið/Ferðalagið through one simple place.
- By default it opens like today's single-drive Ferðaveðrið.
- From there, the user can switch into deeper trip planning:
  - `Finna tjaldsvæði`
  - add more stops
  - turn the drive into a trip
  - later save/re-check the trip

Stebbi also asked an important follow-up:

> If the user has already made one drive, should they be able to create a trip from it or add it to an existing trip?

Codex answer: **Yes. That is the key future-proof path.**

## Codex Recommendation

Treat the current single drive as a **one-leg WeatherTrip**, not as a separate throwaway flow.

In product language:

- `Einn akstur` is the fast default view.
- `Ferðalagið` is the same underlying object with more structure.
- `Finna tjaldsvæði` is a mode/preset inside `Ferðalagið`, not a separate weather engine.

This gives us one simple entry point while keeping a clean upgrade path:

```txt
User starts with one drive
  -> gets current Ferðaveðrið value
  -> can stop there
  -> or convert/add it into Ferðalagið
```

## Why This Matters

If `Einn akstur` and `Ferðalagið` become separate systems, we create fork risk:

- duplicate route selection logic;
- duplicate route-weather assessment;
- duplicated Hellisheiði/Hringurinn/route-family fixes;
- different labels and UX details;
- future improvements landing in one flow but not the other.

If `Einn akstur` is simply a one-leg trip, then all improvements to route/weather core benefit both:

- current Ferðaveðrið;
- multi-stop trips;
- campsite planning;
- saved re-checks;
- future public/auth variants.

## Product Shape

### One entry point

Keep the default entry simple.

Possible outer product name:

- `Veðrið` for now, because that is already understood.

Possible internal mode language later:

- `Einn akstur`
- `Ferðalagið`
- `Finna tjaldsvæði`

Do **not** force this mode choice on first load in the early phase. Default should still feel like the current A -> B flow.

### Default: one drive

The default screen should still answer:

> "Can I drive from A to B at this departure time?"

It should not feel like a trip-planning dashboard before the user asks for that.

### Progressive actions after a route/weather result

Once the user has calculated a single drive, future UI can expose secondary actions such as:

- `Bæta við áfangastað`
- `Breyta í ferðalag`
- `Finna tjaldsvæði nálægt leiðinni`
- `Vista ferðalag`
- `Bæta við í ferðalag`

These should be progressive and secondary. They must not compete with the main single-drive result.

## Key UX Rule

The current single-drive success path must stay fast:

1. Pick `Frá`.
2. Pick `Til`.
3. Choose route.
4. See weather assessment.

Only after that should the richer trip affordances appear.

This matches how users think:

- first: "Can I go there?"
- then: "Could this become part of a bigger trip?"
- later: "Should I add a campsite / another stop / return leg?"

## Data Model Direction

Use a shared model where `Einn akstur` is only the simplest case.

Directional example:

```ts
type WeatherTrip = {
  id?: string
  mode: 'single_drive' | 'multi_stop_trip'
  origin: TripPlace
  legs: TripLeg[]
  thresholdProfile: ThresholdProfile
  createdFrom?: 'single_drive' | 'trip_builder' | 'campsite_search'
}

type TripLeg = {
  id: string
  from: TripPlace
  to: TripPlace
  kind: 'drive' | 'return_home'
  selectedRoute?: SelectedRouteRef
  departureWindow?: DepartureWindow
  assessment?: RouteWeatherAssessment
}

type TripStop = {
  id: string
  place: TripPlace
  kind: 'destination' | 'campsite' | 'home' | 'waypoint'
  stayWindow?: StayWindow
}
```

Do not implement this exact shape blindly. It is directional.

The important principle:

```txt
Current Ferðaveðrið result = WeatherTrip with exactly one TripLeg.
```

## Conversion Path

When the user chooses `Breyta í ferðalag`, the app should not rebuild from scratch.

It should preserve:

- origin;
- destination;
- selected route option if one exists;
- departure time or selected departure candidate;
- route family/labels when available;
- threshold profile;
- calculated summary state if still fresh enough;
- public/auth context.

Then it can open the richer trip builder with:

```txt
Origin: same origin
Stop 1: same destination
Leg 1: same selected/calculated route
```

The user can then add:

- next destination;
- campsite;
- return home;
- stay window;
- alternative date/time.

## Add To Existing Trip

For logged-in users, later phases should support:

```txt
Bæta við í ferðalag
```

This should let the user append the current drive as:

- a new leg at the end of an existing trip;
- or a replacement/alternative for a leg, if that UX is later designed.

Phase guidance:

- Phase 0.5/0.6: no persistence work required.
- Later: authenticated saved trips can support this.
- Public users can convert in-session, but saving or appending to existing trips should require login.

## Public User Behavior

Public users should still be able to use the simple flow if `WEATHER_PUBLIC_ENABLED=true`.

For future trip conversion:

- allow in-session `Breyta í ferðalag` if feasible;
- do not require login just to explore;
- require login only when saving, re-opening later, or adding to an existing saved trip.

This is aligned with Stebbi's recent product direction: reduce login friction while making login valuable.

Suggested added-value copy direction later:

```txt
Skráðu þig inn til að vista ferðalagið og sjá uppfært mat síðar.
```

Exact text belongs in `messages/is.json` and `messages/en.json`.

## Finna Tjaldsvæði

`Finna tjaldsvæði` should be a use case inside the same trip model.

It can start from:

- the current origin;
- the current destination/route;
- or a region/radius chosen by the user.

It should rank/compare campsite candidates using deterministic route + weather calculations first.

No AI in Phase 1.

Later AI can help summarize or explain, but it should not be the source of truth for route/weather scoring.

## UI / Information Architecture

Codex preference:

- Keep one `/vedrid` product surface.
- Default view is `Einn akstur`.
- Later expose `Ferðalagið` as a progressive mode, not a competing separate product.

Possible future UI:

```txt
Veðrið
  [Einn akstur] [Ferðalagið]
```

But do not rush this segmented control into Phase 0.5/0.6.

First prove the shared core and conversion model.

## Design.md Notes

Relevant Design.md constraints:

- Mobile-first at 360-460 px.
- Do not make simple workflows feel heavy.
- Use segmented controls only for real mutually exclusive modes.
- Avoid nested cards.
- Avoid horizontal overflow.
- Keep primary action clear.
- Use progressive disclosure for advanced controls.
- Text must not overflow buttons/cards.
- New visible copy belongs in `messages/is.json` and `messages/en.json`.

Applied here:

- The default one-drive UI should remain visually close to today's Ferðaveðrið.
- Trip expansion actions should appear after a result, not before.
- `Ferðalagið` should not introduce an enterprise-style builder on first load.
- Any future mode switch must be compact and mobile-safe.

## Technical Guardrails For Claude Code

When revising TODO #78, Claude Code should explicitly avoid:

- making `Tjaldferð` a separate route-weather engine;
- duplicating current route option logic;
- duplicating route assessment logic;
- creating a visible new mode switch before the shared seam is proven;
- adding SQL/persistence before the data model is reviewed;
- forcing public users to log in before exploration.

Claude Code should explicitly include:

1. `Einn akstur` maps to a one-leg `WeatherTrip`.
2. `Breyta í ferðalag` preserves the calculated route/weather context.
3. `Bæta við í ferðalag` is a later authenticated saved-trip feature.
4. `Finna tjaldsvæði` is a preset/use case inside the same model.
5. Shared route-weather core remains the first implementation priority.
6. No AI in the initial deterministic product.

## Suggested Updated Message To Claude Code

```md
Claude Code, uppfærðu TODO #78 planið með þessari vörustefnu:

Við viljum einn inngangspunkt í Veðrið/Ferðalagið, ekki tvö aðskilin kerfi. Default á áfram að vera núverandi einfalda A -> B flæðið (`Einn akstur`), en tæknilega á það að vera one-leg `WeatherTrip`.

Þegar notandi hefur reiknað einn akstur þarf framtíðarplanið að gera ráð fyrir að hægt sé að:
- `Breyta í ferðalag`
- `Bæta við áfangastað`
- `Finna tjaldsvæði`
- síðar `Vista ferðalag`
- síðar `Bæta við í ferðalag`

Þetta má ekki verða fork. `Ferðalagið` og `Finna tjaldsvæði` eiga að nota sama route/weather core og núverandi Ferðaveðrið. Tjaldsvæði eru stop/preset/use case inni í trip modelinu, ekki sér veðurkerfi.

Phase 0.5/0.6 á samt ekki að byggja þungan mode UI. Fyrst á að tryggja shared core seam og að núverandi Ferðaveðrið geti verið one-leg trip án þess að notandinn finni fyrir meiri flækju.

Public users mega explore-a ef `WEATHER_PUBLIC_ENABLED=true`, en saving/re-opening/add-to-existing-trip verður seinna login value.

Skilaðu uppfærðu plani með:
- hvernig `Einn akstur` verður one-leg `WeatherTrip`
- hvernig result screen getur seinna boðið `Breyta í ferðalag`
- hvaða state þarf að flytja yfir við conversion
- hvernig `Finna tjaldsvæði` verður preset/use case, ekki fork
- hvaða hlutir eru Phase 0.5/0.6 og hvað bíður
- Design.md mobile-first notes
- Localhost checks for Stebbi.
```

## Localhost Checks For Stebbi

This is a planning handoff only; no app behavior changes yet.

When Claude Code returns an updated plan or implementation proposal, Stebbi should verify:

1. Current `/vedrid` still opens as a simple one-drive flow by default.
2. The plan says `Einn akstur` is internally a one-leg trip, not a separate system.
3. The plan includes `Breyta í ferðalag` as a later action after a route/weather result.
4. The plan preserves current selected origin, destination, route, departure time and weather thresholds during conversion.
5. `Finna tjaldsvæði` is described as a trip preset/use case, not as a separate route-weather fork.
6. No SQL/persistence is proposed until saved-trip requirements are explicitly reviewed.
7. Public users can explore, while save/re-open/add-to-existing-trip is a login value.
8. UI additions remain mobile-first and do not make the default single-drive flow heavier.

## Bottom Line

Best future-proof product direction:

```txt
One entry point.
Default: one drive.
Internally: one-leg WeatherTrip.
Later: convert/add into Ferðalagið.
Camping: preset/use case inside Ferðalagið.
Shared route-weather core everywhere.
```

