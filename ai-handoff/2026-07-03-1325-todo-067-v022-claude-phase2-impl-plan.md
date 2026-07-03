# TODO #67 Vedrid - Phase 2 implementation plan

Created: 2026-07-03 13:25
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi (til að svara) og Codex (til rýni)
Status: Planning handoff. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

---

## Tilgangur

v021 (Codex) bað um implementation plan fyrir Phase 2 (golf + route) áður en kóðavinna byrjar.
Þessi skrá er sá plan. Hún inniheldur opnar spurningar sem Stebbi svarar beint hér.

Rýni úr v021 tilkynnti þrjú atriði sem þarf að leysa áður en framkvæmd getur byrjað:

1. Hvað gerist með Phase 1 (grill)?
2. Er fyrsta checkpoint golf-only eða golf+route saman?
3. Mapbox ToS á geocoding cache

Þessar spurningar eru settar fram hér til að Stebbi svari.

---

## Spurning 1: Phase 1 staða

Phase 1 (grill) kóðinn er tilbúinn en ekki committed, ekki localhost-prófaður, ekki deployed.

Liggja fyrir sem untracked files:
- `lib/weather/` (8 skrár)
- `app/auth-mvp/vedrid/` (page og loading)
- `app/api/teskeid/weather/` (ask route)
- `sql/67_weather_cache.sql`
- `sql/68_feature_access_vedrid.sql`

Þrír möguleikar:

**A) Phase 1 ship fyrst.**
Stebbi prófar grill á localhost, staðfestir, við committum og deployum Phase 1. Phase 2 byrjar þegar Phase 1 er í production.
Kostur: Phase 2 byggir á staðfestu grunni. Auðveldara að greina hvað brotnaði.
Galli: Seinna í Phase 2.

**B) Phase 1 og Phase 2 samhliða í kóða, ship saman.**
Phase 1 er localhost-prófað samhliða Phase 2 kóðavinnu. Eitt ship að lokum.
Kostur: Hraðar í heild.
Galli: Ef Phase 1 þarf lagfæringu eftir localhost-próf getur það brotið Phase 2 verk á meðan.

**C) Phase 1 commit á branch, Phase 2 yfir það.**
Phase 1 committed (en ekki deployed) og Phase 2 byrjar á sama branch. Ship saman þegar báðar eru tilbúnar.
Kostur: Kóðinn er varinn í git án þess að vera í production.
Galli: Flóknari branch-saga.

> **Stebbi svarar hér:**
> [ ] A — Phase 1 ship fyrst
> [ ] B — Samhliða, ship saman
> [ ] C — Phase 1 commit á branch, Phase 2 yfir

---

## Spurning 2: Phase 2 fyrsta checkpoint

v021 segir golf og route saman en sliced. Ég mæli með að við skilgreinum nákvæmlega hvað checkpoint 1 inniheldur.

**Valkostur A — Golf-only fyrst:**
Checkpoint 1 = intent architecture + golf evaluator + tests + UI. Engin Mapbox, engin route.
Checkpoint 2 = Mapbox provider adapter + route evaluator + latest-departure + tests.
Kostur: Checkpoint 1 krefst engra nýrra API-lykla og getur farið í production áður en Mapbox er klárt.
Galli: Tvær minni releases frekar en ein stærri.

**Valkostur B — Golf + Route saman:**
Checkpoint 1 = intent architecture + golf + Mapbox adapter + route weather (basic) + tests.
Checkpoint 2 = latest-departure + route refinements.
Kostur: Eitt ship sem sýnir heildarmyndina.
Galli: Checkpoint 1 er stór og krefst Mapbox lykils til að prófa route-hlutann.

**Mæling:** A er öruggara. Golf er þegar well-defined og Mapbox billing þarf ekki að blokka golf ship.

> **Stebbi svarar hér:**
> [ ] A — Golf fyrst, route í checkpoint 2
> [ ] B — Golf + route saman í checkpoint 1

---

## Spurning 3: Mapbox geocoding cache og ToS

Við munum vilja geyma geocoding niðurstöður (lat/lon fyrir staðarheiti) í Supabase til að lágmarka API-köll og kostnað.

Mapbox [geocoding storage docs](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results) leyfir geymslu á koordináðum til eigin nota þegar við notum Mapbox kort til að birta niðurstöður. Vandinn: Teskeid sýnir engin kort, bara veðursvör.

Mögulegar leiðir:

**A) Geyma geocoded koordinaður í Supabase (og nota þær í met.no köllum).**
Líklega í lagi þar sem við geymum ekki "Mapbox data" heldur staðfærðar GPS koordinaður til eigin nota. En þarf staðfestingu á Mapbox ToS.

**B) Geyma aðeins canonical staðarheiti og coordinates sem við höfum sjálfstætt staðfest (úr `places.ts`).**
Mapbox kallað aðeins til að leysa unknown places sem við geymum þá EKKI. Aðeins `places.ts` entries fara í Supabase cache.
Þetta er öruggasta leiðin ToS-lega.

**C) Staðfesta Mapbox ToS nánar áður en ákvörðun er tekin.**
Þetta er safest approach — ekkert er implementað þar til við vitum.

**Mæling:** B er öruggasta án ToS-rannsóknar. Við getum alltaf bætt við geocoding cache seinna þegar við höfum staðfest.

> **Stebbi svarar hér:**
> [ ] A — Geyma geocoded coordinates í Supabase
> [ ] B — Aðeins places.ts entries í cache, ekki Mapbox geocoded results
> [ ] C — Þarf meiri rannsókn á Mapbox ToS fyrst

---

## Spurning 4: Mapbox API lykill

Phase 2 route weather krefst Mapbox lykils. Tvennt þarf að vera til staðar áður en route-hluti getur verið prófaður:

1. Mapbox account stofnað og secret token búinn til
2. Token settur sem `MAPBOX_SECRET_TOKEN` í `.env.local` og í Vercel env vars

Golf þarf þetta ekki.

> **Stebbi svarar hér:**
> [ ] Ég set þetta upp áður en route checkpoint byrjar
> [ ] Ég hef þegar Mapbox account — set upp token

---

## Spurning 5: WEATHER_AI_ENABLED og Phase 2

Phase 1 (grill) notar AI wording þegar `WEATHER_AI_ENABLED=true`. Á golf og route einnig að styðja AI wording?

**Valkostur A — Já, sömu reglur og grill.**
Golf og route svör eru AI-orðuð þegar flaggið er á. Deterministic er alltaf fallback.

**Valkostur B — Nei, golf og route eru deterministic-only í Phase 2.**
AI wording kemur seinna þegar golf/route patterns eru staðfest.

**Mæling:** A er eðlilegra en tvöfaldar prófunarlegar forsendur í Phase 2. B er einfaldara fyrst.

> **Stebbi svarar hér:**
> [ ] A — Golf og route styðja AI wording (sama pattern og grill)
> [ ] B — Golf og route eru deterministic-only í Phase 2

---

## Navngreint scope — Phase 2A checkpoint 1 (golf-only, ef A er valið)

Ef Stebbi kýs Golf-only fyrst (spurning 2A), þá er þetta scope checkpoint 1:

### Nýtt í question.ts
- `detectIntent` uppfært: `'grill' | 'activity_window_golf' | 'unknown'`
- `extractGolfPlace(question)` — þekkir "Grafarholt", "Grafarholtsvöllur", "Grafarholtið" o.fl.
- `parseGolfTimeWindow(question, nowIso)` — sér "á morgun", "eftirmiðdaginn", "kl. 10" o.fl.

### Nýtt í places.ts
- Golf-sértækt alias: `grafarholtsvollur`, `grafarholtid` → Grafarholt coordinates
- Mögulega aðrir íslenskir golfvellir ef Stebbi vill (Keilir, Korpa, Vesturbær)

### Nýtt í tools.ts
- `checkGolfWindow(input: GolfInput): DeterministicResult`
  - Tekur staðarnafn, HourPoint[], from/to tíma
  - Reynir 4.5h glugga yfir tímamarkið (sliding window)
  - Skilar best slot, second-best og third-best (non-overlapping)
  - Þröskuldar úr `thresholds.ts` (13/17 m/s, precipitation, temperature)
  - Reason codes: `wind_too_strong`, `gusts`, `rain`, `cold`, `all_good`
  - Facts: vindur, hviður, úrkoma, hitastig fyrir best slot

### Uppfært í ask route.ts
- Þekkir `activity_window_golf` intent
- Kallar `checkGolfWindow` og skilar `DeterministicResult`

### Messages
- `messages/is.json` og `messages/en.json`: nýir lyklar fyrir golf svör
- t.d. `weather.golf.bestSlot`, `weather.golf.alternativeSlot`, `weather.golf.noGoodWindow`

### Tests (~25-35 tests)
- Golf intent detection (Grafarholt variants, golf keywords)
- Golf place extraction
- Golf time window detection
- checkGolfWindow: best slot, alternatives, no good window
- Wind thresholds: 10-11 m/s er EKKI sjálfkrafa rautt
- Regression: grill virkar enn, mosó virkar enn
- Edge: öll gluggar eru rauð → skýr "enginn góður gluggi" svar

### Hvað er EKKI í checkpoint 1 (golf-only)
- Engin Mapbox
- Engin route weather
- Engin route sampling
- Engin latest-departure
- Engin geocoding

---

## Navngreint scope — Phase 2A checkpoint 2 (route weather, ef A er valið)

Þetta kemur EFTIR checkpoint 1 er shipped og EFTIR Mapbox lykill er til staðar.

### Nýtt í question.ts
- `detectIntent` uppfært: bætir við `'route_towable_trailer'`
- `detectTrailerKind(question)` → `'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer' | 'generic_trailer'`
- `extractRouteOrigin(question)` — þekkir "frá X"
- `extractRouteDestination(question)` — þekkir "að Y", "til Y"
- `detectLatestDepartureQuestion(question)` → boolean

### Nýtt: lib/weather/mapbox.server.ts
- `geocodePlace(query: string): Promise<{ lat: number; lon: number } | null>`
  - Kallar Mapbox Geocoding API með server-side token
  - Constrains search til Íslands
  - Skilar null á villu eða lága confidence
- `getRouteGeometry(from, to): Promise<RouteGeometry | null>`
  - Kallar Mapbox Directions API
  - Skilar distance-based sampled points (3-5 km spacing)
  - Cap: 80 punktar að hámarki
  - Skilar null á villu

### Nýtt í tools.ts
- `checkTrailerRouteWeather(input): DeterministicResult`
  - Pre-resolves via places.ts, þá geocodes via Mapbox ef vantar
  - Sækir route geometry
  - Samples points (3-5 km)
  - Sækir met.no forecast fyrir hvern punkt (via lazy cache)
  - Early-exit ef einn punktur er rauður
  - Skilar worst-case + rökstuðning
  - Hestakerra caveat ef `horse_trailer`
  - Skýr "provider unavailable" ef Mapbox mistekst
- `findLatestDeparture(input): DeterministicResult` (ef Stebbi vill)
  - Candidate scanning í 30 min steps
  - Notar cumulative travel time per sample
  - Skilar latest safe departure window

### Uppfært í ask route.ts
- Þekkir `route_towable_trailer` intent
- Þekkir `detectLatestDepartureQuestion` flag

### Tests (~40-50 tests)
- Trailer kind detection (tjaldvagn, hjólhýsi, hestakerra, etc.)
- Route origin/destination extraction
- resolvePlace með fallback til Mapbox (mocked)
- getRouteGeometry (mocked Mapbox responses)
- Sampling: known distances, cap behavior
- checkTrailerRouteWeather: graent/gult/rautt, early-exit, provider-unavailable
- Hestakerra caveat
- Latest-departure candidate scanning (mocked)
- Regression: grill og golf virka enn

---

## Route sampling — skýring á 3-5 km spacing

v021 nefndi 5-10 km. Ég mæli með 3-5 km fyrir trailer/hjólhýsi leiðir vegna:

- Mosfellsheiði toppur er u.þ.b. 6 km breiður. Með 5-10 km spacing er mögulegt að missa hann alfarið.
- met.no model resolution á Íslandi er 1-2 km — 3-5 km sampling nýtir þá með eðlilegum hætti.
- 100 km leið → 20-33 punktar við 3-5 km spacing. Vel innan 80 punkta caps.

Spacing verður constant í `thresholds.ts` eða sérstakri `routeConfig` hlut, ekki hardcoded.

---

## Hvað er sameiginlegt með öllum checkpoints

- Engin Mapbox köll frá browser. Alltaf server-side BFF.
- `MAPBOX_SECRET_TOKEN` aldrei í `NEXT_PUBLIC_*`.
- `places.ts` er alltaf fyrsti stoppinn, Mapbox er fallback.
- met.no attribution sýnileg í UI.
- Deterministic tools ákvarða stöðu. AI orðar aðeins þegar `WEATHER_AI_ENABLED=true`.
- Öll user-facing copy í messages files.
- Öll ný kóðavinna með tests.

---

## Hvað Claude Code gerir EKKI án sérstakrar beiðni

- Engar kóðabreytingar fyrr en Stebbi svarar spurningum hér að ofan og gefur framkvæmdarleyfi
- Engar SQL/migration breytingar
- Engar env breytingar
- Ekkert commit eða push
- Engir API lyklar bætt við

---

## Localhost checks for Stebbi

Þetta skjal er planning. Engar localhost prófanir eiga við núna.

Þegar checkpoint 1 (golf) er implementað verður aðskilin handoff með nákvæmum localhost checks. Sama á við checkpoint 2 (route).

---

## Samantekt — hvað þarf frá Stebba

| # | Spurning | Valkostur |
|---|----------|-----------|
| 1 | Phase 1 staða | A (ship fyrst) / B (samhliða) / C (commit, ship saman) |
| 2 | Phase 2 checkpoint 1 | A (golf-only) / B (golf+route saman) |
| 3 | Geocoding cache ToS | A (geyma í Supabase) / B (aðeins places.ts) / C (rannsaka fyrst) |
| 4 | Mapbox lykill | Stebbi setur upp / hefur þegar account |
| 5 | AI wording í Phase 2 | A (já, sama og grill) / B (deterministic-only fyrst) |

Þegar Stebbi hefur svarað þessum fimm spurningum getur Claude Code byrjað á checkpoint 1 ef framkvæmdarleyfi er gefið.
