# TODO #67 Vedrid - Phase 2A plan handoff
**Dagsetning:** 2026-07-03 08:30
**Fra:** Claude (Sonnet 4.6)
**Til:** Stebbi

---

## Staða

Phase 1 (grill) er tilbúið. Codex v017 staðfestir tvær ákvarðanir frá Stebbi:

- **Röðun:** B — Phase 2A samhliða Phase 1 localhost prófunum
- **Route weather:** D — raunveruleg leið metin, ekki bara endapunktar

Tveir hlutir eru enn opnir og þurfa staðfestingu áður en framkvæmd hefst.

---

## Opinn hluti 1 — Þröskuldar

Codex v017 leggur til varfærnar tölur (7/10/15 m/s). `thresholds.ts` (13/18/25 m/s) var hannað fyrir grill, ekki eftirvagnakstur.

Ég legg til **milligildi** sem hentar íslenskum aðstæðum og er samt varfærinn:

| Ástand | Vindur | Hviður |
|--------|--------|--------|
| Gult (varúð) | > 10 m/s | > 13 m/s |
| Rautt (ekki mælt með) | > 15 m/s | > 20 m/s |

Rökstuðningur:

- 10 m/s vindur er töluverður (friskur/hvass) og raunveruleg varúð með eftirvagn
- 15 m/s (stormur) er skýrt rautt — hér er hætta á eftirvagni
- Gult við 7 m/s gæfi varúð nánast alltaf á Íslandi og mundi gera tólið gagnslegt
- 13/18/25 m/s (grill) er of slakur fyrir eftirvagn

Ef þú vilt nota Codex-tölurnar (7/10/15) er það líka í lagi — þær eru varfærnari en þetta.

**Spurning:** Er þetta í lagi, eða vilt þú breyta tölunum?

---

## Opinn hluti 2 — Curated route sample points

Codex v017 mælir með D1 (curated route table) og dæmið frá Stebbi er:

`Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni í dag?`

Þetta er leiðin Reykjavík → Þingvallaleið → Laugarvatn → Apavatn.

Ég legg til eftirfarandi sample points fyrir þessa leið:

| # | Staður | Lat | Lon | Ástæða |
|---|--------|-----|-----|---------|
| 1 | Reykjavík | 64.135 | -21.895 | Uppruni |
| 2 | Mosfellsheiði / Kambar-svæði | 64.175 | -21.530 | Hæsta punktur á þessari leið, útsett svæði |
| 3 | Þingvellir / Almannagjá | 64.255 | -21.128 | Miðsvæði leiðarinnar |
| 4 | Laugarvatn | 64.222 | -20.734 | Lægra land, en langt frá endapunktum |
| 5 | Apavatn | 64.162 | -20.548 | Áfangastaður |

Worst-case yfir alla 5 punkta ákvarðar heildarlitinn. Svar nefnir hvaða punktur var verst.

**Spurningar:**

1. Eru sample punktarnir raunhæfir fyrir þessa leið? (Þú þekkir leiðina betur en ég)
2. Vantar einhverjar aðrar leiðir í Phase 2A, eða er Reykjavík→Apavatn nóg til að byrja?
3. Ef unknown route (t.d. Reykjavík→Atlantis) — á svarið að vera "þessa leið þekki ég ekki" eða "upprunastaður/áfangastaður þekkt, en routing á milli er ekki studd"?

---

## Phase 2A scope — hvað við gerum

Þetta er það sem við implementum þegar leyfi er gefið:

1. `lib/weather/question.ts` — bæta við:
   - `detectTowableTrailer(question)` — TrailerKind classifier
   - `extractRouteOrigin(question)` — "frá X"
   - `extractRouteDestination(question)` — "að Y" / "til Y"
   - Uppfæra `detectIntent` til að skila `'route_travel'` þegar trailer + leið finnast

2. `lib/weather/places.ts` — bæta við Apavatni og route sample points

3. `lib/weather/routes.ts` (ny skra) — curated route table:
   - Supported pairs → listinn af sample coordinates
   - Unknown pair → `{ supported: false }`

4. `lib/weather/tools.ts` — bæta við `checkTowableTrailerRouteWeather`:
   - Sækir forecast fyrir alla sampled points
   - Worst-case aggregation
   - Hestakerra caveat ef trailerKind === 'horse_trailer'
   - Skýr scope disclosure í svar ("Skoðaði X punkta á leiðinni")

5. `app/api/teskeid/weather/ask/route.ts` — þekkir `route_travel` intent

6. `messages/is.json` + `messages/en.json` — nýir lyklar fyrir route/trailer svör

7. Tests (~30 tests):
   - Classifier (trailer keywords)
   - Route parser (origin, destination)
   - Curated route table (known pair, unknown pair)
   - Worst-case aggregation (rautt ef einn punktur rauður)
   - Hestakerra caveat
   - Regression (grill, mosó, unsupported)

---

## Hvað við gerum EKKI í Phase 2A

- Engin routing provider API
- Engin geocoding
- Engin road condition data
- Engin arbitrary routes
- Unknown route pair fær "ekki stutt" svar, ekki destination-only

---

## Hvað þarf frá þér

Svar við tveimur hlutum:

**1. Þröskuldar:** Samþykkt milligildi (10/15 m/s gult/rautt)? Eða eitthvað annað?

**2. Route sample points:** Eru punktarnir að ofan raunhæfir? Eitthvað til viðbótar/breyta?

Þegar þú hefur staðfest þetta og gefur "farðu í framkvæmd" tek ég við Phase 2A.
