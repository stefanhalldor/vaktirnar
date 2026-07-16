# TODO 086 - v031 Claude Code svar við v030 Codex rýni

Created: 2026-07-12 19:34
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Stöðuskil / review response
Input reviewed: `ai-handoff/2026-07-12-1254-todo-086-v030-codex-v029-phase2a-review.md`
Current HEAD: `0252a74 feat: wire Veðurstofan station data into route weather points (#86)`

---

## Staða

Phase 2A commit `0252a74` er til staðar á `main` en hefur ekki verið push-að.
`origin/main` er á `8fea8e0` (tvö commit á eftir: `00e85eb` Phase 1 og `0252a74` Phase 2A).

Allar prófanir eru grænar, TypeScript er hreint, build tókst.

---

## Niðurstaða úr v030 Codex rýni

Codex mælti með að laga tvær meginfundargerðir áður en push/deploy:

### 1. High - Timeout vantar á Veðurstofan fetch (critical path)

`route.ts:255` bíður eftir `vedurstofanFetchPromise` áður en route response er skilað.
Ef `xmlweather.vedur.is`, cache-skrifur eða netið er hægt getur heildarsvar `/api/teskeid/weather/travel` tafist, jafnvel þó MET/Yr sé tilbúinn.
`.catch(() => null)` verndar gegn villum en ekki gegn seinfara eða hængjandi promises.

### 2. Medium-high - ETA misræmi þegar notandi skiptir um departure slot

API velur `nearestForecast` útfrá `point.summaryForWindow.etaIso` og geymir eina röð.
Þegar notandi breytir departure/heatmap candidate í UI uppfærist MET/Yr samantektin en `selectedPoint.vedurstofanStation.nearestForecast` er enn tengd upprunalegu ETA.
UI sýnir ekki `ftimeIso` svo misræmið er erfitt að sjá.

### 3. Medium - Engar markvægar prófanir á route enrichment

Núverandi prófanir staðfesta Phase 1 hegðun en ekki Phase 2A:
- Veðurstofan reject/timeout - route skilar samt MET/Yr
- `vedurstofanStation` er fyllt þegar gögn eru til
- Engar gögn brjóta ekki response
- Active-candidate ETA meðhöndlun

### 4. Low - `ftimeIso` ekki sýnilegur í UI

`RouteWeatherPointDetailCard` sýnir ekki hvaða forecast-tíma var valinn. Gerir niðurstaðu 2 erfiðari að gæðaprófа.

---

## Ákvarðanir sem Stebbi þarf að taka

**Lagfæringarleyfi:**
Codex sagði "Claude Code should only patch after Stebbi gives explicit implementation permission."
Þörf er á skýru framkvæmdarleyfi áður en nokkuð er breytt í kóða.

**Vegna niðurstöðu 2 (ETA misræmi) þarf Stebbi að velja eina af tveimur leiðum:**

- **Leið A (nákvæmari):** API skilar öllum Veðurstofan forecast-röðum fyrir hverja stöð; UI velur nærstu röð dynamískt útfrá virku ETA. Meira gögn í API-svari, meiri JavaScript í UI.
- **Leið B (einfaldari):** Festa Veðurstofan við upprunalegu `summaryForWindow` ETA en sýna `ftimeIso` skýrt í detail card svo notandi getur séð mismuninn. Minni breytingar, minni áhætta.

Codex vísaði til beggja leiða. Claude Code getur útfært hvora sem Stebbi velur.

---

## Tillaga að patchscope (bíður eftir leyfi)

Ef Stebbi gefur leyfi mun Claude Code:

1. Bæta `AbortController` + `Promise.race` við Veðurstofan fetch í `route.ts` með ~1500ms timeout; skila route án Veðurstofan-gagna ef timeout vinnur
2. Útfæra valda ETA-leið (A eða B)
3. Sýna `ftimeIso` í `RouteWeatherPointDetailCard` (leysir niðurstaðu 4, hjálpar niðurstöðu 2)
4. Bæta við markvægar prófanir í `lib/__tests__/weather-travel-api.test.ts`:
   - Veðurstofan timeout - route skilar MET/Yr
   - Veðurstofan reject - route skilar MET/Yr
   - `vedurstofanStation` fyllt við gild gögn
   - Engar gögn - point kemur út óbreyttur
5. Keyra: `npm run test:run`, `npm run type-check`, `npm run lint`, `npm run build`
6. Gera handoff

Commit, push og deploy eru ekki hluti af þessu - þurfa sérstakt leyfi.

---

## Localhost checks fyrir Stebbi (eftir patch)

Þessar athuganir eru eftir lagfæringarnar, ekki áður.

1. `npm run test:run -- lib/__tests__/weather-travel-api.test.ts lib/__tests__/weather-vedurstofan-server.test.ts` - búist við öllum prófunum grænni
2. Opna `/vedrid` á localhost og reikna leið (t.d. Reykjavík - Akureyri)
3. Smella á route point - detail panel á að sýna Veðurstofan-kafla með `ftimeIso`
4. Breyta departure slot í heatmap - ef Leið A: Veðurstofan uppfærist; ef Leið B: `ftimeIso` sýnir að tíminn er festur við upprunalegu ETA
5. Nota mocked/slow network (eða `WEATHER_ENABLED=false` + manual test) til að staðfesta að route skilar MET/Yr jafnvel þó Veðurstofan sé hæg

Engin SQL, engar Supabase-breytingar, engin production touch þarf.

---

## Supabase / RLS / Production

Engar breytingar. Sama staða og v030.

---

## Næstu skref

1. **Stebbi** velur Leið A eða B fyrir ETA misræmi og gefur framkvæmdarleyfi ef við á
2. **Claude Code** framkvæmir patch eftir leyfi
3. **Codex** rýnir næsta handoff áður en push/deploy
4. **Enginn** push-ar, deploy-ar eða snertir Supabase án sérstaks leyfis frá Stebba
