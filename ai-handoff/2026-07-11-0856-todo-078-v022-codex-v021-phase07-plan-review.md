# Codex review of 2026-07-11-0852-todo-078-v021-claude-phase07-plan

## Context

Stebbi asked for review of Claude Code's Phase 0.7 plan for TODO #78.

Goal of Phase 0.7: add a hidden, feature-flagged seed affordance in the existing travel-weather result flow so one completed single drive can later become the first leg of "Ferðalagið", without forking the current weather flow or creating a separate product path yet.

Relevant files checked:

- `ai-handoff/2026-07-11-0852-todo-078-v021-claude-phase07-plan.md`
- `app/auth-mvp/vedrid/page.tsx`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `messages/is.json`
- `messages/en.json`
- `.env.example`
- `Design.md`

## Findings

No blocker found in the Phase 0.7 direction. The plan is small enough and keeps the refactor additive, which is the right move.

However, tighten the implementation before coding:

1. The affordance must be auth-only for Phase 0.7.
   `app/vedrid/page.tsx` already reuses `FerdalagidClient` with `isGuest`, so make sure the new prop defaults to `false` and the public route keeps it false. Guests should not see an unfinished "Ferðalag" affordance yet.

2. Use clicked behavior B, not a disabled tooltip.
   Tooltips are weak on mobile and a disabled control feels broken. Make it a small enabled secondary action that, when clicked, reveals inline text like: `Ferðalag kemur fljótlega. Þessi akstur verður þá fyrsta leggið.` No modal, no toast required, no data mutation.

3. Do not create a nested card.
   The result step already has the main summary card with `Brottför / Á leiðinni / Áfangastaður`. Put the affordance as a small action row after that summary card and before the map, or as a quiet footer row inside the existing summary card. Do not wrap it in a new bordered card.

4. Add the flag to `.env.example`.
   Add `WEATHER_TRIP_ENABLED=` near the other weather flags. Do not edit `.env.local` unless Stebbi explicitly asks.

5. Use the existing translation namespace.
   The existing client uses `useTranslations('teskeid.vedrid')` and `useTranslations('teskeid.vedrid.ferdalagid')`. Add keys under `teskeid.vedrid.ferdalagid`, not hardcoded component text.

6. Keep this strictly non-persistent.
   No SQL, no API, no route model, no localStorage, no public guest tracking, and no "saved trip" object in Phase 0.7.

## Recommended Implementation Shape

In `app/auth-mvp/vedrid/page.tsx`:

- Read `const tripEnabled = process.env.WEATHER_TRIP_ENABLED === 'true'`.
- Render `<FerdalagidClient tripEnabled={tripEnabled} />`.

In `app/vedrid/page.tsx`:

- Leave as `<FerdalagidClient isGuest />`, or explicitly pass `tripEnabled={false}` if Claude prefers readability.

In `FerdalagidClient`:

- Extend props to:
  - `isGuest?: boolean`
  - `tripEnabled?: boolean`
- Default both to false.
- Add local state such as `const [tripHintVisible, setTripHintVisible] = useState(false)`.
- Render the action only when:
  - `tripEnabled`
  - `!isGuest`
  - `step === 'result'`
  - `result && !loading`
- Suggested button label: `Breyta í ferðalag`
- Suggested inline text after click: `Ferðalag kemur fljótlega. Þessi akstur verður þá fyrsta leggið.`

Design notes:

- Use lucide `Route` if already imported, otherwise no new icon is required.
- Keep touch target at least 40px high.
- Use restrained secondary styling, not a primary green CTA.
- Avoid horizontal overflow on narrow mobile.

## Suggested Message Keys

Under `teskeid.vedrid.ferdalagid`:

```json
"convertToTrip": "Breyta í ferðalag",
"tripComingSoon": "Ferðalag kemur fljótlega. Þessi akstur verður þá fyrsta leggið."
```

English can be simple:

```json
"convertToTrip": "Turn into a trip",
"tripComingSoon": "Trips are coming soon. This drive will become the first leg."
```

## Notes Outside Phase 0.7

While reviewing, I noticed `FerdalagidClient.tsx` still renders gust-related comparison text (`hvið.` / `gust`) in the origin/destination comparison. That may be intentional after the later disclaimer decision, but if TODO #75 was meant to remove all visible gust UI, this needs a separate follow-up review. Do not mix it into Phase 0.7 unless Stebbi asks.

## Verdict

Proceed with Phase 0.7 after applying the clarifications above.

This is not a release-risky change if:

- The flag defaults off everywhere.
- Public `/vedrid` does not show the affordance.
- The new UI does not mutate data or call APIs.
- Type-check passes.

## Commands To Run

After implementation:

```powershell
npm run type-check
```

If Claude touches tests or existing logic beyond the small UI/flag change, also run the relevant targeted Vitest suite.

## Supabase / Auth / Production Notes

No SQL should be created or run for Phase 0.7.

No Supabase tables, RLS policies, grants, auth flows, user data, saved places, usage events, or production data should be touched.

The only deployment-related change should be the optional new env flag:

- `WEATHER_TRIP_ENABLED=true` enables the seed affordance for logged-in users.
- If unset or false, behavior should be identical to current production.

## Localhost checks for Stebbi

Before release, test with `WEATHER_TRIP_ENABLED` unset or false:

1. Open logged-in `/auth-mvp/vedrid`.
2. Complete one normal route.
3. Confirm no "Breyta í ferðalag" affordance appears.
4. Open public `/vedrid` while logged out.
5. Confirm public weather still works as before and no trip affordance appears.

Then test with `WEATHER_TRIP_ENABLED=true` in local env and a restarted dev server:

1. Open logged-in `/auth-mvp/vedrid`.
2. Complete one route all the way to result.
3. Confirm a small secondary "Breyta í ferðalag" action appears after the result summary without pushing layout around awkwardly.
4. Tap it on mobile width.
5. Confirm inline "Ferðalag kemur fljótlega..." text appears.
6. Confirm it does not navigate, save data, call a new API, or affect the current weather result.
7. Open public `/vedrid` logged out and confirm the affordance is still hidden.

Main regression checks:

- No mobile horizontal overflow.
- No nested-card look.
- Result step map and forecast drawers still open.
- Back/step navigation still works.
- Public guest limit and guest login hint remain unchanged.
