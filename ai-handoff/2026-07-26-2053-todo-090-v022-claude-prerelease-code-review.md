# TODO-090 v022 — Loka prerelease code review (Claude Code)

**Created:** 2026-07-26 20:53
**Timezone:** Atlantic/Reykjavik
**Byggir á:** v020 (connectivity-gate implementation), v021 (bootstrap verified)
**Scope:** Sameinaður ócommittaður release-pakki — auth, RLS, SQL 92/93, snapshot, Storage, met.no history, OTP, route candidate gates, regression-próf

Þetta er rýni — ekki framkvæmdarleyfi.

---

## Findings raðað eftir alvarleika

---

### BLOCKER

#### 1. `/api/cron/refresh-road-graph` vantar í `EXACT_PUBLIC_PATHS` í middleware

**Skrá:** `middleware.ts`

`EXACT_PUBLIC_PATHS` inniheldur:
```
'/api/cron/warm-vedurstofan',
'/api/cron/warm-vegagerdin',
'/api/cron/warm-metno-points',
```

En **ekki** `/api/cron/refresh-road-graph`.

Vercel cron sendir GET-beiðni án Supabase-session. Middleware-inn keyrir og finnur:
- `user = null` (engin session)
- `isPublic = false` (slóðin er ekki í neinum public lista)
- Skilar því `{ error: 'Unauthorized' }` með status 401

Route handler-inn (`cron/refresh-road-graph/route.ts`) sem athugar `CRON_SECRET` í Authorization header **keyrir aldrei**. Dagleg midnight refresh mun alltaf fá 401 í production.

**Lausn:** Bæta `/api/cron/refresh-road-graph` við `EXACT_PUBLIC_PATHS` í middleware — sama mynster og hinar cron-slóðirnar. Route handler er fail-closed (krefst CRON_SECRET). Þetta þarf framkvæmdarleyfi Stebba.

---

### HIGH

#### 2. SQL 93 gerir ráð fyrir að unique constraint sé til á `metno_point_forecasts_history`

**Skrár:** `sql/93_weather_chase_metno_place_history.sql`, `lib/weather/weatherChaseHistory.server.ts:187`

`fetchAndProjectRoadMapPlaceMetnoHistory` gerir upsert með:
```ts
onConflict: 'target_type,target_id,metno_updated_at,forecast_time'
```

Þetta krefst þess að unique constraint sé þegar til á þessum 4 dálkum í Supabase. SQL 93 setur **ekki upp** þennan constraint — það breytir aðeins `target_type_check` constraint, bætir við index og endurnýjar REVOKE/GRANT.

Ef constraintinn er ekki til: upsert-ið gengur í gegn sem insert með mögulegum dulritun-áhrifum (engir duplicates bætast við vegna Supabase-kliens, en engin conflict-handling keyrir heldur). Í raun gætu komið tvíteknar rows per forecast cycle. `selectLatestIssuedForecastRows` á að takast á við þetta en er ekki hannað til að þurfa að.

**Þarf að staðfesta:** Er unique constraint `(target_type, target_id, metno_updated_at, forecast_time)` til í production DB? Hvaða SQL-migration setti hann upp? Confidence: medium — líklega til úr eldri migration en óstaðfest.

---

#### 3. SQL 93 REVOKE/GRANT á `metno_point_forecasts_history` — óvissa um fyrri stöðu

**Skrá:** `sql/93_weather_chase_metno_place_history.sql:27-29`

```sql
REVOKE ALL ON public.metno_point_forecasts_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metno_point_forecasts_history TO service_role;
```

Þetta gefur aftur allar heimildir ef einhver aðili hafði einhverja lesheimild á þessum töflu (t.d. authenticated-read úr eldri migration). Ef töflunni var alltaf service_role-only er þetta öruggt og idempotent.

**Þarf að staðfesta:** Hvaða grants eru núna á `metno_point_forecasts_history` í production? Ef töflunni er þegar service_role-only er þetta ekkert vandamál.

---

### MEDIUM

#### 4. `pruneRoadGraphSnapshotHistory`: `return` í stað `continue` lýkur allri prune-keyrslu við Storage-villu

**Skrá:** `lib/iceland-routes/roadGraphSnapshotStore.server.ts:290-311`

```ts
for (const status of ['failed', 'unchanged'] as const) {
  ...
  if (paths.length > 0) {
    const { error } = await admin.storage...remove(paths)
    if (error) return  // <-- hér
  }
  ...
}
```

Ef Storage-fjarlæging mistekst fyrir `failed`-rows, hættir fallið alveg og `unchanged`-rows eru aldrei hreinsaðar. Þetta þýðir að við Storage-truflun safnast upp bæði `failed` og `unchanged` rows í töflunni. Þegar Storage kemur aftur keyrir næsti prune-hringur. Ekki blocker en gæti þýtt að 30-daga reglunni sé ekki framfylgt tímanlega.

**Tillaga (ekki framkvæmdarleyfi):** `continue` í stað `return` myndi reyna `unchanged` þótt `failed` Storage-fjarlæging misheppnist.

---

#### 5. `stageRoadGraphSnapshot`: Gat milli path-registration og upload

**Skrá:** `lib/iceland-routes/roadGraphSnapshotStore.server.ts:167-185`

Þrjú skref:
1. Update row: setja `storage_bucket` + `storage_path` (status enn `building`)
2. Upload gzip til Storage
3. Update row: setja `status = 'ready'` og öll metadata

Ef ferli deyr á milli skrefa 1 og 2: row hefur `storage_path` en engin skrá í Storage. `failRoadGraphSnapshot` reynir að fjarlægja skrána (sem er ekki til) — harmless no-op. Byggingarleytið (20 mínútur) hreinsar buildingrows í næsta refresh. Ekki blocker, en mögulegt ástæðuleysi í diagnostics ef þetta gerist.

---

#### 6. Route candidate gate: rate-limit-grein fyrir public-notendur er óaðgengileg

**Skrá:** `app/api/teskeid/weather/travel/route-candidate/route.ts:43-50`

```ts
const hasTeskeidRouting = user?.id && user.email
  ? await checkFeatureAccess(...)
  : false
if (!hasTeskeidRouting) return NextResponse.json({ status: 'disabled' }, { status: 404 })

if (access.mode === 'public') {  // <-- þetta er dead code
  ...checkWeatherGuestRateLimit(ip)
}
```

Ef `access.mode === 'public'`, þá er `user` null, svo `hasTeskeidRouting = false` og fallið skilar 404 áður en rate-limit-hlutinn nær að keyra. Hlið-röðin er rétt (feature gate verður á undan rate limit), en rate-limit-kóðinn fyrir public-notendur er óaðgengilegur.

Öryggisáhrif: engin — gatin er rétt. En kóðinn er villandi og gæti þurft leiðréttingu ef á að leyfa public rate-limited access á þessum endpoint í framtíð.

---

#### 7. `forecast-history/route.ts`: `maxDuration = 60` gæti verið þröngt við 7 live met.no-sóknir

**Skrá:** `app/api/teskeid/weather/forecast-history/route.ts:13`

Met.no hefur 12 sekúndna timeout per sókn. Ef öll 7 atriði eru met.no og engin er í cache, gætu 7 samhliða met.no-sóknir tekið allt að 12 sekúndur, auk paged DB-fyrirspurnar. Í framkvæmd er cache-hit líklegur en líklegt er að slimð slær inn á kalda instance. Floating concern — monitor á production.

---

### LOW

#### 8. `cleanup-chats` cron keyrir þótt LEGACY_ENABLED sé off

**Skrá:** `vercel.json:3-6`

Cron keyrir á hverri klukkustund. Ef `LEGACY_ENABLED !== 'true'`, blokkar middleware-inn slóðina með 401. Óþarfar cron-keyrslur í Vercel. Ekki blocker en minniháttar kostnaður og noise í logs.

---

#### 9. LF/CRLF warnings á öllum skrám — fyrirlægur bakgrunnshávaði

**Skrár:** Allar 34 breyttar skrár

`git diff --check` skilar exit 0 og Codex staðfesti þetta í v020. Gömul Windows line-ending spurning — kemur fram í hverju diff-kalli en hindrar engan build. Cosmetic.

---

#### 10. `parseRoadGraphSnapshotPayload` hafnar payload með `nodeSnapToleranceM !== 20`

**Skrá:** `lib/iceland-routes/roadGraphSnapshotFormat.ts:56`

```ts
if (value.nodeSnapToleranceM !== ROAD_GRAPH_NODE_SNAP_TOLERANCE_M) return null
```

Ef þörfin krefst þess að breyta tolerance í framtíð, þarf schema-migration (schema_version++ og nýr parser). Þetta er meðvituð hönnunarval og rétt — en ætti að vera skráð í `lib/iceland-routes/README.md` eins og forward-migration-stigi.

---

## Sértæk svæðayfirlit

### Auth / OTP

**Flow:** IP rate limit (fails open) → Zod normalize → DB RPC (`create_user_otp_code_if_allowed`, advisory transaction lock) → email → invalidation on delivery failure.

- `recentActive` skilar `{success: true}` án þess að senda email. Rétt — client fer á OTP-stig og getur notað fyrirliggjandi code.
- `deliveryStatus === 'failed'`: invalidates code og skilar 500. Rétt.
- `deliveryStatus === 'uncertain'`: skilar `{success: true, delivery: 'uncertain'}`. Rétt — client sýnir viðvörun.
- Invalid payload skilar `{success: true}` til að koma ekki í veg fyrir validation-leak. Rétt.
- Email-normalization er samræmd á öllum leiðum: `request-code` Zod transform → `createUserCode` (fær normalized) → `invalidateUserCodeAfterSendFailure` (normalizes again, idempotent) → `verifyUserCode` (normalizes sjálft).

**Niðurstaða:** OTP-flæðið er öruggt og vel hannað. Engar athugasemdir.

---

### RLS

- **SQL 92:** RLS kveikt, REVOKE ALL frá public/anon/authenticated, GRANT aðeins service_role. Föllin eru `SECURITY INVOKER` með explicit GRANT til service_role. Correct.
- **SQL 93:** Sjá findings #2 og #3 hér að ofan.
- `getAdmin()` er alltaf kallað inni í föllum (function-level), aldrei á module-level. Correct.
- Engin auth-gögn, notendatengdar leiðir eða heimilisföng í snapshot- eða history-töflum.

---

### SQL 92

- **Advisory lock:** `pg_advisory_xact_lock(hashtext('teskeid_road_graph_refresh'))` í `begin_teskeid_road_graph_refresh` kemur í veg fyrir keppniskeyrslur.
- **Tímamarksgátt:** Building-rows eldri en 20 mínútur eru failed-aðar áður en nýtt lease er tekið. Kemur í veg fyrir varanlegt lock.
- **Unique partial indexes:** `WHERE status = 'active'` og `WHERE status = 'building'` fylgja eins-á-öllum reglunni á DB-stigi. Rétt PostgreSQL-mynstur.
- **Atomic promotion:** `promote_teskeid_road_graph_snapshot` gerir retire-og-activate í einni transaction undir advisory lock.
- **`SECURITY INVOKER` + explicit grants:** Rétt — service_role keyrir föllin, anon/authenticated koma ekki nálægt.
- **Storage bucket:** `public = false`, 50 MB limit, aðeins gzip/octet-stream. Correct.

**Niðurstaða:** SQL 92 er vel hannaður. Engin blocking finding.

---

### SQL 93

- Bætir `road_map_place` við target_type constraint á `metno_point_forecasts_history`.
- Setur upp compound index `(target_type, target_id, forecast_time, metno_updated_at DESC)` sem styður history-fyrirspurnirnar.
- Recovery plan krefst data-deletion og þarf sérstakar samþykki. Rétt.

**Blocking dependency:** Sjá finding #2 — unique constraint á `(target_type, target_id, metno_updated_at, forecast_time)` þarf að vera til.

---

### Snapshot validation

Lög í réttri röð:

1. **Absolute counts:** segment ≥ 1000, node ≥ 1000, edge ≥ 1500.
2. **Absolute connectivity floor:** largestWeakComponent / nodeCount ≥ 60%.
3. **Relative connectivity drift:** current share ≥ 90% af share síðasta active snapshot. Skiptist ut á fyrsta bootstrap (engin previous).
4. **Exact golden route count:** `goldenRouteStatuses.length === 20`. Kemur í veg fyrir off-by-one.
5. **All golden routes 'ok':** `goldenRoutes.every(s => s === 'ok')`.
6. **Relative count bounds:** segment/node/edge breytast ekki um meira en ±20%/+50% frá active.

Payload-integrity við runtime:
- SHA256 staðfest eftir gunzip.
- Byte-count staðfest (bæði compressed og uncompressed).
- Schema-version + source + nodeSnapToleranceM stöðvuð á parse-tíma.
- Coordinate bounds per-segment (lat 62-68, lon -26 til -12).

**Niðurstaða:** Marglaga validation er traust. Engar athugasemdir.

---

### Storage

- Bucket private, service_role eitt og sér.
- `upsert: false` við upload — skrifar aldrei yfir fyrirliggjandi object (content-addressed eftir snapshotId).
- `cacheControl: '31536000'` (1 ár) á immutable objects.
- Orphan-cleanup: ef stage-ferli bilast eftir upload en áður en metadata er skrifað, reynir fallið að hreinsa Storage-objectið. Rollback-kóðinn er til staðar.
- `readRoadGraphSnapshotPayload` staðfestir bucket-nafn og storage-path áður en download-ið keyrir.

**Niðurstaða:** Storage-meðhöndlun er örugg. Sjá finding #4 um cosmetic gap.

---

### Met.no history

- `fetchAndProjectRoadMapPlaceMetnoHistory` síar í 3-klukkustunda slots við heilar klukkustundir.
- `validateWeatherChaseHistoryRequest` staðfestir alla IDs gegn canonical registries (ROAD_MAP_PLACES, VEDURSTOFAN_STATIONS_REGISTRY). Engir arbitrary coordinates eða IDs.
- `readWeatherChaseHistory` mergear history og current. Current rows yfirskrifa sömu forecast_time.
- `pruneMetnoRoadMapPlaceHistory` hreinsar rows eldri en 14 daga (target_type = 'road_map_place' aðeins).
- `warmAllRoadMapPlaceMetnoHistory` keyrir í batches af 5 — hóflegt.

**Óleyst:** Finding #2 — unique constraint dependency.

---

### Route candidate gates

Röð hlið er rétt:

```
global flag (TESKEID_ROUTE_CANDIDATE_ENABLED)
  → weather mode (off blocks)
  → auth check (supabase.auth.getUser)
  → feature access (teskeid-routing-v1)
  → coord validation
  → routing
```

- `MAX_SNAP_DISTANCE_M = 25_000` (25 km). Hæfilegt fyrir dreifðar byggðir á Íslandi.
- `PRODUCTION_CANDIDATE_BUDGET_MS = 8_000` ms. Skilar `pending` ef graph er kaldur; `after()` hitnar hann fyrir næstu beiðni.
- `isTeskeidRouteCandidateEnabled` tekur injectable env — góð testability.
- Sjá finding #6 um dead code í public rate-limit grein.

---

### Regression-próf

- `road-graph-refresh.test.ts`: 12 scenarios — bootstrap, unchanged-path, validation-failure-types, diagnostics-presence, golden route count hardening (exactly 20). Þekja er góð.
- `weather-forecast-history-api.test.ts`: 4 scenarios — public access, invalid input, provider-restricted auth, met.no stays public.
- `weather-chase-history.test.ts` og `weather-metno-history-routes.test.ts` eru í diff.
- `road-graph-snapshot-store.test.ts`, `road-graph-snapshot-format.test.ts`, `road-graph-snapshot-migration.test.ts`, `road-graph-runtime-cache.test.ts` eru öll ný.
- Full suite (v020): 160 files, 3806 tests, 0 failures.

**Vantar:** Enginn middleware-próf sem staðfestir að `/api/cron/refresh-road-graph` sé aðgengilegt án session (finding #1). Ef þessari skrá er bætt við EXACT_PUBLIC_PATHS, ætti að bæta við prófi sem staðfestir þetta.

---

## Samantekt — hvað þarf áður en commit/push/deploy

| # | Alvarleiki | Atriði | Staða |
|---|---|---|---|
| 1 | **BLOCKER** | `/api/cron/refresh-road-graph` vantar í `EXACT_PUBLIC_PATHS` | Þarf fix + framkvæmdarleyfi |
| 2 | HIGH | Unique constraint dependency í SQL 93 upsert | Þarf staðfestingu á DB |
| 3 | HIGH | SQL 93 REVOKE/GRANT — óvissa um fyrri grants | Þarf staðfestingu á DB |
| 4-7 | MEDIUM | Sjá lýsingar hér að ofan | Fræðilegt — ekki blockers |
| 8-10 | LOW | Cosmetic/monitoring | Skráð til viðmiðunar |

**Eitt ótvírætt blocker:** Finding #1. Án lagfæringarinnar keyrir nightly cron refresh aldrei í production. Allt annað er annaðhvort staðfestingarspurning eða Medium/Low.

---

## Tillögur að næstu skrefum

1. **Stebbi staðfestir** hvort unique constraint `(target_type, target_id, metno_updated_at, forecast_time)` er til á `metno_point_forecasts_history` í Supabase (finding #2). Auðvelt að ganga úr skugga um í Supabase Table Editor eða með read-only SQL.
2. **Stebbi gefur Claude Code framkvæmdarleyfi** til að bæta `/api/cron/refresh-road-graph` við `EXACT_PUBLIC_PATHS` í middleware.ts (finding #1). Þetta er einalínubreyting.
3. **Eftir finding #1 + #2 / #3 eru leyst:** Stebbi gefur leyfi fyrir commit, push og deploy.

---

## Óvissa / þarf að staðfesta

- Unique constraint á `metno_point_forecasts_history` (finding #2) — **confidence: medium**. Líklegast til úr eldri migration en óstaðfest.
- Fyrri GRANT-staða á `metno_point_forecasts_history` (finding #3) — **confidence: high** að service_role-only sé rétt, en óstaðfest.
- Finding #1 (middleware blocker) — **confidence: very high**. Kóðinn er lesinn beint og hliðröðin er skýr.
