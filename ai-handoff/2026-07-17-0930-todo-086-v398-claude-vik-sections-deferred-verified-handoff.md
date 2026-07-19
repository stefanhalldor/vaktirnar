# 2026-07-17 10:00 — TODO-086 v398 — Vík section deferred: verified:false, revisit after weather map phases

Created: 2026-07-17
Timezone: Atlantic/Reykjavik

## Hvað var gert í þessari lotu

### 1. Tvær nýjar Vík/Mýrdalur hlutir (ring-road-vik-west + ring-road-vik-east)

Gamla `ring-road-vik-skeidflotur` hlutinn var rangt staðsettur (ankrar byrjuðu austan við Vík,
vantaði Vatnsskarðshólar og Reynisfjall). Honum var skipt út fyrir tvo hluta:

**`ring-road-vik-west`** — Vatnsskarðshólar + Reynisfjall
- West gate: (63.438, -19.450, 10000m) — nálægt Skógar/Sólheimajökli
- East gate: (63.420, -18.870, 10000m) — austan við Vík, nógu nær til að fanga Vík sem upphafsstad
- Ankrar: 6 punktar frá Skógar-svæðinu í gegnum Vatnsskarðshólar (63.424, -19.183) og Reynisfjall (63.448, -19.040) að Vík-nálægð

**`ring-road-vik-east`** — Mýrdalssandur
- West gate: (63.420, -19.080, 8000m) — vestur við Reynisfjall
- East gate: (63.470, -18.380, 10000m) — austur við Mýrdalssandur/Álftaver
- Ankrar: 6 punktar í gegnum Mýrdalssandur (63.463, -18.608)

Báðar: `verified: false` — sjá neðan.

### 2. Endurskipulagning á augmentProviderMatchingPoints

Upphafsleg útfærsla notaði raðbundnar inject-ár. Þegar tvær hlutir voru báðar með
[startIdx=0, endIdx=1] á 2-hnúta sparsa chord, clobbaði önnur hlutinn ankra þeirrar fyrri.

Leiðrétting: plan-on-original + merge-overlapping-windows + apply-right-to-left:
- Allar inject-áætlanir eru reiknaðar gegn UPPHAFLEGU fylkinu
- Skarast gluggar eru sameinaðir (combined anchors í ferðaröð)
- Beitt hægramegin-til-vinstri þannig að fyrri hlutir verða ekki fyrir áhrifum

### 3. Prófanir

7 prófanir bætt við `lib/__tests__/routeControlPoints.test.ts`:
- Sparsa chord missir allar þrjár stöðvar án aukninga
- vik-west chord finnur Vatnsskarðshólar + Reynisfjall innan 1 km
- vik-east chord finnur Mýrdalssandur innan 1 km
- Long chord (Reykjavík ↔ Egilsstaðir) finnur allar þrjár
- Reverse direction: allar þrjár
- Vík → Hella (styttri leiðin, vestur): Vatnsskarðshólar + Reynisfjall en EKKI Mýrdalssandur
- Ótengd leið (Selfoss-svæði): engar Vík-stöðvar

Öll 3 tests í production guard describe (vi.stubEnv) eru einnig til.

Allar prófanir: pass.

## Opið mál: Reynisfjall á localhost

**Einkenni:**
- Localhost (dev, verified:false hlutir virkir): Reynisfjall kemur **ekki** inn
- Raun (production, verified:false → sleppt): Reynisfjall kemur **inn**

**Rannsókn:**
- Reynisfjall stöð: (63.4521, -19.0378)
- Reynisfjall ankri: (63.448, -19.040) — ~469m frá stöðinni
- 469m < 1000m (DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M) — stæðist að passa
- Prófanir sem nota VIK_WEST_CHORD passa og finna Reynisfjall rétt
- matchProviderPointsToRoute notar segment projection (projectToPolyline) — rétt útfærsla

**Mögulegar skýringar (óstaðfest):**
1. Next.js hot-reload tímasetning: þegar Stebbi prófaði localhost hafði þróunarþjónninn ekki endurhlaðið nýja kóðann — gamli `ring-road-vik-skeidflotur` hluturinn var enn virkur (eystri, rangir ankrar) sem fjarlægði nákvæman Google vertex nálægt Reynisfjall og setti rangar ankrar í staðinn
2. Tímabundin Veðurstofan gögn: provider-stations endpoint birtir aðeins stöðvar þar sem `stationResult.status !== 'unavailable'` — ef Reynisfjall gögn voru tímabundið ekki tiltæk við localhost prófun
3. Raunveruleg geometry-villa á raunverulegri Google polyline sem prófanirnar ná ekki yfir

**Ástæða þess að við sendum þetta út án þess að leysa þetta:**
`verified: false` þýðir að **raun verður aldrei fyrir áhrifum** af þessum hlutum.
Eina leiðin til að breyta raun-hegðun er að setja `verified: true` — það skref er ekki tekið.

## Þegar við heimsækjum þetta aftur

### Þegar við erum tilbúin til að klára Vík/Mýrdalur

1. **Localhost staðfesting** — nota route-selection skref í `/vedrid` með Veðurstofan lag virkt:
   - `Reykjavík → Egilsstaðir`: ætti að sjá Vatnsskarðshólar, Reynisfjall, Mýrdalssandur
   - `Höfn → Þorlákshöfn`: sama þrír stöðvar
   - `Vík → Hella`: Vatnsskarðshólar + Reynisfjall (en EKKI Mýrdalssandur)
   - `Egilsstaðir → Reykjavík`: öfug röð, sömu stöðvar
   - `Selfoss → Þorlákshöfn`: engar Vík/Mýrdalur stöðvar (false positive check)

2. **Ef Reynisfjall vantar enn á localhost:**
   - Skoða hvort hlutinn kveikir yfirleitt (log `allGatesMatched` og injection window)
   - Bera saman `providerMatchingPoints` frá Google polyline við augmented result
   - Ef anchor er rétt en stöðin vantarfinna enn: athuga hvort Veðurstofan data er tiltæk

3. **Ef allt lítur rétt út á localhost:**
   - Setja `verified: true` á báðum hlutum í `lib/weather/routeControlPoints.ts`
   - Commit + push

### Skrár sem þarf að breyta

`lib/weather/routeControlPoints.ts` línur 94 og 135:
```ts
verified: false,  // → verified: true  (eftir localhost staðfestingu)
```

### Guardrails

- Ekki laga þetta með því að hækka 1km þröskuld í providerRouteMatching.ts
- Ekki special-case station IDs í UI
- Ekki skipta út shared matching path

## Niðurstöður þessarar lotunar

```
npm run type-check  → pass (ekki keyrt í þessari lotu, en kóðinn er sama gerð og v395)
npm run test:run -- lib/__tests__/routeControlPoints.test.ts  → pass
```

## Skrár sem breyttust

- `lib/weather/routeControlPoints.ts` — tvær hlutir, endurskipulagning augmentProviderMatchingPoints
- `lib/__tests__/routeControlPoints.test.ts` — Vík regression tests, production guard tests

## Committed + pushed sem hluti af v398
