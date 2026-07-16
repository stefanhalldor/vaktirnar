# TODO 085 - Claude Code: Prerelease handoff v005

Created: 2026-07-11 10:10
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Prerelease — tilbúið til rýni
Related TODO: #85 Wind threshold simplification

---

## Staða

Allar 10 framkvæmdarskrefin (per Codex v003) eru lokið. `tsc --noEmit` skilar engu. 107 prófanir standast.

---

## Breytingar í þessari prerelease

### lib/weather/assessment.ts
- Bætti við `WindDistanceLabel` type (5 gildi: `innan-marka` til `haettulegt`)
- Bætti við `classifyWindDistance()` hreinni fallsíðu

### lib/__tests__/weather-wind-distance.test.ts (ný)
- 9 grensumárspróf sem staðfesta boundary-reglur (< 2 m/s = nákvæmlega < 2)

### app/auth-mvp/vedrid/FerdalagidClient.tsx
- `WizardStep` og `STEP_ORDER`: fjarlægði `'trailer'` — 3 skref: Leið, Veðurmörk, Niðurstaða
- `WIND_STATUS_META` map: 5 display labels með emoji icon, dotClass, labelClass
- `handleThresholdSubmit`: alltaf `redGustMs=100`, `cautionPrecipMmPerHour=100` — aldrei stillanleg
- Threshold form: fjarlægði gust/precip ThresholdInput svæði; bætti við `thresholdGustCautionNote` texta
- Step nav threshold summary: vindur eingöngu (`caution/red` m/s)
- `navThreshValues`: `{caution, red}` eingöngu
- "Á leiðinni" staða: notar `classifyWindDistance()` + `windMeta.icon` + `windMeta.labelKey`
- Point detail card badge (`graent`): notar `statusWithinLimits` í stað `heatmapLegendGreen`

### components/weather/DepartureHeatmap.tsx
- Filtarchip `graent` label: `heatmapLegendGreen` → `statusWithinLimits`

### components/weather/TravelAuditMap.tsx
- Filtarchip `graent` label: `heatmapLegendGreen` → `statusWithinLimits`

### messages/is.json + messages/en.json
- Bætti við: `statusWithinLimits`, `statusNearDiscomfort`, `statusUncomfortable`, `statusNearDanger`, `statusDangerous`
- Bætti við: `thresholdGustCautionNote`
- Uppfærði: `heatmapLegendGreen` → "Innan marka" / "Within limits"
- Uppfærði: `timelineEmptyGreenHidden` — "Gott veður" → "Innan marka"
- Uppfærði: `thresholdsSubtitle` — einlægt vindmörk, engin litun nefnd
- Uppfærði: `stepNavThresholdSummaryAria` — fjarlægði `{gust}` og `{precip}` params

---

## Þætti sem eru ÓBREYTTIR

- Internal `WeatherStatus = graent | gult | rautt` — óbreytt
- `trailerKind` state er enn til staðar í FerdalagidClient en er alltaf `'none'`
- `assessDrivingConditions()`, `assessRouteLeg()` — óbreyttir
- Trailer assumptions card í niðurstöðu — enn til (útlítur er skylt í öðrum TODO)
- `heatmapLegendYellow` og `heatmapLegendRed` — óbreytt (notaður enn í kóða)
- `departureStatusGreen/Yellow/Red` — í messages en ekki notaðir lengur í kóða

---

## Localhost-athuganir fyrir Stebba

1. Opnaðu `/vedrid` í farsímaskoðun (360-460px)
2. Staðfestu að `Eftirvagn` skref sé horfið — 3 skref: Leið · Veðurmörk · Niðurstaða
3. Á Veðurmörk: eingöngu `thresholdCautionWind` og `thresholdRedWind` reitir
4. Gust/úrkoma reitir eru horfnir
5. `thresholdGustCautionNote` texti sýnilegur á Veðurmörk skrefinu
6. Step nav threshold summary sýnir `XX/YY m/s` (vindur eingöngu)
7. Veldu mörk þar sem vindur er örugglega undir óþægilegum mörkum → "Á leiðinni" sýnir `🙂 Innan marka` í grænum lit
8. Veldu mörk þar sem vindur er < 2 m/s undir óþægilegum mörkum → `😬 Nálgast óþægindi` í gulum lit
9. Veldu mörk þar sem vindur er yfir óþægilegum en > 2 m/s undir hættu → `😟 Óþægilegt` í appelsínugulum lit
10. Veldu mörk þar sem vindur er < 2 m/s undir hættumörkum → `😰 Nálgast hættumörk` í rauðum lit
11. Veldu mörk þar sem vindur er yfir hættumörkum → `⚠️ Hættulegt` í rauðum lit
12. DepartureHeatmap filtarchip: "Gott veður" → "Innan marka"
13. Point detail card badge: "Gott veður" → "Innan marka"
14. Engin mobile overflow við 360-460px

---

## Opnar spurningar til Codex

Engar. Framkvæmdin er samkvæmt Codex v003 plan.

**Eitt til að staðfesta:** `departureStatusGreen/Yellow/Red` í messages eru nú dauðar lyklar (kóðinn notar `windMeta.labelKey` og `heatmapLegendRed/Yellow`). Má Codex staðfesta hvort þurfi að hreinsa þær upp í sér commit?
