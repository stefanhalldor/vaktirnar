# 2026-07-17 17:06 - TODO-086 v444 - Claude: v443 hardening done, prerelease

Created: 2026-07-17 17:06
Timezone: Atlantic/Reykjavik
Source: `2026-07-17-1701-todo-086-v443-codex-v442-conditions-feed-preview-review.md`

## What was done

All 5 findings from Codex v443 addressed.

### Finding #1 (already fixed before v443)

Public "Sjá fleiri skilaboð..." link in `WeatherOverviewClient` pointed to `${stationPulseReturnBase}/puls/stod/${id}` which was `/vedrid/puls/stod/...` on the public overview — a 404.

Already fixed at end of v442 session (after Stebbi showed screenshot). Now always `/auth-mvp/vedrid/puls/stod/${id}?returnTo=...`.

### Finding #2 (Medium): Access contract documented and enforced

`feed-preview` now checks `getWeatherEnabledMode() === 'off'` and returns 404. Comment in route explains the decision:

> Access contract: conditions feed follows the WEATHER_ENABLED kill-switch, not provider-specific gates.
> It is user-generated community content, not provider data, so no per-provider or per-user gate applies.
> When WEATHER_ENABLED is off, the entire weather section is off and the feed is unavailable.

3 new tests added to `weather-conditions-feed-preview-api.test.ts`:
- 404 when WEATHER_ENABLED is off
- 200 when WEATHER_ENABLED=All (no provider gate, public)
- 200 when WEATHER_ENABLED=true

`getWeatherEnabledMode` is now mocked in the test file (default: `'All'`).

### Finding #3 (Low/Medium): Candidate buffer increased

`getLatestStationConditionPreviews` now fetches `Math.max(limitStations * 3, 20)` candidate threads instead of `limitStations * 2`. Handles more deleted/hidden threads before running short.

### Finding #4 (Low): Route summary cleanup

- `limitPerStation: 3` → `limitPerStation: 1` — only one message is shown per station anyway (newest only).
- Component docstring rewritten, "Safnpúls" removed.

### Finding #5 (Low/i18n): Loading text removed

`ConditionsFeedPreview`:
- Removed hardcoded `...` loading text.
- `emptyBehavior='hide'`: returns null whenever items is empty (including during loading) — no layout shift, no spinner.
- `emptyBehavior='message'`: renders nothing during loading, shows emptyLabel when done.

## Commands run

```bash
npm run type-check
# exit 0

npm run test:run -- lib/__tests__/weather-conditions-feed-preview-api.test.ts lib/__tests__/chat-repository.test.ts lib/__tests__/middleware.test.ts lib/__tests__/vedurpuls-feed.test.ts
# 4 files, 108 tests passed, exit 0
```

## Files changed

```
app/api/teskeid/weather/vedurpuls/feed-preview/route.ts    (v443 #2: WEATHER_ENABLED gate + comment)
lib/chat/repository.server.ts                              (v443 #3: candidateLimit Math.max(N*3, 20))
components/weather/VedurstofanRoutePulseSummary.tsx        (v443 #4: limitPerStation 3→1, docstring)
components/weather/ConditionsFeedPreview.tsx               (v443 #5: no loading text, hide-during-load)
components/weather/WeatherOverviewClient.tsx               (v443 #1: /auth-mvp/vedrid/puls base — was fixed pre-v443)
lib/__tests__/weather-conditions-feed-preview-api.test.ts  (v443 #2: 3 new tests, mock getWeatherEnabledMode)
```

## SQL / RLS / auth notes

No changes.

## Localhost checks for Stebbi

1. **Public `/vedrid` — conditions feed**
   - "Fréttir af aðstæðum frá notendum Teskeið.is" birtist ef gögn eru til.
   - Smella á stöðvarheiti → marker velst á korti, URL fær `?stationId=...`.
   - Smella á "Sjá fleiri skilaboð..." → fer á `/auth-mvp/vedrid/puls/stod/...` (login/full pulse), ekki 404.

2. **Auth `/auth-mvp/vedrid`**
   - Sama hegðun. "Sjá fleiri skilaboð..." fer beint á full pulse (notandinn er innskráður).

3. **Ferðaveðrið route**
   - Route conditions drawer sýnir nýjustu frétt per stöð, newest-first.
   - "Sjá fleiri skilaboð" link virkar per stöð.

4. **Empty state**
   - Engar skilaboð: conditions feed er falinn (emptyBehavior='hide').
   - Engin loading spinner eða `...` text sýnileg.

## Remaining next steps (backlog per v441/v443)

- Station list under overview map (backlog finding #5 frá v441)
- Provider-neutral conditions feed — getur síðar tekið Vegagerðin target types
- Vegagerðin map/detail integration (live fetch eftir samþykki)
