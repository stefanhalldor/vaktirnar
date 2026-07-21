# 2026-07-21 19:00 - todo-086 v291 - Claude: Skilningur á UI redesign

Created: 2026-07-21 19:00
Timezone: Atlantic/Reykjavik

## Samhengi

Stebbi prófaði prototype á production undir `road-intelligence-v1` flaggi og gefur nú leiðbeiningar um UI fine-tuning. Þetta er handoff þar sem Claude skrifar niður skilning sinn á hönnunarfyrirmælunum til staðfestingar Stebba áður en framkvæmd hefst.

**Engar kóðabreytingar í þessum handoff.** Þetta er eingöngu skilningsskjal.

---

## Núverandi staða (default opnun prototype)

Þegar notandi opnar `/auth-mvp/vedrid/road-map-prototype` sér hann:

- Kort (MapLibre) með Vegagerðarstöðvum
- Efst til hægri: stór frosted-glass panel með "Ferðaleið" formi (from/to, þægindamörk, hættumörk, brottfarartími, reikna-takki)
- Panel er opinn by default og þekur hluta af kortinu

---

## Nýtt hönnunarmarkmið

### 1. Sjálfgefin opnun: nákvæmlega eins og /vedrid (Skjámynd 181707)

Þegar prototype opnast á að kortið vera OPIÐ og FULLT — eins og `/vedrid`:

- Vegagerðarstöðvar á kortinu (litaðir punktar eftir vindstyrk)
- **Scrubber neðst** — sami scrubber og er á `/vedrid` (Skjámynd 181707):
  - Vinstri hluti: "Vegagerðin / Núna / Mælt HH:MM" (núgildi)
  - Hægri hluti: "Veðurstofan (spá)" með punktum á 3 klst fresti yfir 2-3 daga
  - Þessi scrubber sýnir strax hvað er í gangi **án þess að leið sé valin**
- **Einfalt / Nánar** toggle og filter pillur við/undir scrubberinn (Skjámynd 182800)
- **Enginn stór panel** yfir kortinu

Þetta þýðir: núverandi DepartureHeatmap/scrubber sem er í `/vedrid` (`WeatherOverviewClient` + `RouteMemoryPicker`) þarf að koma inn á kortið.

---

### 2. Akstursmyndin (🚗) — alltaf sýnileg á kortinu, efst til vinstri

Lítill knappur, uppi í vinstra horni kortsins (eins og map controls eru neðst til vinstri):

```
[🚗]
```

- Alltaf sýnilegur, jafnvel þegar leið er ekki valin
- Smellur opnar/lokar "Ferðaleið" panelinn (sem er nú the default panel)
- Pannelinn opnast sem overlay/drawer undir emoji-knappinn (eða hlið kortsins)
- Þegar lokaður er pannelinn: kortið er FULLT og enginn panel sést — bara kortið, scrubberinn og emojin

**Litsbreyting þegar leið er valin:**
- Emoji-knappur breytir lit eftir route status:
  - Grœnn: allt ok á leiðinni
  - Gulur: óþægilegt á leiðinni
  - Rauður: hættu á leiðinni
- Þetta er eina synlega vísbending um route status þegar pannelinn er lokaður

---

### 3. "Ferðaleið" pannelinn (undir 🚗 þegar opinn)

Þegar 🚗 er smellt:

**Áður en leið er valin:**
- From/to autocomplete reiti
- Þægindamörk + hættumörk stillingar
- Brottfarartími (valfrjálst)
- "Reikna" takki

**Þegar leið er valin (route active):**
- Sama info og er í `/ferdalagid` (Skjámynd 182442 + 182545):
  - Svartexti ("Á leiðinni: Innan marka" osf.)
  - Mest krefjandi punktur á leið + tímasetning + vindur/úrkoma/hiti
  - Áfangastaðarspá
  - Veðursamanburðartafla (Skjámynd 182442)
  - Punct detail (Skjámynd 182545): "Punktur 69/76", brottfarartími, ETA, veðurspá, links (Spá, Yr, Google Maps, met.no)
- "Hreinsa leið" takki (til að fara aftur í no-route state)

Pannelinn er **minimize-able** — notandi lokar með því að smella á 🚗 aftur. Þegar lokaður er leiðin enn virk, kortið er enn filterað, scrubberinn neðst er enn departure-mode.

---

### 4. Scrubber-skipting eftir route-state

**Þegar engin leið er valin (default):**

```
[Vegagerðin | Núna | Mælt 18:15] [•][•][•] ... [Veðurstofan (spá)] [•][•][•] ... Fim
```

Þetta er núverandi `/vedrid` scrubber (Skjámynd 181707). Sýnir:
- Vinstri: núgildi Vegagerðar
- Hægri: Veðurstofuspá á 3 klst fresti yfir næstu 2-3 daga
- Notandi getur scrollað á milli tíma og séð stöðvar á kortinu breytast

**Þegar leið er valin:**

Departure scrubber kemur í stað (Skjámynd 182144):

```
< [Núna ✓] [19] [20] [21] [22] [23] [Mið 22. júlí] ... >
```

- Hourly slots, eins og í `/ferdalagid`
- Núna-slot selected by default
- Smellur á slot: Veðurstofanstöðvar á kortinu uppfærast eftir ETA, summary í paneli uppfærist
- Filter pillur + "Einfalt/Nánar" eru neðst við departure scrubberinn

---

### 5. Filter pillur + Einfalt/Nátar

**Alltaf við/neðan við scrubberinn** — aldrei inni í 🚗 panelnum.

- "Einfalt" / "Nánar" toggle (Skjámynd 182800): sama og er á `/vedrid`
- Filter pillur (Innan marka / Óþægilegt / Hættulegt / Sýna allt)
- Þegar leið er valin: pillur filtera bæði korta-dots OG departure scrubber slots

---

### 6. 💬 Chat-bubble með "púlsinn" — nálægt 🚗

Lítill 💬 knappur við hliðina á 🚗, efst til vinstri:

```
[🚗] [💬]
```

- Smellur opnar "púlsinn" — þ.e. community pulse eða live activity feed (líklega tengist þessu sem er þegar til í `/vedrid`: "Fréttir af aðstæðum frá notendum Teskeiðarinnar", Skjámynd 182800 efst)
- Þetta er **separate** frá 🚗 route panelnum
- Kann að vera einföld drawer/overlay eða bottom sheet

---

## Samantekt á layout

### Þegar engin leið er valin:

```
┌──────────────────────────────────┐
│ [🚗][💬]          [+]            │
│                   [-]            │  ← kortið, fullt
│     · · · ·                      │
│        ·  ·   ·                  │
│              ·  ·                │
│ [Sýna vegakerfi] [Sýna færð]     │
│ [Vegastandið legend]              │
├──────────────────────────────────┤
│ Einfalt │ Nánar                  │
│ ● Innan marka (138)  ● Óþægilegt │
│ [Vegagerðin Núna] ────scrubber── │
└──────────────────────────────────┘
```

### Þegar 🚗 er opinn (engin leið):

```
┌─────────────────────────────────────┐
│ ┌────────────────┐                  │
│ │ [🚗] Ferðaleið │ [X]              │
│ │ Frá: _______   │                  │  ← panel yfir/við kort
│ │ Til: _______   │                  │
│ │ Þægindi: ___   │                  │
│ │ [Reikna]       │                  │
│ └────────────────┘                  │
│     kortið sést að hluta til        │
├─────────────────────────────────────┤
│ [scrubber + filter pillur]          │
└─────────────────────────────────────┘
```

### Þegar leið er valin og 🚗 er minimized:

```
┌──────────────────────────────────┐
│ [🟡🚗][💬]        [+]            │  ← emoji gulur ef óþægilegt
│                   [-]            │
│  route line + station labels     │
│                                  │
├──────────────────────────────────┤
│ Einfalt │ Nánar                  │
│ ● Innan marka  ● Óþægilegt       │
│ < [Núna✓] [19] [20] [21] [22] > │  ← departure scrubber
└──────────────────────────────────┘
```

### Þegar 🚗 er opinn og leið er valin:

```
┌──────────────────────────────────────┐
│ ┌──────────────────────────────────┐ │
│ │ [🟡🚗] Á leiðinni: Óþægilegt    │ │
│ │ Mest krefjandi: 105 km frá Ak... │ │
│ │ Vindur: 6,7 m/s...               │ │
│ │ Áfangastaður kl. 19:47...        │ │
│ │ Veðursamanburður...              │ │
│ │ [Hreinsa leið]                   │ │
│ └──────────────────────────────────┘ │
│     kortið sést að hluta til         │
├──────────────────────────────────────┤
│ Einfalt │ Nánar                      │
│ ● Innan marka  ● Óþægilegt           │
│ < [Núna✓] [19] [20] [21] [22] >     │
└──────────────────────────────────────┘
```

---

## Spurningar til Stebba áður en framkvæmd hefst

**1. Scrubber í default state (engin leið):**
Þetta þýðir að við þurfum að kalla á provider data (Vegagerðin + Veðurstofan) strax þegar kortið opnast, ÁÐUR en notandi velur leið — eins og `/vedrid` gerir. Er það rétt skilningur? Þetta er ný backend-köll frá Road Intelligence kortinu.

**2. Púlsinn (💬):**
Er "púlsinn" sambærilegur við "Fréttir af aðstæðum frá notendum Teskeiðarinnar" sem er þegar til í `/vedrid` (Skjámynd 182800 efst)? Eða er þetta eitthvað annað — t.d. live activity feed, heartbeat frá Vegagerðin/Veðurstofan, eða community reports?

**3. Panel staðsetning (🚗):**
Á pannelinn að opnast sem:
- (a) Overlay/drawer frá vinstri (sama staðsetning og núverandi top-right panel, en vinstri)
- (b) Bottom sheet sem kemur upp neðan frá
- (c) Inline, kortið minnkar til hægri og pannelinn tekur vinstri hlutann
Skjámyndirnar sýna núverandi panel efst til hægri — kemur nýi pannelinn á sama stað en minni?

**4. Vegagerðin-only scrubber í default state:**
Skjámynd 181707 sýnir scrubberinn á `/vedrid` með bæði Vegagerðin (vinstri) og Veðurstofan (hægri). Á Road Intelligence kortið að nota nákvæmlega þennan scrubber (sér í lagi `/vedrid` component), eða á við að útfæra svipað frá grunni á Road Intelligence kortinu?

**5. Filter pillur á default state:**
Í default (engin leið), filterast pillurnar þá alla Vegagerðarstöðvarnar á kortinu (eins og á `/vedrid`)? Þ.e. smellur á "Hættulegt" felur allar grœnar stöðvar og sýnir bara rauðar?

---

## Samantekt skilnings

| Hluti | Default (engin leið) | Route valin, 🚗 minimized | Route valin, 🚗 opinn |
|---|---|---|---|
| Kortið | Fullt, allar stöðvar | Fullt, route + stöðvar | Hluta þakið af paneli |
| Scrubber neðst | Vegagerðin/Núna + Veðurstofan 3h | Departure slots (182144) | Departure slots |
| Filter pillur + Einfalt/Nánar | Við scrubber | Við departure scrubber | Við departure scrubber |
| 🚗 emoji | Grár (inaktíf) | Litur = route status | Litur = route status |
| 💬 emoji | Sýnilegur | Sýnilegur | Sýnilegur |
| Panel efni | — | — | Route form / route detail |

---

## Hvað þarf að framkvæma (eftir staðfestingu Stebba)

1. **Fjarlægja default-opinn panel** — `routeBridgeSummary === null` state á að sýna fullt kort, ekki form
2. **Bæta við 🚗 + 💬 emoji knöppum** efst til vinstri á kortinu
3. **Fara með "Ferðaleið" form** undir 🚗 sem opnast/locast
4. **Bæta við default scrubber** (Vegagerðin/Núna + Veðurstofan) þegar engin leið er valin
5. **Skipta yfir í departure scrubber** þegar leið er reiknuð
6. **Færa filter pillur + Einfalt/Nánar** til að vera alltaf við neðri scrubberinn
7. **Lita 🚗** eftir route status þegar leið er valin
8. **Útfæra 💬 panel** með púlsinn/community content

Framkvæmd ætti að ganga vel þar sem flestir hlutarnir eru þegar til — það er fyrst og fremst um að endurraða/refactor layout en ekki skrifa mikið nýtt.
