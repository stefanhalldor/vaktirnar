# Handoff: todo-067 v136 - Claude v134 framkvæmd

**Date:** 2026-07-07 19:20
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Branch:** main (uncommitted - v130 til v134 breytingar bíða commit)

---

## Hvað var gert

Framkvæmt allt úr v135 Codex review, Phase A scope.

---

### A1 - PlaceSearch empty-state stale-state fix

**Skrá:** `components/weather/PlaceSearch.tsx`

Í `handleSelect` catch branch (Google fetchFields bilar):

```ts
// Á undan:
if (!outcome.ok) setFetchError(true)
else if (outcome.results.length === 0) setFetchError(true)  // RANGT

// Eftir:
if (!outcome.ok) { setNoResults(false); setFetchError(true) }
else if (outcome.results.length === 0) { setFetchError(false); setNoResults(true) }
```

Skýrt aðskilin state þannig að stale fetchError/noResults hreinsar sig áður en nýtt stig er sett.

---

### A2 - Úrkomunivið 2.0 → 5.0 mm/klst, dauður kóði fjarlægður

**Skrár:** `lib/weather/thresholds.ts`, `lib/__tests__/weather-travel.test.ts`

`thresholds.ts`:
- `cautionPrecipMmPerHour: 2.0` → `5.0`
- `heavyPrecipMmPerHour: 3.0` fjarlægt (var aldrei notað - dauður kóði)

Tests uppfærðar (allar boundary references breyttar frá 2.0/2.1/3.0 yfir í 5.0/5.1):
- Lína 71-80: "returns graent at exactly 5.0 mm/h", "returns gult with precipitation (> 5.0 mm/h)"
- Lína 102-106: caravan precipitation test → 5.1
- Lína 394, 462: metric-aware tests → 5.1
- Lína 599-617: nextCaution rainy hours → 5.1
- Lína 787: `resolveThresholds` default assertion → 5.0

Ný regression test bætt við:
- "returns graent at 4.9 mm/h (below new 5.0 threshold)"

**Notendaáhrif**: Létt rigning (2-4 mm/klst) setur ekki lengur ferð í gult. Einungis 5+ mm/klst.

---

### A3 - Hugmyndir fjarlægt úr authenticated hamburger

**Skrá:** `components/teskeid/TeskeidMenu.tsx`

`AUTH_ITEMS`: `{ href: '/', labelKey: 'ideas', icon: Lightbulb }` fjarlægt.

`Lightbulb` import er áfram valid þar sem `PUBLIC_ITEMS` notar hann.

Public menu: óbreytt.
Authenticated menu: `Teskeiðar`, `Minn prófíll`, `Senda hugmynd`, `Útskráning` eftir.

---

## Test niðurstöður

```
npm run type-check  -> exit 0
npm run test:run    -> 1770 passed / 27 skipped / 8 todo (54 files)
```

Fyrri baseline: 1769. +1 ný regression test.

---

## Skrár breyttar

```
components/weather/PlaceSearch.tsx          - stale-state fix í handleSelect catch
components/teskeid/TeskeidMenu.tsx          - Hugmyndir fjarlægt úr AUTH_ITEMS
lib/weather/thresholds.ts                   - cautionPrecipMmPerHour 5.0, heavyPrecipMmPerHour eytt
lib/__tests__/weather-travel.test.ts        - boundary values uppfærðar, 1 ný regression test
```

---

## Allar uncommitted breytingar (v130-v134)

Þetta commit mun innihalda allt frá v130:

```
app/api/place/search/route.ts               - NY: BFF place search
components/weather/PlaceSearch.tsx          - Google fallback, debounce, noResults/fetchError
components/weather/RouteSelectionStep.tsx   - mapError state
components/weather/TravelAuditMap.tsx       - staticMapFailed, onError
components/teskeid/TeskeidMenu.tsx          - Hugmyndir fjarlægt
lib/weather/thresholds.ts                   - cautionPrecipMmPerHour 5.0
lib/__tests__/place-search-api.test.ts      - NY: 9 tests
lib/__tests__/weather-travel.test.ts        - boundary values uppfærðar
messages/is.json                            - title->Ferðaveðrið, noResults, errorAllProviders, m.fl.
messages/en.json                            - same
app/auth-mvp/vedrid/FerdalagidClient.tsx    - stepRouteTitle fjarlægt
```

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid` → `Veðurmörk` → staðfesta að úrkomuþröskuldur sé `5 mm/klst`
2. Reikna ferð þar sem úrkoma er 2-4 mm/klst → á að vera grænt (var gult með gamla þröskuldinn)
3. Logga inn → opna hamburger menu → `Hugmyndir` á ekki að vera til staðar
4. Opna hamburger sem óinnskráður notandi → `Hugmyndir` á áfram að birtast
5. Í PlaceSearch: slá inn ruslheiti (t.d. "xyzabc123") → á að sýna "Enginn staður fannst" texta (mild), ekki rauða villu

---

## Óvissa / þarf að staðfesta

- Google Cloud: `GOOGLE_MAPS_SERVER_KEY` þarf Geocoding API + Routes API, ekki browser-referrer restriction (release prerequisite frá v130)
- Vercel env vars: `WEATHER_ENABLED=true`, `WEATHER_FLAG=true`
- Supabase production: `sql/68_feature_access_vedrid.sql` þarf að keyra

---

## Næstu fasar

| Fasi | Skref |
|------|-------|
| v137 | Phase B: Route alternatives með text-first picker (computeAlternativeRoutes) |
| v138 | Phase C: Vestmannaeyjar/Herjólfur coordinate-based detection |
| v139 | Phase D: Saved places (SQL migration + RLS) |
| v140 | Phase E: Login UI clarity + auto-submit |

**Athugasemd um verðlag Routes API**: Codex v135 benti á að ekki megi fullyrða að `computeAlternativeRoutes` sé án aukakostnaðar - þarf að staðfesta í Google Cloud docs/pricing áður en v137 er útfært.
