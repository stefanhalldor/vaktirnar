# TODO 086 - v037 Phase 2A final prerelease

Created: 2026-07-12 20:47
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Prerelease handoff
Input reviewed: `ai-handoff/2026-07-12-2040-todo-086-v036-codex-v035-review-response.md`
Base: uncommitted changes á ofan `0252a74 feat: wire Veðurstofan station data into route weather points (#86)`

---

## Hvað var gert í v037

Leiðrétting á v034/v036 findings ofan á v033 patch.

### Breyttir skrár

**`components/weather/travelAuditMap.helpers.ts`**
- Bætt við `VedurstofanForecastRow` type export
- Bætt við `selectNearestVedurstofanRow(rows, etaIso)` pure helper — velur röð nærst `etaIso`, fallback til `rows[0]` ef `etaIso` er undefined, `undefined` ef tómt array

**`components/weather/RouteWeatherPointDetailCard.tsx`**
- Importar `selectNearestVedurstofanRow` frá helpers
- Notar helper í stað inline reduce
- Guard breytt frá `forecastRows?.length && (...)` (gæti renderat `0`) í `forecastRows && forecastRows.length > 0 && (...)`
- `if (!selectedRow) return null` tryggir að ekkert sé renderat þótt helper skili undefined

**`app/api/teskeid/weather/travel/route.ts`**
- Bætt við `withTimeout<T>(promise, ms, fallback)` helper — clearar timer í `finally` til að forðast dangling timer þegar promise vinnur race
- `vedurstofanResults` búið til með `withTimeout(vedurstofanFetchPromise, 2000, null)` — 2 sek heildarbudget á user response wait
- Enrichment loop: `if (payload.forecasts.length === 0) continue` — sleppir `vedurstofanStation` alveg (í stað þess að setja hlut með `forecastRows: undefined`)
- `forecastRows: payload.forecasts` — alltaf non-empty hér

**`lib/__tests__/travelAuditMap.helpers.test.ts`**
- Importar `selectNearestVedurstofanRow`
- Bætt við 6 nýjar prófanir:
  - undefined á tóma array
  - first row þegar etaIso er undefined
  - exact match á etaIso
  - nearest þegar etaIso er á milli raða
  - **Leið A regression**: mismunandi ETA gefur mismunandi röð (vindur breytist)
  - singleton array

**`lib/__tests__/weather-travel-api.test.ts`**
- Uppfært test: "omits forecastRows" → "omits vedurstofanStation entirely when payload has no forecast rows"
- Nýtt test: "returns MET/Yr result when global budget elapses" — notar `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(2500)` til að sanna að route skilar 200 þótt provider hængi að eilífu

---

## Hönnunarákvarðanir

**`withTimeout` bindur response latency, ekki provider vinnu:**
Route-level `Promise.race` stoppar user-response wait eftir 2 sek. Ef provider er enn að vinna (e.g. 3 batches í gang, 1.5 sek per batch) heldur hann áfram í bakgrunni og getur skrifað cache. Þetta er skjalfæst í comment og handoff. Ekki krafist að cancel provider vinnu - per-batch AbortController frá v033 annast þá þætti.

**`clearTimeout` í `finally`:**
Þegar `vedurstofanFetchPromise` vinnur race (kemur á undan 2 sek) hreinsar `finally` timerin þannig að enginn dangling timer er eftir.

**Sérstaka helper:**
`selectNearestVedurstofanRow` er pure function í helpers skrá, auðveld að prófa án component setup.

---

## Verification

```
npm run test:run (2227 pass, 27 skip, 8 todo) — exit 0
npm run type-check — exit 0
npm run lint — exit 0 (sömu pre-existing warnings)
npm run build — exit 0
```

Prófanir jukust úr 247 (eftir v033) í 255 (+8: 6 helper row-selection + 1 empty-station + 1 global-budget).

---

## Localhost checks fyrir Stebbi

**Athugið:** Localhost-tenging fer eftir `.env.local`. Ef `.env.local` bendir á production Supabase geta manual prófanir skrifað cache-raðir og usage-events í production `weather_cache` töfluna. Þetta er sama hegðun og áður — engin schema-breyting — en Stebbi á að vera meðvitaður um það.

Engin SQL þarf. Engar Supabase-breytingar.

1. `npm run test:run` og `npm run type-check` — búist við hreinu
2. Opna `/vedrid` á localhost og reikna leið (t.d. Reykjavík - Akureyri)
3. Smella á route point í kortinu:
   - Skoða Veðurstofan kafla: stöðvarnafn, fjarlægð, tími (kl. HH:mm), vindur, hitastig
4. Breyta departure slot í heatmap:
   - **Veðurstofan tíminn á að breytast** með virku ETA (Leið A)
5. Skoða mobile layout: engin lárétt overflow eða `0` í Veðurstofan kafla
6. Endurtaka leið þegar Veðurstofan er ekki tiltækt: route á að skila MET/Yr niðurstöðum hratt

**Regression:**
- MET/Yr veðurniðurstöður breytast ekki
- Veðrið uppfærist rétt þegar departure-slot er breytt

---

## Óvarið (þarf sérstakt leyfi)

- **met.no timeout**: Mælt af Codex v032 sem "long-term phase". Ekki innifalið hér.
- **Phase 2B / canonical Supabase weather store**: Þarfnast sér plan.
- **Commit + push**: Þarfnast sérstakt leyfi frá Stebba.

---

## Næstu skref

1. **Codex** rýnir þennan handoff
2. **Stebbi** gefur push-leyfi eftir Codex-rýni
3. **Claude Code** commit-ar og push-ar þegar bæði hafa samþykkt

## Supabase / RLS / Production

- Engar SQL breytingar
- Engin migration
- Engar RLS, auth, eða production schema breytingar
- `weather_cache` notuð af Phase 1C server-only wrapper (óbreytt frá Phase 1C)
