# TODO 085 - Claude Code: Prerelease handoff v007

Created: 2026-07-11 10:20
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Prerelease — tilbúið til rýni og localhost prófana
Related TODO: #85 Wind threshold simplification
Reviews: `2026-07-11-1010-todo-085-v006-codex-v005-prerelease-review.md`

---

## Staða

Öll P0/P1/P2 atriði úr Codex v006 eru leiðrétt. `tsc --noEmit` — engar villur. 107 prófanir standast.

---

## Leiðréttar villur (per Codex v006)

### P0 — API max validation hækkaður til að samræmast neutral gildum

`app/api/teskeid/weather/travel/route.ts`:
- `redGustMs` max: 50 → 100
- `cautionPrecipMmPerHour` max: 20 → 100

Viðmerking lögð við til skýringar. `handleSubmit` er nú í lagi að senda 100/100.

Aukabót: ef API skilar `thresholds_invalid`, fer notandinn aftur á Veðurmörk skref með field-level villu, í stað þess að lenda á tómri niðurstöðusíðu.

### P1 — Threshold inputs tómir sem sjálfgefið; krafist að bæði séu fyllt út

`app/auth-mvp/vedrid/FerdalagidClient.tsx`:
- `useEffect` á step change: fjarlægði prefill — drafts eru `''` á fyrstu komu á Veðurmörk
- `handleThresholdSubmit`: bætti við `thresholdRequiredError` villa ef annað hvort svæðið er tómt
- Eftir að notandi hefur sent inn og fer til baka: drafts geyma síðasta gildi sem notandinn sló inn
- `navThreshWind`: sýnir `null` ef ekkert hefur verið sent inn → nav sýnir "Veldu mörk"

`messages/is.json` + `messages/en.json`:
- Bætti við `thresholdRequiredError`: "Settu inn báð vindmörkin — óþægilegt og hættulegt."
- Bætti við `navThreshChooseLimits`: "Veldu mörk" / "Choose limits"

### P1 — Hviður fjarlægt úr öllum UI-yfirborðum

Eftirfarandi staðir sýna nú **ekki** "Hviður: X m/s":

| Skrá | Staður |
|---|---|
| `FerdalagidClient.tsx:982` | Arrival card |
| `FerdalagidClient.tsx:1047` | Comparison strip — origin row |
| `FerdalagidClient.tsx:1075` | Comparison strip — destination row |
| `FerdalagidClient.tsx:1316` | Comparison drawer — origin |
| `FerdalagidClient.tsx:1339` | Comparison drawer — destination |
| `FerdalagidClient.tsx:1742` | Point detail — active-candidate mode |
| `FerdalagidClient.tsx:1760` | Point detail — summary-for-window mode |
| `TravelAuditMap.tsx:719` | Audit map point summary |

Aftur á móti: `thresholdGustCautionNote` texti á Veðurmörk skrefi segir notanda að kanna hviður hjá Vegagerðinni.

### P2 — Threshold summary (DepartureHeatmap) sýnir nú eingöngu vindmörk

- `messages/is.json` + `messages/en.json`: `thresholdSummaryLine` uppfærður til "Veðurmörk: vindur {caution}/{red} m/s"
- Kóði í DepartureHeatmap sendir enn gust/precip params en þeir eru ónotaðir í nýja skilaboðastrenginn

### P2 — Gust sem ákvarðanastigi í DepartureHeatmap fallback fjarlægt

`DepartureHeatmap.tsx`: fallback-mælikvarðinn (`metric`) er nú alltaf `'wind'` eða `'precipitation'` — aldrei `'gust'`. Tengd TypeScript-villur lagfærðar.

---

## Localhost-athuganir fyrir Stebba

1. Opnaðu `/vedrid` í farsímaskoðun (360-460px)
2. Veldu upphafsstað og áfangastað
3. Smelltu "Áfram" → lendirðu á Veðurmörk
4. **Staðfestu**: báðar threshold-reitir eru **tómar** (ekki 15 / 25)
5. Smelltu "Reikna ferðina" með tómum reitum → **staðfestu** villuboð: "Settu inn báð vindmörkin..."
6. Fylltu eingöngu einn reit → staðfestu sömu villu
7. Fylltu báða reiti (t.d. 15 og 25) → "Reikna ferðina" → niðurstaða **án** "Ógilt gildi" villu
8. Athugaðu "Á leiðinni" — sýnir eitt af: 🙂 Innan marka / 😬 Nálgast óþægindi / 😟 Óþægilegt / 😰 Nálgast hættumörk / ⚠️ Hættulegt
9. Skoðaðu arrival card, samanburðarstrip, öll route-point kort, audit map — **ekkert** "Hviður: X m/s"
10. Gust caution texti á Veðurmörk er enn til staðar
11. Step nav sýnir "Veldu mörk" fyrir threshold step meðan ekkert hefur verið sent inn
12. Eftir send inn: step nav sýnir "XX/YY m/s"
13. DepartureHeatmap filtarchip: "Innan marka" (ekki "Gott veður")
14. Threshold summary undir heatmap: "Veðurmörk: vindur XX/YY m/s" (ekki gust/precip)
