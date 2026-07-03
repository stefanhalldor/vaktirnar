# TODO #67 Vedrid — Phase 2A ákvörðunarhandoff
**Dagsetning:** 2026-07-03 08:14
**Frá:** Claude (Sonnet 4.6)
**Til:** Stebbi

---

## Staða Phase 1 (grill)

Tilbúið til localhost/dev prófunar. Allt kóðavinna lokið, type-check og tests græn.

**Eftir stendur (þarf Stebba):**
- Localhost smoke-test þegar dev migrations eru keyrðar
- AI smoke-test með `WEATHER_AI_ENABLED=true` og `ANTHROPIC_API_KEY`
- Production rollout þegar localhost er staðfest

---

## Phase 2A plan (Codex v015) — þrjár opnar ákvarðanir

Codex leggur til `route_travel` intent með `towable_trailer` activity. Áður en framkvæmd getur byrjað þarf þig að svara þessu:

### Ákvörðun 1: Röðun — Phase 1 fyrst eða saman?

**Valkostur A:** Gefa út Phase 1 (grill) á production fyrst. Byrja Phase 2A þegar grill er staðfest í raun.

**Valkostur B:** Klára Phase 2A í kóða samhliða Phase 1 localhost prófunum, gefa út bæði saman.

Mæling: **A er öruggara.** Phase 2A er töluvert meiri umfang og Phase 1 er þegar tilbúið.

---

### Ákvörðun 2: Tvær staðsetningar — hvernig?

Route_travel þarf origin + destination (t.d. `frá Reykjavík að Apavatni`). Núverandi kóði finnur aðeins **eina** staðsetningu.

Þrír möguleikar:

**A — Bara áfangastaður (einfaldast):**
Sækja veður fyrir áfangastað. Label-a skýrt sem "veður á áfangastað". Gert er ráð fyrir að þú veist hvernig er á leiðinni.

**B — Báðir staðir:**
Sækja veður fyrir bæði uppruna og áfangastað. Sýna samanburð eða worst-case. Flóknara, en nákvæmara.

**C — Búa til "leið" sem eina staðsetningu:**
Nota midpoint eða nota bara destination. Ekki sýna two-point samanburð í Phase 2A.

Mæling: **A er rétt fyrir MVP.** Einfalt, heiðarlegt við notanda, hægt að bæta síðar.

---

### Ákvörðun 3: Þröskuldar

Tvær mismunandi tölusetningar eru til:

| Þröskuldar | `thresholds.ts` (núverandi) | Codex v015 |
|---|---|---|
| Caution/gult vindur | 13 m/s | 7 m/s |
| Red/rautt vindur | 18 m/s | 10 m/s |
| Red/rautt vindhviður | 25 m/s | 15 m/s |

Codex-tölurnar eru **mun varfærnari** — þær gæfu gult við 7 m/s sem er nánast alltaf á Íslandi. `thresholds.ts` tölurnar eru hófsamari og hentugri ef við viljum gefa nothæf svör.

Mæling: nota `thresholds.ts` tölurnar, en kynna þær fyrir Stebba til samþykktar.

---

### Ákvörðun 4: Apavatn og staðsetningalisti

Apavatn er notað sem dæmi í v015 en er ekki í `places.ts`. Ef við bætum við trailer intent þurfum við meira en borganna — ferðastaði, lón, hálendislegar leiðir.

Spurning: hvað vilt þú sem Phase 2A staðsetningalisti? Eða er Apavatn aðeins dæmi og við höldum okkur við borgirnar 10 sem eru þegar þar?

---

## Tæknileg yfirlit Phase 2A (ef farið er í framkvæmd)

Ný skrá: `lib/weather/question.ts` þarf:
- `detectIntent` → `'grill' | 'route_travel' | 'unknown'`
- `detectTrailerKind` → `'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer' | 'generic_trailer'`
- `extractOrigin` + `extractDestination` (ef tvær staðsetningar)

Ný skrá: `lib/weather/tools.ts` þarf:
- `checkTrailerWeather(input)` → `DeterministicResult`
- Caveat fyrir `horse_trailer`

Breytingar á `app/api/teskeid/weather/ask/route.ts`:
- Þekkir `route_travel` intent
- Kallar `checkTrailerWeather` í stað `checkGrillWeather`

`messages/is.json` og `messages/en.json`:
- Nýir lyklar fyrir trailer svör, trailer caveat, hestakerra caveat

Nýir tests (~25–35 tests):
- Keyword classifier
- Deterministic tool (gult/rautt/graent, hestakerra caveat)
- Regression: grill virkar enn, mosó virkar enn

---

## Hvað þarf frá þér

1. **Röðun:** Phase 1 fyrst, eða Phase 2A samhliða?
2. **Staðsetningar:** Báðar eða bara áfangastaður?
3. **Þröskuldar:** `thresholds.ts` tölurnar (13/18/25 m/s) eða Codex-tölurnar (7/10/15 m/s)?
4. **Places:** Apavatn og hverjir fleiri, eða halda sig við núverandi 10?

Þegar þú hefur svarað og gefur "farðu í framkvæmd" tek ég við.
