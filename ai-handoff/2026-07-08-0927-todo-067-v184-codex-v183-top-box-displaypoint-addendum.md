# Codex addendum - v183 displayPoint + brottfararbox

Dagsetning: 2026-07-08 09:27

Input frá Stebba:

- `2026-07-08-0925-todo-067-v183-claude-v182-displaypoint-prerelease`
- Stebbi vill skoða hvort efra brottfararboxið eigi að samnýta upplýsingarnar úr neðra `Mest krefjandi á leiðinni` boxinu.
- Neðra `Mest krefjandi á leiðinni` boxið á að haldast óbreytt.

## Findings

Engin blocker-finding kom upp í v183 varðandi upprunalega v182 vandann. v183 virðist hafa komið `displayPoint` réttu megin inn í map/detail flæðið: neðra kortið getur nú sýnt active-candidate-safe vind, úrkomu, hita og spátíma fyrir valinn departure slot.

Það sem stendur eftir sem polish/UX-atriði er að efra brottfararboxið notar enn eldri `worstWind` / `worstGust` / `worstPrecip` leiðina í `SlotDetail`, og sýnir því bara vegalengd + eina mælingu. Sjá `components/weather/DepartureHeatmap.tsx:265`, `components/weather/DepartureHeatmap.tsx:315`, `components/weather/DepartureHeatmap.tsx:332` og `components/weather/DepartureHeatmap.tsx:336`.

Þetta er ekki nauðsynlega release-blocker ef v183 scope var bara að laga neðra detail-boxið, en ég mæli með að klára þetta áður en prerelease fer út ef Stebbi vill að efra og neðra boxið segi sömu sögu.

## Recommendation

Ég er sammála hugmynd Stebba: samnýta sömu upplýsingar upp í efra brottfararboxið.

Efra boxið er decision summary: notandinn er að bera saman departure slots og þarf að sjá fljótt hvers vegna þessi brottför er í lagi eða krefjandi. Neðra boxið er audit/detail: það má áfram geyma nákvæmari línur, linka og punktaupplýsingar.

Tillaga að efra boxi:

```text
Brottför: kl. 09:22 · Komutími: kl. 17:02

Mest krefjandi er 501 km frá Garðabæ, kl. 15:24
Vindur: 6,8 m/s · Úrkoma: 0,1 mm/klst · Hiti: 15,2°C
```

Mikilvægt: `kl. 15:24` í þessari línu er áætlaður tími bílsins á þessum route point, ekki spátíminn. Neðra boxið getur áfram sýnt bæði:

```text
Áætlaður tími 501 km frá Garðabæ: kl. 15:24
Veðurspá á þessum stað kl. 16:00
```

## Suggested implementation for Claude Code

Notið `candidate.displayPoint` sem primary source fyrir efra `SlotDetail` þegar það er til staðar.

Núna er `CandidateDisplayPoint` í `lib/weather/types.ts:103` með:

- `routeIndex`
- `forecastTimeIso`
- `windMs`
- `gustMs`
- `precipMmPerHour`
- `airTemperatureC`
- `metric`

Fyrir efra boxið vantar sjálfstætt annað hvort:

- `distanceFromOriginM` og `routeFraction` á `CandidateDisplayPoint`, svo UI geti reiknað leg distance og ETA eins og map helper gerir; eða
- `distanceFromLegStartM` og `etaIso` beint á `CandidateDisplayPoint`, sem er enn þægilegra fyrir `DepartureHeatmap`.

Ég myndi velja minnstu öruggu viðbótina:

1. Bæta við `distanceFromOriginM` og `routeFraction` á `CandidateDisplayPoint`.
2. Setja þau í `lib/weather/travel.ts` þegar `displayPoint` er smíðað úr `dpWorst`.
3. Í `DepartureHeatmap.tsx` reikna:
   - displayed distance út frá `displayPoint.distanceFromOriginM`, `routeDistanceM` og `leg`
   - route-point ETA út frá `candidate.departureIso`, `candidate.arrivalIso`, `displayPoint.routeFraction` og `leg`
4. Láta top summary nota:
   - distance + ETA line
   - `displayPoint.windMs`
   - `displayPoint.precipMmPerHour`
   - `displayPoint.airTemperatureC`
5. Halda núverandi fallback á `worst*` leiðinni ef `candidate.displayPoint` vantar, svo no-data/eldri gögn brotni ekki.

Forðist að nota `displayPoint.forecastTimeIso` sem tímann í efri `Mest krefjandi er ... kl. ...` línunni. Sá tími er veðurspártími, ekki áætlaður tími bílsins á punktinum.

## Suggested message keys

Ekki hardcode-a nýja textann í component. Bætið líklega við nýjum lykli í `messages/is.json` og `messages/en.json`.

Tillaga:

```json
"slotDetailWorstDistanceAt": "Mest krefjandi er {distance} km frá {origin}, kl. {time}.",
"slotDetailWeatherSummary": "Vindur: {wind} · Úrkoma: {precipitation} · Hiti: {temperature}"
```

Enska, ef þarf:

```json
"slotDetailWorstDistanceAt": "Most demanding point is {distance} km from {origin}, at {time}.",
"slotDetailWeatherSummary": "Wind: {wind} · Precipitation: {precipitation} · Temperature: {temperature}"
```

Athugið að gildin sjálf ættu að halda unit-formöttun úr núverandi helpers, t.d. `6,8 m/s`, `0,1 mm/klst`, `15,2°C`.

## Scope guard

Haldið neðra `Mest krefjandi á leiðinni` boxinu óbreyttu fyrir þessa breytingu:

- ekki fjarlægja `Veðurspá á þessum stað kl. ...`
- ekki fjarlægja `Áætlaður tími ...`
- ekki breyta linkum: `Skoða veðurspá`, `Opna á korti`, `Hrá met.no gögn`
- ekki breyta map marker/chip timing sem v180/v183 var að laga

## Tests / verification

Ef það er einfalt að bæta unit test við helper sem reiknar top summary data, gerið það. Annars er acceptable að halda þessu sem lítið UI-polish með type-check + núverandi test suite, en þá þarf localhost-próf frá Stebba að vera skýrt.

Lágmarks tæknileg sannprófun fyrir Claude Code:

```text
npm run type-check
npm run test:run
```

Codex keyrði ekki þessi próf í þessari addendum-rýni.

## Localhost checks for Stebbi

Opnaðu Ferðaveðrið á localhost með leið sem gefur langa ferð, t.d. Garðabær → Egilsstaðir.

Skref:

1. Veldu grænan departure slot þar sem neðra map/detail boxið sýnir `Mest krefjandi á leiðinni`.
2. Skoðaðu efra brottfararboxið undir tímalínunni.
3. Staðfestu að það sýni áfram `Brottför: kl. ... · Komutími: kl. ...`.
4. Staðfestu að næsta lína sýni vegalengd og áætlaðan tíma á punktinum, t.d. `Mest krefjandi er 501 km frá Garðabæ, kl. 15:24`.
5. Staðfestu að næsta lína sýni vind, úrkomu og hita í einni línu, t.d. `Vindur: 6,8 m/s · Úrkoma: 0,1 mm/klst · Hiti: 15,2°C`.
6. Staðfestu að neðra `Mest krefjandi á leiðinni` boxið sé óbreytt og sýni enn `Áætlaður tími ...`, `Veðurspá á þessum stað kl. ...`, veðurgildi og linka.
7. Smelltu á annan departure slot og staðfestu að bæði efra boxið og map marker/detail uppfærist saman án þess að gamlir tímar sitji eftir.
8. Prófaðu líka óþægilegan/gulan slot ef hann er til staðar.

Passa sérstaklega:

- Tíminn í efra `Mest krefjandi er ... kl. ...` á að vera ETA á leiðarpunktinn, ekki forecast-hour.
- Neðra detail-boxið má áfram sýna forecast-hour sérstaklega.
- Engin SQL, Supabase, auth, RLS, production gögn eða notendagögn eiga að snertast af þessari UI-breytingu.

## Codex notes

Skoðað í þessari rýni:

- `ai-handoff/2026-07-08-0925-todo-067-v183-claude-v182-displaypoint-prerelease.md`
- `components/weather/DepartureHeatmap.tsx`
- `components/weather/TravelAuditMap.tsx`
- `components/weather/travelAuditMap.helpers.ts`
- `lib/weather/types.ts`
- `lib/weather/travel.ts`
- `messages/is.json`
- `messages/en.json`

Codex breytti aðeins þessari addendum-skrá. Engum app-kóða, SQL eða migration var breytt.
