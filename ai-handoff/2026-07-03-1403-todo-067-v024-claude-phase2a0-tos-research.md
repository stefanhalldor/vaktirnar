# TODO #67 Vedrid - Phase 2A0: Mapbox ToS og met.no resolution research

Created: 2026-07-03 14:03
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Read-only research handoff. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

---

## Tilgangur

v023 (Codex) bað um Phase 2A0: read-only Mapbox ToS og cache/disclaimer rýni, engin kóðavinna. Þetta er sú rýni.

Til viðbótar: met.no model resolution staðfest úr opinberum skjölum, til að styðja sampling spacing ákvörðun úr v022/v023.

Allt sem er sagt hér er byggt á opinberum skjölum sem Claude Code sótti 2026-07-03. Þetta er ekki lögfræðiráðgjöf. Stebbi ber fulla ábyrgð á að fara yfir ToS sjálfur áður en billing eða permanent geocoding er kveikt.

---

## Niðurstaða 1 — Mapbox Geocoding og geymsla

**Staðfest úr: https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results**

### Temporary geocoding (default)

- Sjálfgefið hegðun þegar `permanent` parameter er ekki settur eða er `false`.
- **Temporary results mega EKKI vera geymdar eða cached.**
- Má aðeins nota niðurstöður í tengslum við þá keyrslu sem þær komu úr.

### Permanent geocoding

- Kveikt með `permanent=true` í Geocoding API call.
- Permanent results **mega vera geymdar um óákveðinn tíma**.
- **Krefst annaðhvort:**
  - Gildrar greiðslukorts á Mapbox account, EÐA
  - Virkrar enterprise-samnings við Mapbox

### Hvað þýðir þetta fyrir Teskeid

Þrír valkostir:

**Valkostur A — Nota aðeins `places.ts` coordinates (öruggast, engin Mapbox geocoding cache)**
Mapbox er aldrei kallað til geocodingar í MVP. Öll staðarheiti fara í gegnum `places.ts` alias-kort. Ef staðarheiti er ekki þar → "þekki þennan stað ekki" svar. Engin geymsla Mapbox-niðurstaðna.
Kostur: Engin ToS vandamál. Einfalt. Virkar strax.
Galli: Takmarkaður staðarlisti. Apavatn, t.d., er ekki í `places.ts`.

**Valkostur B — Kalla Mapbox live, geyma EKKI niðurstöður (temporary mode)**
Mapbox geocoding kallað á hverjum request fyrir óþekkt staðarheiti. Niðurstöður notaðar í þeirri keyrslu en geymdar ekki í Supabase.
Kostur: Leysir óþekkt staðarheiti. Engin caching-brot.
Galli: Hærra API-kostnaður og seinka á hverjum request. Sama staður er geocoded aftur og aftur.

**Valkostur C — Permanent geocoding með credit card**
Stebbi setur credit card á Mapbox account, `permanent=true` í öllum geocoding köllum, niðurstöður geymdar í Supabase.
Kostur: Caching leyfileg, lág seinka eftir fyrsta call.
Galli: Krefst billing setup. Þarf að staðfesta að Mapbox leyfir þetta án þess að sýna Mapbox kort (Teskeid sýnir engin kort).

**Mæling:** Byrja með **Valkostur A + handvirkt stækka `places.ts`** — bæta við Apavatni og fleiri ferðamannastaðum beint. Þetta er hraðast, öruggast og nýtir already-built pattern. Mapbox geocoding er Phase 3, ekki Phase 2.

> **Stebbi svarar:**
> [ ] A — places.ts only, stækka handvirkt
> [ ] B — Mapbox live, ekki geyma
> [ ] C — Permanent mode, credit card setup

---

## Niðurstaða 2 — Mapbox Route Geometry og caching

**Staða: Óstaðfest úr opinberum skjölum.**

Mapbox ToS-síða (https://www.mapbox.com/legal/tos) er JavaScript-rendered og Claude Code gat ekki lesið efnið. Directions API reference skjal (https://docs.mapbox.com/api/navigation/directions/) inniheldur ekki explicit caching-reglur.

**Það sem við vitum:**
- Mapbox geocoding ToS gerir skýran greinarmun á temporary/permanent. Route geometry nefnist ekki með sama hætti.
- Í iðnaðarframkvæmd er gjarnan gert ráð fyrir að route geometry megi cache-a í hæfilegan tíma (route milli tveggja punkta breytist sjaldan á nokkrum klukkustundum).
- met.no Expires headers eru leiðbeinandi um hve lengi veðurgögn eru gild — route geometry gæti cached-ast mun lengur (dagar).

**Forsenda (lágt confidence):** Route geometry má cache-a. Þetta þarf staðfestingu.

**Varleg leið án staðfestingar:** Cache-a EKKI route geometry í Supabase í MVP. Kalla Mapbox Directions á hverjum request. Veðurgögn (met.no) eru cached eins og áður — það breytist ekki.

Kostnaðarmat: Mapbox Directions API free tier er 100,000 calls/mánuð. Ef Teskeid fær 100 route weather requests á dag eru það ~3,000 calls/mánuð — vel innan free tier. Caching route geometry er ekki kostnaðarmál í MVP.

**Mæling:** Cache-a EKKI route geometry í Phase 2. Mapbox Directions kallað á hverjum request. Endurskoða ef traffic krefst.

---

## Niðurstaða 3 — Directions API driving disclaimer

**Staða: Codex-fullyrðing óstaðfest beint úr ToS (JavaScript-rendered síða).**

Directions API technical docs bera ekki nefna disclaimer-kröfu. Hins vegar er það **almennt viðurkennd iðnaðarframkvæmd** og skynsamleg vörn óháð Mapbox ToS að veita notendum skýra fyrirvara þegar veðurmat er byggt á leið-geocoding.

**Teskeid-fyrirvari sem á ALLTAF að fylgja route weather svörum:**

Íslenska:
> "Þetta er veðurmat á sýnishorn af leiðinni. Það er ekki vegaástandsskýrsla, öryggisábyrgð, né staðgengill fyrir opinberar viðvaranir frá Vegagerðinni eða Veðurstofu Íslands. Farðu varlega og fylgstu með vegaástandssíðum."

Enska:
> "This is a weather assessment based on sampled route points. It is not a road conditions report, a safety guarantee, or a substitute for official warnings from the Icelandic Road and Coastal Administration or the Icelandic Meteorological Office. Drive carefully and check road condition services."

Þetta á í `messages/is.json` og `messages/en.json` undir t.d. `weather.route.disclaimer`.

**Hvað varðar Mapbox-kröfu sérstaklega:** Ef Mapbox ToS krefst sérstaks texta, þarf Stebbi að lesa ToS-síðuna sjálfur (eða beiðast lögfræðiráðgjafar) og bæta við þeim texta. Claude Code getur ekki staðfest þetta úr skjölum sem eru JavaScript-rendered.

---

## Niðurstaða 4 — met.no model resolution (staðfest)

**Staðfest úr: https://docs.api.met.no/doc/locationforecast/datamodel**

- **Norrænar spár (þar á meðal Ísland):** MetCoOp Ensemble Prediction System (MEPS)
  - Horizontal resolution: **2.5 km**
  - Tímasvið: 0-60 klst
  - Uppfærslutíðni: **Einu sinni á klukkustund**
- **Meðallangt bil (2-10 dagar):** ECMWF gögn
  - Horizontal resolution: **~9 km**
  - Uppfærslutíðni: Tvisvar á dag

### Hvað þýðir þetta fyrir sampling spacing

**2.5 km MEPS resolution þýðir:**
- Sampling á 3-5 km nær einu til tveimur model-grid-punktum á sýni. Þetta er **eðlilegt** og tekur vel á helstu veðurbreytingum á leiðinni.
- Sampling á 5-10 km gefur eitt model-grid-sýni á sýni, sem **gæti misst** þröng fjallaskarð eða toppa milli punkta.
- Dæmi: Mosfellsheiði-toppur er á ~6 km breiðu svæði. Með 5 km spacing er líklegt að við náum einum punkti á hæstu svæðinu. Með 10 km spacing er mögulegt að missa það alfarið.

**Mæling staðfest:** 3-5 km spacing fyrir trailer/hjólhýsi leiðir er rétt. Stillanlegt constant, ekki hardcoded.

**Forsenda sem þarf staðfestingu:** MEPS nær yfir alla Ísland (þar á meðal miðhálendið). Þetta er líklega rétt en ég staðfesti það ekki sérstaklega. Ef notandi spyr um leið um Sprengisand eða Kjölur getur forecast quality minnkað á fjallasvæðum.

---

## Samantekt: Hvað leysist af Phase 2A0

| Atriði | Staða | Aðgerð |
|--------|-------|---------|
| Geocoding cache (temporary) | Staðfest: ÓLEYFILEGT | Nota aðeins places.ts í MVP |
| Geocoding cache (permanent) | Staðfest: leyfið, en krefst CC/enterprise | Stebbi velur: A/B/C |
| Route geometry cache | Óstaðfest (JS-rendered ToS) | Cache EKKI í Phase 2, endurskoða seinna |
| Directions disclaimer (Mapbox) | Óstaðfest beint | Bæta við Teskeid-fyrirvara óháð Mapbox kröfu |
| met.no MEPS resolution | Staðfest: 2.5 km | 3-5 km sampling er rétt fyrir trailer leiðir |
| met.no uppfærslufrequency | Staðfest: 1/klst | Hourly cache rotation er rétt |

---

## Revised execution slices (uppfæring á v022/v023 tillögu)

Þar sem geocoding cache er útilokuð í Phase 2, er scope skýrara:

### Phase 2A1 — Intent architecture + golf + route skeleton

Engin Mapbox geocoding cache. Engar nýjar Supabase töflur (geocoding).

**Inniheldur:**
- `detectIntent` uppfæring: + `activity_window_golf` + `route_towable_trailer`
- `extractGolfPlace`, `extractTrailerKind`, `extractRouteOrigin`, `extractRouteDestination`
- `checkGolfWindow` tool (deterministic, sliding window, best slot + alternatives)
- Route intent: þekkist en skilar `provider_unavailable` ef Mapbox er ekki configured
- Golf-specific `places.ts` aliases (Grafarholtsvöllur o.fl.)
- Bæta Apavatni og fleiri ferðamannastaðum í `places.ts` handvirkt
- Messages: golf og route disclaimer textar
- Tests: golf evaluator, trailer detection, regression (grill)

**Mapbox token þarf EKKI til að prófa golf.** Route intent þarf token til að skila raunverulegu svari, en `provider_unavailable` gegnir í stað þar til token er tilbúinn.

### Phase 2A2 — Mapbox provider adapter + route evaluator

Aðeins eftir að Stebbi hefur sett upp Mapbox token.

**Inniheldur:**
- `lib/weather/mapbox.server.ts`: `geocodePlace` (live, ekki cached) + `getRouteGeometry`
- `checkTrailerRouteWeather` tool: geocoding + routing + met.no sampling + worst-case
- `findLatestDeparture` tool (ef Stebbi vill í þessari phase)
- Tests: mocked Mapbox responses, provider failure paths, sampling edge cases

**Mapbox geocoding:**
- Ef Stebbi velur Valkostur A (places.ts only): `geocodePlace` fallur til `resolvePlace` og kallar aldrei Mapbox
- Ef Stebbi velur Valkostur B (live, ekki cached): `geocodePlace` kallar Mapbox með `permanent=false`, geymir ALDREI í DB
- Ef Stebbi velur Valkostur C (permanent): krefst CC á Mapbox account og sérstakar beiðni um leyfi

### Phase 2A3 — Combined pre-release

Phase 1 + Phase 2A1 + Phase 2A2 saman til localhost prófunar og síðan production.

---

## Opnar spurningar sem þarf svar við áður en Phase 2A1 byrjar

1. **Geocoding valkostur** (spurning 3 úr v022, endurtekin): A, B eða C?
2. **Apavatn og `places.ts`**: Viltu að Claude Code bæti Apavatni og fleiri ferðamannastaðum við `places.ts` handvirkt? Ef svo, hvaða staðir eru í forgrunni? Eða er Apavatn nóg til að byrja?
3. **Latest-departure**: Er `findLatestDeparture` í Phase 2A2 eða seinna?

---

## Localhost checks for Stebbi

Þetta skjal er read-only research. Engar localhost prófanir eiga við.

Samanlögð localhost prófun kemur í Phase 2A3 pre-release handoff og mun ná yfir:
- Grill regression
- Golf (best slot, alternatives, no-good-window)
- Route (provider OK og provider-unavailable)
- Latest-departure (ef implementað)
- Feature flags (WEATHER_ENABLED, WEATHER_AI_ENABLED)
- AI fallback
- Mobile (360, 390, 460 px)
- Privacy/billing: ekki kalla Mapbox í high-volume loops

---

## Óvissa / þarf að staðfesta

- **Mapbox ToS á route geometry caching:** Óstaðfest. Treystir á varleg leið (ikke cache í Phase 2).
- **Mapbox driving disclaimer í ToS:** Óstaðfest beint. Teskeid bætir við eigin fyrirvara óháð.
- **MEPS coverage á miðhálendinu:** Líklega gott en ekki staðfest sérstaklega.
- **Permanent geocoding án Mapbox map display:** Óljóst hvort það sé leyfilegt. Þarf Stebbi að lesa ToS eða hafa samband við Mapbox.
