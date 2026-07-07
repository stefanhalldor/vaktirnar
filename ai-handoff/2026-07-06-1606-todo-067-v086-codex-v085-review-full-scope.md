# todo-067 v086 - Codex review of v085, full-scope route weather UX

Created: 2026-07-06 16:06  
Timezone: Atlantic/Reykjavik  
Review target: `2026-07-06-1545-todo-067-v085-claude-v084-plan`  
Reviewer: Codex  
Relevant TODO: ongoing `todo-067` Ferðalagið weather work, plus #67 follow-up context

## Findings

### P1 - V085 scope does not match Stebbi's product decision

V085 explicitly excludes:

- departure heatmap/timeline
- `Breyta forsendum`
- interactive origin/destination map selection

Stebbi has now clarified: `Ég vil ekki fara neinar hálfar leiðir... alla leið`.

That means V085 should not be executed unchanged. It is too much of a patch pass. The implementation still needs to be staged so the diff is reviewable, but the milestone must include the full product experience:

1. trustworthy result explanation,
2. departure-time heatmap backed by deterministic data,
3. editable assumptions,
4. interactive origin/destination selection instead of static confirmation images.

Recommended framing: one full milestone with multiple stop-points, not three "maybe later" handoffs.

### P1 - `nextCaution` must show thresholds, not just metric + value

V085 says:

> No threshold values needed — the metric and value are enough context.

I disagree. Stebbi explicitly asked that if we say a departure time is risky, we must support it with data. A value alone is not enough because the user cannot know why `Úrkoma: 1.2 mm/klst` or `Vindur: 14 m/s` matters.

The UI should show:

- metric
- value
- threshold
- status
- location/time

Example:

`Næst verður varasamt kl. 17:00 · Úrkoma 1.4 mm/klst yfir mörkum 1.0 mm/klst · 45 km frá Reykjavík`

or:

`Næst verður varasamt kl. 20:00 · Vindur 14.2 m/s yfir mörkum 13 m/s fyrir hjólhýsi · 120 km frá Reykjavík`

If threshold cannot be derived reliably from `reasonCode`, `trailerKind` and metric, then the code should add threshold metadata to the deterministic issue/candidate model before presenting the claim.

### P1 - Gust visual indicator must not imply wrong causality

V085 suggests showing `↑` when `summary.status !== 'graent' && summary.gustMs > summary.windMs`.

That can mislead. Example: status is yellow because of precipitation, but gust is slightly above wind. The UI would visually imply gusts are part of the warning.

Better rule:

- show gust text whenever `gustMs > windMs`
- show a neutral gust chip/icon for elevated gusts
- show warning styling only when the decisive metric is actually `gust`
- do not use `summary.status !== 'graent'` as a proxy for gust causality

This likely means `PointSummary` needs `decisiveMetric` from `summaryForWindow.decisiveMetric`.

### P1 - Heatmap should be in-scope for the full route-weather experience

The existing model already has `TravelPlan.outbound.candidates: TravelCandidate[]`. That means the heatmap is not speculative. It is a UI over deterministic candidate evaluations.

V085's separate-handoff note is useful as a component sketch, but for "alla leið" it should move into the main milestone.

Minimum viable heatmap:

- uses `outbound.candidates`
- each slot is a departure candidate
- status: green/yellow/red/no-data
- selected slot shows:
  - departure and arrival
  - decisive metric
  - value and threshold
  - worst point distance/location
  - link/select corresponding map point where possible
- best window is marked
- no-data is distinct from green
- works at 360-430px with horizontal scroll or compact segmented grid

This is the right surface for "when should I leave?", not a single `nextCaution` sentence.

### P1 - `Breyta forsendum` is core UX, not optional polish

Forcing the user to `Byrja aftur` after a result is a dead end. The assumptions are the mental model of the whole feature.

V085 defers this to a separate handoff. For the full milestone, it should be included:

- result screen actions: `Breyta forsendum`, `Byrja aftur`
- assumptions summary screen
- edit one assumption at a time
- return to summary after save
- `Reikna aftur`

This does not need a database model. It can remain client state in the current flow.

### P1 - Static from/to confirmation should be replaced by an interactive route selection experience

The static image confirmation has repeatedly failed the trust/comfort bar. If the goal is "Google Maps app" feeling, the next plan should stop iterating on static confirmation cards.

Target experience:

- one screen with origin and destination fields
- interactive map visible during selection
- pins for origin/destination
- route preview once both are selected
- ability to correct either point before continuing
- map helps disambiguate duplicate Icelandic street/place names

This is a bigger UI pass and should be designed carefully, but it belongs in the full milestone rather than being treated as a future afterthought.

### P2 - Nominatim disabled-by-default conflicts with "all the way" labels

V085 gates Nominatim behind `NEXT_PUBLIC_ENABLE_REVERSE_GEOCODE` and disables it by default. That is safer than direct public browser calls, but it means the product still falls back to coordinate labels unless Stebbi manually enables the flag.

If human-readable labels are part of "all the way", pick one real direction:

1. do not ship external reverse geocoding yet, and use local/route-derived labels only, or
2. implement a real provider path via BFF/server route with rate limiting, cache, kill switch and privacy/attribution, or
3. use an already-approved paid maps provider with known billing/terms.

Do not leave this as a half-enabled browser experiment for production.

### P2 - The full milestone needs explicit stop-points

"Alla leið" should not mean "one massive unreviewable diff".

Recommended stop-points:

1. data model / deterministic explanation upgrade
2. result screen + heatmap
3. assumptions editing
4. interactive origin/destination selection
5. provider/place-label decision

Claude Code should stop after each stop-point with a handoff and verification results before continuing.

## Recommended direction

Do not execute V085 unchanged.

Ask Claude Code to rewrite it as a full-scope implementation plan with stop-points. The plan should include all product requirements in the milestone, but it should explicitly say where Claude Code will stop for Codex review.

## Suggested message for Claude Code

```text
Ekki framkvæma V085 óbreytt. Stebbi vill ekki hálfa leið í þessu veðurflæði, heldur fulla upplifun.

Uppfærðu V085 í full-scope milestone plan með stop-points. Þetta má ekki verða eitt risadiff, en eftirfarandi má ekki vera "out / maybe later":

1. Result explanation og nextCaution með gögnum
   - Ef UI segir "varasamt að leggja af stað kl. X" þarf það að sýna af hverju.
   - Sýna metric, value, threshold, status, stað/tíma á leið og tengingu við map point.
   - Ekki segja "thresholds not needed". Thresholds eru nauðsynleg til að notandi skilji af hverju þetta er varasamt.
   - Ef threshold vantar í data model, bæta við deterministic threshold metadata í candidate/issue model.

2. Hviður
   - Birta "Hviður" bara þegar gustMs > windMs.
   - Ekki sýna warning-style visual indicator bara af því status != graent.
   - Sýna neutral gust indication þegar gustMs > windMs.
   - Sýna warning/decisive gust indication aðeins þegar decisiveMetric === 'gust'.
   - Ef þarf, bæta decisiveMetric inn í PointSummary úr summaryForWindow.

3. Departure heatmap/timeline
   - Þetta er IN-scope fyrir milestone.
   - Nota TravelPlan.outbound.candidates.
   - Slot per departure candidate, grænt/gult/rautt/no-data.
   - Click/tap á slot sýnir reason details: departure, arrival, metric, value, threshold, worst point, distance/location.
   - Best window merkt.
   - No-data er grátt og skýrt, ekki grænt.
   - Þetta þarf að virka mobile-first 360-430px.

4. Breyta forsendum
   - Lokaskjár má ekki bara hafa "Byrja aftur".
   - Bæta við "Breyta forsendum".
   - Sýna assumptions summary: frá, til, tímar, eftirvagn, og síðar avoid-driving-time preference.
   - Notandi getur edit-að eina forsendu, kemur aftur á summary, og getur ýtt á "Reikna aftur".
   - Þetta má vera client-state fyrst, ekki gagnagrunnur.

5. Frá/til val sem interactive map upplifun
   - Static image confirmation er ekki nóg.
   - Plan fyrir Google Maps-like origin/destination selection:
     - frá og til á sama skjá
     - interactive map strax
     - pins fyrir frá/til
     - route preview þegar báðir punktar eru þekktir
     - hægt að leiðrétta hvorn punkt fyrir sig
     - map hjálpar við duplicate staðarheiti/götunöfn
   - Ef þetta er of stórt fyrir sama implementation pass, skilgreindu það sem stop-point innan sama milestone, ekki sem óákveðið "later".

6. Nominatim/place labels
   - Disabled-by-default Nominatim browser experiment er ekki "alla leið".
   - Veldu skýra stefnu:
     A) engin external reverse geocoding í production enn, local/route-derived labels only, eða
     B) BFF/server reverse-geocode með cache, app-wide throttle, timeout, provider switch/kill switch, privacy/attribution, eða
     C) approved maps provider með þekktum terms/billing.
   - Ekki skilja eftir production sem hálfvirka browser-Nominatim lausn.

7. Stop-points
   - Skiptu implementation í reviewable stop-points:
     1. deterministic data/threshold model
     2. result screen + heatmap
     3. assumptions editing
     4. interactive origin/destination selection
     5. provider/place-label decision
   - Stoppaðu eftir hvert stórt stop-point með handoff fyrir Codex review.

8. Verification
   - npm run type-check
   - npm run test:run
   - npm run build
   - Localhost checks fyrir Stebba á hverjum stop-point.
```

## Localhost checks for Stebbi

For the rewritten full-scope plan, the localhost checks should cover:

1. Route result with current safe weather.
2. Route result with yellow/red future slot.
3. Heatmap slots: green, yellow, red and no-data.
4. Clicking heatmap slot updates detail reason and map selection.
5. Gust text hidden when `gustMs <= windMs`.
6. Gust shown neutrally when `gustMs > windMs`.
7. Gust warning indicator only when gust is the decisive metric.
8. `Breyta forsendum` opens assumptions summary.
9. Editing one assumption returns to summary.
10. `Reikna aftur` recomputes with the edited assumption.
11. Origin/destination selection shows both fields and interactive map in one flow.
12. Duplicate/ambiguous place names can be visually confirmed on the map.
13. Mobile 360px, 390px, 430px: no overflow, no overlapping map controls, no hidden primary action.
14. No new third-party/billing/provider behavior is enabled in production without explicit Stebbi approval.

## Uncertainty / needs confirmation

- I did not run the app or tests in this review.
- The exact data changes for threshold metadata need Claude Code's code-level proposal.
- The interactive origin/destination flow is large enough that Claude Code should produce a component-level plan before implementation, even though it remains inside the full milestone.

