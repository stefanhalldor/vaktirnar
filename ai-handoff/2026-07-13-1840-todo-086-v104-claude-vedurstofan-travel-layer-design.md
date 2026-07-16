# TODO 086 v104 - Claude: hönnunarhandoff fyrir Veðurstofan travel layer

Created: 2026-07-13 18:40
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input:
- `2026-07-13-1833-todo-086-v103-codex-additive-vedurstofan-layer-decision.md`
- Stebbi clarification í chat

---

## Staða óframkvæmdrar v101

`app/api/teskeid/weather/travel/route.ts` og `lib/__tests__/weather-travel-api.test.ts` eru breytt en **ócommituð**. Þessar breytingar eru fail-open product-table read (rétt foundation), en þær eru ekki gataðar af `elta-vedrid` flag. Það þarf að leysa áður en commit.

---

## Staðfest frá Stebbi

1. **Blending regla: hækkun einungis.** `max(MET/Yr, Veðurstofan)` per gildi per punkt. Veðurstofan getur bara hækkað viðvörn/mat, aldrei lækkað það.
2. **Framtíð:** leyfa notanda að taka Yr út líka -- en **ekki í þessum fasa**.
3. **Framing:** Veðurstofan er auka öryggislag í prófunum.
4. **Toggle:** þegar notandi tekur Veðurstofan út, þarf "on-the-fly" endurreikning.

---

## Opnar arkítektúrspurningar til Codex og Stebbi

### A. Feature flag scope

Spurning: á Veðurstofan travel layer (toggle + augmented mat) að vera:

**A1. Aðeins `elta-vedrid` notendur** (núverandi validation flag)
- Öruggt, þröng útgáfa meðan validation stendur
- Þýðir að `baselineResult` kemur til allra, `augmentedResult`/toggle er falin í UI nema `elta-vedrid`

**A2. Allir `vedrid` notendur** (aðalveðurflag)
- Breiðari prófun á raunverulegum notendum
- Hærri áhætta ef Veðurstofan gögn eru stale eða gölluð

**A3. Sérstakur server flag** (`VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true`, default false)
- Vercel env stýrir útgáfu óháð per-user flags
- Auðvelt að kveikja/slökkva á hraðlega á production

**Codex mæling (v103):** A1 eða A3 (helst báðar).
**Claude tillaga:** A1 + A3 -- per-user `elta-vedrid` OG server flag, default false.

---

### B. Toggle/endurreiknunarmeðferð

Spurning: hvernig fær notandi "stöðu án Veðurstofan" þegar hann slökkvar á layerinu?

**B1. Tvöfalt mat í einu API-svari**
- Server keyrir `checkTravelWeather` tvisvar: einu sinni á MET/Yr, einu sinni á max-blended data
- Skilar bæði `baselineResult` og `augmentedResult`
- Client skiptir á milli án extra API-kalls -- augnabliksleg toggle
- Ókostur: tvöfaldur reikning á hverjum request (en `checkTravelWeather` er létt, ~ms)
- Ókostur: stærra API response

**B2. Nýtt API-kall við toggle**
- Server skilar aðeins einu mati (með eða án Veðurstofan eftir query param)
- Client sendir nýtt request `?vedurstofan=false` þegar notandi slökkvar
- Kosti: einfaldara API response
- Ókostur: notandi bíður við toggle (þó líklega <500ms)

**B3. Client-side endurreikning**
- Server skilar MET/Yr HourPoints OG Veðurstofan gildum sérstaklega
- Client reiknar max-blending og mat sjálfur
- Ókostur: `checkTravelWeather` er flókin rökfræði sem við viljum halda á server
- Mælt ekki með

**Claude tillaga:** B1 (tvöfalt mat) -- augnabliksleg toggle, engin extra latency, og `checkTravelWeather` er létt reikning. Sé Codex ósammála, þá B2.

---

### C. Max-blending nákvæmni

Spurning: hvernig berum við saman MET/Yr (klukkustundarleg gögn) við Veðurstofan (3h gögn)?

Veðurstofan `forecast_time` er á 3h fresti (06:00, 09:00, 12:00...). MET/Yr er á 1h fresti.

Valkostur C1: **Nearest forecast_time** -- fyrir hverja MET/Yr klukkustund, finndu næstu Veðurstofan forecast_time (max ±1.5h offset) og taktu max.

Valkostur C2: **Linear interpolation** -- interpolera Veðurstofan gildi milli 3h punkta.

Valkostur C3: **Tímabilsmax** -- fyrir hvert 3h Veðurstofan tímabil, nota max-gildið á allar MET/Yr klukkustundir innan tímabilsins.

**Claude tillaga:** C1 (nearest, ±1.5h) -- einföld, eðlileg, og Veðurstofan gögn eru nákvæm nóg á 3h upplausn. C3 er conservative option ef við viljum vera varfærnari.

---

### D. Hvaða gildi blendast?

Spurning: hvaða Veðurstofan fields nota við í max-blending?

- `wind_speed_ms` → já, þetta er aðal safety signal
- `precipitation_mm_per_hour` → já, önnur þröskuldsbreytu
- `temperature_c` → ólíklegt að tempratúra hækki viðvörun (en Veðurstofan tempratúra er mælt, MET/Yr er spá)
- `wind_direction_text` → nei, þetta er ekki tölulegt mat

**Claude tillaga:** blend aðeins `wind_speed_ms` og `precipitation_mm_per_hour`. `temperature_c` er til sýnis en ekki í matið (of mismunandi context). Hægt að bæta við síðar.

---

## Hvað er þegar til staðar (ócommitað, v101)

```
M  app/api/teskeid/weather/travel/route.ts
   - Importar readVedurstofanProductForStations
   - Les product table í Promise.all með MET/Yr
   - Veðurstofan enrichment (stationId, forecastRows) á route points
   - withTimeout fjarlægt (ekki þörf fyrir DB read)

M  lib/__tests__/weather-travel-api.test.ts
   - Mock uppfærður á readVedurstofanProductForStations
   - 2 tests endurskrifaðar (reject→empty map, timeout→empty stationIds)
```

Þetta er **góður grunnur** fyrir B1 eða B2 -- product table read er þegar í Promise.all.

---

## Tillaga að framkvæmdaröð (eftir ákvörðun)

1. **Ákveða A, B, C, D** (þessi skrá)
2. **Útfæra max-blending hjálparfall** í `lib/weather/providers/vedurstofan.server.ts` eða nýrri hjálparskrá
3. **Uppfæra `app/api/teskeid/weather/travel/route.ts`** með guard (A) og blending/dual-result (B)
4. **Uppfæra `checkTravelWeather` eða kalla það tvisvar** eftir B-val
5. **UI: toggle control** á bak við guard, disclaimer tekst
6. **Tests** fyrir blending, fallback, guard
7. **Commit + push** eftir Stebbi samþykki

---

## Það sem Codex er beðinn um

Í næstu review:

1. Staðfestu eða breyttu tillögu að A, B, C, D að ofan.
2. Segðu hvort v101 óframkvæmd breyting (product table read í travel route) sé réttur grunnur eða hvort hún eigi að byrja öðruvísi.
3. Ef B1 (tvöfalt mat) er samþykkt: gefðu skoðun á hvort `checkTravelWeather` sé nægilega létt til að keyra tvisvar á hverjum request.
4. Beinlínis: er þetta tilbúið til útgáfu á allir `vedrid` notendur eftir validation, eða á það að vera permanent `elta-vedrid` feature?
