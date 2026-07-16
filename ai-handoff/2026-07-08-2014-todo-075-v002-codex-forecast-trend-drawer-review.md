# Codex review: TODO #75 v002 — Spáskúffa fyrir alla spápunkta með þróun milli klukkustunda

Created: 2026-07-08 20:14
Timezone: Atlantic/Reykjavik
Agent: Codex
Reviewed handoff: `2026-07-08-2008-todo-075-v001-claude-forecast-drawer-all-points.md`
Related TODO: #75, ekki enn skráð í `TODO.md` samkvæmt v001

---

## Findings fyrst

1. **V001 er rétt í megindráttum, en vantar sterkasta product-value punktinn:** skúffan á ekki bara að spegla Yr/met.no töflu. Hún á að sýna hvernig vindur, hviður, úrkoma og hiti þróast milli klukkustunda, því það er akkúrat það sem fólk þarf að lesa úr þegar ferðaveður er metið.

2. **Ekki senda bara hrá `HourPoint[]` hugsunarlaust fyrir alla punkta fyrr en payload er mælt.** Leið getur verið miklu fleiri en 20 punktar. Fyrsta útgáfa má samt vera einföld, en þá á að takmarka við nytsamlegan glugga, t.d. 24-48 klst frá núna eða kringum ETA-gildi, og mæla payload eftir breytingu.

3. **Trend-reikningur á að vera shared helper, ekki UI-ad-hoc.** `lib/weather/travel.ts` hefur nú þegar `summaryForWindow.nextForecast.trend` lógík. Færum þessa hugsun í hreinan helper sem má unit-testa og nota í skúffunni.

4. **Active slot mode má ekki nota stale `summaryForWindow` sem highlight.** Ef notandi hefur valið brottfarartíma í timeline/heatmap, á skúffan að highlighta spáklukkustundina sem passar við valda brottför/ETA fyrir þann punkt, ekki default summary-window.

5. **Per-point linkarnir eiga að verða nytsamlegir og einfaldir:** `Yr`, `Teskeið`, `Google Maps`. `Teskeið` opnar innri skúffu. `Yr` fer á manneskjulega Yr-síðu. `Google Maps` opnar stað. `Hrá met.no gögn` á ekki að vera almennur notendahlekkur í fyrstu útgáfu; halda honum bara debug/admin ef hann þarf að lifa.

---

## Stebbi product input sem v002 bætir við

Stebbi vill ekki bara lista fleiri spágildi. Hann vill sýna skýrt í hverri línu hvernig gildin eru að þróast milli klukkustunda.

Markmiðið: Teskeið gefi auka innsýn umfram Yr. Dæmi:

- vindur hækkar eða lækkar frá síðustu klst.
- hviður aukast eða róast
- úrkoma er að koma inn, dala eða haldast svipuð
- hitastig breytist
- heildarmat batnar, versnar eða helst svipað

Textinn á að vera hjálplegur, ekki drama. Dæmi um línu:

`Vindur: 6,2 m/s, lækkar um 1,0 · Úrkoma: 0,6 mm/klst, eykst um 0,3 · Hiti: 10,7°C, svipað`

Eða meira compact mobile:

`Vindur 6,2 m/s ↓1,0 · Úrkoma 0,6 ↑0,3 · Hiti 10,7°C →`

---

## Tillaga að scope fyrir Claude Code

### 1. Skrá TODO #75 fyrst

Ef `TODO.md` hefur ekki #75, bæta við opnu atriði áður en kóða er breytt.

Stutt heiti:

`#75 Veðurspáskúffa fyrir alla spápunkta með þróun milli klukkustunda`

Staða:

`Í vinnslu` ef Claude byrjar strax, annars `Bíður`.

### 2. Búa til forecast-row model

Ekki binda UI við raw met.no `HourPoint`. Betra er að server/helper búi til compact row model.

Tillaga:

```ts
type ForecastTrendDirection = 'up' | 'down' | 'steady'

type ForecastMetricTrend = {
  direction: ForecastTrendDirection
  delta: number
  label: 'hækkar' | 'lækkar' | 'svipað' | 'eykst' | 'minnkar'
}

type ForecastDrawerRow = {
  timeIso: string
  status: WeatherStatus
  windMs: number
  gustMs: number
  precipMmPerHour: number
  airTemperatureC: number
  trends: {
    wind: ForecastMetricTrend
    gust: ForecastMetricTrend
    precip: ForecastMetricTrend
    temp: ForecastMetricTrend
    overall: 'batnar' | 'versnar' | 'svipað'
  }
}
```

Athugið: heiti og textar mega fara í messages, en lógíkin á að vera typed/helper, ekki inline JSX.

### 3. Reikna trend með varfærnum þröskuldum

Samanburður: hver row berist við næstu fyrri forecast-row.

Mældur threshold til að forðast noise:

- vindur/hviður: breyting undir `0.5 m/s` = `svipað`
- úrkoma: breyting undir `0.1 mm/klst` = `svipað`
- hiti: breyting undir `0.5°C` = `svipað`
- overall: nota status severity fyrst (`rautt > gult > graent`), síðan vind/hviðu/úrkomu sem tie-breaker

Fyrsta row hefur ekki fyrri samanburð. Sýna frekar `Upphaf` eða sleppa trend badges þar.

### 4. Data/payload stefna

V001 stingur upp á `forecastHours?: HourPoint[]` á `RouteWeatherPoint`. Það er einfalt, en getur stækkað svarið talsvert ef leiðin hefur 58-80 punkta.

Codex mælir með:

- Fyrsta val: senda compact `forecastRows?: ForecastDrawerRow[]`, ekki full raw `HourPoint[]`.
- Takmarka tímaglugga í fyrstu útgáfu, t.d. 48 klst frá núna eða 24 klst í kringum ETA eftir því hvað er auðveldara í kóða.
- Mæla response-stærð í dev fyrir Akranes, Egilsstaðir og langa hringvegsleið ef til.
- Ekki bæta við nýjum met.no köllum í v1 nema Stebbi samþykki sérstaklega. Gögnin eru nú þegar sótt á server fyrir spápunktana.

Ef Claude velur raw `forecastHours` í fyrstu útgáfu, skal skrá það sem meðvitaða einföldun og setja payload-mælingu í handoff.

### 5. UI leiðbeiningar

Spáskúffa á að vera mobile-first.

Forðast breiða desktop-töflu sem þarf horizontal scroll á síma. Betra:

- ein card/row per klukkustund
- tími efst: `Fös. 10. júl 23:00`
- litað status-chip: `Gott veður`, `Óþægilegt`, `Varasamt`, eða `Ófullnægjandi gögn`
- mæligildi í einni til tveimur línum
- trend sem stutt texta/arrows: `lækkar um 1,0`, `eykst um 0,3`, `svipað`
- highlighted row fyrir tímann sem Teskeið notaði í matinu, með label:
  `Spáin sem Teskeið notar í matinu`

Per-point action row í `RoutePointRow`:

- `Yr`
- `Teskeið`
- `Google Maps`

`Teskeið` er button sem opnar skúffuna. Ekki láta hann líta út eins og external link ef hann er internal action.

### 6. Active-candidate highlight

Regla:

- Ef heatmap/timeline slot er valinn: highlighta forecast hour sem samsvarar ETA á þann punkt fyrir valda brottför.
- Ef punkturinn er active decisive/display point: nota `activeCandidate.displayPoint.forecastTimeIso`.
- Fyrir aðra punkta í active mode: reikna ETA með `estimatePointEtaIso(activeCandidate, pt, activeLeg)` og velja næsta forecast hour í skúffunni.
- Ef ekkert active mode: nota `pt.summaryForWindow?.forecastTimeIso`.

Ekki nota stale `summaryForWindow` metrics sem "valda klst" í active mode.

---

## Kostnaðarmat

Beinn peningakostnaður ætti ekki að aukast ef:

- við endurnýtum met.no gögn sem server er þegar búinn að sækja
- `Yr` er bara external URL
- `Google Maps` er bara maps URL, ekki nýtt Maps API/Routes kall

Raunveruleg áhætta er ekki billing heldur:

- JSON payload stærð
- mobile rendering performance
- að notandi ruglist á `Yr` vs `Teskeið`
- að trend verði of noise-y ef þröskuldar eru of lágir

---

## Skrár sem Claude Code ætti líklega að snerta

- `TODO.md` ef #75 er ekki skráð.
- `lib/weather/types.ts` fyrir compact drawer row type eða `forecastRows`.
- `lib/weather/travel.ts` eða nýr helper í `lib/weather/forecast-trends.ts` fyrir trend calculation.
- `lib/__tests__/weather-travel.test.ts` eða ný test file fyrir trend helper.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` fyrir drawer state og per-point `Teskeið` action.
- `messages/is.json` og `messages/en.json` fyrir alla nýja UI-texta.

Muna `Design.md` ef UI/layout breytist.

---

## Prófin sem ég myndi vilja sjá

Unit tests:

- wind/gust trend: up/down/steady með 0.5 m/s threshold
- precip trend: up/down/steady með 0.1 mm/klst threshold
- temp trend: up/down/steady með 0.5°C threshold
- overall trend: green -> yellow = `versnar`, yellow -> green = `batnar`, same status + lower wind = `batnar` eða `svipað` eftir threshold
- first row has no previous trend

Type/build:

- `npm run type-check`
- `npm run test:run`
- `npm run build` ef breytingin snertir client/server boundary eða messages

Manual payload sanity:

- Skrá í Claude handoff hversu stórt `/travel/evaluate` eða viðeigandi response varð fyrir stutta og langa leið ef auðvelt er að mæla.

---

## Localhost checks for Stebbi

Opna `http://localhost:3004/auth-mvp/vedrid` eða það localhost-port sem Stebbi er þegar með í gangi.

Prófa:

1. Reikna leið Garðabær -> Akranes.
2. Opna `Allir spápunktarnir á leiðinni`.
3. Smella á `Teskeið` hjá venjulegum punkti og líka hjá mest krefjandi punkti.
4. Staðfesta að skúffan opnist án þess að opna nýjan tab.
5. Staðfesta að hver klukkustund sýni vind, hviður ef við á, úrkomu, hita og þróun frá fyrri klst.
6. Staðfesta að valda/assessed klukkustundin sé highlighted.
7. Smella á annan brottfarartíma í timeline og opna aftur skúffu fyrir sama punkt.
8. Staðfesta að highlighted klukkustund færist með valda brottfarartímanum.
9. Prófa í mobile viewport, t.d. 390px breidd: enginn horizontal scroll, enginn full-width desktop table, close button aðgengilegur.
10. Staðfesta að `Yr` opni Yr, `Google Maps` opni kort og `Teskeið` opni innri skúffuna.

Regression sem þarf að passa:

- Ekki missa úrkomu/hita af route point cards.
- Ekki endurvekja `Ófullnægjandi gögn` pillu þegar allir punktar hafa raunverulegt mat.
- Ekki bæta við nýjum met.no eða Google billing-köllum óvart.
- Ekki senda raw place IDs, lat/lon history eða notendagögn í logs.

---

## Codex niðurstaða

Halda áfram með #75, en breyta v001 scope svona:

`Spáskúffa fyrir alla punkta` + `þróun milli klukkustunda` er sama verkefni, ekki tvö aðskilin verkefni.

Það er þessi þróun sem gerir Teskeið gagnlegra en bara "opna Yr frá hverjum punkti".
