# Codex addendum: TODO #75 v034 - Copy, disclaimer placement, and comparison color rules

Created: 2026-07-09 17:28  
Timezone: Atlantic/Reykjavik

## Context

Stebbi reviewed `2026-07-09-1723-todo-075-v033-claude-temperature-first-green-temp-done`.

The current first-phase visual comparison is now close enough for the eye, but Stebbi wants three product tweaks before this is considered ready:

1. Move the safety disclaimer into the `Á leiðinni` section.
2. Rename `Brottför og áfangastaður` back to `Fyrir þá sem eru að elta veðrið`.
3. Change comparison coloring so all meaningful side-to-side differences are colored, without requiring a minimum `X` difference.

This is a handoff/addendum only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## 1. Move disclaimer into `Á leiðinni`

Current disclaimer copy:

`Þetta er veðurspá og við búum á Íslandi. Fylgist vel með færðinni til öryggis, t.d. á vef Vegagerðarinnar.`

Current location:

- It is rendered at the bottom of the full summary card, after the comparison section.
- In current code, this is around `FerdalagidClient.tsx:1066-1075`.

Desired location:

- Move it under the last line inside the `Á leiðinni` row/section.
- In current code, `Á leiðinni` is around `FerdalagidClient.tsx:886-934`.
- Put the disclaimer after the route/weather metric line in that right-hand content column.

Important:

- Do not duplicate the disclaimer.
- Remove it from the bottom of the summary card after moving it.
- Keep the Vegagerðin link exactly as a link.
- Keep copy in `messages/is.json` and `messages/en.json`; do not hardcode user text.
- If `Á leiðinni` section is not rendered because there is no `dp`/`issue`, keep the disclaimer somewhere safe rather than hiding it accidentally. Codex recommendation: if the route summary exists but `Á leiðinni` cannot render, keep the disclaimer at the old bottom fallback. But in the normal result state, it should be inside `Á leiðinni`.

## 2. Rename comparison heading

Change:

`Brottför og áfangastaður`

To:

`Fyrir þá sem eru að elta veðrið`

This applies to:

- Summary strip heading.
- Detail drawer heading, unless Stebbi later asks for a shorter drawer-specific title.
- `messages/is.json` key currently named `weatherCompareSection`.

English can remain natural, e.g.:

`For weather watchers`

or:

`For those tracking the weather`

Codex recommendation: use `For weather watchers`.

## 3. Change comparison coloring rules

Stebbi wants values colored whenever one side is different, without requiring the difference to pass a minimum threshold.

Current v033/v032 logic uses deadbands:

- Wind: green only if lower by `>= 1.0 m/s`.
- Gust: green only if lower by `>= 2.0 m/s`.
- Precipitation: green only if lower by `>= 0.2 mm/klst`.
- Temperature: green only if warmer by `>= 2.0°C`.

Desired:

- Remove these minimum-difference gates.
- If values differ, color the better side immediately.

Codex interpretation of “better”:

- Temperature: higher/warmer is better in this comparison component.
- Wind: lower is better.
- Gusts: lower is better.
- Precipitation: lower is better.

Important ambiguity:

- Stebbi wrote “lita allt sem er hærra öðru megin”. If this literally means “color the numerically higher value for every metric,” that would color worse wind/gust/precipitation as green, which is likely not intended.
- Codex recommendation: implement “better side gets green, no deadband.” That means warmer temperature, but lower wind/gust/precipitation.

Tie behavior:

- If values are exactly equal, no side is green.
- If one side is missing, no side is green.

Warning precedence:

- Existing warning colors still win over green.
- Example: lower wind is normally green, but if that lower wind is still over the selected warning threshold, warning color wins.

## Suggested implementation notes

Update the metric helpers:

- `windMetricClass`: remove `otherValue - value >= 1.0`; use `value < otherValue`.
- `gustMetricClass`: remove `otherValue - value >= 2.0`; use `value < otherValue`, after warning checks.
- `precipMetricClass`: remove `otherValue - value >= 0.2`; use `value < otherValue`, after warning checks.
- `tempMetricClass`: remove `value - otherValue >= 2.0`; use `value > otherValue`.

If floating point noise becomes a visual problem later, add a tiny formatting-aware equality check, but do not keep the old visible-value deadbands.

## Suggested tests

Add or update helper tests:

- Wind lower by `0.1 m/s` is green.
- Gust lower by `0.1 m/s` is green.
- Precipitation lower by `0.1 mm/klst` is green.
- Temperature higher by `0.1°C` is green.
- Equal values are neutral.
- Missing other value is neutral.
- Warning style wins over green for wind/gust/precip.

Run:

- `npm run type-check`
- `npm run test:run`

## Localhost checks for Stebbi

After Claude Code updates this:

1. Open `/auth-mvp/vedrid`.
2. Run a route such as Akureyri -> Garðabær.
3. Confirm the `Á leiðinni` row now includes the safety disclaimer under its normal weather/detail line.
4. Confirm the disclaimer is not duplicated at the bottom of the summary card.
5. Confirm the Vegagerðin link still works.
6. Confirm the comparison heading says `Fyrir þá sem eru að elta veðrið`.
7. Confirm the drawer heading uses the same copy or a deliberate equivalent.
8. Confirm any small side-to-side difference gets colored:
   - warmer temperature green,
   - lower wind green,
   - lower gust green,
   - lower precipitation green.
9. Confirm equal values are not colored.
10. Confirm warning colors still beat green comparison colors.
11. Confirm route verdict, scrubber status, map point status, and forecast drawer behavior are unchanged.

## Óvissa / þarf að staðfesta

- Codex interprets Stebbi’s color request as “better side gets green with no minimum difference,” not “numerically higher side always gets green.” If Claude Code believes the literal higher-value interpretation is intended, stop and ask before implementing because that would color worse wind/precipitation.
- Need to confirm fallback disclaimer placement if `Á leiðinni` does not render for a rare no-data state.
- Confidence: high on copy/disclaimer changes, medium-high on color-rule interpretation.

