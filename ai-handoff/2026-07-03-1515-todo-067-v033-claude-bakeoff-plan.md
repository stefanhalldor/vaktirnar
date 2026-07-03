# TODO #67 Vedrid - Provider bake-off plan (v033)

Created: 2026-07-03 15:15
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Planning handoff. Leiðrétting á v029 og samþætting v031/v032. Engin kóðavinna, SQL, env, Supabase, commit, push, deploy eða production breytingar gerðar.

---

## Tilgangur

Þetta skjal fangar þrjá hluti í einni handoff:

1. **Leiðréttingar á v029** (villur sem Codex v030 uppgötvaðar)
2. **Bake-off plan** (v031 — test Google og Mapbox, velja einn)
3. **Admin toggle** (v032 — env var í Phase 2A, admin UI seinna)

---

## Leiðréttingar á v029

### Lyklar — Static Maps vandinn

v029 gerði ranga forsendu: að server key mætti nota í Static Maps URL sem fer til browser. Það er rangt — URL inniheldur `key=` parameter sem er sýnilegur í DevTools.

**Rétt lykla-uppbygging:**

| Lykill | Notaður fyrir | Hvar |
|--------|--------------|------|
| `GOOGLE_MAPS_SERVER_KEY` | Geocoding API, Routes API | Server only — aldrei í browser, aldrei í URL sem fer til client |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Static Maps API, Places API, Maps JS API | Browser-visible, **restricted í Google Cloud Console** |

**Restrictions á browser key (þarf Stebbi að setja upp í Google Cloud Console):**
- HTTP Referrer (website): `https://teskeid.is/*`, `https://*.teskeid.is/*`, `http://localhost:*/*`
- API restrictions: Static Maps API, Places API (New), Maps JavaScript API
- Þegar Capacitor kemur: bæta við app bundle ID

Browser key er sýnilegur, en restricted — einhver gæti notað hann til að biðja um static maps myndir, en aðeins á allowed domains og allowed APIs. Þetta er standard Google-mynstrið.

---

### Verðtafla — leiðrétt

Upprunalegar tölur í v029 voru rangar. Rétt úr Google pricing page (skoðað 2026-07-03 af Codex v030):

| API | Ókeypis/mánuð | Eftir það |
|-----|--------------|-----------|
| Static Maps | 10,000 req | $2/1,000 |
| Geocoding | 10,000 req | $5/1,000 |
| Routes Essentials | 10,000 req | $5/1,000 |
| Places Autocomplete requests | 10,000 req | $2.83/1,000 |
| Places UI Kit Autocomplete (per session) | 10,000 sessions | $10/1,000 |

Við MVP-umfang Teskeid (fáar hundraðar users) er líklegt að við séum vel innan ókeypis þrepanna. En budget alerts á Google Cloud eru nauðsynlegar áður en nokkurt prófun hefst.

---

### Places Autocomplete — nákvæm spec

v029 tilgreindi ekki hvaða Places product, hvaða fields, né session token lifecycle. Hér er það:

**Valið:** Places Library í Google Maps JavaScript API með session tokens.

**Flæði:**
1. Browser hleður `@googlemaps/js-api-loader` með `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — libraries: `['places']`
2. Notandinn byrjar að skrifa í leitarbox → `Autocomplete` widget
3. Session token búinn til við upphaf leitarinnar og haldið í state
4. Notandinn velur candidate → `place.getDetails()` kallað með session token og takmarkuðum fields:
   - `place_id`
   - `name`
   - `formatted_address`
   - `geometry.location` (lat/lon)
5. Session lýkur við val. Næsta leit fær nýjan session token.
6. Client sendir `{ placeId, displayName, lat, lon }` til server — **engar frekari Google API köll á client**
7. Server notar lat/lon beint í met.no og route weather (geocoding lykils þarf ekki ef client skilar lat/lon)

**Kostnaður:** Session-based billing — öll autocomplete keystrokes í einni leit eru eitt session (ef session tokens eru rétt notuð). Val á Place Details er innifalið í session-verðinu.

**Mapbox equivalent:** `mapbox-gl` + Mapbox Search JS eða Search Box API — svipað session-mynstur.

---

## Admin toggle — env var í Phase 2A

Stebbi vill geta skipt á milli Google og Mapbox. Env var er nóg í Phase 2A:

```
WEATHER_MAP_PROVIDER=google   # eða: mapbox
```

**Breyta í Vercel:** Settings → Environment Variables → breyta → Save → Redeploy (1-2 mínútur). Hægt á síma.

**Server-side read:** Provider adapter les `process.env.WEATHER_MAP_PROVIDER` við request. Ef gildi er óþekkt eða tómt → `provider_unavailable` svar.

**Admin UI með Supabase** (persistent toggle án redeploy) er seinna verk með eigin execution permission og security review. Þarf ekki fyrir bake-off.

---

## Bake-off — uppbygging

### Markmið

Nota sömu 12 test-cases með báðum providers og velja þann sem gefur betri notendaupplifun á íslenskum staðarheitum.

### Test-cases (12 fest)

| # | Input | Tegund | Vandinn sem er prófaður |
|---|-------|--------|------------------------|
| 1 | `Sudurgata` | Geocoding | Tvíræðni — margar Sudurgötur |
| 2 | `Sudurgata Reykjavik` | Geocoding | Tvíræðni með borg |
| 3 | `Sudurgata Hafnarfjordur` | Geocoding | Borg sem útilokar |
| 4 | `Moso` | Geocoding | Óformlegt heiti |
| 5 | `Grafarholtid` | Geocoding | Inflected + óformlegt |
| 6 | `Grafarholtsvollur` | Geocoding | Golf-sértækt heiti |
| 7 | `Apavatn` | Geocoding | Lítill ferðamannastaður |
| 8 | `Husavik` | Geocoding | Þorp á landsbyggðinni |
| 9 | `Reykjavik → Apavatn` | Route | Þekkt leið |
| 10 | `Selfoss → Reykjavik` | Route | Önnur þekkt leið |
| 11 | `Bæjarholt 99` | Geocoding | Tilbúið/óþekkt heiti |
| 12 | `Reykjavik → Atlantis` | Route | Ógild leið |

### Mælikvarðar per test-case

| Mælikvarði | Útskýring |
|------------|-----------|
| Réttur efsti candidate | Já/Nei |
| Þarf notendastaðfestingu | Já/Nei |
| Candidate fjöldi (1-5+) | Fjöldi |
| Gæði (1-5) | Subjective — hversu gagnlegur er listinn |
| Seinka (ms) | Rough estimate |
| Villa/failure | Villukóði eða engin |

### Framkvæmd bake-off (leiðbeiningar fyrir Stebbi)

1. `WEATHER_MAP_PROVIDER=google` í Vercel → redeploy
2. Keyra 12 test-cases → taka niðurstöður (spreadsheet eða handrit)
3. `WEATHER_MAP_PROVIDER=mapbox` í Vercel → redeploy
4. Keyra sömu 12 test-cases → taka niðurstöður
5. Bera saman — velja provider

Timebox: 1-2 dagar, ekki lengur.

### Hvað kemur úr bake-off

Einn provider valinn. Allar `provider_unavailable` fallbacks haldast (ef selected provider er niðri → skýrt svar, ekki crash). Seinna: fjarlægja ónotaðan provider adapter.

---

## Phase plan (uppfært, einfaldað)

### Phase 2A1 — Intent + golf (engir provider lyklar þarf)

Sama scope og áður. Lykilatriðið: route intent skilar `provider_not_configured` í stað map confirmation. Engin map UI í þessum phase.

Inniheldur:
- `detectIntent`: + `activity_window_golf` + `route_towable_trailer`
- `extractGolfPlace`, `extractTrailerKind`, `extractRouteOrigin`, `extractRouteDestination`
- `checkGolfWindow` tool (4.5h sliding window, best + 2 alternatives)
- Golf entries í `places.ts`: Grafarholt golfvöllur, [Stebbi bætir við fleiri]
- Ferðamannastaðir í `places.ts`: Apavatn + [Stebbi bætir við fleiri]
- Messages: golf svör, route "provider not configured", "staður óþekktur"
- Tests: ~30-35 tests

Þarf frá Stebba: lista yfir golf courses og ferðamannastaði sem á að bæta í `places.ts`.

---

### Phase 2A2 — Provider adapters + map confirmation + bake-off

Þarf Google og Mapbox lykla til staðar áður en þetta getur verið prófað.

Inniheldur:

**Provider adapters (server):**
- `lib/weather/google.server.ts`: `geocodePlace`, `getRouteGeometry`, `staticMapUrl`
- `lib/weather/mapbox.server.ts`: `geocodePlace`, `getRouteGeometry`, `staticMapUrl`
- `lib/weather/provider.server.ts`: les `WEATHER_MAP_PROVIDER`, velur adapter

**Map confirmation UI (client):**
- Static map mynd (úr `staticMapUrl`) + "Þetta er rétt / Breyta"
- Places Autocomplete leitarbox (þegar "Breyta" eða staður óþekktur)
- Einn map panel per confirmation flow — **ekki margir interactive maps í lista**
- Design.md constraints: mobile-first, 16px inputs, engin horizontal overflow, loading state

**Bake-off toggle:**
- Les `WEATHER_MAP_PROVIDER` env var server-side
- Ef gildi vantar eða óþekkt → `provider_not_configured` svar

**Tests:** ~25-30 tests með mocked API responses fyrir báða providers

---

### Phase 2A3 — Route weather eftir staðfestingu

Eftir bake-off og provider valinn. Scope óbreytt frá v022/v027:
- Route sampling (3-5 km spacing, 80 punkta cap)
- met.no worst-case aggregation
- Trailer evaluation + horse trailer caveat
- AI wording þegar `WEATHER_AI_ENABLED=true`
- Latest-departure (ef Stebbi vill í þessum phase)

---

### Phase 2A4 — Combined pre-release

Phase 1 + 2A1 + 2A2 + 2A3 saman til localhost prófunar og production.

---

## Hvað Stebbi þarf að setja upp (áður en Phase 2A2 getur prófað)

### Google Cloud Console

1. Fara í https://console.cloud.google.com → Credentials
2. Búa til **server key**:
   - Nafn: `Teskeid Server Key`
   - API restrictions: Geocoding API, Routes API
   - Application restrictions: IP (recommended) eða none
   - Setja sem `GOOGLE_MAPS_SERVER_KEY` í `.env.local` og Vercel
3. Búa til **browser key**:
   - Nafn: `Teskeid Browser Key`
   - Application restrictions: HTTP referrers — `https://teskeid.is/*`, `https://*.teskeid.is/*`, `http://localhost:*/*`
   - API restrictions: Maps Static API, Places API (New), Maps JavaScript API
   - Setja sem `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` í `.env.local` og Vercel
4. **Budget alert:** Billing → Budgets & alerts → Set $20/mánuð alert

### Mapbox (ef bake-off felur í sér Mapbox)

1. Fara á https://account.mapbox.com → Tokens
2. Búa til **secret token**:
   - Leyfa: Geocoding, Directions (server APIs)
   - Setja sem `MAPBOX_SECRET_TOKEN` í `.env.local` og Vercel
3. Búa til **public token**:
   - Takmarka á URL: `https://teskeid.is`
   - Setja sem `NEXT_PUBLIC_MAPBOX_TOKEN` í `.env.local` og Vercel
4. **Budget alert:** á Mapbox account settings

### Env var toggle

```
WEATHER_MAP_PROVIDER=google
```

Setja í Vercel. Breyta á síma í Vercel Dashboard → Settings → Environment Variables → Redeploy.

---

## Hvað Claude Code gerir EKKI án framkvæmdaleyfis

- Engar kóðabreytingar
- Engar env breytingar
- Engar SQL/migration breytingar
- Ekkert commit eða push
- Engir API lyklar bætt við
- Engin dependency packages bætt við

---

## Localhost checks for Stebbi

### Phase 2A1 (golf, engir provider lyklar þarf)

1. Golf þekktur staður:
   - `Hvenær er best að spila golf í Grafarholti á morgun?`
   - Expected: best gluggi + 1-2 alternatives, vindur/úrkoma/hitastig rökstuðningur. 10-11 m/s er ekki rautt.
2. Golf óþekktur staður:
   - Golfvöllur sem er ekki í `places.ts`
   - Expected: skýr "þetta staðarheiti þekki ég ekki" — ekkert veðurmat
3. Route intent (án provider):
   - `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?`
   - Expected: "provider ekki stilltur" eða "staðfesting þarf" — ekkert fake route weather
4. Grill regression:
   - `Er grillveður í Mosó í kvöld?`
   - Expected: virkar eins og Phase 1

### Phase 2A2 (Google/Mapbox lyklar til staðar)

5. Static map lykill:
   - DevTools Network tab: `GOOGLE_MAPS_SERVER_KEY` kemur aldrei fram í neinum URL eða request
   - `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` er einungis í map/places requests
6. Map confirmation, þekktur staður:
   - Reykjavík og Apavatn (báðir í `places.ts`)
   - Expected: static map mynd með tveimur pinna, confirm buttons. Geocoding API kallað ekki.
7. Map confirmation, óþekktur staður:
   - Stað sem er ekki í `places.ts`
   - Expected: Places Autocomplete leitarbox, notandinn velur, static map sýnd
8. Leiðrétting:
   - "Breyta" → leit → nýr staður → ný static map
   - Expected: engin global geymsla á Google Places niðurstöðunni
9. Bake-off toggle:
   - `WEATHER_MAP_PROVIDER=google` → Google static map og Places Autocomplete
   - `WEATHER_MAP_PROVIDER=mapbox` → Mapbox static map og Search
   - Provider stable í öllu einu flæði
10. Provider failure:
    - Slökkva á lykli → skýr "route provider ekki tiltækur" — ekkert crash
11. Mobile (360, 390, 460 px):
    - Static map mynd fit, engin horizontal overflow
    - Places Autocomplete input ≥16px, engin iOS zoom
    - Confirm buttons reachable
12. Billing:
    - Static map birtist ekki aftur og aftur í einu flæði
    - Autocomplete fires ekki uncontrolled loops

### Ekki prófa

- High-volume route/geocoding loops gegn billing
- Production secrets í devtools
- Google og Mapbox blönduð í sama flæði

---

## Óvissa / þarf að staðfesta

- **Google Places session token lifecycle í Capacitor WebView:** Likely virkar eins og í browser, en þarf test þegar Capacitor setup byrjar.
- **Mapbox Search session billing:** Svipað mynstur og Google, en spec er öðruvísi — þarf að staðfesta við implementation.
- **Google Routes free tier (10,000/mánuð):** Gæti orðið þröskuldur ef Teskeid vex hratt. Monitor í Google Cloud billing.
- **Confidence: high** á Static Maps lykla-uppbygginguna — þetta er standard Google recommendation.
- **Confidence: high** á env var toggle — einfalt og rétt fyrir bake-off.
- **Confidence: medium** á Places Autocomplete session costs — háð því hvernig notendur nota leitina.
