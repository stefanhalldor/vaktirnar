# Review: TODO #73 v004 - arrival copy and destination forecast drawer polish

Created: 2026-07-08 18:53  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Review target: `ai-handoff/2026-07-08-1841-todo-073-v004-claude-v003-arrivalweather-fix.md`  
Related TODO: #73 - Veður: veður við komu á áfangastað

## Findings

### Medium - Arrival top-card copy should be changed before release

Stebbi tested localhost and wants the arrival block changed from:

```text
Mættur á Akranes kl. 19:28
Veður við komu kl. 19:00: Vindur: 3,2 m/s · Úrkoma: 0,6 mm/klst · Hiti: 10,7°C
```

to:

```text
Komutími kl. 19:28, spáin þar kl. 19:
Vindur: 3,2 m/s · Úrkoma: 0,6 mm/klst · Hiti: 10,7°C
```

Implement this as a copy/UI adjustment in `app/auth-mvp/vedrid/FerdalagidClient.tsx` and `messages/is.json` / `messages/en.json`.

Recommended structure:

- One top line with arrival time and forecast time.
- One second line with wind / precipitation / temperature.
- Keep the subtle visual block if it still feels good, but remove/avoid the `Mættur á {destination}` wording for Icelandic.
- The destination name can remain in the drawer title; the top line does not need to repeat it.

Copy detail:

- Icelandic message should support: `Komutími kl. {arrivalTime}, spáin þar kl. {forecastTime}:`
- Stebbi wrote `kl. 19:` in the example. Since every other time in the UI uses `HH:mm`, I recommend using `formatKlTime` and rendering `19:00` unless Stebbi explicitly asks for hour-only. If implementing hour-only, make a deliberate helper and test it.

### Medium - Drawer is not mobile-first on desktop; it stretches across the whole viewport

The opened `Skoða spána` drawer currently appears like a full-width desktop table. The code uses:

- overlay: `fixed inset-0 z-50 flex items-end bg-black/40`
- panel: `bg-background border-t w-full max-h-[75vh] overflow-y-auto rounded-t-2xl`

On a wide desktop viewport this becomes a huge sheet across the entire screen, which is not the intended mobile-first app feel.

Recommended adjustment:

- Keep it bottom-sheet style on mobile.
- Constrain the panel width on larger viewports, for example with `w-full max-w-md sm:max-w-lg mx-auto`.
- Keep `max-h-[75vh]` or similar, but add safe-area padding where useful.
- If the table needs width, wrap only the table area in `overflow-x-auto`; do not make the whole drawer a full desktop-width sheet.
- Preserve easy tap targets and close behavior.

Design.md relevance:

- Mobile-first.
- Avoid horizontal overflow.
- Avoid page-sized dashboard/table feel inside app flows.
- Use quiet canonical surfaces, borders, and compact hierarchy.

### Medium - Forecast drawer date/time formatting is wrong for Icelandic UI

Stebbi’s screenshot shows rows like:

```text
Wed, Jul 8 07:00 PM
Thu, Jul 9 12:00 AM
```

Expected:

```text
Fös. 10. júl 23:00
```

Technical cause to check:

- Current code does `locale === 'is' ? 'is-IS' : 'en-GB'`.
- If `useLocale()` returns `is-IS` or another Icelandic variant, this exact equality falls through to English.
- Current `toLocaleTimeString` does not force `hour12: false`, so AM/PM can appear.

Recommended fix:

- Use `normalizeLocale(locale)` or `locale.startsWith('is')`, not exact `locale === 'is'`.
- Prefer `formatKlTime(h.time)` for the hour column/time part, since it already returns 24h UTC `HH:mm` and is used elsewhere in Ferðaveður.
- For date label, use Icelandic formatting for Icelandic locale, e.g. `Intl.DateTimeFormat('is-IS', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Atlantic/Reykjavik' })`.
- Normalize output to match Stebbi’s expectation as closely as practical: capitalized weekday abbreviation, day number, Icelandic month abbreviation, no English AM/PM.

Add a small local helper in `FerdalagidClient.tsx` if there is no shared helper yet. Do not scatter ad hoc locale expressions inline in table rendering.

### Low - Button copy should be more explicit

Change:

```text
Skoða spána
```

to:

```text
Skoða spána á áfangastað betur
```

This should be in `messages/is.json`. Update English too, for example:

```text
View the destination forecast
```

Keep the button visually compact. It should not stretch full width unless the mobile layout genuinely needs it; current `self-start` direction is probably right.

### Low - Close button aria-label is hardcoded Icelandic

Current drawer close button has `aria-label="Loka"` in `FerdalagidClient.tsx`.

Since this component is localized, move that to messages or reuse an existing close label if one exists. This is not the main issue, but it is a small i18n cleanup while touching the drawer.

## Suggested Claude fix plan

1. Keep the v004 data fix intact; do not change `arrivalWeather` enrichment unless tests fail.
2. Update the arrival block copy and layout in `app/auth-mvp/vedrid/FerdalagidClient.tsx`.
3. Update `messages/is.json` and `messages/en.json`:
   - replace `arrivalAtDestination` / `arrivalWeatherAt` usage or add better keys for the new two-line copy.
   - change `viewFullForecast` copy.
   - add localized drawer close label if needed.
4. Refactor drawer date/time formatting into a helper:
   - Icelandic date label like `Fös. 10. júl`.
   - time in 24h `HH:mm`.
   - use `formatKlTime` or equivalent for the hour.
5. Constrain drawer panel width on larger viewports while keeping mobile bottom-sheet behavior.
6. Run `npm run type-check`.
7. Run `npm run test:run lib/__tests__/weather-travel.test.ts`.
8. Return a v006 handoff with exact files changed, command results, and localhost checks.

## Localhost checks for Stebbi

1. Open `/auth-mvp/vedrid` on localhost while signed in.
2. Calculate Garðabær -> Akranes or another route where arrival weather appears.
3. Expected top-card copy:

```text
Komutími kl. 19:28, spáin þar kl. 19:00:
Vindur: 3,2 m/s · Úrkoma: 0,6 mm/klst · Hiti: 10,7°C
```

4. Click another heatmap slot.
5. Expected: both arrival time and forecast time update.
6. Click `Skoða spána á áfangastað betur`.
7. Expected: drawer opens as a mobile-first bottom sheet and does not stretch across the whole desktop viewport.
8. Expected drawer rows use Icelandic date labels and 24h time, e.g. `Fös. 10. júl 23:00`, not `Fri, Jul 10 11:00 PM`.
9. Expected: highlighted arrival forecast hour still matches the top-card forecast time.
10. Test 360, 390, and 460 px widths.
11. Expected: no horizontal overflow, close button is usable, table remains readable.

No SQL, Supabase, RLS, auth, secrets, production data, billing, deployment, or migration checks are required for this copy/UI polish.

## Notes

I did not change application code in this review. This is a handoff/review only.

I did not run tests. The technical comments are based on reading the current component code and Stebbi’s localhost screenshot.
