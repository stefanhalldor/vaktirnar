# TODO-071 v020 - Claude Code post-release handoff - displayPoint weather details fix

Created: 2026-07-08 17:55
Timezone: Atlantic/Reykjavik
Author: Claude Code
Status: Released. Commit 940ce60. Vercel Ready (34s).

## Hvað var gert

Lagfærð tvöföld vandamál sem Stebbi sá á localhost eftir v014:

### 1. Map panel — `Mest krefjandi á leiðinni` sýndi aðeins eina mælingu

**Ástæða:** `buildPointSummary` í `travelAuditMap.helpers.ts` forcaði `isDisplayPoint = false` þegar punkturinn var bæði highlighted og displayPoint (`!isHighlighted && ...`). Þá notar map panel `summaryForWindow` / `highlightedIssue.value` — sem gaf aðeins eina mælingu (t.d. `Vindur: 10 m/s`).

**Lagfæring:** Fjarlægja `!isHighlighted` úr `isDisplayPoint` skilyrðinu. displayPoint vinnur núna jafnvel þegar punkturinn er versti punkturinn, svo map panel sýnir fulla línu: `Vindur: 10 m/s · Úrkoma: 0 mm/klst · Hiti: 10,3°C`.

`forecastTimeIso` á `PointSummary` bætt við til að nota `dp.forecastTimeIso` þegar displayPoint er til staðar.

`showSummaryMetrics` uppfært: `!activeCandidate || (isHighlighted && !isDisplayPoint)` — highlighted punktur sem er EKKI displayPoint notar enn summaryForWindow (fallback ef displayPoint vantar).

### 2. `Allir spápunktarnir á leiðinni` sýndi engar mælingar í active mode

**Ástæða:** `RoutePointRow` í active mode sýndi aðeins no-data copy og ekkert annað. Engar mælingar fyrir gula/rauða/græna punkta.

**Lagfæring:** Þegar `isActiveMode` og `activeCandidate.displayPoint?.routeIndex === pt.routeIndex` sýnir `RoutePointRow` núna:
- `Veðurspá á þessum stað kl. HH:MM` (displayPoint.forecastTimeIso)
- `Vindur: X m/s · Úrkoma: X mm/klst · Hiti: X°C` (displayPoint gildi)

Aðrir punktar í active mode (sem eru ekki displayPoint) sýna ETA og stöðu en engar mælingar — þar sem við höfum ekki active-safe gögn fyrir alla punkta. Þetta er viljandi og skjalfest.

No-data punktar halda áfram að sýna `heatmapNotAssessedDetail` og engar gamlar mælingar.

## Skrár breyttar

- `components/weather/travelAuditMap.helpers.ts` — `isDisplayPoint`, `showSummaryMetrics`, `forecastTimeIso`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `RoutePointRow` active mode displayPoint rendering
- `lib/__tests__/travelAuditMap.helpers.test.ts` — test uppfærður: highlighted+displayPoint á nú að nota displayPoint gildi

## Commands keyrðar

```
npm run type-check  # exit 0
npm run test:run    # 62 files, 1953 passed, 27 skipped, 8 todo — all green
git push            # 940ce60
vercel ls           # Ready, 34s
```

## Localhost checks for Stebbi

1. Reikna Garðabær -> Akranes.
2. Velja slot sem sýnir fulla línu í top-spjaldi (t.d. `Vindur: 10 m/s · Úrkoma: 0 mm/klst · Hiti: 10,3°C`).
3. Athuga map panel `Mest krefjandi á leiðinni` — á núna að sýna fulla veðurlínu, ekki bara eina mælingu.
4. Opna `Allir spápunktarnir á leiðinni` — versti/decisive punkturinn á að sýna `Veðurspá á þessum stað kl. HH:MM` og fulla mælingalínu.
5. Aðrir punktar (ekki displayPoint) sýna ETA og stöðu en engar mælingar — þetta er rétt.
6. Velja no-data slot — gráar raðir, `Ekki nóg gögn til að meta þennan brottfarartíma.`, engar gamlar mælingar.
7. Engin slot valin (sjálfgefin staða) — fullar `summaryForWindow` mælingar á öllum punktum.
8. Mobile 360-460 px — athuga wrapping og ekkert horizontal overflow.

## Opið eftir þessa útgáfu

- `sql/71_teskeid_usage_events.sql` ekki keyrð — Stebbi keyrir hana sérstaklega.
- `USAGE_EVENT_SECRET` ekki stillt í Vercel.
- TODO #74 (rannsókn á no_data ástæðum og nálgun) bíður.
