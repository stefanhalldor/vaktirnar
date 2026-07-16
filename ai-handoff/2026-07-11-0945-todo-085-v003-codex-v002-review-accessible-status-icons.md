# TODO #85 - Codex review of Claude v002, with accessible status icon direction

## Context

Stebbi reviewed Claude's v002 pre-implementation questions and specifically answered S2 with an accessibility/color-blindness direction:

> Innan marka: grænn broskarl?
> Nálgast óþægindi: smá stressaður emoji, gulur
> Óþægilegt: stressaður emoji, appelsínugulur
> Nálgast hættumörk: Sveittur emoji, rauður
> Hættulegt: þríhyrningsvarúðarmerki

This handoff turns that into an implementation recommendation.

## Verdict

Proceed with #85 after applying the direction below.

Claude v002 is generally sound:

- keep internal `WeatherStatus = graent | gult | rautt`,
- add a finer display-layer wind classifier,
- remove visible `trailer` step,
- hide gust/precip threshold controls,
- keep gust/precip internals neutralized with high hidden thresholds for this phase.

## Answers To Claude's Open Questions

### S1 - Where should `classifyWindDistance()` live?

Use a domain-level helper, not a component-only helper.

Codex preference:

- either `lib/weather/assessment.ts` if small,
- or a new `lib/weather/wind-status.ts` / `lib/weather/wind-display.ts` if it starts growing.

Do not put it under `components/weather/`; route option preview, trip assessment display and final result may all need the same logic later.

### S2 - `Nálgast hættumörk` and accessible visual treatment

Use **text + icon + color**, never color alone.

This should work for color-blind users and still feel fast to scan.

Recommended display mapping:

| Display status | Text | Icon cue | Color treatment |
| --- | --- | --- | --- |
| `innan-marka` | `Innan marka` | smiling face cue | green |
| `nalgast-othaegindi` | `Nálgast óþægindi` | slightly stressed face cue | yellow / amber |
| `othaegilegt` | `Óþægilegt` | stressed face cue | orange |
| `nalgast-haettumork` | `Nálgast hættumörk` | sweaty / high-stress face cue | red or red-orange warning treatment |
| `haettulegt` | `Hættulegt` | warning triangle | red / destructive-adjacent |

Important accessibility notes:

- Always show the text label next to the icon in pills, selected-slot summary and route/detail cards.
- In tiny scrubber dots, do not force full emoji labels into every dot if it creates clutter. The dot/mark can remain compact, but the selected detail and pill labels must expose the status in text.
- If using raw emoji, render it `aria-hidden="true"` and rely on the text label for screen readers.
- Consider lucide `TriangleAlert` for `Hættulegt` instead of a raw warning emoji, if it fits the current icon system better.
- Status-litir mega ekki vera eina leiðin til að miðla merkingu, per `Design.md`.

Codex preference for professional UI:

- Use the emoji-like idea as the product language, but implement as a small status icon slot that can be either emoji or icon.
- Start simple with raw emoji if fastest, but keep it wrapped so we can replace with custom icons later without changing classifier logic.

Suggested first-pass emoji cues:

```ts
innan-marka: '🙂'
nalgast-othaegindi: '😬'
othaegilegt: '😟'
nalgast-haettumork: '😰'
haettulegt: TriangleAlert icon or '⚠️'
```

If the emoji style feels too playful in localhost, switch to lucide icons while preserving the same labels and colors.

### S3 - Is `Gott veður` -> `Innan marka` part of #85?

Yes. Do it in #85.

This is central to the change. The app is now saying "inside the user's configured wind boundaries", not making a broad claim that the weather is good.

### S4 - Precipitation as informational

Yes: precipitation may remain visible as informational weather data.

Interpretation:

- Result/detail/forecast rows may still show precipitation values.
- Precipitation should not be a user-editable threshold in this phase.
- Precipitation should not determine the visible traffic-light status in this phase if the hidden threshold is neutralized to `100`.
- Summary threshold text should only mention uncomfortable/dangerous wind.

## Status Model Recommendation

Keep two layers:

1. Internal severity, for compatibility:
   - `graent`
   - `gult`
   - `rautt`

2. Display wind status, for user-facing labels:
   - `innan-marka`
   - `nalgast-othaegindi`
   - `othaegilegt`
   - `nalgast-haettumork`
   - `haettulegt`

Mapping:

```ts
innan-marka -> graent
nalgast-othaegindi -> gult
othaegilegt -> gult
nalgast-haettumork -> gult, but with stronger display warning
haettulegt -> rautt
```

This avoids breaking existing `graent/gult/rautt` assumptions while adding better user language.

## UI Notes

Follow `Design.md`:

- Mobile-first.
- Text labels required.
- Color cannot be the only carrier of meaning.
- Avoid nested cards.
- Touch targets at least 40px where interactive.
- Use semantic tokens and restrained warning colors.

Where to show icon + label:

- status pills/counts,
- selected departure summary,
- `Á leiðinni` row,
- all route/detail cards that display the status,
- route option preview later if #83 uses the same status.

Where to stay compact:

- scrubber dots/marks can remain dots or compact marks,
- but selected state and accessible labels must expose the full text.

## Implementation Guardrails

Do not overbuild iconography in this pass.

Preferred first implementation:

- create a small status metadata map:
  - label message key,
  - icon cue,
  - className/tone,
  - internal severity.
- use it wherever user-facing status is rendered.
- keep status labels in `messages/is.json` and `messages/en.json`.

Do not introduce five separate database/event/status values unless absolutely needed. This is display classification, not a new persistence model.

## Suggested Message Keys

Under `teskeid.vedrid.ferdalagid` or a nearby weather namespace:

```json
"statusWithinLimits": "Innan marka",
"statusNearDiscomfort": "Nálgast óþægindi",
"statusUncomfortable": "Óþægilegt",
"statusNearDanger": "Nálgast hættumörk",
"statusDangerous": "Hættulegt"
```

English:

```json
"statusWithinLimits": "Within limits",
"statusNearDiscomfort": "Near discomfort",
"statusUncomfortable": "Uncomfortable",
"statusNearDanger": "Near danger limit",
"statusDangerous": "Dangerous"
```

## Recommended Execution Plan

Do #85 in one focused prerelease if Claude can keep it tight:

1. Add pure wind display classifier + tests.
2. Add status metadata map with icon cue/text/tone.
3. Remove `trailer` from visible wizard step order.
4. Hide gust and precipitation threshold inputs.
5. Submit hidden gust/precip thresholds as neutral high values, e.g. `100`.
6. Update threshold summary text to only show wind thresholds.
7. Replace `Gott veður` display with `Innan marka`.
8. Apply the five display labels where currently appropriate.
9. Keep precipitation informational values visible.
10. Run type-check and targeted tests.

If this gets large, split after step 2 and hand back to Codex before UI wiring.

## Tests To Add / Update

Boundary tests for `classifyWindDistance()`:

- wind clearly below uncomfortable threshold -> `innan-marka`
- wind exactly 2 m/s below uncomfortable threshold -> `innan-marka` if rule is `< 2`
- wind 1.99 m/s below uncomfortable threshold -> `nalgast-othaegindi`
- wind exactly at uncomfortable threshold -> `othaegilegt`
- wind clearly between uncomfortable and danger -> `othaegilegt`
- wind exactly 2 m/s below dangerous threshold -> `othaegilegt` if rule is `< 2`
- wind 1.99 m/s below dangerous threshold -> `nalgast-haettumork`
- wind exactly at dangerous threshold -> `haettulegt`

Also update existing tests that assert `Gott veður` labels or threshold summary copy.

## Localhost Checks For Stebbi

1. Open `/vedrid` in mobile viewport.
2. Confirm the old `Eftirvagn` step is gone.
3. Confirm threshold step only asks for uncomfortable wind and dangerous wind.
4. Confirm the threshold step includes short gust/Vegagerðin caution copy.
5. Confirm the threshold summary near result/scrubber mentions only the two wind limits.
6. Pick thresholds so the selected slot is safely below uncomfortable wind.
7. Expected: `Innan marka` with green/smiling cue.
8. Pick thresholds so wind is less than 2 m/s below uncomfortable wind.
9. Expected: `Nálgast óþægindi` with yellow/stressed cue.
10. Pick thresholds so wind is above uncomfortable wind but more than 2 m/s below danger.
11. Expected: `Óþægilegt` with orange/stressed cue.
12. Pick thresholds so wind is less than 2 m/s below danger.
13. Expected: `Nálgast hættumörk` with stronger warning cue.
14. Pick thresholds so wind is over danger.
15. Expected: `Hættulegt` with warning triangle cue.
16. Check all visible status spots:
    - pills/counts,
    - scrubber selected detail,
    - `Á leiðinni`,
    - point detail cards,
    - map/detail if relevant.
17. Confirm color is not the only way to understand status.
18. Confirm no mobile overflow at 360-460px.

## Codex Recommendation

Stebbi's emoji/status idea is good, especially for color-blind accessibility, as long as the implementation uses text + icon + color together.

Claude can proceed with #85 using this direction.
