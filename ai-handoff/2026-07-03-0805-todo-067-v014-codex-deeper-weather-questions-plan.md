# TODO #67 Vedrid - plan for deeper weather questions

**Dagsetning:** 2026-07-03 08:05  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Stebbi spurdi hvort vid getum strax farid ad virkja dypri spurningar eftir ad basic grill/Reykjavik flaeði virkadi local. Daemi fra Stebba: `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`

## Short answer

Já, við getum byrjað strax á næsta lagi, en ekki með því að opna AI fyrir almennum frjálsum veðurdómum.

Rétta bulletproof leiðin er:

1. Laga fyrst `mosó`/place extraction bug úr v013.
2. Bæta við “deep question parser” sem skilar structured intent/slots.
3. Láta deterministic tool meta gögnin.
4. Láta AI aðeins orðfæra og útskýra niðurstöðuna, með guards.

Þetta heldur vörunni gagnlegri án þess að AI fari að gefa of öruggar eða órökstuddar ráðleggingar.

## Why current code rejects the example

Núverandi route styður bara:

- `detectIntent()` -> `grill` eða `unknown`
- einn stað úr `PLACE_PATTERNS`
- einn punkt forecast
- `checkGrillWeather()`

Spurningin `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?` þarf:

- intent: travel / towing / safety-ish weather check
- origin: Reykjavík
- destination: Apavatn
- time window: í dag
- multiple forecast points eða route approximation
- varúð í wording: þetta má ekki hljóma eins og endanleg öryggistrygging

## Required guardrails

### AI má ekki vera eina heimildin

AI má:

- flokka spurningu í intent
- draga út activity, place(s), time window
- skrifa náttúrulegt svar út frá deterministic result

AI má ekki:

- búa til veðurgögn
- gefa “öruggt/óhætt” sem absolute safety guarantee
- hunsa deterministic `rautt`
- ráðleggja akstur í hættu ef deterministic tool varar við

### Texti þarf að forðast absolute safety wording

Fyrir spurningar eins og “er mér óhætt” þarf svar að vera eitthvað í þessa átt:

- “Veðurlega lítur þetta út fyrir að vera ...”
- “Ég myndi fara varlega / fylgjast með vindi og hviðum...”
- “Þetta kemur ekki í staðinn fyrir vegaaðstæður, hálku, færð eða eigin mat.”

Ekki:

- “Já, þér er óhætt”
- “Þetta er öruggt”

## Suggested Phase 2A scope

### 1. Fix place extraction first

Before deeper questions:

- `mosó`, `Mósó`, `moso` all resolve to Mosfellsbær.
- Avoid duplicate pattern logic if possible.
- Prefer a helper that normalizes question text and alias keys consistently.

### 2. Add structured intent layer

Add a small internal type, e.g.

```ts
type WeatherIntent =
  | { kind: 'grill'; place: string; timeWindow: TimeWindow }
  | {
      kind: 'route_travel'
      activity: 'caravan' | 'cycling' | 'walking' | 'driving'
      origin: string
      destination: string
      timeWindow: TimeWindow
    }
  | { kind: 'unsupported' }
```

For now, support only one new intent:

- `route_travel` for caravan/towing style questions

Cycling can be next, because it has different thresholds and comfort rules.

### 3. Add Apavatn and route approximation

For immediate MVP, do not add a routing provider yet.

Add local place aliases:

- Apavatn
- maybe Laugarvatn if route midpoint is useful

For route approximation:

- fetch forecasts for origin and destination
- optionally add one manually defined midpoint for known routes
- aggregate worst condition across points

This is not perfect routing, but it is transparent and free. For later, route geometry/provider can replace this.

### 4. Deterministic tool: `checkRouteTravelWeather`

Create a deterministic tool for caravan/towing:

Inputs:

- origin
- destination
- sampled places
- time window
- hourly forecasts per sampled place

Outputs:

- `stada`: `graent | gult | rautt`
- reasonCode
- facts grouped by location
- suggestedAction
- caveat text

Suggested first thresholds for caravan/towing:

- red if wind speed > 10 m/s or gusts > 15 m/s
- yellow if wind speed > 7 m/s or gusts > 11 m/s
- yellow/red if precipitation is meaningful
- yellow if temperature near freezing

Claude should check thresholds against existing `WEATHER_THRESHOLDS` style and keep them conservative. If uncertain, choose caution (`gult`) rather than green.

### 5. AI parser and AI answer

Two possible approaches:

#### Preferred for bulletproof: deterministic-first parser, AI fallback

- Regex/rule parser handles obvious cases:
  - “frá X að Y”
  - “í dag”
  - “á morgun”
  - “hjólhýsi”, “kerru”, “keyra”
- If parser cannot classify, return unsupported.
- Later AI parser can fill gaps.

#### Faster but riskier: AI parser behind flag

Use Anthropic SDK to extract structured JSON from question, but validate against local known places/intents before any tool runs.

If using AI parser:

- add env flag, e.g. `WEATHER_AI_PARSE_ENABLED`
- default off
- if AI parser fails validation, return unsupported
- never let AI invent a place outside resolver

My recommendation: start with deterministic parser for `route_travel` because the pattern is simple and safer.

## Specific response for Stebbi's example

Target behavior for:

`Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`

Expected:

- Recognize activity: `caravan`
- Recognize origin: Reykjavík
- Recognize destination: Apavatn
- Time: today / next daylight-ish window, maybe now -> 22:00
- Fetch forecasts for Reykjavík + Apavatn, optionally midpoint.
- Return:
  - green/yellow/red
  - wind/gust/precip/temp facts
  - cautious wording
  - caveat: “Athugaðu líka færð/vegagerð og aðstæður á leiðinni.”

If Apavatn is not supported yet:

- error should say “Ég styð ekki Apavatn enn” or similar, not generic unknown place if the feature is meant to support it soon.

## What Claude Code should implement next

### Phase 2A minimal execution

1. Fix `mosó` place extraction and add tests.
2. Add Apavatn to local places/aliases with tests.
3. Add parser for:
   - `frá {origin} að {destination}`
   - `í dag`, `á morgun`, `í kvöld`
   - `hjólhýsi`, `kerru`, `vagn`, `keyra`
4. Add `checkRouteTravelWeather` deterministic tool.
5. Update `/api/teskeid/weather/ask` to dispatch:
   - grill -> existing tool
   - route_travel -> new tool
   - unsupported -> existing friendly error
6. Reuse current UI if possible. No new big UI yet.
7. Add messages for new caveats/error text.
8. Add tests:
   - parser
   - Apavatn resolving
   - route travel green/yellow/red
   - API unsupported still works
   - `mosó` regression

### Do not do yet

- No routing API/provider yet.
- No paid geocoding yet.
- No production env changes.
- No Vercel rollout.
- No broad “ask anything” AI mode.

## Localhost checks for Stebbi

After Claude implements Phase 2A:

1. Basic regression:
   - `Er grillveður í mosó í kvöld?`
   - expected: Mosfellsbær weather answer, not unknown-place.
2. Existing happy path:
   - `Er grillveður í Reykjavík í kvöld?`
   - expected: same style as now.
3. Route travel:
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`
   - expected: route/caravan answer with cautious wording, not unsupported-intent.
4. Unsupported:
   - `Ætti ég að kaupa ís?`
   - expected: unsupported message, no crash.
5. Unknown route place:
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Atlantis í dag?`
   - expected: useful unknown-place error.
6. Feature gate:
   - allowlisted user can access.
   - non-allowlisted user cannot access.
7. AI:
   - If `WEATHER_AI_ENABLED=true`, answer can be nicer but must not contradict deterministic status.
   - If AI is off/fails, deterministic result still displays.

Do not test production Supabase, production Vercel env, deployment, or billing-sensitive AI broad rollout without explicit permission.

## Codex recommendation

Yes, start now, but with a narrow Phase 2A:

**route_travel/caravan + Apavatn + normalized place extraction**, not “all deeper weather questions”.

That gives Stebbi a genuinely useful next example while preserving the architecture: structured parser, deterministic tool, AI wording behind guardrails.
