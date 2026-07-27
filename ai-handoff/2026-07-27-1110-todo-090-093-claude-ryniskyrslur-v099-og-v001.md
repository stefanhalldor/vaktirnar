# TODO-090 v099 + TODO-093 v001 — Kóðarýni

**Agent:** Claude Code
**Tími:** 2026-07-27 11:55
**Staða:** Rýni lokið. Báðar breytingasetningar eru tæknilegur tilbúnar; rekstrarskilyrði hér að neðan þurfa að vera uppfyllt áður en útgáfa er staðfest.

---

## 1. Hvaða skrár voru lesnar

### TODO-090 v099 (fullbreið skúffa, leiðaröðun, veðurvissa)

- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx` (grep á lykilþáttum)
- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/DriveRouteMap.tsx`
- `lib/weather/providerRouteMatching.ts`
- `lib/iceland-routes/routeOptionEnvelope.server.ts`
- `lib/iceland-routes/routeMemoryVariant.ts`
- `lib/iceland-routes/firstReadyCoordinator.ts`
- `lib/iceland-routes/firstReadyDiscovery.ts`
- `lib/weather/pulseFormat.ts`
- `lib/weather/routeOptionLabels.ts`
- `lib/chat/format.ts`
- `app/api/teskeid/weather/route-memory/lookup/route.ts`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `lib/__tests__/providerRouteMatching.test.ts` (maximumRouteDistanceToMatchedStationKm hlutinn)
- `lib/__tests__/route-option-envelope.test.ts` (fyrstu 60 línur)
- `messages/is.json` og `messages/en.json` (lyklar með grep)

### TODO-093 v001 (HMS-first staðaleit, GPS, PlaceSearch)

- `lib/places/types.ts`
- `lib/places/normalize.ts`
- `lib/places/hmsCsv.ts`
- `lib/places/municipalities.ts`
- `lib/places/hmsDirectory.server.ts`
- `lib/places/hmsImport.server.ts`
- `lib/places/currentLocation.client.ts`
- `lib/places/providerCandidate.ts`
- `sql/94_hms_place_directory.sql`
- `app/api/place/search/route.ts`
- `app/api/place/reverse-geocode/route.ts`
- `app/api/cron/refresh-hms-places/route.ts`
- `app/api/admin/weather/refresh-hms-places/route.ts`
- `components/weather/PlaceSearch.tsx` (grep á lykilþáttum)
- `lib/__tests__/hms-place-api.test.ts` (fyrstu 60 línur)
- `middleware.ts` (grep á nýjum slóðum)
- `vercel.json` (grep á cron schedule)

---

## 2. Niðurstöður v099

### Gott

**Sorting:** `sortRouteComparisonItems` er rétt útfærð. Google fer aftast í `default`. Óstaðfest slitlag (presence, síðan magn) kemur á undan möl. Þannig fer 14,7 km óstaðfest slitlag réttilega á undan 69 km, jafnvel þótt fyrri leiðin hafi meiri möl.

**Fullbreið skúffa:** `useEffect` → `cautionCloseButtonRef.current?.focus()` eftir opnun. Tab trapped á loka-hnapp. Escape lokar. Focus endurheimt til trigger í `closeCautionDrawer`. A11y er rétt.

**Veðurvissa:** `maximumRouteDistanceToMatchedStationKm` er pure helper, prófaður í 4 cases. `ROUTE_WEATHER_STATION_CONFIDENCE_DISTANCE_KM = 50` er skilgreint á einum stað og notað á báðum. Texti segir skýrt að þetta sanni ekki slæmt veður.

**Öryggi:** `routeOptionEnvelope.server.ts` notar HMAC-SHA256 með `timingSafeEqual`. Canonical JSON með lyklaröðun. TTL og clock-skew vernd. `routeMemoryVariant.ts` sendir aldrei Google route ID yfir API-mörk.

**Fail-open:** Vegagerðin layer og veðurvissa bilun brjóta ekki baseline niðurstöðu.

### Eitt atriði sem þarf skýringu

`RouteComparisonMiniMap.tsx` kemur **ekki fram** í git status sem breytt skrá, þrátt fyrir að handoffið (section 4) segi að hún hafi verið breytt í v099. Innihald skrárinnar á diski er þó fullkomið og inniheldur alla lýsta virkni (sorting, caution drawer, `weatherCoverageConcern`). Þetta þýðir annaðhvort:

- Breytingarnar eru þegar committed frá fyrri áfanga og eru þar af leiðandi þegar útgefnar
- Eða skráin er á clean-stöðu vegna annars ástæðna

Þetta er ekki kóðagalli en Stebbi ætti að staðfesta ástand skrárinnar með `git status --short components/weather/RouteComparisonMiniMap.tsx` áður en útgáfa er staðfest.

### Eftirstöðvar

- Localhost-skoðun (section 13 í v099 handoffinu) — sérstaklega Safari/iPad, 50 km merking í raunnotkun og Google-aftast í default röðun
- Road-graph snapshot refresh (v098) þarfnast sérstaks leyfis

---

## 3. Niðurstöður v001

### Gott

**SQL schema:** RLS, service-role-only grants, `UNIQUE INDEX WHERE status = 'active'`, advisory locks í bæði `begin_hms_place_refresh` og `promote_hms_place_dataset`, atomic row-count verify við promotion. Rollback plan skjalfestur neðst í migrationinni. Vandlega útfært.

**CSV þáttur:** Rétt RFC 4180 útfærsla. BOM-stripping. Afritun eftir HEINUM með gæðaröðun (review_status → coordinate_type → accuracy_m → correctedAt). Robust villutölugreining.

**Innlesningaflæði:** 64 MB download cap. SHA-256 idempotency. 10 validation gates. Promotion staðfest með row-count verify. `failDataset` eyðir aldrei promoted dataset.

**Search og reverse API:** POST-only á báðum. `Cache-Control: private, no-store`. Auth + rate limit + Iceland-bounds validation. HMS → static → Google eingöngu þegar báðar skila engu og explicit flag sett.

**GPS:** Eitt user-triggered `getCurrentPosition`. Validates Iceland bounds. Reverse er eingöngu display-texti. Engin GPS-geymsla.

**Provider candidate:** HMS `sourceId` kemur aldrei inn sem Google `placeId` í routing. `source === 'hms'` → `placeId = 'confirmed'` → leiðalykill notar hnit. Rétt.

**SQL injection:** `search_hms_places` takmarkar `v_query` við `^[a-z0-9 ]+$` áður en tsquery er byggt upp. Engin injection möguleg.

### Vandamál sem þarf að hafa í huga

**1. In-memory rate limiter á Vercel (medium)**

`rateLimits = new Map()` á module-level endurstillist við hverja cold start á serverless. Rate limit gildir eingöngu innan eins tilviksins. Þetta er þekkt takmörk á serverless IP rate limiting og hentar fyrir núverandi umfang. Ef leitin verður mjög vinsæl þarf Redis/Upstash eða Supabase-based rate limit.

**2. 38 MB import í 300 s (medium – operational, ekki kóðagalli)**

`maxDuration = 300` er sett. 137k rows með 500-row chunks = ~275 PostgREST requests. Hefur ekki verið mælt gegn raun-Vercel/Supabase latency. Fyrsta import gæti tímaðst út á hægu neti. Mistakist hún þarf að kalla admin refresh aftur — retry-mekanisminn meðhöndlar þetta.

**3. `relevanceScore` Google penalty þegar Google er ein uppspretta (lágt)**

Google fallback kallaðist einungis þegar HMS og static skila engu. `dedupeAndRank` beitir þá `-20` penaltý á Google niðurstöður þrátt fyrir að ekkert annað sé til samanburðar. Hefur engin praktísk áhrif á röðun (öll hafa sama grunnpenalty) en er villa í merkingu kóðans. Krefst ekki lagfæringar fyrir útgáfu.

**4. PlaceSearch.tsx ARIA rýni ófullnægjandi**

Staðfest: `listboxId`, debounce + AbortController + requestIdRef, scrollIntoView, rate_limited meðhöndlun. Full `aria-activedescendant` og `role="option"` rýni fór ekki fram. Ef eitthvað er óvænt birtist það í localhost-prófunum.

**5. `normalizePlaceSearchText` notar `.toLocaleLowerCase('is')` (lágt)**

Íslenska locale lowercasing getur verið platform-háð. Þar sem bæði import og leit nota sama fall er áhættan eingöngu ef Node.js útgáfa breytist milli þessara tveggja aðgerða. Í reynd mjög lítil áhætta.

### Stór operational áhætta — rollout dependency chain

Þetta er **ekki kóðagalli** heldur rekstrarvandamál. Handoffið lýsir þessu vel. Ef kóðinn er deployaður án HMS gagna:

- Staðaleit skilar aðeins static bæjarlista (mjög takmarkaður)
- Þarf `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true` sem tímabundið öryggisnet

**Rétt rollout-röð (framlengir rollout-lýsingu Codex):**

| Skref | Skilyrði |
|-------|---------|
| 1 | Localhost-próf (section 13 í v001 handoffinu) |
| 2 | Staðfesta HMS attribution/endurnýtingarheimild |
| 3 | Setja `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true` sem öryggisnet |
| 4 | Keyra `sql/94_hms_place_directory.sql` — sérstakt leyfi |
| 5 | Deploya kóða með `HMS_PLACE_DIRECTORY_REFRESH_ENABLED=true` |
| 6 | Kalla admin refresh einu sinni og staðfesta active dataset |
| 7 | Slökkva `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=false` |

---

## 4. Samantekt: Óhætt að gefa út?

### v099 (route confidence drawer og sorting)

**Já, að uppfylltum þessum skilyrðum:**

1. Stebbi keyrir localhost-próf (section 13 í v099 handoffinu)
2. Stebbi staðfestir `git status` á `RouteComparisonMiniMap.tsx`
3. Road-graph snapshot refresh fær sérstakt leyfi þegar við á

Commit, push og deploy þurfa sérstakt leyfi.

### v001 (HMS-first staðaleit og GPS)

**Já fyrir kóðadeploy, en HMS virkni þarf sérstakt leyfi í hverju skrefi:**

1. Localhost-próf (section 13 í v001 handoffinu) — gera má strax með static leit og GPS
2. HMS attribution staðfesting — án þessa má aldrei kalla import
3. SQL migration — sérstakt leyfi
4. `HMS_PLACE_DIRECTORY_REFRESH_ENABLED` — sérstakt leyfi
5. Admin refresh og staðfesting

Kóðinn má deploya fyrir skref 4–7 ef `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=true` er sett tímabundið. Commit, push og deploy þurfa sérstakt leyfi.

---

## 5. Supabase, SQL, auth og production

- **SQL skrifað af þessari rýni:** ekkert
- **Skrár breyttar:** ekkert
- **Gögn lesin úr Supabase:** ekkert
- **Production/deploy/billing:** engin breyting
