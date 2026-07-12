# Handoff: TODO #071 v024 — Prerelease

**Date:** 2026-07-12
**Session:** Claude
**Status:** Ready for localhost testing. No commit yet.
**Covers:** v022 Codex P1+P2 fixes + button affordances + threshold disabled state

---

## What changed since v022

### P1 — PointDetailsPanel always shows full weather line

`components/weather/TravelAuditMap.tsx` (section 7 in PointDetailsPanel):

Old: worst point showed only the decisive single metric (`Vindur: 18 m/s, 3 m/s yfir mörkum`), replacing the full line.

New priority:
1. Full weather line is always primary when summary values exist: `Vindur: X m/s · Úrkoma: Y mm/klst · Hiti: Z°C`
2. Single-metric kept only as fallback when summary has no values at all (no-data edge case)
3. Threshold excess rendered as a secondary small line below the full weather line

Worst point and manually selected point now always show the same data shape.

### P2 — Exact value assertions in tests

`lib/__tests__/travelAuditMap.helpers.test.ts`:

Non-displayPoint active-candidate test now asserts exact row values:
- `windMs` → `9.5`
- `gustMs` → `12.0`
- `precipMmPerHour` → `0.2`
- `decisiveTempC` → `6.0`
- `forecastTimeIso` → `'2026-07-10T10:00:00Z'`
- `decisiveTimeFormatted` → `'10:00'`

Comment updated to match actual `routeFraction: 0.2 → ETA = 10:00`.

### Button affordances — primary buttons look clickable

`components/weather/RouteSelectionStep.tsx` ("Nota þessa leið") and `app/auth-mvp/vedrid/FerdalagidClient.tsx` ("Reikna ferðina"):

- Added `shadow-sm` — visual elevation, button looks physical
- Added `cursor-pointer` — hand cursor on hover
- Added `hover:shadow-md` — shadow grows on hover
- `hover:opacity-90` → `hover:opacity-95 active:opacity-90`
- `transition-opacity` → `transition-all` — shadow animates with opacity
- Added `disabled:shadow-none disabled:cursor-not-allowed`

### Threshold button disabled state

`app/auth-mvp/vedrid/FerdalagidClient.tsx`:

- Button disabled when either draft field is empty (`draftCautionWind.trim() === '' || draftRedWind.trim() === ''`), not only when `loading`
- Label when not ready: **"Veldu þín veðurmörk"** (IS) / **"Choose your thresholds"** (EN)
- Label when ready: **"Reikna ferðina"** as before

`messages/is.json` + `messages/en.json`: added `thresholdNotReadyLabel`.

---

## Localhost checks for Stebbi

### Map detail parity

1. Reikna ferð, bíða eftir niðurstöðu
2. Kort: **engir** svartir `HH:mm` chips yfir punktum
3. Klicka á versta punkt: **full lína** — `Vindur: X m/s · Úrkoma: Y · Hiti: Z°C`, EKKI bara einn mælikvarði
4. Klicka á annan punkt (ekki verstu): sama form og versti punktur
5. Breyta brottfarartíma: valinn punktur uppfærir sig

### Takkarnir

6. Fara á veðurmarkaskrefi — bæði reitirnir tómir:
   - **Expected:** takkinn er disabled, stendur "Veldu þín veðurmörk"
7. Fylla inn eitt gildi en ekki annað:
   - **Expected:** takkinn ennþá disabled
8. Fylla inn bæði gildi:
   - **Expected:** takkinn verður virkur, stendur "Reikna ferðina", sjáanlegt skuggi og cursor breytist í hand
9. Fara á leiðarvalsskrefi með raunlegar leiðir:
   - **Expected:** "Nota þessa leið" takki hefur skugga og cursor:pointer þegar virkur

---

## Files changed

- `components/weather/TravelAuditMap.tsx` — PointDetailsPanel section 7 refactor
- `components/weather/RouteSelectionStep.tsx` — button affordances
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — button affordances + threshold disabled logic
- `messages/is.json` + `messages/en.json` — `thresholdNotReadyLabel`
- `lib/__tests__/travelAuditMap.helpers.test.ts` — exact value assertions

Type-check: clean. Tests: 62/62 pass.
