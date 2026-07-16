# TODO 078 - Claude Code: Phase 0.7 prerelease handoff

Created: 2026-07-11 09:05
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Prerelease handoff — ekki commitað, ekki pushað
Related TODO: #78 Ferðalagið / shared route-weather core
Implements: Phase 0.7 per v022 Codex review + Stebbi leiðrétting (per-user flag)

Status: Framkvæmd lokið. Ekkert commitað. Ekkert pushað.

---

## Hvað var gert

### Stebbi leiðrétting á planinu

Í stað global `WEATHER_TRIP_ENABLED` env var notar Phase 0.7 per-user `feature_access`
pattern eins og aðrar Teskeiðar: `WEATHER_TRIP_FLAG` + `feature_access` tafla +
`/admin` UI. Engin SQL migration þarf — `feature_access` taflan er til.

---

### 1. `lib/loans/guard.ts`

Bætt við `'ferdalagid'` case í `checkFeatureAccess()`:

```ts
if (featureKey === 'ferdalagid') {
  if (process.env.WEATHER_ENABLED !== 'true') return false
  if (process.env.WEATHER_TRIP_FLAG !== 'true') return true
  return checkPerUserAccess(email, 'ferdalagid')
}
```

Pattern: sama kill-switch og `vedrid` (`WEATHER_ENABLED`), sérstakt per-user
flag (`WEATHER_TRIP_FLAG`). Þegar flag er ekki sett: allir vedrid-notendur
fá ferdalagid access.

### 2. `app/api/admin/feature-access/route.ts`

`'ferdalagid'` bætt við `ALLOWED_FEATURES` array.
`FeatureAccessSectionProps.featureKey` í admin page uppfærð samhliða.

### 3. `app/auth-mvp/vedrid/page.tsx`

Kallar `checkFeatureAccess('', user.email!, 'ferdalagid')` og sendir niðurstöðuna
sem `tripEnabled` prop til `FerdalagidClient`.

### 4. `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Tvær breytingar:

**Props:**
```tsx
export function FerdalagidClient({
  isGuest = false,
  tripEnabled = false,
}: { isGuest?: boolean; tripEnabled?: boolean } = {})
```

**Nýtt state:**
```ts
const [tripHintVisible, setTripHintVisible] = useState(false)
```

**Affordance UI** (milli combined card og TravelAuditMap):
- Sýndur þegar `tripEnabled && !isGuest && result && !loading`
- Ghost textalink með `Route` icon og `tf('convertToTrip')` label
- Þegar smellt: toggle-ar `tripHintVisible` sem sýnir `tf('tripComingSoon')` texta
- Ekki nested card, mobile-first, touch target ≥40px
- Notar `Route` icon sem er þegar importaður í skránni

### 5. `app/(admin)/admin/page.tsx`

```tsx
<FeatureAccessSection
  featureKey="ferdalagid"
  heading="Ferðalag-aðgangur"
  flagName="WEATHER_TRIP_FLAG"
/>
```

Bætt við eftir `vedrid` section.

### 6. `messages/is.json` og `messages/en.json`

Tveir nýir lyklar undir `teskeid.vedrid.ferdalagid`:

```json
"convertToTrip": "Breyta í ferðalag",
"tripComingSoon": "Ferðalag kemur fljótlega. Þessi akstur verður þá fyrsta leggið."
```

```json
"convertToTrip": "Turn into a trip",
"tripComingSoon": "Trips are coming soon. This drive will become the first leg."
```

### 7. `.env.example`

```
# WEATHER_TRIP_FLAG=true     # uncomment to enable per-user access control for Ferðalag affordance
                             # if unset or false: all Veðrið users see the Ferðalag affordance
```

---

## Hvað var EKKI gert

- Engin multi-stop WizardStep
- Engin `WeatherTrip` / `assessWeatherTrip()` kall úr UI
- Engin add-stop form
- Engin campsite controls
- Engin saved trips
- Engin SQL / migration (feature_access taflan er til)
- Engar API route breytingar (nema ALLOWED_FEATURES)
- Engin breyting á public `/vedrid` (isGuest=true, tripEnabled=false)
- Ekkert commitað eða pushað

---

## Prófarniðurstöður

```
tsc --noEmit: engar villur

(Engar vitest próf snerta þessa breytingu — hún er UI/guard-only)
```

---

## Skrár sem breyttust (frá síðasta commit)

```
lib/weather/assessment.ts                      (Phase 0.5C)
lib/weather/travel.ts                          (Phase 0.5C)
lib/weather/trip.ts                            (Phase 0.6A)
lib/__tests__/weather-trip.test.ts             (Phase 0.6A)
lib/weather/trip-assessment.ts                 (Phase 0.6B + P1 fix)
lib/__tests__/weather-trip-assessment.test.ts  (Phase 0.6B + P1 fix)
lib/loans/guard.ts                             (Phase 0.7 — ferdalagid case)
app/api/admin/feature-access/route.ts          (Phase 0.7 — ALLOWED_FEATURES)
app/auth-mvp/vedrid/page.tsx                   (Phase 0.7 — checkFeatureAccess + prop)
app/auth-mvp/vedrid/FerdalagidClient.tsx       (Phase 0.7 — tripEnabled prop + affordance)
app/(admin)/admin/page.tsx                     (Phase 0.7 — FeatureAccessSection)
messages/is.json                               (Phase 0.7 — 2 nýir lyklar)
messages/en.json                               (Phase 0.7 — 2 nýir lyklar)
.env.example                                   (Phase 0.7 — WEATHER_TRIP_FLAG skjöl)
```

---

## Commit og push

Ekki framkvæmt. Bíður eftir skýru samþykki frá Stebba.

---

## Localhost checks fyrir Stebbi

**Án `WEATHER_TRIP_FLAG` (eða þegar það er false):**
1. Opna `/auth-mvp/vedrid`
2. Reikna leið alla leið að niðurstöðu
3. Vænt: engin "Breyta í ferðalag" element sést
4. Öll önnur UI óbreytt

**Með `WEATHER_TRIP_FLAG=true` í `.env.local` (og restarted dev server):**
1. Opna `/auth-mvp/vedrid`
2. Reikna leið
3. Vænt: lítill "Breyta í ferðalag" link sést undir niðurstöðukortinu, yfir kortinu
4. Smella á hann -- "Ferðalag kemur fljótlega. Þessi akstur verður þá fyrsta leggið." birtist
5. Engin navigation, engin gagnageymsla, engin API köll

**Einnig:**
- Opna public `/vedrid` -- engin ferðalag affordance
- `/admin` -- "Ferðalag-aðgangur" section sýnist með WEATHER_TRIP_FLAG nafni

**Per-user test (ef Stebbi vill prófa):**
- Setja `WEATHER_TRIP_FLAG=true` í `.env.local`
- Fara á `/admin`, bæta email Stebba við undir "Ferðalag-aðgangur"
- Reloadda `/auth-mvp/vedrid` -- affordance birtist
- Eyða emailinu -- reloadda -- affordance hverfur

---

## Næst

Phase 0.8: fyrstu multi-stop UI (bæta við stigi). Þarf sér Codex rýni og Stebbi samþykki.
