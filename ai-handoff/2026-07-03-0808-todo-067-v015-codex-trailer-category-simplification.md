# TODO #67 Vedrid - trailer category simplification for Phase 2A

**Dagsetning:** 2026-07-03 08:08  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Stebbi leggur til að byrja ekki með nákvæma tegund eftirvagns, heldur nokkrar algengar tegundir: tjaldvagn, fellihýsi, hjólhýsi, hestakerra.

## Recommendation

Já. Byrja með einn sameiginlegan, varfærinn flokk:

`towable_trailer`

Þessi flokkur nær yfir:

- tjaldvagn
- fellihýsi
- hjólhýsi
- hestakerra
- kerra / eftirvagn / vagn ef samhengið er ferðalag eða akstur

Ekki biðja notanda um nákvæmari tegund í Phase 2A. Ef spurningin inniheldur eitt af þessum orðum, með aksturs/leiðar samhengi, má route-a hana í sama `route_travel` deterministic tool.

## Why this is better for MVP

Þetta er:

- einfaldara fyrir notanda
- minna fragile en að reyna að greina nákvæma tegund
- öruggara en frjálst AI svar
- nóg til að leysa spurningu eins og:
  `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`

Við getum síðar bætt sérreglum fyrir stærð, hæð, þyngd eða reynslu ökumanns, en það væri overkill núna.

## Implementation plan for Claude Code

### 1. Add trailer keyword classifier

Create a small deterministic helper, e.g. in `lib/weather/intents.ts` or similar:

```ts
type TrailerKind =
  | 'tent_trailer'
  | 'folding_camper'
  | 'caravan'
  | 'horse_trailer'
  | 'generic_trailer'

type TravelActivity = {
  kind: 'towable_trailer'
  trailerKind?: TrailerKind
}
```

Keyword mapping:

- `tjaldvagn`, `tjaldvagni` -> `tent_trailer`
- `fellihýsi`, `fellihysi`, `fellihýsið` -> `folding_camper`
- `hjólhýsi`, `hjolhysi`, `hjólhýsið` -> `caravan`
- `hestakerra`, `hestakerru`, `hestakerrunni` -> `horse_trailer`
- `kerra`, `kerru`, `eftirvagn`, `vagn` -> `generic_trailer`

All of these should use the same weather thresholds in Phase 2A.

### 2. Keep thresholds unified and conservative

Initial `towable_trailer` thresholds:

- `rautt` if wind speed > 10 m/s or gusts > 15 m/s
- `gult` if wind speed > 7 m/s or gusts > 11 m/s
- `gult` if meaningful precipitation is expected
- `gult` if temperature is near freezing or below
- default to `gult` rather than `graent` if key data is missing

Do not claim absolute safety. The output is weather guidance, not a driving guarantee.

### 3. Hestakerra caveat

Do not add a totally separate weather algorithm yet, but if `trailerKind === 'horse_trailer'`, add an extra caveat:

> Athugaðu líka velferð dýra, færð og aðstæður á leiðinni.

This is product-sensible without expanding scope too much.

### 4. Parser should not ask follow-up questions in Phase 2A

If user says:

`Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`

Route directly:

- intent: `route_travel`
- activity: `towable_trailer`
- trailerKind: `caravan`
- origin: Reykjavík
- destination: Apavatn
- time: today

If trailer word is missing:

- leave unsupported for now, unless it is clearly existing `grill`.

### 5. Place extraction still needs v013 fix

Before or as part of this:

- `mosó`, `Mósó`, `moso` must all resolve.
- Avoid a separate un-normalized `PLACE_PATTERNS` list if possible.

## Tests Claude should add

### Intent / parser tests

- `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`
  - returns `route_travel`, `towable_trailer`, `caravan`
- `Má ég keyra með tjaldvagn frá Reykjavík að Apavatni á morgun?`
  - returns `tent_trailer`
- `Hvernig er að fara með fellihýsi frá Selfossi að Apavatni í dag?`
  - returns `folding_camper`
- `Er í lagi að fara með hestakerru frá Reykjavík að Apavatni?`
  - returns `horse_trailer`
- `Er hægt að keyra með kerru frá Reykjavík að Apavatni?`
  - returns `generic_trailer`

### Deterministic tool tests

- green-ish weather -> `graent` but cautious wording
- moderate wind -> `gult`
- high gusts -> `rautt`
- horse trailer -> includes animal welfare caveat
- missing key data -> `gult` or `no_data`, not `graent`

### Regression tests

- existing grill question still works
- unsupported question still returns unsupported
- `mosó`, `mósó`, `moso` all resolve

## Localhost checks for Stebbi

After implementation:

1. Trailer route:
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`
   - expected: route/trailer answer, not unsupported.
2. Other trailer words:
   - `Má ég keyra með tjaldvagn frá Reykjavík að Apavatni á morgun?`
   - `Er í lagi að fara með fellihýsi frá Selfossi að Apavatni í dag?`
   - `Er í lagi að fara með hestakerru frá Reykjavík að Apavatni?`
   - expected: same general tool, hestakerra has extra caveat.
3. Existing feature:
   - `Er grillveður í Reykjavík í kvöld?`
   - expected: unchanged.
4. Place regression:
   - `Er grillveður í mosó í kvöld?`
   - expected: Mosfellsbær answer.
5. Unsupported:
   - `Ætti ég að kaupa ís?`
   - expected: friendly unsupported message.

Do not test production Supabase, Vercel env, deployments, or broad AI rollout without explicit permission.

## Scope guard

Do not implement:

- full routing provider
- geocoding provider
- speed/road condition integration
- individualized safety advice
- open-ended AI weather assistant

Implement only:

- normalized place extraction fix
- Apavatn support
- trailer keyword classification
- route_travel deterministic tool
- cautious AI wording over deterministic result
