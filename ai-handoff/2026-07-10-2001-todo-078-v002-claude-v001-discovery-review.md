# Claude Code: Tjaldferð — tæknileg rýni og product discovery

Created: 2026-07-10 20:01
Timezone: Atlantic/Reykjavik
Tengist: TODO #078
Byggt á: v001 Codex handoff (2026-07-10-1953-todo-078-v001-codex-tjaldferd-product-discovery.md)

Engar kóðabreytingar í þessari handoff. Þetta er rýni, discovery og tillögur.

---

## Svör við spurningum Codex til Claude Code

### 1. Hvaða Ferðaveðrið föll eru endurnýtanleg beint?

Eftirfarandi eru **endurnýtanleg óbreytt**:

| Fall / týpa | Skrá | Endurnýting í Tjaldferð |
|---|---|---|
| `resolveThresholds()` | `lib/weather/thresholds.ts` | Keyra með nýjum `campingKind` í stað `trailerKind` |
| `buildForecastRows()` | `lib/weather/travel.ts` | Beint endurnýtanlegt fyrir dvöl á tjaldsvæði — sama format |
| `deriveGustSeverity()` | `lib/weather/travel.ts` | Beint endurnýtanlegt |
| `HourPoint`, `WeatherStatus`, `TravelPointForecast` | `lib/weather/types.ts` | Grunntypar haldast |
| `ForecastDrawerRow`, `ForecastDrawerMetricCell` | `lib/weather/types.ts` | Beint endurnýtanlegt |
| `getHoursNearEta()` (internal) | `lib/weather/travel.ts` | Þarf að flytja upp sem export |
| `enrichWithArrivalWeather()` (internal) | `lib/weather/travel.ts` | Hér er komuveðrið á tjaldsvæði — þarf að flytja upp |

### 2. Hvaða föll eru of UI-tengd og þarf að draga út?

**`checkTravelWeather()`** (lib/weather/travel.ts lína 687) er stærsta vandinn.
Hún er eitt monolitískt fall sem sameinar:

- forspár per punkti
- candidate-generation (30 mín intervals)
- best-window logic
- next-caution scan
- audit map
- `DeterministicResult` pökkun með `svar` texta

Fyrir Tjaldferð þarf **hvert legg og hverja dvöl að vera sjálfstætt metið**. Ef `checkTravelWeather()` er köllað einu sinni per legg í 3-stöðu ferð, færst niðurstaðan í 3 aðskildar `DeterministicResult`-skrár með engu sameiningarlagi yfir.

**Tillaga**: Draga út kjarnamatið í nýtt exportað fall:

```ts
// lib/weather/legAssessment.ts  (nýtt)
export function assessRouteLeg(input: RouteLegInput): RouteLegAssessment
export function assessStayWindow(input: StayWindowInput): StayAssessment
export function aggregateTripAssessment(legs: RouteLegAssessment[], stays: StayAssessment[]): TripAssessment
```

`checkTravelWeather()` heldur áfram að vera óbreytt (bakwards-compat fyrir Ferðaveðrið) og kallar inn í þessi nýju föll.

### 3. Lágmarks gagnalíkan fyrir tjaldsvæði

```ts
type Campsite = {
  id: string           // slug, t.d. 'landmannalaugar'
  name: string         // 'Landmannalaugar'
  lat: number
  lon: number
  region: string       // 'Suðurland', 'Norðurland' etc.
  openMonths?: number[] // [5,6,7,8,9] — ef vitað
  exposed: boolean     // opið/útsétt, eða skjólsælt — áhrif á UI contextualization
  source: string       // 'curated_2026' — rekjanleiki
}
```

Phase 1: Statísk listi í `lib/camping/campsites.ts`.
Phase 2: `public.campsites` tafla í Supabase með RLS (read-only public, write = service_role).

### 4. Hvaða API endpoints þarf?

**MVP 1 — handvirk ferð:**

```
POST /api/teskeid/camping/assess-trip
Body: { stops: TripStopInput[], equipment: CampingEquipment, departureIso: string }
Returns: TripAssessmentResult
```

Þetta kallar Google Routes API per legg (N-1 legar fyrir N stöðvar) og Met.no per sample-punkti + tjaldsvæðisspá.

**MVP 2 — re-check vistuð ferð:**

```
POST /api/teskeid/camping/recheck/:tripId
Returns: TripAssessmentResult (ný snapshot + delta frá síðasta)
```

**MVP 3 — campsite suggestions:**

```
POST /api/teskeid/camping/suggest
Body: { origin, dates, maxDriveMinutes, nights, equipment, region? }
Returns: RankedCampsite[]
```

Þetta endpoint þarf staged evaluation (sjá kostnaðargreining).

### 5. Öruggasta gagnalíkan með RLS fyrir vistaðar ferðir

```sql
-- camping_trips: ein röð per ferð
-- user_id = auth.uid() í öllum RLS policies
CREATE TABLE camping_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,                          -- notandaskilgreint heiti
  equipment text NOT NULL,            -- 'tent' | 'camper' | 'caravan'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE camping_trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES camping_trips(id) ON DELETE CASCADE,
  position integer NOT NULL,          -- 0 = origin, 1+ = stops
  campsite_id text,                   -- null ef custom staður
  custom_name text,
  lat numeric NOT NULL,
  lon numeric NOT NULL,
  arrival_iso timestamptz,
  nights integer,
  departure_iso timestamptz
);

CREATE TABLE camping_trip_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES camping_trips(id) ON DELETE CASCADE,
  calculated_at timestamptz DEFAULT now(),
  overall_status text NOT NULL,       -- 'graent' | 'gult' | 'rautt'
  assessment_json jsonb NOT NULL,     -- full TripAssessmentResult
  -- Ekki geyma raw Google/Met.no response — aðeins processed niðurstaðan
  CONSTRAINT valid_status CHECK (overall_status IN ('graent', 'gult', 'rautt'))
);

-- RLS
ALTER TABLE camping_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE camping_trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE camping_trip_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns trip" ON camping_trips FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user owns trip stop" ON camping_trip_stops FOR ALL
  USING (trip_id IN (SELECT id FROM camping_trips WHERE user_id = auth.uid()));

CREATE POLICY "user owns trip snapshot" ON camping_trip_snapshots FOR ALL
  USING (trip_id IN (SELECT id FROM camping_trips WHERE user_id = auth.uid()));
```

**Mikilvægar öryggisnótur:**
- Aldrei geyma raw `place_id` úr Google í sér dálki — nota lat/lon.
- `assessment_json` á aðeins að innihalda processed niðurstöður, ekki raw provider payloads.
- Engar anonymous vistaðar ferðir — `camping_trips.user_id NOT NULL`.

### 6. API-kostnaðaráhætta og caching

**Versta-tilfelli per ferð (3 stöðvar, 2 legar + heimferð):**
- Google Routes: 3 köll (leggur 1, leggur 2, heimferð) × $5/1000 = ~$0.015
- Met.no: ~15-20 sample-punktar per legg × 3 legar = 45-60 köll (gratis)

**Suggestion mode (100 tjaldsvæði):**
- Naiv: 100 × 3 Google-köll = 300 Google köll = ~$1.50 per notanda-query
- Staged: geo-filter fyrst (haversine í JavaScript, 0 kostnaðar) → shortlist 5-10 → Google-köll aðeins á þá

**Caching-strategy:**

```
Route cache: (originLat,originLon,destLat,destLon) → route result, TTL 24h
  (Legar breytast ekki mikið á milli daga)

Forecast cache: (forecastLat,forecastLon) → HourPoint[], TTL 1h
  (Met.no uppfærir á 1 klst fresti)
```

Nota Redis eða Supabase Edge Function cache. Ef Supabase er eini valkosturinn:
`public.route_cache` og `public.forecast_cache` með `expires_at` dálki.

**Rate limit:**
- Gestur: 2 ferðamat á dag (strangara en Ferðaveðrið)
- Innskráður: 20 ferðamat á dag
- Suggestion mode: innskráðir only, 5 queries á dag

### 7. Hvað ætti Phase 1, 2, 3 að vera?

Codex-handoff-röðunin er góð en ég legg til eina breytingu:

**Phase 0** (discovery, enginn kóði): Þetta er þessi handoff.

**Phase 1** (MVP 1, enginn SQL):
- Statískt tjaldsvæðalisti (`lib/camping/campsites.ts`, ~20-30 stöðvar)
- Einfaldur trip-builder: origin + 1-2 stöðvar + heimferð
- `assessRouteLeg()` + `assessStayWindow()` extracted úr travel.ts
- `/api/teskeid/camping/assess-trip` endpoint
- UI: trip-builder form + timeline niðurstaða
- **Engin vistuð ferð í Phase 1** — engin SQL, engin session state

**Phase 2** (vistaðar ferðir):
- SQL migration með camping_trips/stops/snapshots
- Innskráðir geta vistað og opnað aftur
- Snapshot delta: `Veðrið hefur versnað á öðrum legg` osfrv.

**Phase 3** (suggestion mode):
- Geo-filter + staged Google-routing
- Ranking algorithm

**Phase 4** (AI-túlkun): Síðast.

### 8. Hvað er hægt án SQL?

Allt í Phase 1:
- Campsite list í kóða
- Trip assessment calculation
- Ephemeral UI result (ekki vistað, bara reiknað)
- Guest access með IP rate limit (sama RPC og Ferðaveðrið notar)

---

## Ný product-hugmyndir (Stebbi bað um fleiri fídusa)

Þessar eru **hugmyndir til umræðu**, ekki samþykkt framkvæmd.

### A. Tjaldveðurþröskuldar — ekki bara akstursþröskuldar

Núverandi `resolveThresholds()` er sérhönnuð fyrir **akstur**. Tjaldferð þarf sérstaka **dvölarþröskulda**:

| Búnaður | Vindvarúð | Vindhámark | Frost-varúð (°C) | Úrkoma-varúð |
|---|---|---|---|---|
| Tjald | 8 m/s | 15 m/s | 5°C | 1 mm/klst |
| Húsbíll | 13 m/s | 20 m/s | enginn | 5 mm/klst |
| Hjólhýsi | 13 m/s | 18 m/s | enginn | 5 mm/klst |

Þetta er **nýr threshold-dimension** (hitastig) sem Ferðaveðrið þarf ekki.
Tjald í frösti er vandamál sem hiti undir 0°C á meðan gisting krefst sérstakra vara.

### B. Nóttargluggi vs. daggluggi

`buildForecastRows()` gefur alla klukkustundina. Tjaldferð þarf að aðskilja:

- **Daggluggi**: 08:00–20:00 (hvílast á tjaldsvæðinu, ferðast, skemmtist)
- **Nóttargluggi**: 22:00–06:00 (sofa í tjaldi — þetta er worst-case)

`assessStayWindow()` á að geta þegið `windowType: 'day' | 'night' | 'full'`.
Nótt á tjaldsvæði með 25 m/s vindi er rauð. Dagur á sama stað með 12 m/s er gul.

### C. Ferðadagbók-scorecard

Eftir útreikning sýnir UI þétt scorecard efst:

```
Leggur 1 (Rvk → Þórsmörk, 2:45)    🟢 Gott
Nótt 1 á Þórsmörk                  🟡 Rok (14 m/s, kl. 02:00)
Leggur 2 (Þórsmörk → Landm., 1:15) 🟢 Gott
Nótt 2 á Landmannalaugum            🔴 Rok+frost (-2°C, 19 m/s)
Heimferð (Landm. → Rvk, 3:30)      🟢 Gott

Heildarskor: RAUTT — Nótt 2 er vandinn
```

Þetta er í stíl við Ferðaveðrið-`highlightedIssue` en yfir heila ferð.
Grunnurinn (`aggregateTripAssessment()`) reiknar `worst = max(legs ∪ stays)`.

### D. "Hvað ef?" — einföld tímafærsla

Eftir útreikning: notandi smellir á legg eða dvöl og velur "Færa um +1 dag".
Kerfið endurreiknar aðeins **þann legg og þá dvöl** sem breyttist, ekki alla leggina.
Þetta er ódýrt (1-2 Met.no-köll í viðbót) og gefur mjög sterka notendaupplifun.

Útfærsla: Trip-state í client, recalculate endpoint tekur delta-input.

### E. Besta glugginn á tjaldsvæðinu

Svipað og Ferðaveðrið sýnir `bestWindow` fyrir akstur:

> "Besti gluggi til að sofa á Þórsmörk: laugardagsnótt. Vindur mun minnka í 6 m/s eftir kl. 23:00."

Þetta er determinískt: taka nóttarglugga per dag, raða eftir stöðu + hámarksvinds, sýna besta.

### F. Deilanlegur hlekkur (ephemeral)

Búa til deililegan hlekk á ferðaplan **án þess að vista gögn í DB**:
Kóða trip-params í base64 URL hash (`/tjaldvid#[base64]`). Hlutir af:
- Stöðvar (lat/lon, heiti)
- Dagsetningar
- Búnaður

Notandi deilir með fjölskyldu. Allir fá sama útreikning. Engin persónuleg gögn vistuð.
Þetta er Phase 1 feature — krefst engrar SQL.

### G. Tjaldsvæðasamanburður

Gefið: origin, dagsetningar, búnaður.
Sýna: 3 tjaldsvæði hlið við hlið með veðurstöðu per nótt.

```
              Þórsmörk    Landmann.   Kerlingarfjöll
Föstudagsnótt  🟢 Gott    🟡 Rok      🔴 Rok+frost
Laugardagsnótt 🟡 Rok     🟢 Gott     🟡 Rok
Sunnudagsnótt  🟢 Gott    🟢 Gott     🟢 Gott
```

Þetta er Phase 3 feature (þarf suggestion-mode API) en líkanið á að geta stutt það.

### H. Opnunartími tjaldsvæðis — skýr viðvörun

Ef notandi velur tjaldsvæði sem er lokað á völdum dagsetningum:

> "Þórsmörk er yfirleitt lokað fyrir maí. Þessar dagsetningar eru utan opnunartíma."

Þetta er aðeins metadata-check, enginn API-kostnaðar.
Mikilvægt að nota `openMonths` í Campsite-líkaninu frá byrjun.

### I. Smellur á spáröð í dvölarmati

Sama og `ForecastDrawer` í Ferðaveðrið — notandi getur smellt á einstakar klukkustundir í dvölarmati og séð nákvæmar tölur. `buildForecastRows()` er þegar til fyrir þetta.

### J. "Frí ferð" — gestu-útgáfa

Phase 1: Gestur getur reiknað eina einfalda 1-stöðu ferð (origin → campsite → home).
Innskráning gefur: fleiri stöðvar, vistaðar ferðir, "hvað ef?", samanburður.

Þetta er sama login-incentive og Ferðaveðrið notar.

---

## Gagnrýni á v001 handoff

### Sterkur grunnur

- Multi-stop data model frá byrjun: rétt hugsuð.
- Staged ranking for suggestions: nauðsynlegt.
- "Worst leg wins" scoring: correct — average-scoring myndi fela hættu.
- "Living trip" snapshot comparison: þetta er líklega sterkasta login-value proposition.
- Phase 0 discovery-first: réttur nálgunarmáti.

### Vantar eða þarf að skerpa

**1. Þröskuldar fyrir dvöl eru ólíkir þröskuldum fyrir akstur**

v001 gengur ráðinn út frá því að `resolveThresholds()` dugi fyrir camping. Það dugar **ekki** — hitastig er nýr dimension og vindþröskuldar fyrir tent sleeping á nóttu eru lægri en voor akstur. Þetta þarf sérstakar `campingThresholds` sem er ekki sama og `trailerKind`-líkanið.

**2. `checkTravelWeather()` þarf extraction áður en Tjaldferð er byggð ofan á**

Ef við byrjum á Tjaldferð með `checkTravelWeather()` sem er, endum við með 4 aðskildar `DeterministicResult`-niðurstöður með engu sameiningarlagi. Þarf að draga út `assessRouteLeg()` sem sér fall.

Þetta er **Phase 0.5 refactor** sem þarf að gerast áður en Tjaldferð-kóðinn er skrifaður. Það er lítið verk (5-10 föll extract, tests uppfærðar) en mikilvægt.

**3. Met.no forecast horizon**

Met.no gefur ~9.5 daga spá. Camping-ferðir geta verið 7-10 daga fram í tímann.
Þarf skýra "Spá nær ekki" viðvörun ef ferð er of langt fram á.
Við 9+ daga: "Spágögn eru ekki til fyrir þennan tíma. Reyndu nær dagsetningu ferðar."

**4. Campsite coverage á Íslandi**

Þetta er product risk, ekki tæknileg. Hvað ef tjaldsvæðið sem notandi vill er ekki á listanum? Phase 1 þarf "custom location" — notandi slær inn staðarnafn (Google Places) og fær spána þar án þess að tjaldsvæðið sé í curated lista.

**5. UI hættan: "Dashboard hell"**

v001 nefnir þessa hættu og hún er raunveruleg. Scorecard-hugmyndin (C hér að ofan) er lykillinn — **einn compact row per legg/dvöl**, ekki card-stafla. Collapse-logic: notandi smellir á row til að sjá nákvæmar tölur.

---

## Ráðlögð röð framkvæmdar

1. **Phase 0.5** (fáeinar klukkustundir): Draga `assessRouteLeg()` og `assessStayWindow()` út úr `checkTravelWeather()` sem exportað föll. Ferðaveðrið heldur óbreytt. Próf í báðum.

2. **Phase 1a**: `lib/camping/campsites.ts` — curated listi ~20 stöðvar. Gagnalíkan `Campsite`. Engin UI.

3. **Phase 1b**: `/api/teskeid/camping/assess-trip` endpoint + `assessRouteLeg()` + `assessStayWindow()`.

4. **Phase 1c**: Trip-builder UI + timeline niðurstaða + scorecard.

5. **Phase 1d** (valkvæmt): Deililegt URL hash. Engin DB.

6. **Phase 2**: SQL + vistaðar ferðir + snapshot delta.

7. **Phase 3**: Suggestion mode.

---

## Opnar spurningar sem Stebbi þarf að svara

1. **Heiti**: `Tjaldferð` eða `Tjaldveðrið`? (product branding ákvörðun)
2. **Custom staðsetning**: Á Phase 1 að leyfa custom staðsetningu (Google Places) eða **aðeins** curated tjaldsvæði?
3. **Gestuðar ferðir**: Á gestur að fá reikna 1-stöðu ferð án innskráningar?
4. **Phase 0.5 refactor**: Á Claude Code að draga `assessRouteLeg()` út úr `checkTravelWeather()` sem sér Phase 0.5 verk, áður en Tjaldferð-kóðinn byrjar? (Þetta er endurnýting-refactor, breytir ekki Ferðaveðrið-hegðun.)
5. **Tjaldsvæðalisti**: Hvaðan koma fyrstu 20-30 tjaldsvæðin? (Ferðalag.is? Handvirk? Ferðamálastofa?)
6. **Nóttargluggi vs. daggluggi**: Á kerfið að meta þetta sérstaklega (hugmynd B hér að ofan)?

---

## Localhost checks fyrir Stebbi

Engin kóðabreyting í þessari handoff — ekkert að prófa á localhost.

Þegar Phase 1 kemur þarf að prófa:
- Mobile 360px: trip-builder form án horizontal overflow
- Keyboard open í place-search field: inputs hverfa ekki á bak við keyboard
- Loader sýnilegur á meðan Google + Met.no köll eru í gangi
- 1-stöðu ferð (einföld)
- 2-stöðu ferð (origin → campsite A → campsite B → home)
- Tjaldsvæði utan opnunartíma: viðvörun sýnileg

---

## Óvissa / þarf að staðfesta

- **Confidence medium**: Að `checkTravelWeather()` sé hægt að endurnýta með litlum breytingum. Fallið er stórt (~400 línur) og monolitískt — extraction gæti leitt í ljós óvænt tenging.
- **Confidence low**: Tjaldsvæðaopnunartímar — þessir gögn eru oft óstaðfest eða óskrásett. "Best effort" er líklega eina mögulega Phase 1 nálgunin.
- **Óstaðfest**: Hvort `check_and_increment_ip_rate_limit` RPC geti tekið við camping guest rate limit (líklegt já, sama pattern og weather guest).
- **Forsenda**: Met.no API er gratis og án throttling á þessum request volumes. Þarf að staðfesta ef suggestion mode felur í sér meira en ~100 köll á mínutu.
