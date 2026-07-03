# TODO #67 Vedrid - Phase 2A route sampling decisions

**Dagsetning:** 2026-07-03 08:18  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Stebbi svaraði `2026-07-03-0814-todo-067-v016-claude-phase2a-decisions.md`.

## Stebbi decisions

### Decision 1 - sequencing

Stebbi velur **B**:

> Klára Phase 2A í kóða samhliða Phase 1 localhost prófunum, gefa út bæði saman.

Codex note: þetta er samþykkt sem þróunarröð, ekki production rollout leyfi. Phase 1 og Phase 2A þurfa áfram localhost/dev smoke-test og rýni áður en production/Vercel/Supabase rollout er samþykkt.

### Decision 2 - route weather

Stebbi hafnar destination-only og origin+destination-only nálguninni.

Stebbi decision:

> Við vorum búin að ræða að mappa upp leiðina milli áfangastaðanna og skoða alla punktana sem eru í boði og raunverulega gefa mat á þessu. Það hjálpar mér ekkert í Kömbunum að veðrið á Apavatni sé gott.

Þetta þýðir:

- Ekki nota Option A úr Claude v016.
- Ekki nota bara destination forecast.
- Ekki nota bara origin + destination.
- Ekki láta svar hljóma eins og leiðin hafi verið metin ef aðeins endapunktar voru skoðaðir.

Ný ákvörðun er **D - actual route sampling**:

1. Finna route geometry milli origin og destination.
2. Sample-a punkta eftir leiðinni.
3. Sækja met.no forecast fyrir sampled route points.
4. Meta worst-case yfir alla sampled punkta.
5. Svara með skýringu um hvaða leið/punktar voru metnir.

Ef route geometry er ekki tiltæk í Phase 2A, þá á feature að skila unsupported / not-yet-supported fyrir route-travel, ekki gefa destination-only svar.

## Important product principle

Route question is not "weather at destination".

For question like:

`Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`

The answer must care about route-relevant sections such as:

- Hellisheiði / Kambar type areas when relevant to the route
- exposed windy sections
- higher elevation / pass areas if route includes them
- worst gusts/precip/temp along sampled points

Even if Apavatn looks fine, route may still be yellow/red.

## Implementation implications for Claude Code

### 1. Need route provider or deterministic route table

Claude should not fake route mapping.

Acceptable Phase 2A options:

#### Option D1 - deterministic curated route table

For a very small MVP, define known route samples manually for the supported origin/destination pairs.

Example:

- Reykjavík -> Apavatn:
  - Reykjavík
  - Mosfellsheiði/Kambar-relevant sampled point if route choice requires it
  - Laugarvatn / Þingvellir-area point if route uses that way
  - Apavatn

Pros:

- no new external routing API
- predictable, cache-friendly
- quick to test

Cons:

- only works for explicitly supported route pairs
- needs honest unsupported response for unknown pairs

#### Option D2 - routing provider plus route sampling

Use a routing provider to get geometry, then sample every N km or every M route vertices, round coords for cache, and query met.no for each unique rounded point.

Pros:

- more general
- matches Stebbi's product expectation better

Cons:

- new provider choice, terms, errors, caching, cost/rate-limit questions
- larger implementation

Codex recommendation for now:

Start with **D1 curated route table** if Phase 2A must stay small. If Stebbi wants arbitrary routes, Claude should stop and propose provider choices before implementation.

### 2. Route response must disclose scope

If using curated samples:

Say something like:

- "Ég skoðaði veður á nokkrum punktum á leiðinni: Reykjavík, [punktur], Apavatn."

Do not say:

- "Öll leiðin er örugg."
- "Þér er óhætt."

### 3. Worst-case aggregation

For `towable_trailer`:

- calculate status per sampled point
- final route status = worst status
- facts should mention worst point and value

Example facts:

- `Mesti vindur á leiðinni: 9.2 m/s við [punkt]`
- `Mestu hviður: 14.8 m/s við [punkt]`
- `Úrkoma: mest 0.4 mm/klst við [punkt]`

### 4. Threshold decision is still open

Stebbi has not explicitly answered Decision 3 from Claude v016.

Codex recommendation remains:

- Use conservative thresholds for towable trailers.
- If Claude thinks 7/10/15 m/s is too conservative for Iceland, propose a specific middle ground.
- Do not silently use generic `thresholds.ts` if those thresholds were designed for some other weather domain.

The important part: if uncertain, prefer `gult` over `graent`.

### 5. Places decision

Stebbi's route example requires at least:

- Reykjavík
- Apavatn
- route sample point(s) between them

If using curated routes, places list can be route-specific rather than globally broad.

Do not add a large random places list. Add only what the route sampling needs and tests cover.

## Revised Phase 2A execution scope

Claude Code should implement only if it can do all of this safely:

1. Keep existing grill flow working.
2. Keep `mosó` fix working.
3. Add `towable_trailer` classifier from v015.
4. Add route parser for `frá X að Y`.
5. Add Apavatn support.
6. Add route sample model:
   - either curated route table for supported pairs
   - or explicit provider plan before implementation
7. Add `checkTowableTrailerRouteWeather` deterministic tool.
8. Fetch forecasts for sampled route points, not just destination.
9. Aggregate worst-case.
10. Use cautious wording, no absolute safety claims.
11. Add tests for route sample behavior.

If step 6 is not feasible now, stop and return plan. Do not implement destination-only shortcut.

## Tests Claude should add

### Route parser

- `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`
  - parses route_travel
  - origin Reykjavík
  - destination Apavatn
  - trailer kind caravan

### Route samples

- Reykjavík -> Apavatn returns more than 2 sampled points if curated route supports it.
- Unknown route pair returns unsupported, not destination-only fallback.
- Sampled points are de-duped/rounded for met.no cache.

### Weather tool

- red if any route sample is red.
- yellow if any route sample is yellow and none red.
- green only when all sampled points are green.
- facts identify worst point.
- hestakerra includes animal welfare caveat.

### Regression

- `Er grillveður í mosó í kvöld?` still works.
- `Er grillveður í Reykjavík í kvöld?` still works.
- unsupported non-weather question still returns friendly unsupported.

## Localhost checks for Stebbi

After Claude implements/revises Phase 2A:

1. Route trailer question:
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`
   - expected: route-travel answer, not unsupported.
   - answer must mention route/sample basis, not only Apavatn.

2. Worst route point:
   - answer/facts should show the worst wind/gust/precip point along the sampled route.

3. Other trailer words:
   - `Má ég keyra með tjaldvagn frá Reykjavík að Apavatni á morgun?`
   - `Er í lagi að fara með hestakerru frá Reykjavík að Apavatni?`
   - expected: towable trailer logic; hestakerra caveat.

4. Unknown route:
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Atlantis í dag?`
   - expected: useful unsupported/unknown-place error.

5. Regression:
   - `Er grillveður í mosó í kvöld?`
   - `Er grillveður í Reykjavík í kvöld?`
   - expected: existing grill flow unchanged.

Do not test production Supabase, production Vercel env, deployments, routing-provider billing, or production `feature_access` without explicit permission.

## Message to Claude Code

Use this v017 as the updated decision handoff. It supersedes the route-location recommendation in Claude v016 and sharpens Codex v015:

- sequencing: Stebbi chooses B
- route weather: must evaluate the route, not just destination/endpoints
- implementation must use curated route samples or stop for provider decision
- no destination-only shortcut
