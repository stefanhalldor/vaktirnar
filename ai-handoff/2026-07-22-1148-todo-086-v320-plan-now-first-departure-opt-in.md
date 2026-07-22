# 2026-07-22 12:15 - todo-086 v320 plan - "Núna fyrst, brottfarartími opt-in" + Frá/Til villa

## Frá/Til villa í gamla viðmótinu (production bug)

### Einkenni
Notandi velur leið á `/vedrid` (RouteMemoryPicker). Þegar farið er á Ferðalagið, fer áfangastaðurinn (Hvert) í Frá-reit og uppruni (Hvaðan) í Til-reit.

### Rót vandans
`messages/is.json` (og `en.json`) hafa þýðingarnar í öfugri röð:

```json
"routeLensFrom": "Hvert ertu að fara?",   // <-- þetta er destination-spurning
"routeLensTo": "Hvaðan?",                  // <-- þetta er origin-spurning
```

RouteMemoryPicker notár `fromLabel` (= "Hvert") á fyrsta reiti og `toLabel` (= "Hvaðan") á öðrum. Þegar notandinn velur:
- Fyrsti reitur: `selectedFrom` = t.d. Egilsstaðir (destination valið sem "from" gögnum)
- Annar reitur: `selectedTo` = t.d. Akureyri (origin valið sem "to" gögnum)

`onPlacesChange(Egilsstaðir, Akureyri)` →
`writeOverviewRouteDraft(Egilsstaðir, Akureyri)` →
`draft.from = Egilsstaðir`, `draft.to = Akureyri` →
FerdalagidClient: `setOrigin(Egilsstaðir)`, `setDestination(Akureyri)` — ÖFUGT.

### Lagfæring (tvær línur í messages)

Skipta um þýðingarnar þannig að origin komi fyrst (origin-first er hefðbundnari röð):

```json
"routeLensFrom": "Hvaðan?",
"routeLensTo": "Hvert ertu að fara?",
```

Sama fix í `en.json`:
```json
"routeLensFrom": "From where?",
"routeLensTo": "Where are you going?",
```

Engar kóðabreytingar þarf — aðeins þýðingarstrengarnir.

**Athugasemd:** Þetta breytir sjónræn röð á `/vedrid`:
- Fyrsti reitur → "Hvaðan?" (origin, t.d. Akureyri)
- Annar reitur → "Hvert ertu að fara?" (destination, t.d. Egilsstaðir)

---

## Nýja flæðið: "Núna fyrst, brottfarartími opt-in"

### Skrá hugmyndina

Notandinn velur Frá og Til. Í dag: ein stór API-beiðni skilar leiðinni + 24h veðurspá og allt birtist í einu.

Hugmynd Stebbi: skipta þessu upp í tvo skýra kafla.

**Kafli 1 — Núna (sjálfgefið)**
Sýna strax:
- Vegagerðarstöðvar á leiðinni með nústöðu
- Vindtala + hviðutala: `8(13)m/s` (meðalvindur í sviga meðal sterkasta hviðs)
- Leiðarkostur/leiðir sem eru í boði
- Kort með stöðum lita

Þetta krefst ekki útreiknings á veðurspá yfir tíma — aðeins núverandi mælingar frá Vegagerðinni.

**Kafli 2 — Ef lagt er af stað kl. (opt-in)**
Þegar notandinn vill sjá spárnar:
- Birtist "Veldu brottfarartíma" pickup
- Fyrst: næstu heilar klukkustundir (09:00, 10:00, 11:00...)
- Þegar valið: reiknar veðurspár fyrir þá brottfararstund og sýnir hvað má búast við á hverri stöð

### Tæknileg greining

#### Hvað breytist í `calculateResolvedRoute`

**Í dag:**
1. Fetch `/weather/travel` → skilar route + allri veðurspá
2. Núna (vegagerdin): sýnt strax
3. `window.setTimeout(0)` → `buildProviderSlotStatusOverrides` → 24h forecast í bakgrunni

**Tillaga:**
1. Fetch `/weather/travel` → skilar route + allri veðurspá (sama API, sömu gögn)
2. Render vegagerdin stöðvar + kortið — **þetta er fast og gerist nú þegar**
3. **EKKI** keyra `buildProviderSlotStatusOverrides` sjálfkrafa
4. Sýna "Ef lagt er af stað kl." hlutann sem collapsed / opt-in UI
5. Þegar notandinn velur brottfarartíma → ÞANNIG keyra `buildProviderSlotStatusOverrides` eða re-fetch með `earliestDepartureAt`

#### Hvað breytist í DepartureHeatmap

DepartureHeatmap er í dag notaður bæði fyrir Núna og 24h slots. Nýtt flæði:
- **Núna-kafli:** ekki heatmap heldur einföld "Núna" kort-yfirlit (núverandi mælingar)
- **Brottfarar-kafli:** DepartureHeatmap með val á tíma, sýnir forecast per slot

#### `8(13)m/s` vindtala

Vegagerðinstöðvar hafa `meanWindMs` og `gustLast10MinMs`. Í dag:
```tsx
const valueText = point.meanWindMs != null ? formatNum(point.meanWindMs, locale) : '–'
```

Nýtt:
```tsx
const meanStr = point.meanWindMs != null ? formatNum(point.meanWindMs, locale) : '–'
const gustStr = point.gustLast10MinMs != null ? `(${formatNum(point.gustLast10MinMs, locale)})` : ''
const valueText = gustStr ? `${meanStr}${gustStr}` : meanStr
// Þ.e. "8(13)" án "m/s" hlutans (einingamerki birtist sér)
```

Sama má gera í popup-inu.

### Hvað á EKKI að breyta

- API endapunktar (`/weather/travel`) — sama response-format
- Vegagerdin data model — sama `meanWindMs`, `gustLast10MinMs`
- `buildProviderSlotStatusOverrides` — sama function, keyrt síðar
- DepartureHeatmap component — hægt að nota óbreytt fyrir opt-in kafla

### Framkvæmdarprioriteter

1. **Laga Frá/Til villu** (2 línur í messages) — á að gera strax
2. **Gust í sviga `8(13)m/s`** — einföld breyting í `createVegagerdinRouteLabel` og popup
3. **Skipta scrubber í "Núna" og "Ef lagt er af stað kl."** — meira UI-vinna
4. **Opt-in forecast computation** — velja hvort `setTimeout` á að keyra sjálfkrafa eða first-on-demand

### Spurningar sem þarf að svara áður en útfærsla

1. Á "Ef lagt er af stað kl." kaflinn að birta **heilar klukkustundir frá núna** (09, 10, 11...) eða **10-mínútu skref** (09:10, 09:20, 09:30...)?
   - Stebbi: "næsta heili mínútutuginn og svo klukkustundir þar eftir" → þ.e. fyrsti valkostur = næsti :00 eða :10 tímabil, svo heilu tímarnar

2. Á forecast computation að gerast **eftir val** (on-demand) eða **í bakgrunni meðan notandinn skoðar Núna**?
   - Mælt: background, með progress indicator í "Ef lagt er af stað kl." hlutanum

3. Á "Ef lagt er af stað kl." að nota veðurstofan-spárnar (núverandi) eða nýja tegund af forecast?
   - Svar: nota núverandi `buildProviderSlotStatusOverrides` sem reiknar m.v. Veðurstofan-stöðvar

4. Á leiðarkostaval (Leið 1, Leið 2...) að vera í "Núna" kaflanum eða "Ef lagt er af stað" kaflanum?
   - Mælt: í "Núna" kaflanum — notandinn velur leið með tilliti til nústöðu, sér svo forecast á þeirri leið

---

## Skrár sem verður að breyta

### Frá/Til villuleiðrétting (leyfis þarf):
- `messages/is.json` — 2 línur
- `messages/en.json` — 2 línur

### Gust í sviga (leyfis þarf):
- `components/weather/RoadMapPrototypeMap.tsx`
  - `createVegagerdinRouteLabel` — `valueText` með `(gustStr)`
  - `openVegagerdinRouteStationPopup` — sýna `meanWindMs(gustLast10MinMs)m/s`

### Scrubber UI (leyfis þarf):
- `components/weather/RoadMapPrototypeMap.tsx`
  - Núna-kafli: núverandi stöður, gust, leiðarkostir
  - "Ef lagt er af stað kl." kafli: DepartureHeatmap með opt-in forecast

---

## Supabase / SQL

- Engar SQL-breytingar
- Engin áhrif á RLS, auth eða production gögn
