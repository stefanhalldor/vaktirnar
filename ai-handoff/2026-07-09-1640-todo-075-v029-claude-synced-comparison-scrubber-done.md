# Handoff: TODO #75 v029 — Synced comparison scrubber done

Created: 2026-07-09 16:40
Timezone: Atlantic/Reykjavik
Staða: Framkvæmt, type-check og tests grænir, ekki commitað

---

## Hvað var gert

### v028 vandamál leyst

- Falleg `airTemperatureC ?? 0` samanburðarröng: v027 static block fjarlægt að fullu. Nýr scrubber notar `ForecastDrawerRow.temperature.value` beint — alltaf gilt.
- Hviðar bætt við: sýndar þegar gust > wind í hvorum röð um sig.
- Íslenski fyrirsögnin: breytt í `Brottför og áfangastaður` (mun skýrari).
- Samanburðarsetning fjarlægð (var v027-aðferðin, kemur ekki aftur).

### Nýr synced comparison scrubber (Phase A)

**Section heading:** `Brottför og áfangastaður`

**Gögn:**
- Brottfararstaður: `routeWeatherPoints.find(p => p.isOrigin).forecastRows`
- Áfangastaður: `travelPlan.destinationForecastRows`
- Báðar dálkaröðir nota sömu tímastigasetningin: ein dálkur per dagur, kl. 12:00 UTC (=IS), max 5 dagar.
- Tolerance: 90 mínútur — ef engin gögn á báðum hliðum á þeim tíma er dálkurinn sleppt.

**Layout:**
- `overflow-x-auto` utan um `inline-grid` — ein scroll-eining, báðar raðir rullar saman.
- Grid: `5.5rem [nafn] + repeat(N, 5rem) [dagar]`.
- 3 raðir: header (dagsetning + "kl. 12"), brottfararstaður, áfangastaður.
- Per cell: vindur m/s (rautt/gult ef yfir mörkum), hviður /X.X ef gust > wind, úrkoma mm, hiti °C.

**Þröskuldlitun:** `row.status` (þegar reiknað með `thresholdsUsed`):
- `rautt` → `text-destructive`
- `gult` → `text-amber-600 dark:text-amber-500`
- `graent` / `no_data` → meðalstigi (erfðir)

**"Skoða samanburð nánar":** Opnar spáglugga áfangastaðar (Phase B drawer búinn til seinna).

### Nýr helper: `buildKl12Columns`

Bætt við neðst í `FerdalagidClient.tsx` við hliðina á `nearestForecastIso`:

- Safnar saman einstaka dagsetningum úr báðum röðunum.
- Finnur nálægstu röð innan 90 mínútna frests.
- Skilar `Kl12Col[]` með `dayLabel`, `timeLabel`, `origin`, `dest`.
- Staðbundinn dagsetningarsnið: IS og EN með `getUTC*()` (Ísland = UTC+0).

### Þýðingalyklar

Fjarlægðir (10):
`weatherHuntersSection`, `weatherCompareOriginAt`, `weatherCompareOriginForecastBtn`, `weatherCompareSimilar`, `weatherCompareDestWindier/Calmer/Wetter/Drier/Warmer/Colder`

Bætt við (2):
- `weatherCompareSection` = "Brottför og áfangastaður" / "Departure and destination"
- `weatherCompareViewMore` = "Skoða samanburð nánar" / "View detailed comparison"

---

## Niðurstöður

```
Type-check: PASS (0 villur)
Tests: 1958 pass, 27 skipped, 8 todo — PASS
```

---

## Skrár breyttar

- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — static block skipt út, `buildKl12Columns` bætt við
- `messages/is.json` — 10 lyklar fjarlægðir, 2 bætt við
- `messages/en.json` — 10 lyklar fjarlægðir, 2 bætt við

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid`, keyra leið (Garðabær -> Akranes eða Garðabær -> Akureyri)
2. Skruna niður í summary kortinu — "Brottför og áfangastaður" birtist neðst, fyrir disclaimer
3. Staðfesta: tveir nafn-dálkar til vinstri (brottfararstaður + áfangastaður), dagatals-dálkar til hægri
4. Staðfesta: dálkarnir sýna "fim. 10. júl" o.s.frv. með "kl. 12" undir
5. Rullaðu lárétt: báðar raðir (brottfararstaður og áfangastaður) hreyfast saman
6. Staðfesta: vindur, hviður (ef gust > wind), úrkoma mm, hiti°C í hverri reitu
7. Staðfesta: rauðar/gular reiti þegar veðurmörk eru farin yfir (ef til staðar)
8. Staðfesta: engar reiti með "–" nema gögn vantar
9. Smella á "Skoða samanburð nánar" — spágluggi áfangastaðar opnast
10. Staðfesta: ekkert lárétt yfirflæði á 360px og 390px utan scroll-svæðisins
11. Staðfesta: summary kortið, kortið, "Á leiðinni" hlutinn, og spágluggi virka eins og áður

---

## Phase B — Skoða samanburð nánar (eftir)

Ekki hluti af þessum phase. Þarf samþykki Stebbi:
- Drawer/sheet með stillanlegum tímastimpum (kl. 12 / morgun-hádegi-kvöld / 3 klst fresti / sérsniðið)
- Samræmdar raðir brottfararstaðar og áfangastaðar í drwernum

---

## Hvað er eftir

- Commit + push (þegar Stebbi staðfestir)
- Phase B comparison drawer (þarfnast sérstaks samþykkis)
- Design.md IS-þýðing á "Structured summary panels" (P3, frestað)
