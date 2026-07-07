# TODO-067 v065 - Claude Code: Blocker/Major/Minor fixes shipped

Created: 2026-07-06 07:40
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Lokið. Engar production-breytingar, engin SQL-keyrsla, ekkert commit, ekkert push, ekkert deploy.

---

## Niðurstaða

Allar blockers, majors og minors úr Codex review (v064) lagaðar. 51/51 test files, 1639 passed.

---

## Framkvæmdar lagfæringar

### Blocker 1 — ETA per route point (`lib/weather/travel.ts`)

**Vandinn:** `findWorstMetric` notaði full route window `[departureIso, arrivalIso]` fyrir ALLA route punkta. Punkt 90% inn á leiðinni var metinn á veðri frá brottfarartíma, ekki frá þeim tíma sem notandinn er þar.

**Lagfæring:** Nýr `getHoursNearEta()` helper. `findWorstMetric` reiknar ETA per punkt:
```
fraction = distanceFromOriginM / totalDistanceM
etaMs = depMs + fraction * durMs
hours = getHoursNearEta(pt.hours, etaMs, ±1h)
```
Hvern punkt er metinn á spágögnum ±1 klst. umhverfis hans áætlaðan komumat.

### Blocker 2 — Window start/end semantics (`lib/weather/travel.ts`)

**Vandinn:** `groupCandidatesIntoWindows` setti `toIso = c.arrivalIso`. Brottfarargluggi `08:00–10:00` varð `08:00–15:00` á 5h leið — villandi.

**Lagfæring:** `toIso` er nú `c.departureIso`. Báðar hliðar gluggans eru brottfarartímar.

### Blocker 3 — Impossible home target (`lib/weather/travel.ts`)

**Vandinn:** Ef `latestHomeBy` var ómögulegt, voru `returnCandidates = []` og `returnOverallStada = 'graent'` (fallback). Ferðin gat litið út sem "lítur vel út" þótt heimkoman væri ómöguleg.

**Lagfæring:** `returnImpossible = true` flag. `returnOverallStada = 'gult'` þegar impossible. `issueReasonCode = 'home_too_soon'`. `svar` útskýrir: *"Varúð á heimleið: miðað við aksturstíma nærðu ekki heim fyrir kl. HH:MM."*

Nýr test bætt við sem staðfestir `stada: 'gult'` og `reasonCode: 'home_too_soon'`.

### Major 1 — Highlighted issue reason mismatch (`lib/weather/travel.ts`)

**Vandinn:** `issueReasonCode = outboundWorst?.reasonCode ?? returnWorst?.reasonCode` — ef highlighted issue var frá return leg, kom reasonCode frá outbound.

**Lagfæring:** `issueReasonCode = highlightedIssue?.reasonCode` — beint frá valda issue.

### Major 2 — Return leg distance (`lib/weather/travel.ts`)

**Vandinn:** Á heimleið stóð `X km frá Reykjavík` þótt notandinn sé á leið frá Akureyri.

**Lagfæring:** Á return leg: `issueDist = (distanceM - distanceFromOriginM) / 1000 km frá [destinationName]`.

### Major 5 — Destination-nearest route point (`app/api/teskeid/weather/travel/route.ts`)

**Vandinn:** Sampling-lykkjan tryggði ekki að síðasti route punktur (næstur áfangastað) væri alltaf með.

**Lagfæring:** Eftir sampling, ef síðasti allPts-punktur er ekki þegar inni (< 500m frá síðasta sampleðum punkti) og við erum undir `MAX_WEATHER_POINTS`, er honum bætt við.

### Minor 1 — Icelandic copy (`lib/weather/travel.ts`)

- `'caution_wind_driving'`: "Vindur nær cautionviðmiðum" → **"Vindur nálgast varúðarmörk"**
- `'caution_wind_trailer'`: "Vindur á cautionviðmiðum fyrir eftirvagn" → **"Vindur nálgast varúðarmörk fyrir eftirvagn"**
- `'home_too_soon'`: **"Miðað við aksturstíma nærðu ekki heim fyrir þennan tíma"** (nýtt)

### Minor 2 — Invalid optional date validation (`app/api/teskeid/weather/travel/route.ts`)

**Vandinn:** Invalid optional dates voru þögult breytt í `undefined` frekar en 400.

**Lagfæring:** Ef `body.earliestDepartureAt/latestArrivalBy/latestHomeBy` er present en ógilt → `400 { error: 'invalid_departure/invalid_latest_arrival/invalid_latest_home' }`.

---

## Eftir þessari lagfæringu (enn eftir)

### Major 3 — UI renders structured travelPlan fields

`FerdalagidClient.tsx` sýnir enn bara `svar` + `facts`. `travelPlan.outbound.bestWindow`, `highlightedIssue` með links, og return plan eru ekki renderade. Þetta þarf sérstakt UI pass.

### Major 4 — Auditability (v062/v063 addenda)

`WorstMetric` vantar enn `forecastLat`, `forecastLon`, `metnoUrl`. `travelPlan` vantar `routeWeatherPoints`. UI vantar "Spápunktar á leiðinni" section. Þetta er stærsta verkefnið eftir.

### worstCandidateOf tie-break

Codex benti á að tie-break notar wind til að velja milli sama-stöðu candidates, sem getur valið rangan punkt fyrir precipitation-driven niðurstöður. Þetta er minor en bíður.

---

## Prófunarniðurstöður

```
npm run type-check  → clean
npm run test:run    → 51/51 test files, 1639 passed | 27 skipped | 8 todo
```

---

## Supabase / production / billing

Engar Supabase breytingar, engar SQL breytingar, keyrði enga migration, breytti engum RLS policies, auth, grants, functions, secrets, Vercel env, production stillingum eða billing.
