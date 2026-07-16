# TODO 086 - v041 detail card Veðurstofan layout

Created: 2026-07-12 21:30
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Prerelease handoff
Input: Beiðni frá Stebba eftir v040 Codex rýni
Base: uncommitted changes á ofan `0252a74 feat: wire Veðurstofan station data into route weather points (#86)`
Scope: UI-breyting á `RouteWeatherPointDetailCard.tsx` og tvær i18n-skrár.

---

## Hvað var gert í v041

### Beiðni Stebba

> "Þá myndi ég vilja að á detail spjaldinu myndi sjást, alveg neðst (fyrir neðan hlekkina helst)
> Veðurstofan (eingöngu til viðmiðunar að svo stöddu)
> Nálægasti punktur er x m (eða km) frá veginum.
> Heiti stöðvar
> Öll fáanleg veðurgildi"

### Breyttir skrár

**`components/weather/RouteWeatherPointDetailCard.tsx`**

- Veðurstofan-hlutinn **færður neðar** -- kemur nú á eftir hlekka-blokkina (Spá / Yr / Google Maps / Hrá met.no gögn) frekar en á undan henni
- Nýtt skipulag Veðurstofan-hlutans:
  1. Haus (10px, medium, dimmari): `Veðurstofa Íslands (eingöngu til viðmiðunar að svo stöddu)`
  2. Fjarlægðarlína (10px, enn dimmari): `Nálægasti punktur er 7,7 km frá veginum`
  3. Stöðvarnafn og tími: `Garðabær - Kauptún · kl. 21:00 [· gömul gögn]`
  4. Öll veðurgildi: `Vindur: 7 m/s S · Úrkoma: 0,2 mm/klst · Hiti: 11°C`
  5. Veðurlýsing ef til staðar: `Skýjað` (11px, dimmari)

- Bætt við **úrkoma** (`precipitationMmPerHour`) og **veðurlýsing** (`weatherText`) -- báðar vantaði í v037
- Fjarlægðin er nú á sinni eigin línu með textalegum label í stað sviga á stöðvarnafnslínunni
- `distanceStr` reiknast inline: `< 1000m` → `X m`, `>= 1000m` → `X,X km` (formatNum + locale)

**`messages/is.json`**

Bætt við tveimur nýjum lyklum í `teskeid.vedrid.ferdalagid`:
```json
"vedurStofanSubtitle": "eingöngu til viðmiðunar að svo stöddu",
"vedurStofanNearestPoint": "Nálægasti punktur er {distance} frá veginum"
```

**`messages/en.json`**

Samsvarandi enskir lyklar:
```json
"vedurStofanSubtitle": "for reference only at this stage",
"vedurStofanNearestPoint": "Nearest point is {distance} from the road"
```

---

## Hönnunarákvarðanir

**Röðun:** Veðurstofan neðar en hlekkir -- Veðurstofan er viðmiðun, ekki aðalsvar. Notandi sér MET/Yr niðurstöðuna og hlekki til nánar áður en hann skoðar Veðurstofan-hlutann.

**Fjarlægðarlína:** Textaleg setning ("Nálægasti punktur er X frá veginum") frekar en tölulegt gildi í svigum við stöðvarnafn. Skýrara og auðveldara að lesa. Tvær stærðirnar (m / km) eru reiknaðar inline og sendar inn sem `{distance}` í i18n-streng -- þarf því aðeins einn lykil, ekki tvo.

**Öll gildi:** Úrkoma og veðurlýsing voru til staðar í `forecastRows` frá Phase 2A en birtust ekki. Bætt við í v041. Öll gildi skilyrðisbundin (null-check) -- ef gildi er null birtist það ekki.

**Engin breyting á verdictum:** Þetta er eingöngu UI-endurskipulagning. Engin rök, engin reiknibreyting, engin API-breyting.

---

## Verification

```
npm run type-check -- exit 0
npm run test:run lib/__tests__/travelAuditMap.helpers.test.ts lib/__tests__/weather-travel-api.test.ts -- 83 tests passed
```

Engar nýjar prófanir þurfti -- breytingarnar eru UI-layout og i18n-lyklar eingöngu. Öll rök sem prófanir ná yfir (row-selection, enrichment, timeout) eru óbreytt.

---

## Localhost checks fyrir Stebba

1. Opna `/vedrid` á localhost og reikna leið (t.d. Reykjavík - Akureyri)
2. Smella á route point í kortinu
3. Staðfesta að **hlekkir** (Spá / Yr / Google Maps / Hrá met.no) birtast eðlilega
4. Staðfesta að **Veðurstofan-hlutinn kemur FOR NEÐAN hlekki**
5. Sannreyna skipulag:
   - Haus: "Veðurstofa Íslands (eingöngu til viðmiðunar að svo stöddu)"
   - Fjarlægðarlína: "Nálægasti punktur er X m / X,X km frá veginum"
   - Stöðvarnafn + kl. HH:MM
   - Veðurgildi: Vindur + Úrkoma + Hiti (öll sem eru til staðar)
   - Veðurlýsing ef til staðar (t.d. "Skýjað")
6. Breyta departure slot -- Veðurstofan-tíminn á að uppfærast með ETA
7. Skoða mobile (360-460px) -- engin lárétt overflow

---

## Hvað er EKKI í v041

- Engar breytingar á verdict-logic, heatmap, eða route recommendations
- Engin ný Supabase-tafla eða migration
- Engar breytingar á API (`route.ts`)
- Engar breytingar á prófunarforgöngum (`types.ts`, helpers)
- Commit/push þarfnast sérstaks leyfis

---

## Samantekt breytinga

```
components/weather/RouteWeatherPointDetailCard.tsx  -- UI endurskipulagning
messages/is.json                                    -- 2 nýir lyklar
messages/en.json                                    -- 2 nýir lyklar
```

4 skrár. Engar SQL-breytingar. Engar RLS, auth, eða production schema breytingar.

---

## Supabase / RLS / Production

- Engar SQL breytingar
- Engin migration
- Engar RLS, auth, eða production schema breytingar
- `weather_cache` óbreytt
