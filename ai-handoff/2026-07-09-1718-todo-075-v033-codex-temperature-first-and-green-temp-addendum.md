# Codex addendum: TODO #75 v033 - Temperature first and green temperature comparison

Created: 2026-07-09 17:18  
Timezone: Atlantic/Reykjavik

## Context

Stebbi reviewed `2026-07-09-1715-todo-075-v032-claude-metric-colors-presets-drawer-done`.

The latest version is good enough visually for a first phase, but Stebbi wants two product tweaks:

1. Color the better temperature value too, in both summary and detail.
2. Put temperature at the top of each comparison cell, above wind, because temperature is the most important comparison signal for most people in this origin/destination view.

This is a handoff/addendum only. Codex did not change app code, SQL, migrations, commits, deployment, Supabase, secrets, or production data.

## Product decision

For this comparison component, temperature should be treated differently than in route-risk assessment.

Earlier Codex guidance kept temperature neutral because “warmer/colder” is not always safer for driving. That still applies to route-risk verdicts.

But this component is not the route-risk verdict. It is a place-to-place weather comparison. In that context, users often care most about which place is warmer/milder.

Therefore:

- In **origin/destination comparison only**, temperature can be green-highlighted when one place is meaningfully warmer/milder than the other.
- This must not affect route status, scrubber counts, departure verdict, or “good/unpleasant/bad” route assessment.

## Temperature-first cell order

Change metric order in both summary strip and detail drawer:

Current-ish:

```text
Vindur
Hviður
Hiti
Úrkoma
```

Desired:

```text
Hiti
Vindur
Hviður, if relevant
Úrkoma
```

Visual hierarchy:

- Temperature should be the strongest line in the comparison cell.
- Wind should be secondary.
- Gusts should remain a subtle subline unless warning state applies.
- Precipitation remains small/footer-like.

## Green temperature highlighting rule

Add a `temperatureMetricClass(value, otherValue)` or equivalent helper.

Recommended first-phase rule:

- Warmer is green if the difference is at least `2.0°C`.
- If difference is under `2.0°C`, do not color either value.
- If either value is missing, do not color.

Example:

- Akureyri `13,7°C` vs Garðabær `10,8°C` -> Akureyri temperature green.
- Garðabær `11,8°C` vs Akureyri `16,1°C` -> Akureyri temperature green.

Important:

- This is “warmer/milder in this comparison”, not “safer driving weather”.
- Keep the visual green subtle and consistent with wind/precip green.
- Do not use red/amber for colder in this comparison unless there is an actual frost/ice warning rule.

Potential future refinement:

- If later frost/ice semantics are added, temperatures near/below freezing can get their own warning logic.
- For now, warmer wins only as a mild comparison cue.

## Warning precedence

Warning styles should still win over green when they apply.

For temperature today, there may be no temperature warning. If no temp warning exists, green warmer highlight can apply normally.

For wind/gust/precip, keep existing precedence:

1. Threshold warning.
2. Better-than-other-place green.
3. Neutral.

## Detail drawer

Apply the same temperature-first order and green temperature comparison in the detail drawer.

Detail drawer still needs to remain mobile-contained and use the preset controls from v032.

## Suggested tests

Add or update helper tests:

- Temperature value is green when it is warmer by >= `2.0°C`.
- Temperature value is neutral when warmer by < `2.0°C`.
- Temperature value is neutral when other value is missing.
- Temperature green highlighting is applied in both origin and destination directions.
- Temperature-first ordering is visible in summary and detail rendering, if component tests exist.

Run:

- `npm run type-check`
- `npm run test:run`

## Localhost checks for Stebbi

After Claude Code updates this:

1. Open `/auth-mvp/vedrid`.
2. Test Akureyri -> Garðabær and Garðabær -> Akureyri.
3. In the summary strip, confirm temperature appears at the top of each comparison cell.
4. Confirm the warmer place is green-highlighted when the temperature difference is clearly meaningful.
5. Confirm tiny temperature differences are not colored.
6. Confirm wind/gust/precip green and warning colors still behave as before.
7. Open `Skoða samanburð nánar`.
8. Confirm the detail drawer also shows temperature first.
9. Confirm the detail drawer uses the same temperature green-highlight logic.
10. Confirm no route verdict, scrubber count, map point status, or summary risk text changes because of this visual comparison coloring.

## Óvissa / þarf að staðfesta

- Codex assumes “better temperature” means warmer/milder for this first comparison phase. If Stebbi wants a different seasonal/comfort rule later, that should be a separate product decision.
- Confidence: high for this product tweak.

