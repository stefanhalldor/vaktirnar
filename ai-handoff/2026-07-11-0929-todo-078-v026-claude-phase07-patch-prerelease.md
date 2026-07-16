# TODO 078 - Claude Code: Phase 0.7 patch prerelease handoff

Created: 2026-07-11 09:29
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Prerelease handoff — ekki commitað, ekki pushað
Related TODO: #78 Ferðalagið / shared route-weather core
Implements: Codex v024 P1 fix + P3 polish

Status: Framkvæmd lokið. Ekkert commitað. Ekkert pushað.

---

## Hvað var gert

### P1 fix — fail-closed ferdalagid

**`lib/loans/guard.ts`**

Ein lína breytt:

```ts
// Áður (fail-open):
if (process.env.WEATHER_TRIP_FLAG !== 'true') return true

// Eftir (fail-closed):
if (process.env.WEATHER_TRIP_FLAG !== 'true') return false
```

Hegðun nú:
- `WEATHER_TRIP_FLAG` ekki sett eða false → enginn sér affordancena
- `WEATHER_TRIP_FLAG=true` + email í `feature_access(ferdalagid)` → notandi sér affordancena
- Graduation síðar: meðvituð ákvörðun í sér handoff

### P3 polish — focus/aria á button

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**

```tsx
aria-expanded={tripHintVisible}
className="... rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
```

### `.env.example`

Comment uppfærður til að endurspegla fail-closed:

```
# WEATHER_TRIP_FLAG=true     # enable per-user access control for the hidden Ferðalag affordance
                             # if unset or false: Ferðalag affordance is hidden for all users
```

---

## Hvað var EKKI gert

- Engin breyting á Phase 0.7 UI scope
- Engin SQL / migration
- Engin API breyting
- Ekkert commitað eða pushað

---

## Prófarniðurstöður

```
tsc --noEmit: engar villur
```

---

## Allar skrár sem breyttust (frá síðasta commit)

```
lib/weather/assessment.ts                      (Phase 0.5C)
lib/weather/travel.ts                          (Phase 0.5C)
lib/weather/trip.ts                            (Phase 0.6A)
lib/__tests__/weather-trip.test.ts             (Phase 0.6A)
lib/weather/trip-assessment.ts                 (Phase 0.6B + P1 fix)
lib/__tests__/weather-trip-assessment.test.ts  (Phase 0.6B + P1 fix)
lib/loans/guard.ts                             (Phase 0.7 + fail-closed fix)
app/api/admin/feature-access/route.ts          (Phase 0.7)
app/auth-mvp/vedrid/page.tsx                   (Phase 0.7)
app/auth-mvp/vedrid/FerdalagidClient.tsx       (Phase 0.7 + aria/focus polish)
app/(admin)/admin/page.tsx                     (Phase 0.7)
messages/is.json                               (Phase 0.7)
messages/en.json                               (Phase 0.7)
.env.example                                   (Phase 0.7 + comment fix)
```

---

## Commit og push

Ekki framkvæmt. Bíður eftir skýru samþykki frá Stebba.

---

## Localhost checks fyrir Stebbi

**Þegar `WEATHER_TRIP_FLAG` er ekki sett (eða false):**
1. Opna `/auth-mvp/vedrid`, reikna leið, fá niðurstöðu
2. Vænt: engin "Breyta í ferðalag" element sést

**Þegar `WEATHER_TRIP_FLAG=true`, email ekki í allowlist:**
1. Setja `WEATHER_TRIP_FLAG=true` í `.env.local`, restarta dev server
2. Reikna leið í `/auth-mvp/vedrid`
3. Vænt: engin "Breyta í ferðalag" element sést

**Þegar `WEATHER_TRIP_FLAG=true`, email í allowlist:**
1. Bæta email við undir `/admin` -> "Ferðalag-aðgangur"
2. Reikna leið í `/auth-mvp/vedrid`
3. Vænt: lítill "Breyta í ferðalag" link sést milli niðurstöðukorts og korts
4. Smella á hann — inline texti birtist, engin navigation eða gagnageymsla
5. Tab-a í gegnum button — focus ring sýnileg

**Public `/vedrid`:** engin ferðalag affordance óháð flaggi.
