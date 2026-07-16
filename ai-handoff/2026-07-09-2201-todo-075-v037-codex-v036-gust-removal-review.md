# Codex review: TODO #75 v036 - hviður teknar út

Created: 2026-07-09 22:01
Timezone: Atlantic/Reykjavik
Rýnir á: `2026-07-09-2157-todo-075-v036-claude-v035-gust-removal-review.md`
Tengist: TODO #75, v035 `2026-07-09-2153-todo-075-v035-codex-remove-gusts-data-correction.md`

## Findings

### Blocking: v036 vantar skyldukaflann `Localhost checks for Stebbi`

`ai-handoff/README.md` og `AGENTS.md` krefjast að öll implementation plan, handoff og review skjöl innihaldi `Localhost checks for Stebbi`. v036 er gott tæknilegt review, en það má ekki nota óbreytt sem handoff til framkvæmdar fyrr en þessi kafli er kominn inn.

### Blocking: v036 er með mótsögn um `lib/weather/tools.ts`

v036 mælir með fullri týpuhreinsun í einum pass og að byrja á að fjarlægja `HourPoint.windGustMs`. Samt segir það að `lib/weather/tools.ts` eigi að vera utan scope.

Það gengur ekki saman nema annað af þessu sé gert:

1. `lib/weather/tools.ts` er líka lagað í þessum pass, að minnsta kosti þannig að það hvorki notar né birtir hviður.
2. `HourPoint.windGustMs` er tímabundið látið lifa sem deprecated compatibility field, en allt user-facing ferðaveður, thresholds, summaries, drawer, comparison og map hættir að nota það.

Mín ráðlegging: vegna þess að Stebbi sagði “allt hviðutengt út”, á Claude Code ekki að skilja eftir user-facing hviður í `tools.ts` nema það sé staðfest að þessi kóði sé algjörlega óaðgengilegur notendum. Ef `tools.ts` getur skilað texta eða mati til notanda, á það að fara með í þessum pass.

### Blocking: API má ekki rejecta eldri clients með `redGustMs`

v036 nefnir þetta rétt, en framkvæmdin þarf að vera nákvæm:

- Fjarlægja `redGustMs` úr virkum validation og úr `resolveThresholds` inputi.
- Ekki henda 400 ef body inniheldur legacy `redGustMs`.
- Ekki senda `redGustMs` áfram í `thresholdsUsed`.
- Ekki birta `redGustMs` í client summary eða aria texta.

Þetta þarf líklega að sannreyna með API-prófi eða unit-prófi sem sendir legacy `thresholdOverrides.redGustMs` og staðfestir að requestið fari í gegn án þess að reiturinn hafi áhrif.

### Blocking: ferðamatið sjálft má ekki nota fallback-hviður

`lib/weather/forecast.ts` er núna með `windGustMs: d.wind_speed_of_gust ?? d.wind_speed ?? 0`. Þetta er einmitt vandinn: þegar hviðsgögn vantar verður “hviða” bara endursögð sem vindur eða hálfgerður fallback.

Claude Code þarf að tryggja að:

- `evalDrivingLeg` taki ekki gust argument.
- `TravelIssue.metric` geti ekki orðið `gust`.
- `decisiveMetric` geti ekki orðið `gust`.
- `worstGust`, `worstGustMs`, `displayPoint.gustMs`, `arrivalWeather.gustMs`, `nextForecast.gustMs` hverfi eða verði ekki notuð í travel response.
- Tests sem áður sönnuðu gust-decisiveness séu fjarlægð eða endurskrifuð sem wind/precip tests.

### Medium: fully type-driven cleanup er rétt, en byrjið á diff-stöðu

v036 segir að það séu ócommittaðar weather-breytingar. Ég gat ekki staðfest tracked modified skrár með `git status --short --untracked-files=no` núna; skipunin skilaði bara git ignore permission warning. Það eru hins vegar margar untracked handoff-skrár.

Claude Code á samt að keyra:

```powershell
git status --short --untracked-files=no
git diff -- app/auth-mvp/vedrid/FerdalagidClient.tsx components/weather lib/weather messages lib/__tests__
```

áður en kóða er breytt. Markmiðið er að vernda nýlegar veðurbreytingar og ekki skrifa yfir vinnu úr v033-v036.

### Medium: fully “no hviður” þarf líka að ná yfir messages og a11y

`rg` sýnir hviðutexta í `messages/is.json` og `messages/en.json`, þar á meðal:

- beta banner
- loading step
- metric labels
- forecast drawer labels
- how-assessed copy
- threshold labels
- threshold summary line
- step nav aria summary

Það þarf að fjarlægja hviður úr íslensku og ensku, ekki bara fela UI elements. Annars lekur hugtakið áfram í skjálesara, loading texta eða hidden labels.

### Medium: Design.md þarf að stýra UI cleanup

Ég las `Design.md`. Þessi breyting snertir UI, þannig að Claude Code þarf að fylgja sérstaklega:

- mobile-first við 360, 390 og 460 px
- engin lárétt overflow í comparison strip eða forecast drawer
- structured summary panels: stutt labels, ekki endurtekið status-dot, ekki laus paragraph-stafla
- status-litir mega ekki vera eina merkingin
- texti og controls mega ekki skarast þegar dálkum fækkar

Þetta skiptir máli þegar hviðudálkar og threshold controls hverfa. Grid og spacing mega ekki skilja eftir tómt gat.

### Medium: öryggistexti má nefna hviður sem ytri athugun

Stebbi vill breyta neðsta öryggis-/athugunartextanum úr almennu “við búum á Íslandi” copy í skýrari attention texta:

> Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.

Þetta er ekki mótsögn við að fjarlægja hviður úr Teskeiðarútreikningum. Reglan er:

- Teskeið má ekki reikna, flokka, bera saman eða birta hviðugildi úr eigin spágögnum.
- Teskeið má vísa notanda á Vegagerðina til að athuga hviður og færð sérstaklega.

Setja þetta inn í `Á leiðinni` boxið, undir vind/úrkomu/hita línuna eða sem compact attention sub-row innan sama structured summary kafla. Ekki setja þetta sem lausan footer neðst í summary cardinu. Nota `attention`/info ham, ekki rauða villu: ljós amber eða hlýr neutral bakgrunnur, fíngerð border/vinstri lína, lítið info/warning icon ef það passar við núverandi UI. Linka “vef Vegagerðarinnar” á `https://umferdin.is/`.

## Verdict

v036 er directionally rétt og ætti að fara áfram, en ekki óbreytt.

Ég myndi nota v036 sem grunn með þessum breytingum:

1. Bæta við `Localhost checks for Stebbi`.
2. Ákveða skýrt hvað gerist með `lib/weather/tools.ts`; ekki skilja eftir user-facing hviður.
3. Gera API legacy `redGustMs` ignore prófanlegt.
4. Fjarlægja hviður úr decision-making, response types, UI, copy og tests í sama pass eða halda `HourPoint.windGustMs` tímabundið sem ósýnilegu compatibility field þar til `tools.ts` er hreinsað.

## Recommended implementation scope

### In scope

- `lib/weather/types.ts`
- `lib/weather/forecast.ts`
- `lib/weather/thresholds.ts`
- `lib/weather/travel.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/ForecastDrawer.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `messages/is.json`
- `messages/en.json`
- weather/travel/map/forecast tests that mention gust or hviður
- `lib/weather/tools.ts` if reachable by any user-facing weather feature
- attention/info text inside the `Á leiðinni` summary box, using Stebbi's approved copy and a link to `https://umferdin.is/`

### Out of scope

- SQL
- Supabase/RLS/auth/secrets
- route-fidelity/Mapbox work
- visual redesign beyond removing hviður cleanly
- commit, push, deploy

## Safer sequencing for Claude Code

1. Run focused git status and diff before edits.
2. Start with `types.ts`, but only remove `HourPoint.windGustMs` immediately if `tools.ts` is included in the same pass.
3. Remove gust from threshold model and validation, keeping legacy request bodies tolerated.
4. Remove gust from travel scoring and route summaries.
5. Remove gust from drawer/comparison/map/detail UI and message keys.
6. Update tests to assert no gust output and no rejected legacy `redGustMs`.
7. Run `npm run type-check`, `npm run test:run`, and `npm run build`.
8. Have Stebbi do localhost checks below before release.

## Localhost checks for Stebbi

Prófa á localhost eftir að Claude Code skilar breytingu, áður en útgáfa er samþykkt:

1. Opna `/auth-mvp/vedrid` sem innskráður notandi.
2. Velja leið sem þú hefur notað áður, t.d. Garðabær -> Akranes eða Akureyri -> Garðabær.
3. Fara í veðurmörk/stillingar:
   - Það á ekki að vera hviðamark.
   - Threshold summary á aðeins að tala um vind og úrkomu.
   - Step/nav aria-visible texti má ekki sýna `10/15/18` eða hviðugildi.
4. Reikna leið:
   - Scrubber, summary box, “Á leiðinni”, “Áfangastaður”, map marker/detail og “Allir spápunktarnir” mega hvergi sýna `hviður`, `hvið.`, `gust`, `gusts` eða hviðutölu.
   - Mat má enn vera grænt/gult/rautt út frá vindi og úrkomu.
   - “Mest krefjandi” á að sýna vind, úrkomu og hita áfram.
5. Opna forecast drawer með `Spá`/teskeið-spá:
   - Taflan á að sýna hita, vind og úrkomu.
   - Enginn hviðudálkur, engin hviðusublína, engin hviðutengd viðvörun.
   - Sticky header og controls mega ekki skilja eftir tómt pláss.
6. Skoða “Fyrir þá sem eru að elta veðrið” comparison:
   - Engar hviður á summary eða detail.
   - Hitastig, vindur og úrkoma eru enn sýnd og lituð rétt.
   - Mobile drawer á 360-390 px breidd má ekki valda horizontal overflow.
7. Prófa íslensku og ensku ef tungumálaskipti eru auðveld:
   - Hvorugt locale má innihalda gust/hviður í visible texta.
8. Regression:
   - Saved places eiga enn að virka.
   - Route calculation á enn að skila niðurstöðu.
   - Map marker selection á enn að uppfæra detail spjald.
   - Forecast drawer opnast/lokast án scroll-brota.
9. Öryggis-/attention texti í `Á leiðinni` boxinu:
   - Textinn á að vera: “Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.”
   - “vef Vegagerðarinnar” á að linka á `https://umferdin.is/`.
   - Textinn á að vera inni í `Á leiðinni` kaflanum/boxinu, ekki sem almennur texti neðst í öllu summary cardinu.
   - Boxið á að líta út eins og hóflegt attention/info box, ekki rauð villa.
   - Þetta er eini staðurinn þar sem hviður mega koma fyrir í visible UI eftir breytinguna.

Ekki þarf að prófa Supabase, RLS, auth, secrets eða production gögn fyrir þessa breytingu. Ekki keyra migration. Ekki deploya fyrr en type-check, tests, build og localhost review eru græn.

## Commands run by Codex for this review

- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Date -Format yyyy-MM-dd-HHmm`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-09-2157-todo-075-v036-claude-v035-gust-removal-review.md`
- `git status --short`
- `git status --short --untracked-files=no`
- `rg -n "gust|Gust|hvið|Hvið|redGust|windGust|worstGust" lib components app messages --glob '!node_modules'`
- `Get-Content -Encoding UTF8 Design.md`
