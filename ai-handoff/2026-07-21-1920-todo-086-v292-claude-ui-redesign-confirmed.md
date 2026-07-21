# 2026-07-21 19:20 - todo-086 v292 - Claude: UI redesign - staðfestur skilningur

Created: 2026-07-21 19:20
Timezone: Atlantic/Reykjavik

## Samhengi

Stebbi staðfesti / leiðrétti v291-skilning minn. Þetta er uppfært skjal til að afmarka framkvæmd.
Engar kóðabreytingar í þessum handoff.

---

## Staðfestingar Stebba

### Panel lokaður við opnun
Já — `isPanelOpen` er `false` by default. Kortið sést fullt um leið og síðan opnast.

### 🚗 emoji litur
- **Grár** þegar engin leið er valin
- **Grœnn** þegar leið er valin (óháð route status)
- Scrubberinn neðst (slot-litir) segir til um hvort gott sé að fara — emoji-liturinn segir bara "er leið valin eða ekki"

### Default scrubber (engin leið)
Vegagerðin-gögn eru þegar í cache. Sækjum þau samhliða því sem kortið hleðst — birta um leið og þau eru klár. Nákvæmlega eins og `/vedrid` gerir.

### 💬 púlsinn
Nákvæmlega sama og á núverandi `/vedrid` — component/section sem heitir `ConditionsFeedPreview` (eða `useConditionsFeedPreview`). Sama UI, sama gögn.

### Panel staðsetning (🚗 opinn)
"Þú gerir fyrstu drög" — Claude velur. Plan: drawer sem kemur frá vinstri (eða top-left overlay). Stærð: ca. 320px breitt, hámark 80vh hátt, scrollable inni. Á mobile: bottom sheet.

### Útfærsla scrubbers
Herma nákvæmlega eftir `/vedrid` — `WeatherSourceTimeSelector` component + `ForecastTimeScrubber`. Ekki skrifa frá grunni.

### Filter logic í default state
Herma eftir `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES` frá `/vedrid`:
```ts
new Set(['nalgast-othaegindi', 'othaegilegt', 'nalgast-haettumork', 'haettulegt'])
```
Þ.e. `no_wind_data`, `no_data`, `innan-marka` eru falin by default. "Sýna allt" => tómt Set.

---

## Fullur UI-plan eftir breytingar

### Þegar síðan opnast (engin leið valin)

```
┌──────────────────────────────────────┐
│ [🚗] [💬]              [+][-]        │
│                                      │  ← kortið, fullt skjár
│   · (Vegagerðin stöðvar)             │
│          ·   ·                       │
│   [Sýna vegakerfi] [Sýna færð]       │
│   [Vegafærð legend] [Vegastandið]    │
├──────────────────────────────────────┤
│ Einfalt │ Nánar                      │
│ ● Óþægilegt (42) ● Hættulegt (2)     │  ← filter pillur
│                       Sýna allt      │
│ [Vegagerðin│Núna│Mælt 18:15] ──────  │  ← WeatherSourceTimeSelector scrubber
│                     [spá dots ──── ] │
└──────────────────────────────────────┘
```

Vegagerðin-data er sótt samhliða korta-hleðslu. Birtist um leið og klár.

---

### Þegar 🚗 er smellt (engin leið)

```
┌──────────────────┬───────────────────┐
│ ┌──────────────┐ │                   │
│ │ [◀] Ferðaleið│ │                   │
│ │              │ │  kortið sést      │
│ │ Frá: _______ │ │  að hluta til     │
│ │ Til: _______ │ │                   │
│ │               │ │                   │
│ │ Þægindi: ___  │ │                   │
│ │ Hætta: ____   │ │                   │
│ │ [Reikna]      │ │                   │
│ └──────────────┘ │                   │
├──────────────────┴───────────────────┤
│ [scrubber + filter pillur]           │
└──────────────────────────────────────┘
```

Panelinn á vinstri hlið, kortið sést þjappað til hægri.

---

### Þegar leið er valin og 🚗 er minimized (lokaður)

```
┌──────────────────────────────────────┐
│ [🟢🚗] [💬]            [+][-]        │  ← 🚗 grœnn = leið valin
│                                      │
│   route line + station labels        │
│                                      │
│   [Sýna vegakerfi] [Sýna færð]       │
│   [legend]  [Skoðar: brottför kl X] │
├──────────────────────────────────────┤
│ Einfalt │ Nánar                      │
│ ● Óþægilegt  ● Hættulegt             │
│ < [Núna ✓] [19] [20] [21] [22] >    │  ← departure scrubber
└──────────────────────────────────────┘
```

---

### Þegar leið er valin og 🚗 er opinn

```
┌──────────────────┬───────────────────┐
│ ┌──────────────┐ │                   │
│ │[🟢◀]Á leiðinni│ │                  │
│ │Óþægilegt     │ │  kortið + leið    │
│ │              │ │                   │
│ │ Mest krefjandi│ │                  │
│ │ 105 km frá.. │ │                   │
│ │ Vindur: 6,7..│ │                   │
│ │              │ │                   │
│ │ Áfangastaðar │ │                   │
│ │ kl. 19:47... │ │                   │
│ │              │ │                   │
│ │ Veðursamanb. │ │                   │
│ │              │ │                   │
│ │ [Hreinsa leið]│ │                  │
│ └──────────────┘ │                   │
├──────────────────┴───────────────────┤
│ Einfalt │ Nánar                      │
│ ● Óþægilegt  ● Hættulegt             │
│ < [Núna ✓] [19] [20] [21] [22] >    │
└──────────────────────────────────────┘
```

---

## Þau components sem eru þegar til og þarf að endurnýta

| Component/function | Heimild | Hvernig notað |
|---|---|---|
| `WeatherSourceTimeSelector` | `/vedrid` | Default scrubber |
| `ForecastTimeScrubber` | `/vedrid` | Slots í default scrubber |
| `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES` | `windDisplayStatus.ts` | Default filter |
| `WindStatusFilterPills` | RoadMapPrototypeMap (þegar til) | Við scrubber |
| `DepartureHeatmap` | RoadMapPrototypeMap (þegar til) | Route departure scrubber |
| `ConditionsFeedPreview` | `/vedrid` | 💬 púlsinn |
| `useConditionsFeedPreview` | `/vedrid` | 💬 hook |
| `/api/teskeid/weather/vegagerdin/current` | `/vedrid` API | Vegagerðin núna-gögn |
| `/api/teskeid/weather/travel` (vedurstofan) | RoadMapPrototypeMap | Veðurstofan forecast |

---

## Framkvæmdaskref í röð

### Skref 1 — Panel lokaður by default, 🚗 knappur

- Bæta `isPanelOpen: boolean` state, default `false`
- Fjarlægja núverandi alltaf-opinn panel
- Bæta 🚗 + 💬 knöppum efst til vinstri á kortinu
- Panel opnast/locast við smell á 🚗
- 🚗 er grár þegar `routeBridgeSummary === null`, grœnn þegar `!== null`

### Skref 2 — Default scrubber (Vegagerðin + Veðurstofan)

- Sækja Vegagerðin current data: `GET /api/teskeid/weather/vegagerdin/current`
- Notum sömu adaptive-fetch lógík og `/vedrid`: birta strax þegar klár
- Reikna worst WindDisplayStatus across all stations (með `DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES` filter)
- Sækja Veðurstofan forecast data (mögulega frá `/api/teskeid/weather/travel` eða annarri endapoint)
- Birta `WeatherSourceTimeSelector` neðst á kortinu
- Þegar tímaseli er breytt: uppfæra korta-dot liti (Veðurstofan stöðvar) eins og `/vedrid` gerir

### Skref 3 — Filter pillur færðar til scrubber

- Filter pillur eru nú inni í panelnum þegar leið er valin
- Færa þær út fyrir panelinn, alltaf neðan við scrubberinn
- Virka á bæði default scrubber (Vegagerðin/Veðurstofan) og departure scrubber (leið)

### Skref 4 — Skipti milli scrubbers þegar leið er valin

- Þegar `routeBridgeSummary !== null`: fela default scrubber, sýna `DepartureHeatmap`
- Þegar `routeBridgeSummary === null`: sýna default scrubber, fela `DepartureHeatmap`

### Skref 5 — 🚗 panel með route info þegar leið er valin

- Inni í panelnum (þegar opinn + leið valin): sýna `/ferdalagid`-style info
- Þetta er sú info sem er nú í `routeBridgeSummary` + worst-point detail
- "Hreinsa leið" takki inni í panelnum (ekki á kortinu)

### Skref 6 — 💬 púlsinn

- Smellur á 💬 opnar `ConditionsFeedPreview` (same as `/vedrid`)
- Overlay/drawer, sama UI

---

## Tæknilegar ákvarðanir

### Panel design (fyrstu drög frá Claude)

Vinstri drawer, 320px, bakgrunnur frosted-glass (`bg-background/90 backdrop-blur-sm`), shadow.
Á mobile (< 640px): bottom sheet, max 70vh, scrollable.

Implementerum með einfaldri CSS transition (`translate-x`), ekki react-spring eða framer.
`position: absolute; left: 0; top: 0; z-index: 20` á desktop.

### Vegagerðin fetch í RoadMapPrototypeMap

Nýr `useEffect` sem keyrir einu sinni við mount:
```ts
useEffect(() => {
  fetch('/api/teskeid/weather/vegagerdin/current')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) setVegagerdinOverviewData(data) })
}, [])
```

Þetta er sama URL og `/vedrid` notar. Cache er á `/api` route.

### Veðurstofan forecast í default state

Í `/vedrid` er þetta fengið sem hluti af stærra API-kalli. Í RoadMapPrototypeMap er þetta erfiðara — við höfum ekki valda stöð/leið enn.

Tvo valkostir:
- (A) Nota sömu `/api/teskeid/weather/vedrid-overview` eða sambærilegt endpoint sem `/vedrid` notar
- (B) Nota `/api/teskeid/road-intelligence/station-markers` sem skilar GeoJSON — en það gefur ekki forecast rows

Skoðaðu hvort við getum endurnýtt `/vedrid` overview API beint eða hvort við þurfum nýjan endpoint. Þetta þarf að kanna áður en Skref 2 er framkvæmt.

---

## Spurning til Stebba (ein)

Hvernig ætti default Veðurstofan-spáin í scrubbernum að virka á Road Intelligence kortinu þegar engin stöð/leið er valin? Á `/vedrid` er þetta byggt á öllu Íslandi (eða valda stöð frá Route Memory Picker). Á nýja kortinu:

- (A) Nota ALLAR Veðurstofanstöðvar á Íslandi (sama og `/vedrid` by default) — þetta er auðveldast
- (B) Bara sýna Vegagerðin núna-hlutann í scrubbernum þar til leið er valin (engin Veðurstofan forecast þá)

Stebbi svaraði "hermum eftir /vedrid nákvæmlega" — þetta bendir til (A). En staðfestu ef tafarlaust framkvæmd er heitið.

---

## Hvað er EKKI hluti af þessum redesign

- Engar breytingar á route matching logic
- Engin ný SQL/Supabase
- Engar breytingar á `/vedrid` eða `/ferdalagid` sjálfum
- Engar breytingar á route travel API
