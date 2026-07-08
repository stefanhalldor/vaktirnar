# TODO-067 v175 - Codex review/handoff - v174 result-card polish

Created: 2026-07-08 07:41  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Status: Review/handoff only. No app code, SQL, env, deployment, or production data changed.

## Context

Reviewed:

- `ai-handoff/2026-07-08-0740-todo-067-v174-claude-v173-done-prerelease.md`

Stebbi's localhost review: the combined card is now much more understandable, but the card still has too much instructional/header text and the selected-slot detail wording can be clearer.

This is a UI/content polish handoff for Claude Code.

## Findings

### 1. Medium - Combined card still has redundant headers and guidance

v174 says the card structure starts with:

1. `Brottfarartíminn þinn í Teskeið`
2. scrubber
3. dynamic status sentence
4. coverage text
5. disclaimer

In the screenshot, the card also shows `Hvenær er best að leggja af stað?`.

That made sense while the UI was teaching the scrubber, but the current version is now understandable enough that these headings are noise. The card should lead with the data scope, then the scrubber itself.

### 2. Medium - Slot detail text should explain where the difficult point is before naming the metric

Current text:

```text
Mest krefjandi á þessum brottfarartíma: 10 m/s
51 km frá Garðabæ
```

This reads like a metric label first and location second. For user trust, the location should come first:

```text
Mest krefjandi er 51 km frá Garðabæ.
Vindur: 10 m/s
```

If the origin cannot be safely declined, use `frá upphafsstað` rather than grammatically wrong place text.

### 3. Low - Need to avoid fragile Icelandic declension

Do not build a broad Icelandic declension engine in this pass.

Use safe known dative forms only when available. If the app cannot confidently render the origin in dative, use:

```text
Mest krefjandi er {distance} km frá upphafsstað.
```

This is less personal but always correct.

## Required changes

### 1. Remove redundant card header text

Inside the combined result card, remove:

- `Brottfarartíminn þinn í Teskeið`
- `Hvenær er best að leggja af stað?`

Do not replace them with a new title.

### 2. Move coverage text to the top of the card

Move this text to the top of the combined card, above the scrubber:

```text
Teskeið hefur metið brottfarartíma á klukkutíma fresti fram til fimmtudagsins 16. júlí.
```

Keep this dynamic based on the actual forecast coverage end date, as already implemented in v172/v174.

If there is not enough forecast coverage, the sentence must still be truthful. Example:

```text
Teskeið hefur metið brottfarartíma á klukkutíma fresti fram til miðvikudagsins 15. júlí.
```

### 3. Keep scrubber immediately after coverage text

Card order should become:

1. Coverage text: `Teskeið hefur metið...`
2. Scrubber and filter pills
3. Selected-slot detail box
4. Dynamic status sentence with colored dot
5. Optional ferry/window/custom-threshold notes if present
6. Disclaimer: `Þetta er veðurmat, ekki umferðar- og farartrygging.`

No `Af hverju?`.
No `Næst verður varasamt...`.
No standalone card title.
No `Hvenær er best að leggja af stað?`.

### 4. Change selected-slot detail wording

Replace:

```text
Mest krefjandi á þessum brottfarartíma: {value}
{distance} km frá {origin}
```

With:

```text
Mest krefjandi er {distance} km frá {originDativeOrFallback}.
{metricLabel}: {value}
```

Examples:

```text
Mest krefjandi er 51 km frá Garðabæ.
Vindur: 10 m/s
```

```text
Mest krefjandi er 223 km frá upphafsstað.
Úrkoma: 3,5 mm/klst
```

Use Icelandic decimal formatting consistently with the rest of the weather UI.

### 5. Origin dative handling

Preferred order:

1. If a selected place has a known dative/display form in local place metadata, use it.
2. If a tiny explicit map of common known names already exists, use that.
3. Otherwise render `frá upphafsstað`.

Do not attempt broad automatic declension in this pass.

Avoid output like:

```text
frá Garðabær
frá Reykjavíkurborg?
frá 210 Garðabær
```

If the raw origin string includes postal code/address clutter, fallback is better:

```text
frá upphafsstað
```

### 6. Translation keys

Do not hardcode user-facing text in components.

Add/update keys in both `messages/is.json` and `messages/en.json`.

Suggested Icelandic keys/values:

```json
{
  "slotDetailWorstDistance": "Mest krefjandi er {distance} km frá {origin}.",
  "slotDetailOriginFallback": "upphafsstað",
  "slotDetailMetricLine": "{metric}: {value}"
}
```

Or use equivalent naming if current `teskeid.vedrid.ferdalagid` key naming suggests a better local pattern.

English draft:

```json
{
  "slotDetailWorstDistance": "Most demanding point is {distance} km from {origin}.",
  "slotDetailOriginFallback": "the starting point",
  "slotDetailMetricLine": "{metric}: {value}"
}
```

For English, phrase may be adjusted to avoid `from the starting point` awkwardness if needed.

## Design.md notes

This change aligns with:

- Mobile-first UI, dense but not cramped.
- Card text hierarchy should be clear and not repetitive.
- Text must not overflow controls.
- Cards should represent one focused repeated item or focused result, not nested explanation blocks.
- User-facing text belongs in message files.

## Suggested implementation locations

Likely files:

- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `messages/is.json`
- `messages/en.json`

If origin dative metadata already belongs somewhere like `lib/weather/places.ts`, use existing pattern. Otherwise keep fallback simple.

## Suggested tests/checks

Run after implementation:

```bash
npm run type-check
npm run test:run
```

If there are focused weather/client tests, run them too.

## Localhost checks for Stebbi

Open `/auth-mvp/vedrid` on localhost.

Use a long route such as:

- `Garðabær → Egilsstaðir`

Expected:

1. Route summary above card still shows distance and duration, e.g. `Garðabær → Egilsstaðir (636 km, 460 mín.)`.
2. The combined card starts with coverage text: `Teskeið hefur metið brottfarartíma...`.
3. The text `Brottfarartíminn þinn í Teskeið` is gone.
4. The text `Hvenær er best að leggja af stað?` is gone.
5. Scrubber appears immediately below the coverage text.
6. First scrubber slot is still selected by default.
7. Selecting another scrubber slot still updates:
   - selected slot highlight;
   - selected slot detail box;
   - dynamic status sentence;
   - map state, if already wired.
8. Slot detail box shows:
   - `Brottför: kl. HH:MM · Komutími: kl. HH:MM`
   - `Mest krefjandi er X km frá Garðabæ.` when safe.
   - fallback `Mest krefjandi er X km frá upphafsstað.` when dative is not safe.
   - metric on next line, e.g. `Vindur: 10 m/s`.
9. The disclaimer remains near the bottom of the combined card:
   - `Þetta er veðurmat, ekki umferðar- og farartrygging.`
10. No `Af hverju?` disclosure appears in the result card.
11. Mobile viewport at 360px has no horizontal overflow, clipped text, or overlapping controls.

No Supabase, RLS, auth, SQL, production data, secrets, billing, or deployment behavior should change in this pass.
