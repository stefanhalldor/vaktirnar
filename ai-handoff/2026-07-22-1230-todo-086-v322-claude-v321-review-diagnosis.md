# TODO-086 v322 Claude Handoff - v321 Review og Greining

## Samantekt

Claude fór yfir v321 Codex-breytingar og greinir ástæðu beggja villna sem Stebbi tilkynnti eftir að v321 var prófað á localhost.

## Villur sem Stebbi tilkynnti

1. **Vegagerðin stöðvar sjást ekki á upphaflegu "Núna"** -- kortið sýnir Veðurstofanstöðvar (forecast mode) í stað Vegagerðarstöðva (now mode).
2. **"Núna" er ekki sjálfkrafa filterað** þegar leið opnast.

## Greining

### Skjámynd 2026-07-22 121314

Skjámyndin sýnir:
- Popup: "Möðrudalsöræfi II / 162,2 km frá upphafi / Vindur: 12 m/s / **Ætlað hjá punkti: 12:00**"
- "Ætlað hjá punkti" er Veðurstofan-popup formát -- þetta staðfestir að kortið er í `'forecast'` mode, ekki `'now'` mode.
- Stöðvarnar á kortinu (Fljótsheið, Mývatnsheiði, Biskupsháls o.fl.) eru Veðurstofanstöðvar, ekki Vegagerðarstöðvar.
- "Núna 12:12" chipið er sýnt og virðist selected (dökkur bakgrunnur) -- þ.e. `effectiveSelectedCandidateIdx === 0` er rétt.

### Rótarorsök

Báðar villur eru **sama vandinn**: `vegagerdinRender.count = 0`.

Í `calculateResolvedRoute` (lína 2715):
```tsx
const nowRouteMode: RouteWeatherMode = vegagerdinRender.count > 0 ? 'now' : 'forecast'
```

Þegar engar Vegagerðin stöðvar finnast:
- `nowRouteMode = 'forecast'`
- `setRouteWeatherModeState('forecast')` (lína 2719)
- `updateRouteWeatherLayerVisibility('forecast')` (lína 2757)
- Veðurstofan layer verður sýnilegur, Vegagerðin layer er falinn
- Status pills sýna Veðurstofan-stöðvar (6 Innan marka + 1 Óþægilegt)

**Þetta er EKKI kóðavilla í v321** -- þessi skilyrt mode-rökin voru í kóðanum fyrir v321 líka. Vandinn er gagnaaðgangur.

### Af hverju `vegagerdinRender.count = 0`?

Tvær mögulegar ástæður:

**A. Vegagerðin gögn restricted (líklegasta ástæðan)**

`/api/teskeid/weather/vegagerdin/current` endpoint krefst `weather-provider-vegagerdin` feature access þegar `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` er í `.env.local`. Ef notandinn hefur ekki þessa access:
- `/api/teskeid/weather/vegagerdin/current` skilar 403
- `overviewVegagerdinData` er `null` í React state
- `buildClientVegagerdinRouteLayer` skilar `undefined` (lína 1601: `if (overviewVegagerdinData?.status !== 'ok') return undefined`)
- Travel API skilar heldur ekki `vegagerdinLayer` ef `vegagerdinLayerEnabled = false`
- Niðurstaða: `vegagerdinRender.count = 0`

**B. Route matching finnur engar stöðvar (minna líklegt)**

`VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M = 2_500` (2.5km). Ef Vegagerðin stöðvar eru >2.5km frá þessari leið virkar matching ekki. Mögulegt á sumum fjallaleið (t.d. Möðrudalur-svæðið).

### Önnur athugun: `handleSelectCandidateIdx` vs `setSelectedCandidateIdx`

Í `calculateResolvedRoute` er aðeins `setSelectedCandidateIdx(0)` kallað (lína 2755), ekki `handleSelectCandidateIdx(0)`. Þetta er rétt -- `handleSelectCandidateIdx(0)` er fyrir notendaklick og myndi endurteikna stöðvar aftur. `calculateResolvedRoute` stillir mode og visibility beint (línur 2719 og 2757).

`effectiveSelectedCandidateIdx` reiknast rétt (= 0) í næsta render.

## v321 Kóðamat: Yfirleitt vel útfært

- `routeForecastBuildContextRef` og opt-in flow er skynsamleg hönnun.
- `formatVegagerdinRouteWindValue` (mean+gust formát `8(12) m/s`) er rétt.
- TypeScript pass og tests pass samkvæmt Codex handoff.
- Mode-rökin (now vs forecast eftir vegagerdin count) voru til staðar fyrir v321 líka.

Einn smávægilegur ábendingur um retry-takka: línan
```tsx
{routeForecastBuildStatus !== 'loading' && routeForecastBuildStatus !== 'ready' && (
  <button onClick={handleRouteDepartureForecastOptIn}>Reyna aftur</button>
)}
```
sýnir Reyna-aftur takkann þegar status er `'idle'` (rétt eftir opt-in). Þetta er óheppilegt -- takkinn ætti bara að sjást þegar `status === 'error' || status === 'unavailable'`. En þetta er ekki blocker.

## Greiningarlíkur fyrir Stebbi

**Check 1** -- Browser console. Leitaðu að:
```
[RoadMap] providers — vegagerdin: 0 stations
```
Ef þetta sýnir 0 er vandinn staðfestur.

**Check 2** -- Network tab. Skoðaðu svar frá travel API (`/api/teskeid/weather/travel`). Er `vegagerdinLayer` til staðar í JSON response?

**Check 3** -- Network tab. Skoðaðu `/api/teskeid/weather/vegagerdin/current`. Skilar það 200 með gögnum eða 403?

## Tillögur að lagfæringum eftir greiningarngreiningu

### Ef vandinn er access (403 frá vegagerdin/current)

**Valkostur A** (Dev-only, fljótt): Setja `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=false` í `.env.local`. Þá þarf enginn að hafa sérstaka feature access í dev.

**Valkostur B** (SQL, Stebbi keyrir): Bæta Stebbi-notanda í `weather-provider-vegagerdin` feature group í Supabase:
```sql
-- Ath: Stebbi keyrir þetta sjálfur, EKKI Claude
INSERT INTO feature_access (user_id, email, feature)
VALUES ('<stebbi-user-id>', '<stebbi-email>', 'weather-provider-vegagerdin')
ON CONFLICT DO NOTHING;
```

### Ef vandinn er route matching (gögn koma en 0 stations)

Þarf nánari skoðun. Mögulegar lausnir:
- Auka `VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M` (t.d. 5000m)
- Bæta debug-log inn í `buildClientVegagerdinRouteLayer` til að sjá hvenær matching tekst

### Ef gögn eru aðgengileg en `auditPolylinePoints` er tómt

`buildClientVegagerdinRouteLayer` krefst `result.travelPlan?.route.auditPolylinePoints` (lína 1603). Ef þetta er tómt virkar matching ekki. Check:
```
[RoadMap] providers —
```
log-lína og athugaðu hvort `vedurstofan: N stations` sé > 0 (Veðurstofan matching notar sömu polyline).

## Skrár skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/vegagerdin/current/route.ts`
- `lib/weather/providerRouteMatching.ts`
- `ai-handoff/2026-07-22-1201-todo-086-v321-codex-now-first-departure-opt-in-draft.md`
- `ai-handoff/2026-07-22-1048-todo-086-v318-codex-route-now-switching-labels-prerelease.md`
- Skjámynd: `C:\Users\Lenovo\Pictures\Screenshots\Skjámynd 2026-07-22 121314.png`

## Engar kóðabreytingar

Claude gerði engar breytingar á kóða í þessum áfanga. Greining eingöngu.

## Localhost Checks for Stebbi

Framkvæmdu þrjár greiningarlíkurnar hér að ofan (browser console + network tab) og láttu næsta agent vita niðurstöðurnar. Ef vandinn er access-related (Check 3 skilar 403) er Dev-only lagfæringin í `.env.local` fljótlegasta leiðin til að prófa hvort Vegagerðin stöðvar birtist á kortinu.

Þegar access-vandinn hefur verið leystur:
1. Keyra leið (t.d. Akureyri → Egilsstaðir)
2. Gera ráð fyrir: Vegagerðin stöðvar birtast á kortinu með `8(12) m/s` formati
3. Gera ráð fyrir: "Núna" chip sé selected og pills sýni Vegagerðin statusar (mögulega hviðuálag ef veður er slæmt)
4. Gera ráð fyrir: Engar Veðurstofanstöðvar sjást á "Núna" view
5. Gera ráð fyrir: Smella á "Skoða brottfarartíma" opni opt-in og sé hægt að skipta yfir í Veðurstofan forecast view
