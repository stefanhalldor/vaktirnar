# Codex review: TODO #75 v003 — Spá 🥄 tafla, staðsetningar og dálkaþróun

Created: 2026-07-08 20:37
Timezone: Atlantic/Reykjavik
Agent: Codex
Builds on:
- `2026-07-08-2008-todo-075-v001-claude-forecast-drawer-all-points.md`
- `2026-07-08-2014-todo-075-v002-codex-forecast-trend-drawer-review.md`

Related TODO: #75, ef ekki þegar skráð: `Veðurspáskúffa fyrir alla spápunkta með þróun milli klukkustunda`

---

## Stebbi input fyrir v003

Stebbi er að sjá fyrir sér að notandi geti smellt á `Spá 🥄` sem opnar Teskeið-spátöflu. Taflan má vera aðeins stærri/meiri en núverandi arrival forecast tafla, en hún á að vera mobile-first og læsileg.

Skjámyndirnar sýna þrjá staði þar sem þessi aðgerð á að vera aðgengileg:

1. Í komu-/áfangastaðaspjaldinu fyrir ofan kortið, þar sem nú er `Skoða spána á áfangastað betur`.
2. Í `Mest krefjandi á leiðinni` spjaldinu, þar sem nú eru linkar eins og `Skoða veðurspá`, `Opna á korti`, `Hrá met.no gögn`.
3. Í hverju spjaldinu undir `Allir spápunktarnir á leiðinni`, þar sem nú eru sömu linkar.

Stebbi vill einnig:

- litakóða per dálk sem sýnir hvort breyting frá síðasta klukkutíma er jákvæð eða neikvæð
- möguleika á að sýna/fela ákveðna klukkutíma dagsins, t.d. nótt
- áfram upplifun sem finnst eins og Teskeið, ekki bara raw met.no/Yr tafla

---

## Findings fyrst

1. **`Spá 🥄` ætti að verða innri primary action fyrir Teskeið-spána.** Hún á ekki að vera sami hlutur og `Yr`; þetta er sérvirkni Teskeiðar með þróun, litakóðun og highlighted matstíma.

2. **Ekki láta `Hrá met.no gögn` vera í almennu notendaflæði.** Í þeim þremur stöðum sem skjámyndirnar benda á ætti action röðin að vera meira eins og: `Spá 🥄` · `Yr` · `Google Maps`. Raw met.no má vera debug/admin ef við viljum halda því.

3. **Litakóðun per dálk þarf að vera metric-aware.** Fyrir ferðaveður er lækkandi vindur, hviður og úrkoma almennt jákvætt; hækkandi vindur/hviður/úrkoma neikvætt. Hiti er ekki alltaf “meira er betra”, þannig hann ætti annað hvort að vera hlutlaus trend-dálkur eða fá sérreglur síðar.

4. **Show/hide night hours er góð UX-viðbót, en ekki láta það fela áhættu sjálfkrafa.** Ef nótt er falin og rauður/gulur tími er falinn, þarf að sýna vísbendingu eins og `3 faldir tímar með óþægilegu veðri`.

5. **Taflan má vera stærri en núverandi, en hún má ekki verða desktop-tafla sem þröngvar mobile horizontal scroll.** Hún þarf að virka í 390px viewport án zooms.

---

## Nýtt UX scope fyrir Claude Code

### 1. Action label og staðsetningar

Nota `Spá 🥄` sem innri action-label fyrir Teskeið-spána.

Setja action á þessa staði:

- Komuspjaldið: skipta `Skoða spána á áfangastað betur` út fyrir eða láta það verða `Spá 🥄` með secondary text/aria-label `Skoða spána á áfangastað betur`.
- Mest krefjandi spjald: bæta við `Spá 🥄` sem opnar skúffu fyrir þann spápunkt og highlighted klukkustundina sem Teskeið notaði.
- Allir spápunktarnir: bæta við `Spá 🥄` á hverja `RoutePointRow`.

Mælt action röð:

`Spá 🥄` · `Yr` · `Google Maps`

Ef `Hrá met.no gögn` er enn til staðar, færa það í debug-only eða fela bakvið dev flag. Ekki hafa það sem venjulegan þriðja notendahlekk.

Accessibility:

- Button text má vera `Spá 🥄`.
- `aria-label` þarf að vera skýrt, t.d. `Opna Teskeið-spá fyrir punkt 45 af 58`.
- Ekki nota emoji eitt og sér sem eina merkingarberandi einingu.

### 2. Tafla/skúffa

Hönnunin má líkjast núverandi töflu:

| Dagur og tími | °C | m/s | mm/klst |

En bæta við þróun án þess að brjóta mobile:

Tillaga fyrir mobile:

| Dagur og tími | °C | m/s | mm/klst |
| --- | ---: | ---: | ---: |
| Fös. 10. júl 23:00 | 10,1 → | 7,9 ↓0,4 | 0,8 ↓0,2 |

Eða ef taflan verður of þröng:

```
Fös. 10. júl 23:00
Hiti 10,1°C → · Vindur 7,9 m/s ↓0,4 · Úrkoma 0,8 mm/klst ↓0,2
```

Mælt er með að byrja með töflu þar sem gildi + delta er inni í sama cell:

- `7,9 ↓0,4`
- `0,8 ↑0,3`
- `10,1 →`

Nota `title`/accessible text fyrir tákn:

- `Vindur lækkar um 0,4 m/s frá síðustu klukkustund`
- `Úrkoma eykst um 0,3 mm/klst frá síðustu klukkustund`

### 3. Litakóðun per dálk

Litun á að merkja þróun miðað við ferðaveður, ekki bara stærðfræðilegt upp/niður.

Reglur í fyrstu útgáfu:

- Vindur:
  - lækkar marktækt = grænt
  - hækkar marktækt = gult/rautt eftir stærð breytingar
  - svipað = hlutlaust
- Hviður, ef þær birtast:
  - sama og vindur, en hviður mega vega þyngra í overall trend
- Úrkoma:
  - minnkar marktækt = grænt
  - eykst marktækt = gult/rautt eftir stærð breytingar
  - svipað = hlutlaust
- Hiti:
  - í fyrstu útgáfu: hlutlaus litun með örvum, ekki safety-grænt/rautt
  - síðar má bæta sérreglum ef frost/hálka verður hluti af mati

Mælt thresholds til að forðast noise:

- vindur/hviður: `0.5 m/s`
- úrkoma: `0.1 mm/klst`
- hiti: `0.5°C`

Color classes eiga að fylgja núverandi Teskeið palette: grænt/gult/rautt/grátt eins og status-pillur og route point cards.

### 4. Sýna/fela nótt eða tíma dags

Setja þetta sem optional filter í skúffunni, ekki default blocker.

Tillaga:

- Segmented control efst:
  - `Allt`
  - `Dagur`
  - `Fela nótt`
- Skilgreina nótt í fyrstu útgáfu sem `00:00-06:00`.
- Ef faldir tímar innihalda gult/rautt eða mikla breytingu, sýna compact warning:
  `Faldir næturtímar: 2 með óþægilegu veðri`

Ekki fela nótt sjálfkrafa í v1 nema Stebbi samþykki það sérstaklega. Betra default: `Allt`.

### 5. Highlight og samhengi

Skúffan þarf að opnast með réttum title:

- Áfangastaður: `Spá fyrir Akranes`
- Mest krefjandi punktur: `Spá fyrir mest krefjandi punkt`
- Almennur spápunktur: `Spá fyrir punkt 45/58`

Highlighted row:

- nota spáklukkustundina sem Teskeið notaði í matinu
- sýna texta nálægt henni:
  `Spáin sem Teskeið notar í matinu`

Active slot mode:

- ef notandi velur annan brottfarartíma, þarf highlighted row að fylgja honum
- ekki nota stale `summaryForWindow` ef active candidate er valinn

---

## Tæknileg stefna

### Data model

V002 lagði til compact `ForecastDrawerRow`. V003 styrkir það.

Ekki senda full raw met.no object ef ekki þarf. Senda frekar row sem UI getur teiknað beint:

```ts
type ForecastDrawerMetricCell = {
  value: number
  delta?: number
  direction: 'up' | 'down' | 'steady' | 'none'
  tone: 'positive' | 'negative' | 'neutral'
  accessibleLabel: string
}

type ForecastDrawerRow = {
  timeIso: string
  status: WeatherStatus | 'no_data'
  temperature: ForecastDrawerMetricCell
  wind: ForecastDrawerMetricCell
  gust?: ForecastDrawerMetricCell
  precipitation: ForecastDrawerMetricCell
  isHighlighted?: boolean
  isHiddenByTimeFilter?: boolean
}
```

Athugið: `tone` er metric-aware. Fyrir vind er `down` yfirleitt `positive`, fyrir úrkomu líka. Fyrir hita er oft `neutral`.

### Component boundary

Mælt:

- gera `ForecastDrawer` eða `WeatherForecastDrawer` sem sér component, ekki halda öllu inline í `FerdalagidClient.tsx`
- `RoutePointRow` fær callback eins og `onOpenForecast(pt)`
- arrival card notar sama drawer component

Þetta minnkar líkur á að arrival drawer og route point drawer fari að haga sér ólíkt.

### Messages

Allur texti í `messages/is.json` og `messages/en.json`.

Nýir textar sem þarf líklega:

- `Spá 🥄`
- `Opna Teskeið-spá`
- `Spáin sem Teskeið notar í matinu`
- `Allt`
- `Dagur`
- `Fela nótt`
- `Faldir næturtímar`
- trend labels: `hækkar`, `lækkar`, `eykst`, `minnkar`, `svipað`

---

## Prófanir sem þarf að biðja Claude Code um

Unit:

- trend helper fyrir vind, hviður, úrkomu og hita
- metric-aware tone: wind down = positive, wind up = negative; precip down = positive, precip up = negative; temp mostly neutral
- thresholds: smábreytingar verða `steady`
- first row has no previous delta
- hidden-night summary telur falda gula/rauða tíma rétt

UI/manual:

- `Spá 🥄` birtist á öllum þremur stöðunum sem Stebbi merkti með örvum
- `Spá 🥄` opnar innri Teskeið-skúffu, ekki nýjan tab
- `Yr` opnar external Yr
- `Google Maps` opnar kort
- `Hrá met.no gögn` er ekki venjulegur notendahlekkur nema Stebbi samþykki það áfram

Build:

- `npm run type-check`
- `npm run test:run`
- `npm run build` ef messages/component boundary breytist

---

## Localhost checks for Stebbi

Opna `http://localhost:3004/auth-mvp/vedrid` eða það localhost-port sem Stebbi er þegar með í gangi.

Prófa:

1. Reikna Garðabær -> Þorlákshöfn.
2. Velja brottfarartíma sem sýnir komu-/áfangastaðaspjald.
3. Smella á `Spá 🥄` í áfangastaðaspjaldinu.
4. Staðfesta að taflan opnist og sýni íslenskt dags/heiti og 24h tíma, t.d. `Fös. 10. júl 23:00`.
5. Staðfesta að dálkarnir sýni gildi og þróun frá síðustu klukkustund, t.d. vindur/úrkoma með grænu þegar lækkar og gulu/rauðu þegar hækkar.
6. Loka skúffu.
7. Smella á `Spá 🥄` í `Mest krefjandi á leiðinni`.
8. Staðfesta að réttur punktur og rétt highlighted klukkustund birtist.
9. Opna `Allir spápunktarnir á leiðinni`, velja venjulegan punkt og smella á `Spá 🥄`.
10. Staðfesta að title sé punktatengdur, t.d. `Spá fyrir punkt 1/58`.
11. Prófa `Fela nótt` eða sambærilega síu ef hún er útfærð.
12. Staðfesta að falin nótt feli ekki áhættu án vísbendingar.
13. Prófa í 390px mobile viewport: enginn horizontal overflow, taflan er læsileg, close button alltaf aðgengilegur.
14. Velja annan brottfarartíma í timeline og opna sömu spá aftur. Highlighted klukkustund á að færast með valda brottfarartímanum.

Passa sérstaklega:

- arrival weather textinn og eldri drawer virki áfram
- úrkoma/hiti detti ekki út úr mest krefjandi spjaldinu
- `Ófullnægjandi gögn` pillur komi ekki aftur þegar punktarnir hafa gögn
- engin ný met.no/Google API köll nema það hafi verið samþykkt sérstaklega
- engin SQL/RLS/auth breyting í þessu verkefni

---

## Codex niðurstaða

V003 breytir #75 úr “opna spá fyrir alla punkta” í skýrara product pattern:

`Spá 🥄` er Teskeið-spá fyrir stað/punkt, með klukkustundatöflu, metric-aware þróun og möguleika á að sía tíma dags.

Þetta er líklega mun sterkari útgáfa en að setja bara `Skoða veðurspá` á fleiri staði.
