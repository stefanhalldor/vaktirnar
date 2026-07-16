# Claude handoff: TODO #70 v007 - Hringurinn product analysis + pending work

Created: 2026-07-10 07:45
Timezone: Atlantic/Reykjavik
Tengist: TODO #70, v005/v006

## Núverandi staða

### Ócommittaðar breytingar (v005)

Þessar breytingar eru í working tree, type-check og tests pass, en **ekki committaðar**:

```
lib/weather/google.server.ts
lib/__tests__/weather-google.test.ts
messages/is.json
messages/en.json
components/weather/RouteSelectionStep.tsx
app/auth-mvp/vedrid/FerdalagidClient.tsx  (v044/v046 disclaimer + scrubber)
```

`git diff --stat` (rough):
- v005: `via` → `vias` refactor, East Iceland rule, 6 nýjar prófanir
- v044+v046: disclaimer amber box, scrubber whole-hours (þegar committað í `ae22fcd` og `1391d73`)

**Vandamál**: `a1fe77f` committaði Hellisheiði rule of fljótt án localhost-staðfestingar. v005-breytingarnar eru ofan á þeim commit.

---

## Pending v006 cleanup (per Codex)

Þessar smábreytingar þurfa líka að fara inn, annaðhvort með v005 eða sér:

1. **Fjarlægja Þrengslavegur curated rule** — er orðin duplicate sem er *hægari* en Google sjálfgefið. Ruglandi fyrir notendur.
2. **`routeOptionShortest`**: `"Fljótlegasta leið"` → `"Fljótlegasta leiðin"` (íslenska)
3. **Uppfæra tests**: fjarlægja prófanir sem búast við `CURATED_VIA_THRENGSLAVEGUR` generation, bæta við regression sem staðfestir að hún kemur *ekki* fram

---

## Hringurinn product discussion

### Stebbi's hugmynd

> Búa til nokkra punkta á Þjóðvegi 1 í öllum landshlutum og keyra í gegnum þá. Ef niðurstaðan er áberande lengsta leiðin → kalla hana "Hringurinn". Gera þetta fyrir allar ferðir >350km.

### Claude greining

**Styrkleiki hugmyndarinnar:**

- Miklu einfaldari en flókin geographic bounds per destination
- 350km þröskuldur síar út stuttar ferðir náttúrulega
- Fingerprint duplicate-detection sem við höfum þegar sér um ef Google skilar sömu leið
- Google leyfir allt að 25 intermediates — 3-4 via-punktar eru engin vandkvæði

**Galla / opnar spurningar:**

1. **Einn punktur þvingar ekki hring**: Einn Hellisheiði-punktur gæti látið Google fara til baka norður eftir. Þarf líklega 3 punkta: Hellisheiði + suðurströnd + austursvæði.

2. **API kostnaður**: Ein extra Google Routes beiðni fyrir *hverja* ferð >350km. Þarf að meta hversu margar þær eru á dag.

3. **"Áberandi lengri" threshold**: Við hvaða mun köllum við þetta Hringurinn? Tillaga:
   - Ef >40% lengri en fljótlegasta, eða >150km lengri → `"Hringurinn"`
   - Ef minna → bara `"Önnur leið"` eða sleppa

4. **Destination-óháð**: Fyrir Reykjavík → Akureyri þarf hringinn að fara suður/eystra og upp norður. Via-punktar sem henta Akureyri eru aðrir en þeir sem henta Egilsstaðir.

### Tillaga að via-punktum (óstaðfestir)

```ts
const RING_ROAD_SOUTH_VIA    = { lat: 63.419, lon: -19.001 } // Vík á Mýrdal
const RING_ROAD_EAST_VIA     = { lat: 64.252, lon: -15.212 } // Höfn
```

Ásamt `HELLISHEIDI_VIA = { lat: 64.036, lon: -21.392 }` sem við höfum þegar.

### Þrjár útfærsluleiðir til mats

**Leið A (Stebbi's hugmynd, simplified):**
```ts
{
  id: 'ring-road-south-east',
  logName: 'Hringurinn',
  origin: { bounds: [CAPITAL_AREA_BOUNDS] },
  destination: { minDistanceKm: 350 },  // þarf nýjan matcher type
  vias: [HELLISHEIDI_VIA, RING_ROAD_SOUTH_VIA, RING_ROAD_EAST_VIA],
  labels: ['CURATED_RING_ROAD_SOUTH_EAST'],
  labelIfLongerThanFastestByPct: 40,  // þarf nýja rök
}
```

**Leið B (destination-based eins og núna):**
Halda geographic destination bounds per rule. Capital → Akureyri fær Hringurinn-rule með 3 via. Capital → Egilsstaðir fær annað. Flóknara en A en nákvæmara.

**Leið C (hybrid):**
Nota 350km distanceM threshold í client/server beiðninni til að ákveða hvort við reynum Hringurinn, en nota ennþá geographic destination matcher til að forðast vitlausar leiðir.

### Mælt með til Codex

Codex er beðinn um að meta:

1. Er Leið A raunhæf? Þarf `CuratedRouteRule` að styðja distance-threshold matcher?
2. Hvernig á við að meðhöndla "áberandi lengri" threshold — á það að vera í registry eða í UI?
3. Eru 3 via-punktar nóg eða þarf fleiri?
4. Er API-kostnaður við "allar ferðir >350km" ásættanlegur?

---

## Næstu skref (eftir Codex mat)

1. Klára og committa v005 (vias refactor, Austurland)
2. Bæta við v006 cleanup (fjarlægja Þrengslavegur rule, copy polish)
3. Útfæra Hringurinn per Codex/Stebbi ákvörðun
