# Handoff: TODO #75 v001 — Spáskúffa fyrir alla spápunkta á leiðinni

Created: 2026-07-08 20:08
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Related TODO: #75 (ekki enn skráð í TODO.md — til skilgreiningar)

---

## Hugmyndin

Sama Teskeið-spáskúffa sem nú sýnir spána á áfangastað (`Skoða spána á áfangastað betur`) verður aðgengileg frá hverjum spápunkti á leiðinni. Notandinn smellir á punkt í listanum eða á kortinu og fær fullar met.no spágögn í Teskeið-útliti, highlighted á þann tíma sem við notuðum í matið.

---

## Núverandi staða

**Hvað við höfum:**
- `RouteWeatherPoint` (sent til client) hefur: `metnoUrl`, `yrnoUrl`, `googleMapsUrl`, `summaryForWindow`, `forecastTimeIso` -- en **ekki** hrár `HourPoint[]`
- `TravelPointForecast` (bakendi-only, notað við útreikning) hefur `hours: HourPoint[]` fyrir hvern punkt
- Destination drawer er útfærður í `FerdalagidClient.tsx` og tekur `HourPoint[]` + `forecastTimeIso` til highlighted

**Hvað vantar:**
- `forecastHours?: HourPoint[]` á `RouteWeatherPoint`
- Bakendi fyllir það í (gögnin eru nú þegar til)
- Almennur drawer component eða callback sem tekur við hvaða `HourPoint[]`

---

## Tæknilegar breytingar

### 1. `lib/weather/types.ts`
Bæta við `RouteWeatherPoint`:
```ts
forecastHours?: HourPoint[]
```

### 2. `lib/weather/travel.ts` — `buildRouteWeatherPoints`
Við byggjum `RouteWeatherPoint[]` úr `pointForecasts`. Bæta `forecastHours: pf.hours` við hverja færslu.

### 3. `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- Gera spáskúffuna að almennum hluta sem tekur `{ hours: HourPoint[], title: string, highlightedTimeIso?: string }` í stað þess að vera fest við destination
- Bæta "Skoða spána" hnappi við hverja `RoutePointRow` sem opnar skúffuna með `pt.forecastHours`
- Highlighted tími = `pt.summaryForWindow?.forecastTimeIso` eða `activeCandidate` ETA-tími

---

## Álitaefni fyrir Codex

### A — Payload stærð
~20 punktar × ~60 tímar × 7 fields = um ~8.400 tölur viðbót í JSON svarið. Á móbíla yfir 4G er þetta líklega um 30--50KB viðbót (compressed). Er þetta ásættanlegt eða þurfum við að takmarka (t.d. max 10 punktar × 48 tímar)?

Valkostur: senda aðeins tíma ±6h kringum ETA-gluggann í stað fullrar 72h spár.

### B — Hvar birtist "Skoða spána" hnappur?
Valkostur 1: Aðeins á "Mest krefjandi á leiðinni" kortapanelnum (einn punktur).
Valkostur 2: Á hverjum `RoutePointRow` í listanum (allir punktar).
Valkostur 3: Báðar.

### C — Highlighted tími í active mode
Þegar notandinn hefur valið brottfarartíma í heatmap er `activeCandidate` til staðar og ETA á hvern punkt er reiknanlegur. Á highlighted tíminn í skúffunni vera:
- `summaryForWindow?.forecastTimeIso` (default departure), eða
- Reiknaður ETA m.v. `activeCandidate` (réttara en dýrara að senda)?

### D — Drawer component
Á að:
- Gera skúffuna að sérstakri React component í `components/weather/` (hreinna, endurnýtanlegt), eða
- Halda henni inline í `FerdalagidClient.tsx` með breyttu state (einföldara)?

---

## Kostnaðarmat

| Þáttur | Kostnaður |
|--------|-----------|
| met.no API köll | Enginn (nú þegar sótt) |
| Google Maps API | Enginn (engar nýjar beiðnir) |
| Yr.no | Enginn (URL hlekk) |
| JSON payload | ~30-50KB viðbót (compressed) |
| Server CPU | Óverulegur (engin ný vinna) |

**Niðurstaða:** Enginn beinn peningalegur kostnaður. Eina álitaefnið er payload stærð.

---

## Tengsl við núverandi kóða

- `lib/weather/types.ts:51` — `RouteWeatherPoint` type
- `lib/weather/travel.ts` — `buildRouteWeatherPoints` fall
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1003` — núverandi drawer
- `components/weather/travelAuditMap.helpers.ts` — `RoutePointRow` og `buildPointSummary`

---

## Ekki hluti af þessum handoff

- Engar breytingar á SQL, Supabase, RLS eða auth
- Engar breytingar á met.no API-köllum
- Engar Google Maps breytingar
