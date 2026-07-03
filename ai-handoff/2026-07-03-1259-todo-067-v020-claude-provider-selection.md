# TODO #67 Vedrid - Provider-selection handoff (routing + geocoding)

Created: 2026-07-03 12:59
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Read-only review/planning. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

---

## Tilgangur

v019 (Codex) hafnaði v018 og bað um read-only provider-selection handoff áður en route weather er implementað. Þetta er sú skrá.

Tvær spurningar eru meginmálið:

1. Hvaða provider á að nota fyrir **routing** (leið milli tveggja punkta, með geometry)?
2. Hvaða provider á að nota fyrir **geocoding** (staðarheiti → lat/lon)?

Þetta skjal er rýni og tillögur. Ekkert er implementað.

---

## Núverandi staða

**Phase 1 (grill):** Kóðavinna lokið og liggur á local branch (untracked í git). Ekki committed, ekki localhost-prófað af Stebba, ekki deployed.

**Phase 2A (route/trailer):** v018 var hafnað af Codex (v019). Engin Phase 2A kóðavinna hefur farið fram.

**Það sem er þegar til staðar og nýtist síðar:**
- `lib/weather/places.ts` — staðbundin alias-kort: Moso, Grafarholt, Selfoss, Reykjavík o.fl. (10 staðir). Þetta er uppspretta laga-lausn gegn óformlegar heiti.
- `lib/weather/thresholds.ts` — golf (13/17 m/s) og caravan (13/18/25 m/s) þröskuldar eru þegar skilgreindir.
- `lib/weather/question.ts` — `extractPlace` og `parseTimeWindow` virka, en `detectIntent` skilar aðeins `'grill' | 'unknown'`.

---

## Hvað Route weather þarf sem Place weather þarf ekki

Til að svara "Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?" þarf:

1. **Geocoding:** "Reykjavík" → (64.135, -21.895), "Apavatn" → (64.162, -20.548)
2. **Routing:** Uppruni+áfangastaður → polyline eða waypoints eftir raunverulegri leið
3. **Sampling:** Velja 4-8 punkta á leiðinni
4. **met.no:** Sækja veður fyrir hvern punkt (þegar til staðar)
5. **Aggregation:** Worst-case yfir alla punkta

Geocoding og routing eru það sem vantar núna. met.no og aggregation eru lausir hlutar.

**Golf þarf ekkert af þessu.** Golf þarf bara staðarnafn (Grafarholt er þegar í `places.ts`) og tímaglugga. Þetta er lykilatriðið í Golf-first argúmentinu.

---

## Provider-mat

### Routing providers

#### OSRM (demo server)
- **Útfærsla:** Opinn hugbúnaður, notar OSM gögn
- **Kostnaður:** Ókeypis (demo server) eða self-hosted
- **Ísland:** Góð umfjöllun (OSM community á Íslandi er virk)
- **Geometry:** Já, skilar full route geometry
- **API lykill:** Þarf ekki (demo server)
- **Vandamál:** Demo-server ToS bannar framleiðslunotkun. Self-hosting þarf Docker + reglulegar OSM uppfærslur + rekstrarmenn.
- **Niðurstaða:** Góður fyrir prototyping. Ekki fyrir production án self-hosting.

#### Mapbox Directions API
- **Útfærsla:** Sky-þjónusta, RESTful, notar eigin gögnin + OSM
- **Kostnaður:** 100,000 requests/mánuð ókeypis (gjöldunarþrep eftir það: ~$1/1000 req)
- **Ísland:** Góð umfjöllun, íslensk staðarnöfn þekkt
- **Geometry:** Já, encoded polyline eða GeoJSON waypoints
- **API lykill:** Já, þarf server-side secret
- **Caching:** Leyfður innan hófsemdar, ekki óendanlegar afurðir
- **Einn provider nýtist fyrir bæði:** Já — Mapbox hefur bæði Directions og Geocoding (Search) API
- **Niðurstaða:** Sterkasta valkosturinn sem þjónustuaðili.

#### Google Directions API
- **Útfærsla:** Sky-þjónusta, mjög nákvæm
- **Kostnaður:** $10/1000 requests eftir $200/mánuð credit (sem dugar um 20.000 requests)
- **Ísland:** Frábær umfjöllun, besta þekking á íslenskum staðarnöfnum
- **Geometry:** Já, encoded polyline
- **API lykill:** Já, þarf billing setup á Google Cloud
- **Caching:** Strangar takmarkanir í ToS — almennt er bannað að varðveita niðurstöður lengur en eina lotu
- **Niðurstaða:** Dýrara, flóknari ToS, overkill fyrir þessa notkun.

#### GraphHopper Routing API
- **Útfærsla:** Sky-þjónusta, notar OSM
- **Kostnaður:** 500 requests/dag ókeypis (takmarkað)
- **Ísland:** Þekking í gegnum OSM
- **Geometry:** Já
- **API lykill:** Já
- **Niðurstaða:** Of takmarkað dagleg mörk. Síður viðeigandi.

---

### Geocoding providers

#### Nominatim (OSM)
- **Útfærsla:** Opinn hugbúnaður, notar OSM gögn
- **Kostnaður:** Ókeypis (opinber server) / self-hosted
- **Ísland:** Góð umfjöllun fyrir formlegar heiti, t.d. "Mosfellsbær" virkar vel
- **Óformlegar heiti:** "Moso" → væntanlega ekki þekkt án aliasa
- **ToS:** Ekki fyrir þunga framleiðslunotkun á opinberi server. Hægt að self-hosta.
- **API lykill:** Þarf ekki (opinber server)
- **Niðurstaða:** Góður fyrir þróun. Opinber server er of takmarkaður og ToS erfiður fyrir production.

#### Mapbox Search/Geocoding API
- **Útfærsla:** Sky-þjónusta, notar Mapbox gögn + OpenAddresses + OSM
- **Kostnaður:** 100,000 requests/mánuð ókeypis
- **Ísland:** Góð umfjöllun. "Grafarholt" og "Selfoss" virka. Óformlegar heiti gætu vantar.
- **API lykill:** Sama lykill og Directions API — einn provider, einn lykill
- **Caching:** Leyfður
- **Niðurstaða:** Sterkasta valkosturinn sem þjónustuaðili.

#### Google Geocoding API
- **Útfærsla:** Sky-þjónusta, best í heimi
- **Kostnaður:** $5/1000 requests eftir $200 credit
- **Ísland:** Besta þekking, þar á meðal óformlegar heiti
- **Niðurstaða:** Sama vandamál og Google Directions — dýrara, ToS á caching.

---

## Tillaga: Tvær leiðir

### Leið A — Mapbox (mælt með)

**Ein provider, einn API lykill, eitt billing account.**

- Mapbox Directions API → routing med geometry
- Mapbox Search API → geocoding
- 100,000 requests/mánuð ókeypis á hvorum — nær yfir alla þarfir þessa verkefnis í langan tíma
- Server-side only, passar í BFF-mynstur sem er þegar til
- Leyfir caching (mikilvægt til að lágmarka API-kostnað og virða met.no Expires headers)
- Eitt billing/account setup

**Hvað þarf frá Stebba til að halda áfram með Leið A:**
1. Mapbox account stofnað (https://account.mapbox.com)
2. API lykill búinn til (server-side, aldrei `NEXT_PUBLIC_`)
3. Lykillinn settur sem `MAPBOX_SECRET_TOKEN` í `.env.local` og Vercel env vars
4. Claude Code fær leyfi að bæta við `.env.example` og nota Mapbox SDK eða native fetch

**Hvað þarf EKKI leyfi fyrirfram:**
- Engar pakkabreytingar án sérstakrar samþykki (gæti þurft `@mapbox/mapbox-sdk` eða við notum native fetch)
- Engir API-kallar frá browser

### Leið B — Nominatim + OSRM (þróun/prototype only)

- Nominatim ókeypis geocoding (OSM)
- OSRM demo server routing (OSM)
- Engir API lyklar þarf
- **Ekki hæfur fyrir production** vegna ToS
- Gagnlegt til að prófa arkitektúr án billing setup

**Uppbygging:** Notum Leið B fyrir dev/local og Leið A fyrir production, með abstraction layer sem skiptir á milli.

**Vandinn:** Þetta tvöfaldar prófunarkomplexitana. Ef Mapbox-lykillinn kemur fljótt er betra að nota Mapbox alla leiðina.

---

## Hvað gerist þegar route lookup mistekst

Þetta er afar mikilvægt (v001 og v019 setja báðar þessa kröfu).

Þegar provider skilar ekki leiðinni (tæknileg villa, óþekkt staðarheiti, leið ekki studd), **verður svarið skýrt "ekki stutt"** — ekki veður á áfangastað, ekki veður á uppruna, ekki hlustuð approximation.

```
"Get ekki metið þessa leið.
[Ástæða: staðarheiti þekkist ekki / route provider tiltækt ekki]
Prófaðu aðra leið eða staðarheiti."
```

Þetta á alltaf við:
- Provider er niðri
- API lykill er rangur/útrunninn
- Staðarheiti er ekki leyst af geocoder
- Leið er ekki drivable (t.d. yfir sjó)
- Sampling skilar engum punktum

Aldrei á svarið að þykjast meta leið þegar einungis veður á einum punkti er til.

---

## Golf-first tillaga

Golf þarf engan provider. Golf þarf:

- Staðarnafn (Grafarholt er þegar í `places.ts`)
- Tímaglugga (already í `question.ts`)
- 4.5h window evaluator (ný function í `tools.ts`)
- Golf thresholds (þegar í `thresholds.ts`: 13/17 m/s)
- Nýtt intent í `detectIntent`: `'activity_window_golf'`

**Golf getur farið í framkvæmd strax**, óháð provider ákvörðun.

Það þýðir að Stebbi gæti samþykkt tvennt í sömu lotu:
- Golf implementation (enginn provider þarf)
- Mapbox billing setup (provider fyrir route weather)

Og síðan route weather þegar Mapbox-lykilinn er tilbúinn.

---

## Hvað Claude Code gerir EKKI í þessari handoff

- Engar kóðabreytingar
- Engar env-breytingar
- Engar Supabase/SQL breytingar
- Ekkert commit eða push
- Engir API-lyklar bætt við
- Engar pakkabreytingar

---

## Localhost checks for Stebbi

Þetta skjal er read-only planning. Engar localhost-prófanir eiga við.

Þegar provider er valinn og implementation hefst, verða localhost checks í þeirri handoff.

---

## Opnar spurningar fyrir Stebbi

1. **Provider:** Mapbox (Leið A) eða villa þú fyrst prófa með Nominatim+OSRM prototype (Leið B)?
2. **Röðun:** Golf implementation fyrst (enginn provider þarf), eða bíðum eftir provider ákvörðun og gerum golf og route saman?
3. **Pakki eða native fetch:** Vilt þú að Claude Code noti `@mapbox/mapbox-sdk` npm-pakka, eða nota native `fetch` í gegnum okkar BFF-mynstur (minna dependency overhead)?
4. **Icelandic informal names:** Mapbox þekkir "Moso" og "Grafarholtið" líklega ekki. Á Claude Code að pre-resolve óformlegar heiti gegnum `places.ts` áður en geocoder er kallaður, og kalla geocoder aðeins á formlegt heiti ef þarf?

---

## Óvissa / þarf að staðfesta

- **Confidence: medium** á Mapbox Iceland coverage fyrir minna þekkt staðarheiti (t.d. "Apavatn"). Þarf að staðfesta þegar lykill er fáanlegur.
- **Confidence: medium** á Mapbox caching terms — lestur á official ToS er mælt með áður en við implementum persistent route cache í Supabase (sql/67_weather_cache.sql).
- **Confidence: high** á að Golf-first approach er rétt — engin óvissa þar, það er staðfent af kóðanum sem er þegar til.
- **Forsenda:** Reikningur hjá Mapbox er ókeypis að stofna. Ef Stebbi hefur nú þegar account einhvers staðar (Google, Mapbox, etc.) gæti það haft áhrif á val.
