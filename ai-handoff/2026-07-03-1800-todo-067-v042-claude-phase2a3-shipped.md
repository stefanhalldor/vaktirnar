# TODO #67 Vedrid - Phase 2A3 shipped

Created: 2026-07-03 18:00
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Handoff — Phase 2A3 framkvæmt. Engar production env breytingar, commit eða push gerðar.

---

## Staða

Phase 2A3 er **lokið, 20 nýjar prófanir, 1613 heildarlega, ekkert brotið.**

Einnig innifalið: attribution fix í `MapConfirmation.tsx` (Google "Map data ©Google") sem var áfallið prerequisite.

---

## Hvað var gert

### Breyttar skrár

| Skrá | Breyting |
|------|----------|
| `lib/weather/tools.ts` | `checkRouteWeather()` + `RouteWeatherInput` type |
| `app/api/teskeid/weather/ask/route.ts` | `route_towable_trailer` intent: full route implementation í stað `provider_not_configured` stub |
| `messages/is.json` | `errorUnknownRoute`, `errorRouteUnavailable` |
| `messages/en.json` | `errorUnknownRoute`, `errorRouteUnavailable` |
| `app/auth-mvp/vedrid/VedridClient.tsx` | `unknown_route` og `route_unavailable` bætt við `errorCodeKeys` |
| `components/weather/MapConfirmation.tsx` | Google attribution: `Map data ©Google` neðst undir korti |
| `lib/__tests__/weather-tools.test.ts` | 20 nýjar prófanir á `checkRouteWeather` |

---

## Route weather flæði

```
POST /api/teskeid/weather/ask
  { question: "Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Akureyri?" }

1. detectIntent → 'route_towable_trailer'
2. getWeatherMapProvider() → null → 422 provider_not_configured (ef Google lyklar vantar)
   → googleProvider → halda áfram
3. extractTrailerKind → 'caravan'
4. extractRouteOrigin → "Reykjavík"
5. extractRouteDestination → "Akureyri"
6. resolvePlace("Reykjavík") → hit í curated list → { lat: 64.135, lon: -21.895 }
7. resolvePlace("Akureyri") → hit í curated list → { lat: 65.683, lon: -18.1 }
8. provider.getRouteGeometry(origin, dest) → RouteGeometry { points[80], distanceM, durationS }
9. Subsample: max 15 weather points (step = ceil(80/15))
10. Promise.allSettled: fetchForecast for each point in parallel
11. checkRouteWeather({ trailerKind, originName, destName, distanceM, durationS, pointForecasts, timeWindow })
12. getAiAnswer (ef WEATHER_AI_ENABLED=true)
13. Return envelope (án staticMapUrl — engin einstök staðsetning til að sýna á korti)
```

---

## checkRouteWeather þröskuldar

| Ástand | Vindur | Hviður |
|--------|--------|--------|
| Gult (varúð) | >= 13 m/s | - |
| Rautt (ekki mælt) | >= 18 m/s | >= 25 m/s |
| Gult (úrkoma) | - | - |

Þessar tölur eru í `WEATHER_THRESHOLDS.caravan` í `thresholds.ts` — einn staður, ekkert duplikering.

---

## Villukóðar — ný

| Kóði | HTTP | Ástæða |
|------|------|--------|
| `provider_not_configured` | 422 | `WEATHER_MAP_PROVIDER` ekki stillt eða Google lyklar vantar |
| `unknown_route` | 422 | Gat ekki dregið út uppruna eða áfangastað úr spurningunni |
| `unknown_place` | 422 | Geocoding skilaði engu fyrir uppruna eða áfangastað |
| `route_unavailable` | 422/503 | Google Routes API skilaði engri leið eða HTTP villa |
| `forecast_unavailable` | 503 | Engin met.no spá fékkst fyrir neinn punkt |

---

## Tæknileg atriði

| Atriði | Útfærsla |
|--------|----------|
| Met.no API kallsfjöldi | Max 15 punktar per leit (subsample úr 80 route punktum) |
| Parallel fetching | `Promise.allSettled` — einstaka villur í punktum hundsaðar |
| Curated-first | `resolvePlace()` prófað áður en geocoding — sparar API köll fyrir þekkta staði |
| Worst-case | `Math.max` yfir alla punkta og allar klukkustundir í tímabili |
| Horse trailer caveat | Sérstakar upplýsingar í `facts[]` fyrir `horse_trailer` |
| Disclosure | "Þetta er veðurmat, ekki umferðar- eða farartrygging." alltaf í `facts[]` |
| Static map | Engin í Phase 2A3 — route hefur enga einstaka miðpunktsstaðsetningu |

---

## Localhost checks for Stebbi

Krefst lykla (sjá v041):
```
GOOGLE_MAPS_SERVER_KEY=<server key>
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=<browser key>
WEATHER_MAP_PROVIDER=google
WEATHER_AI_ENABLED=false
```

**Phase 2A2 checks (áður óstaðfestir):**
Sjá v041 handoff — 10 checks fyrir PlaceSearch, static map, óþekkta staði.

**Phase 2A3 checks (nýir):**

1. **Þekkt leið (Reykjavík → Akureyri):** Spyrðu "Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Akureyri?"
   - Búist við: svar með vindstigi, fjarlægð/tíma, "Skoðaði X veðurpunkta", disclaimer
   - Búist við: engin kortamynd (route = engin einstök staðsetning)

2. **Hestakerra:** "Er mér óhætt að keyra með hestakerra frá Selfossi til Reykjavíkur?"
   - Búist við: "Hestakerra: gæti krafist sérstaks ökuréttindaflokks" í "Af hverju?"

3. **Óþekkt uppruni/áfangastaður:** "Er mér óhætt að keyra með eftirvagn frá Atlantis til Narnia?"
   - Búist við: `unknown_place` villa og skýrt villuskilaboð

4. **Vantar uppruna í spurningu:** "Er mér óhætt að keyra með hjólhýsi?"
   - Búist við: `unknown_route` villa — "Gat ekki skilið uppruna..."

5. **Án Google lykla:** Fjarlægðu `WEATHER_MAP_PROVIDER=google` úr `.env.local`
   - Búist við: `provider_not_configured` villa — "Veðurspá á leiðinni er í þróun"

6. **Grill/golf regression:** Prófaðu "Er grillveður í Mósó í kvöld?" og golf spurningu
   - Búist við: áfram eðlilegt — route kóðinn hefur engin áhrif á þessar slóðir

7. **MapConfirmation attribution:** Spyrðu grill/golf og sjáðu kortið (ef lyklar til)
   - Búist við: "Map data ©Google" texti neðst undir korti

---

## Næsta skref

Phase 2A (grill + golf + route) er nú fullbúið á kóðastigi. Næst:

- [ ] Localhost prófun Phase 2A2 + Phase 2A3 með Google lykla
- [ ] Commit Phase 2A1 + 2A2 + 2A3 saman eða sérstaklega (Stebbi ákveður)
- [ ] Pre-release review (Codex eða Stebbi)
- [ ] Ship

Framkvæmdarleyfi til commit: **"commitum Phase 2A3"** eða sambærilegt.
