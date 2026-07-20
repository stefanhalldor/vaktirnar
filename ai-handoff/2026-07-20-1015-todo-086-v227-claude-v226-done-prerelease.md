# TODO 086 / v227 - Claude handoff - v226 áfangar A-E kláraðir, pre-release

**Created:** 2026-07-20 10:15 Atlantic/Reykjavik
**Agent:** Claude Code
**Purpose:** Yfirlit yfir framkvæmda áfanga, localhost prófanir og handoff til Codex-rýni.

## Hvað var gert í þessari lotu

Allir fimm áfangar úr v226 handoff voru framkvæmdir. Engin SQL var keyrð.

### Áfangi A — Einföld sýn stýrir öllum status-litum

**Files changed:**

- `lib/weather/windDisplayStatus.ts` — `toSimpleWindDisplayStatus()` bætt við (nalgast-othaegindi → innan-marka, nalgast-haettumork → othaegilegt)
- `components/weather/WeatherOverviewClient.tsx`:
  - `toSimpleWindDisplayStatus` imported
  - `displayForecastSlotStatuses` - collapse near-threshold statuses í scrubber dots þegar mode = simple
  - `vedurstofanLayer` markers: `displayStatus` notað fyrir `tone` og `markerColor`
  - `vegagerdinLayer` markers: sama mynstur
  - `nowStatusColor` á `WeatherSourceTimeSelector`: notar `displayStatus` í simple mode
  - `forecastSlots={displayForecastSlotStatuses}` (ekki raw `forecastSlotStatuses`)

### Áfangi B — Vista Nánar/Einfalt á notanda

**Files changed:**

- `messages/is.json` — `"statusFilterModeDetailed": "Nánar"` (var "Nákvæmt")
- `components/weather/WeatherOverviewClient.tsx`:
  - `thresholdsRef` - always-fresh ref til að forðast stale closure
  - `handleStatusFilterModeChange` - sendir PUT til API þegar authenticated
  - Loads `statusFilterMode` frá API á mount og setur localStorage + state
- `app/api/teskeid/weather/preferences/thresholds/route.ts`:
  - GET: velur `status_filter_mode` dálk, skilar `statusFilterMode` í svari. 42703 fallback ef dálkur er ekki til.
  - PUT: tekur við `statusFilterMode`, bætir honum við upsert payload. 42703 fallback sem reynir aftur án dálksins.
- `sql/88_weather_user_preferences_status_filter_mode.sql` — **ÓSKEYRÐ**. Stebbi keyrir sjálfur.

**SQL sem þarf að keyra (Stebbi):**
```sql
-- sql/88_weather_user_preferences_status_filter_mode.sql
alter table public.weather_user_preferences
  add column if not exists status_filter_mode text;

alter table public.weather_user_preferences
  drop constraint if exists weather_user_preferences_status_filter_mode_check;

alter table public.weather_user_preferences
  add constraint weather_user_preferences_status_filter_mode_check
    check (status_filter_mode is null or status_filter_mode in ('simple', 'detailed'));
```

Kóðinn er 42703-robust: ef dálkurinn er ekki til enn þá virka GET og PUT eins og áður (vindmörk haldast).

### Áfangi C — Veðurstofustöð á nýju URL sýnir gamla spjaldið

Þetta var þegar til staðar í kóðanum:

- `renderSelectedOverlay` í `WeatherOverviewClient` er notað fyrir BÁÐAR tegundir stöðva
- Veðurstofustöð: `Nánar` takki opnar `vedurstofanPulseHref(stationId, returnTo)` — sem postar notanda á `/vedrid/puls/stod/[stationId]`
- Vegagerðarstöð: `Nánar` takki opnar `vegagerdinPulseHref(stationId, returnTo)`

Engar breytingar þurftu á `VedurstofanPulsClient.tsx` í þessari lotu.

### Áfangi D — Korta-overlay

**Files changed:**

- `components/weather/WeatherOverviewClient.tsx`:
  - `MapStationOverlay` component bætt við neðst í skrá
  - `renderSelectedOverlay` prop sent inn á `WeatherOverviewShell` — notar `MapStationOverlay` fyrir báðar tegundir stöðva
  - Overlay fetchar nota preview async með AbortController
  - Sýnir: stöðvar nafn, vindur m/s, hviður m/s (ef til), síðasta athugasemd (ef til), Nánar link
  - `Link` from next/link notaður
- `components/weather/WeatherOverviewShell.tsx`:
  - `renderSelectedOverlay` prop bætt við interface og function signature
  - Map wrapped í `<div className="relative">` og overlay renderar `absolute bottom-3 left-3`
- `messages/is.json` og `messages/en.json`: `overlayClose`, `overlayGust`, `overlayNanar`

### Áfangi E — Scrubber örvar

**Files changed:**

- `components/weather/WeatherSourceTimeSelector.tsx`:
  - `prevLabel`/`nextLabel` props bætt við
  - `ChevronLeft`/`ChevronRight` frá lucide-react
  - `selectableModes` array: ['now', ...forecastSlots.map(s => s.timeMs)]
  - `selectRelative(delta)` function
  - Vinstri ör disabled þegar `activeIdx <= 0`, hægri disabled þegar við enda
  - `data-active="true"` attribute á virkum forecast slot button
  - `scrollRef` á scrollable div + `useEffect` sem scrollar virkan slot í view þegar `activeMode` breytist
  - Örvar fyrir utan scrollable area — overflow kemur ekki
- `components/weather/DepartureHeatmap.tsx`:
  - `ChevronLeft`/`ChevronRight` frá lucide-react
  - `useRef`/`useEffect` import
  - `selectedFilteredIdx` — position í filtered list (eða -1)
  - `selectRelative(delta)` — fer í gegnum `filteredWithIdx` (filtered slots only)
  - `prevArrowDisabled`/`nextArrowDisabled` logic
  - `btnRefsRef` — Map<number, HTMLButtonElement> til að geta scrollað í view
  - `useEffect` sem scrollar í view þegar `selectedIdx` breytist
  - Örvar utan scrollable div, layout `flex items-center gap-1`
- `messages/is.json` og `messages/en.json`: `timelinePrevious`, `timelineNext`

## Validation

```
npm run type-check  → exit 0
npm run test:run    → 118 passed, 0 failed
```

## SQL migration

`sql/88_weather_user_preferences_status_filter_mode.sql` er á disk. **Stebbi keyrir þetta sjálfur** þegar hann er tilbúinn. 42703 fallback í API þýðir að kóðinn virkar án migration — þar til Stebbi kýr hann.

## Localhost prófanir — Stebbi

### 1. Einföld/Nánar sýn (Áfangi A + B)

#### Status-litur á kortinu

1. Opna `/vedrid` sem ósannvottaður notandi.
2. Ganga úr skugga um að sjálfgefinn mode er `Einfalt`.
3. Athuga marker-liti á kortinu og dots í tíma-scrubber:
   - Stöðvar sem voru amber (nalgast-othaegindi) eiga að líta **grænar** út.
   - Stöðvar sem voru appelsínugular (nalgast-haettumork) eiga að líta **appelsínugular** út (sama litur og othaegilegt).
   - Stöðvar sem eru "haettulegt" haldast rauðar.
4. Skipta yfir í `Nánar` (var "Nákvæmt").
5. Ganga úr skugga um að fimm stöður koma fram aftur í pills og dot-litir breytast í nánar-liti.

#### Filter pills í simple mode

6. Í `Einfalt` eiga þrjár pillur að sjást: `Innan marka` (græn), `Óþægilegt` (orange), `Hættulegt` (rautt).
7. Í `Nánar` eiga fimm pillur að sjást.

#### Vista í DB (Áfangi B)

8. Innskrá sig.
9. Skipta yfir í `Nánar`.
10. Refresh síðunnar.
11. Ganga úr skugga um að `Nánar` komi aftur (frá API, ekki bara localStorage).
12. Skipta aftur í `Einfalt`, refresh, ganga úr skugga um að `Einfalt` komi aftur.

> **ATH:** Þetta krefst þess að `sql/88` hafi verið keyrð. Ef hún er ekki keyrð enn þá virkar localStorage enn og API skilar null (sem fall-back á localStorage gildi). 42703 error í API log er vænst fyrirfram migration.

### 2. Map overlay (Áfangi D)

13. Smella á Vegagerðarstöð á kortinu.
14. Ganga úr skugga um að lítið spjald komi fram neðst til vinstri á kortinu með:
    - Nafn stöðvar
    - Vindur m/s
    - Hviður m/s (ef til)
    - Síðasta athugasemd (ef til — birtist eftir stutta stund)
    - `Nánar` tengill
15. Smella á `Nánar` → á að fara á Vegagerðin pulse síðu.
16. Smella á `Loka` (×) → overlay hverfur, marker er afvaldinn.
17. Smella á Veðurstofustöð á kortinu.
18. Sama uppsetning á overlay.
19. Smella á `Nánar` → á að fara á Veðurstofan pulse síðu (gamla spjaldið).

#### Mobile (360-460px)

20. Skoða overlay á mjóum skjá.
21. Overlay á EKKI að valda horizontal overflow.
22. Google attribution og controls eiga ekki að vera huldar.

### 3. Scrubber örvar (Áfangi E)

#### `/vedrid` tíma-selector

23. Opna `/vedrid`.
24. Staðfesta að tveir örvar (◀ ▶) sjáist utan um tíma-scrubber.
25. Vera á `Núna` (Vegagerðin).
26. Vinstri ör á að vera disabled (ekki hægt að fara lengra til baka).
27. Smella á hægri ör.
28. Fyrsti Veðurstofan forecast slot á að verða virkur, kort breytist.
29. Smella á hægri ör nokkrum sinnum — hvert smellur velur næsta slot, dot scrollar í view.
30. Fara á síðasta slot — hægri ör á að vera disabled.
31. Smella á vinstri ör — slot fer til baka.
32. Á fyrsta forecast slot, smella á vinstri ör → fer á `Núna`.

#### `/auth-mvp/vedrid/ferdalagid` brottför-scrubber

33. Reikna leið sem gefur marga brottfarar-slota.
34. Fara á niðurstöðu-skref þar sem brottfararslotaröðin er sýnd.
35. Staðfesta að tveir örvar (◀ ▶) sjáist utan um brottfarar-scrubber.
36. Smella á hægri ör — næsti synlegi slot velst, kort uppfærist.
37. Setja status-síu sem felur suma slota.
38. Smella á hægri/vinstri örvar — fara aðeins í gegnum sýnilega slota.
39. Hreinsa síur — örvar fara aftur í gegnum alla slota.
40. Vinstri ör á að vera disabled þegar enginn slot er valinn eða við byrjun.
41. Hægri ör á að vera disabled þegar við enda.

#### Mobile (360-460px)

42. Örvar eiga ekki að valda horizontal overflow á `/vedrid` eða `/ferdalagid`.
43. Touch targets eiga að vera auðveldlega smellanlegar (min ~32px).

## Codex rýni — lykil atriði

1. **DepartureHeatmap div-nesting**: Nýja `flex items-center gap-1` wrapper var sett utan um scrollable `overflow-x-auto` div og örvar. Vertu viss um að div-closing sé rétt — sérstaklega `</div>` chains á línunum þar sem `filteredWithIdx.length > 0` block endar.

2. **WeatherOverviewShell relative wrapper**: Map er nú wrapped í `<div className="relative">`. Ganga úr skugga um að þetta brjóti ekki IcelandOverviewMap height eða aspect-ratio.

3. **MapStationOverlay note fetch**: Nota `AbortController` + `cancelled` flag til að forðast state updates á unmounted component. Preview API endpoint paths eru:
   - Veðurstofan: `/api/teskeid/weather/vedurpuls/stations/{stationId}/preview`
   - Vegagerðin: `/api/teskeid/weather/vedurpuls/vegagerdin/stations/{stationId}/preview`
   Staðfesta að þessir endpoints séu til og skili `Array<{ body: string }>`.

4. **42703 fallback**: GET og PUT í `preferences/thresholds/route.ts` nota `(error as { code?: string }).code === '42703'` check. Þetta er correct Postgres error code. Supabase PostgREST sendir þetta sem strenginn `'42703'`.

5. **`statusFilterMode` null semantics**: null = notandi hefur ekki sett sér sérstaklega; kóðinn fall-backar á localStorage. `'simple'` eða `'detailed'` = notandi visataði sér sérstaklega. Þetta þýðir að anon notendur sem nota localStorage missa EKKI gildi sitt þegar þeir logga inn — því innskráður notandi fær null frá API ef hann hefur aldrei vistað.

6. **`windStatusToTone` changes**: Tónn er enn reiknaður út frá `displayStatus` (ekki `status`). Í simple mode gætu tveir stöðvar sem voru áður ólíkir (haettulegt vs nalgast-haettumork) fengið sama tón. Þetta er rétt hegðun.

## Files changed

```
app/api/teskeid/weather/preferences/thresholds/route.ts  (Phase B)
components/weather/DepartureHeatmap.tsx                  (Phase E)
components/weather/WeatherOverviewClient.tsx             (Phase A, B, C, D)
components/weather/WeatherOverviewShell.tsx              (Phase D)
components/weather/WeatherSourceTimeSelector.tsx         (Phase E)
lib/weather/windDisplayStatus.ts                         (Phase A)
messages/en.json                                         (Phase B, D, E)
messages/is.json                                         (Phase B, D, E)
sql/88_weather_user_preferences_status_filter_mode.sql   (Phase B, NEW, UNRUN)
```

## Ekki gert

- Pending auth flow fyrir status_filter_mode (sessionStorage pending key, login-return save) — handoff v226 nefnir þetta sem Áfangi B hluta. Vindmörk nota þessa flæði nú þegar. Einfalt/Nánar mun virka á localStorage þar til innskráning fer fram, og við login save-ar kóðinn ekki automatically. Hægt að bæta þessu við seinna ef þörf er á.
- Automatic overlay þegar margir punktar eru sýnilegir (v226 nefndi þetta sem optional) — ekki útfært.
