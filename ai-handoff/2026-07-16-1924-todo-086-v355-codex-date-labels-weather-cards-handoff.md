# TODO 086 v355 - Codex handoff: day/date labels on weather cards

Created: 2026-07-16 19:24  
Timezone: Atlantic/Reykjavik  
Author: Codex  
Builds on:
- `2026-07-16-1835-todo-086-v353-codex-chat-timestamp-date-handoff.md`
- `2026-07-16-1904-todo-086-v354-codex-v353-chat-timestamp-review.md`

## Product Problem

The date/day ambiguity is not limited to full Veðurpúls chat messages.

When a user is looking at a route that departs tomorrow or spans midnight, several weather cards still show only `kl. HH:mm`. This makes future/tomorrow values look like today's values.

Examples from Stebbi:

- met.no point card:
  - `Brottfarartími: kl. 16:00`
  - `Áætlaður tími ... kl. 18:55`
  - `Veðurspá á þessum stað kl. 18:00`
- Veðurstofan station card:
  - `Brottfarartími: kl. 16:00`
  - `Áætlaður tími ... kl. 16:04`
  - `Spá gefin út kl. 15:00`
  - forecast rows: `12:00`, `15:00`, `18:00`

These need day/date context too.

## Product Decision

Add day/date context anywhere a displayed time can refer to a different day than "now" or where rows can cross midnight.

Preferred compact format should stay short enough for mobile:

- Icelandic compact date+time: `fim. 16. júl kl. 16:00`
- If the surrounding sentence already says `kl.`, use a formatter/string that avoids `kl. kl.`.

Important: all of this should use Iceland time (`Atlantic/Reykjavik` / UTC year-round), not arbitrary browser local timezone.

## Scope Update

v353/v354 focused on:

1. Chat timestamps.
2. Full Veðurpúls forecast rows.

This v355 adds:

3. met.no point detail cards.
4. Veðurstofan point cards.
5. All Veðurstofan forecast rows shown on those cards.

## Code Surfaces

### met.no shared point card

`components/weather/RouteWeatherPointDetailCard.tsx`

Current time-only lines:

- `summary.departureIso` at lines around `77-80`
- `summary.etaIso` at lines around `82-90`
- `summary.forecastTimeIso` / `forecastTimeFormatted` at lines around `61-63` and `99-102`

This component is already shared for worst point, selected point, and all-point cards for met.no. Fixing it here should keep those three surfaces aligned.

### Veðurstofan shared point card

`components/weather/VedurstofanPointCard.tsx`

Current time-only lines:

- `buildVedurstofanPointDisplayModel` stores `etaTimeLabel` and `ftimeLabel` as time-only labels at lines around `71-72`.
- compact variant:
  - route ETA summary uses `etaTimeLabel` around `123-137`
  - `station.atimeIso` uses `formatKlTime` around `139-142`
- full variant:
  - departure time around `185-189`
  - ETA around `190-196`
  - `station.atimeIso` around `207-211`
  - forecast rows around `215-225`

This component is already shared for:

- worst Veðurstofan point
- selected Veðurstofan point
- all Veðurstofan station cards

Keep it that way. Do not implement separate formatting per card type.

### Veðurstofan forecast row line

`components/weather/VedurstofanForecastRows.tsx`

Current row time:

- `formatKlTime(row.ftimeIso)` at line around `27`

This line is reused by:

- `VedurstofanPointCard`
- full pulse forecast context in `VedurstofanPulsClient`

This is the best shared place to add day/date-aware row labels.

## Suggested Implementation Direction

### 1. Build/extend shared date helpers deliberately

There are already weather date helpers in `components/weather/travelAuditMap.helpers.ts`:

- `formatKlTime`
- `formatCompactDateTime`
- `formatLongDepartureDateTime`

v354 suggested a new chat-core formatter in `lib/chat/format.ts`. That still makes sense for chat timestamps, but weather card times should probably use weather/date helpers unless Claude Code deliberately creates a more general shared date utility.

Recommended minimal safe approach:

- Keep chat timestamp formatter in `lib/chat/format.ts` if v353 is being implemented.
- For weather cards, use or extend `formatCompactDateTime(iso, locale)` from `travelAuditMap.helpers.ts`.
- Avoid duplicating weekday/month arrays in multiple files.
- Ensure every date helper uses Iceland/Reykjavik time semantics consistently.

### 2. Add compact date+time labels to point cards

For both met.no and Veðurstofan point cards:

- `Brottfarartími:` should show compact date+time.
- `Áætlaður tími ...:` should show compact date+time.
- `Veðurspá á þessum stað...` / `Spá gefin út...` should show compact date+time.

Example Icelandic:

```text
Brottfarartími: fim. 16. júl kl. 16:00
Áætlaður tími 238 km frá Reykjavík: fim. 16. júl kl. 18:55
Veðurspá á þessum stað: fim. 16. júl kl. 18:00
Spá gefin út: fim. 16. júl kl. 15:00
```

If the existing translation key includes `kl. {time}`, do not pass a value that already includes `kl.`. Either:

- add new translation keys for date+time labels, or
- pass a `time` value without `kl.` and a separate `dateTime` value where needed.

Do not produce strings like `kl. fim. 16. júl kl. 16:00` or `kl. kl. 16:00`.

### 3. Forecast rows on Veðurstofan cards

For the previous/used/next rows shown on Veðurstofan station cards, avoid bare `12:00`, `15:00`, `18:00` when dates can be ambiguous.

Preferred behavior:

- Use compact date+time in the row's leading time cell when the row date differs from the relevant reference date or when rows span multiple days.
- Or show a day separator before rows when the date changes.

Since card space is tight, the cleanest likely approach is:

- `ForecastRowLine` accepts an optional `showDate?: boolean` or `timeLabelMode?: 'time' | 'compact-date-time'`.
- Full pulse page with all rows can use day separators.
- Station cards can use compact date+time for the 2-3 rows if any visible row is not same calendar day as the selected departure/ETA or if the visible rows span multiple dates.

If unsure, prioritize clarity over minimalism: a slightly longer label is better than misleading tomorrow's data as today's.

### 4. Do not regress mobile layout

These labels can become long in compact cards. Check:

- worst point card
- selected point card
- all forecast point cards
- Veðurstofan station cards
- compact `Á leiðinni` summary
- mobile width around 360-390 px

Text can wrap, but must not overflow or push buttons/cards into broken layout.

## Suggested Tests

Add or update tests around the formatter rather than component snapshots:

- `formatCompactDateTime('2026-07-16T16:00:00Z', 'is')` returns expected Icelandic compact label.
- day boundary labels use Iceland time, not machine local timezone.
- English locale still works.

If there are existing tests for `travelAuditMap.helpers.ts`, extend them.

Current test file to inspect:

- `lib/__tests__/travelAuditMap.helpers.test.ts`

## Explicit Non-goals

- Do not change database schema.
- Do not change Supabase/RLS/auth.
- Do not change route calculations.
- Do not change Veðurpúls access model.
- Do not deploy.

## Localhost checks for Stebbi

After Claude Code implements:

1. Open `/vedrid` and calculate a route with departure tomorrow or later today crossing midnight.
2. Inspect the met.no worst point card.
   - Expected: `Brottfarartími`, ETA, and forecast time include day/date context.
3. Inspect selected met.no point and all met.no point cards.
   - Expected: same date/time formatting as worst point, because the shared component is used.
4. Enable/show Veðurstofan provider and inspect worst/selected/all Veðurstofan cards.
   - Expected: `Brottfarartími`, ETA, forecast issue time, and visible forecast rows include enough date context to know the day.
5. Open full Veðurpúls station URL.
   - Expected: forecast rows with `Sjá öll spágildi` are not ambiguous across midnight.
6. Check mobile viewport.
   - Expected: no horizontal overflow, no clipped text, no broken row layout.

No SQL, migration, Vercel env, push, deploy, or production action is needed for this task.

## Óvissa / þarf að staðfesta

- Exact text format may need small copy tuning after Stebbi sees it in mobile cards.
- I assume Iceland/Reykjavik time should be used for all route/weather timestamps.
