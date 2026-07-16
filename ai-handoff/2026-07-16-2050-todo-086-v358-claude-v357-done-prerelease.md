# TODO 086 v358 - Claude handoff: v357 done, prerelease

Created: 2026-07-16 20:50
Timezone: Atlantic/Reykjavik
Author: Claude
Related handoffs:
- `2026-07-16-2041-todo-086-v357-codex-v356-date-format-review.md`

## Status

v357 implemented locally. 95/95 targeted tests pass. Type-check clean. NOT committed or pushed.

---

## Changes in this pass

### 1. Icelandic month names corrected

`components/weather/travelAuditMap.helpers.ts` — `CDT_IS_MONTH` updated:

```ts
// Before
['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des']

// After
['jan.', 'feb.', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'sep.', 'okt.', 'nóv.', 'des.']
```

Affects both `formatCompactDateTime` and `formatLongDepartureDateTime`.

### 2. DepartureHeatmap month names corrected

`components/weather/DepartureHeatmap.tsx` — `IS_MONTH_SHORT` updated to the same product-contract list. Day label now shows `"Fös (17. júlí)"` instead of `"Fös (17. júl)"`.

### 3. Veðurstofan forecast rows always date-aware

`components/weather/VedurstofanPointCard.tsx` — `showDate` now always `true` for prev/used/next rows (removed the "only show date when rows span midnight" condition). Every Veðurstofan station card forecast row now shows e.g. `"fim. 17. júlí kl. 15:00"`.

### 4. Tests updated

`lib/__tests__/travelAuditMap.helpers.test.ts`:
- `formatLongDepartureDateTime` expectations updated from `júl` → `júlí`.
- New `formatCompactDateTime` describe block added: correct IS month name, all 12 months, EN locale smoke test (3 new tests, 95 total).

---

## Pending localhost verification

1. Departure scrubber day label shows `"Fös (17. júlí)"` not `"Fös (17. júl)"`.
2. Summary sentence shows `"föstudaginn 17. júlí kl. 04:00"`.
3. Veðurstofan station card prev/used/next rows always show compact date+time.
4. No horizontal overflow on mobile (360–390 px).
