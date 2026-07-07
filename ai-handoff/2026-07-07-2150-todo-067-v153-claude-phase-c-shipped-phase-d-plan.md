# Handoff: todo-067 v153 - Phase C shipped, Phase D plan

**Date:** 2026-07-07 21:50
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Commit:** `33283c1` á main

---

## Phase C - shipped

Commit `33283c1` inniheldur alla Phase C vinnu (v149-v152 findings leiðrétt):

- `lib/weather/ferryPorts.ts` - bbox-detection, FERRY_PORTS
- `lib/__tests__/ferryPorts.test.ts` - 13 tests
- `components/weather/RouteSelectionStep.tsx` - ferry picker UI
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` - ferrySelection state
- `messages/is.json` + `messages/en.json` - 6 ferry-lyklar

### Lokin findings

| Finding | Lykill |
|---------|--------|
| Stöðugar route ids | v147 |
| Fallback þegar routes bregðast | v147 |
| Public top nav (óinnskráðir) | v147 |
| isVestmannaeyjarDestination (bbox-only) | v149 |
| Ferry picker UI | v149 |
| Stale result við hafnarskipti | v151 |
| Same-port re-click no-op | v152 |
| Text false-positive fjarlægt | v151 |

### Localhost checks eftir pull

1. `/auth-mvp/vedrid` - velja `Reykjavík → Vestmannaeyjar`
2. Ferry-kortið á að birtast
3. Velja `Landeyjahöfn` → leiðir birtast, kort sýnir til Landeyjahöfnar
4. Smella aftur á `Landeyjahöfn` → engin breyting (no-op)
5. Fara í niðurstöðu → `Ferðaveðrið er reiknað fyrir akstur að Landeyjahöfn. Það metur ekki siglingu Herjólfs.`
6. Fara til baka → skipta í `Þorlákshöfn` → gamla niðurstaðan er horfin

---

## Phase D - Saved places

### Staða

**Ekki hafið.** Þetta þarf skýrt framkvæmdarleyfi frá Stebbi vegna SQL migration.

Codex útbjó fullnægjandi plan í v152 handoff. Samantekt:

### Hvað þarf að gera

**1. SQL migration** — `sql/69_weather_saved_places.sql`

Tafla `public.weather_saved_places` með:
- `id`, `user_id`, `place_key`, `name`, `formatted_address`, `lat`, `lon`
- `usage_count`, `last_used_at`, `created_at`, `updated_at`
- Unique constraint: `(user_id, place_key)`
- place_key = `lat.toFixed(5) + ':' + lon.toFixed(5)` (reiknað á server)

RLS:
- `anon`: engin aðgangur
- `authenticated`: select/insert/update/delete — en **eingöngu eigin raðir** (`user_id = auth.uid()`)

**2. API routes**

- `GET /api/teskeid/weather/saved-places` — skilar 12 nýlegustu stöðum
- `POST /api/teskeid/weather/saved-places` — vistar eða uppfærir (upsert á place_key)
- `DELETE /api/teskeid/weather/saved-places/[id]` — eyðir eigin stað

Sama auth-mynstur og weather APIs: `AUTH_MVP_ENABLED`, `createClient()`, `getUser()`, `checkFeatureAccess('vedrid')`.

**3. TypeScript helpers** — `lib/weather/savedPlaces.ts`

`SavedWeatherPlace`, `makeWeatherPlaceKey(lat, lon)`, `normalizeSavedPlaceInput`, `savedPlaceToRoutePlace`.

**4. Client**

- `FerdalagidClient` sækir saved places við mount
- Sendir í `RouteSelectionStep` og þaðan í `PlaceSearch`
- Þegar staður er valinn: vista best-effort í bakgrunni (blokkar ekki ferðalagið)
- `PlaceSearch` sýnir `Nýlegir staðir` þegar reitur er tómur/í fókus

**5. Nýir message-lyklar**

`savedPlacesTitle`, `savedPlaceDelete`, `savedPlacesUnavailable`, `savedPlaceSaveFailed`

**6. Tests**

- SQL static test (RLS, anon-aðgangur, policies)
- API tests (auth, feature-gate, invalid coords, user_id trusted server-side)
- Component tests ef við á

### Óskráðar reglur

- Ferry-hafnir (Landeyjahöfn, Þorlákshöfn) eru **ekki** vistaðar sjálfkrafa þegar notandi velur í ferry picker — eingöngu þegar hann leitar sérstaklega.
- `user_id` er alltaf sett á server-hlið. Client-body `user_id` er hunsað.
- Engin service-role í venjulegu notendaflæði.

### Til að hefja Phase D þarf Stebbi að segja

> "Framkvæmdu Phase D" eða "Þú mátt skrifa migration og API"

---

## Test baseline við skipun

```
npm run type-check  -> exit 0
npm run test:run    -> 1809 passed / 27 skipped / 8 todo (56 files)
```

---

## Næstu fasar

| Phase D | Saved places (SQL migration + RLS) — þarf leyfi |
| Phase E | Login UI clarity (auto-submit, no magic link) |
