# Codex Handoff: Viðkomustaður, Status Mode Login-Save og Weather Watchers á /vedrid

Created: 2026-07-20 12:17
Agent: Codex
Type: Implementation handoff for Claude Code
TODO: 086

## Input sem á að sameina

Þetta handoff sameinar þrjú atriði í eina framkvæmdarsögu fyrir Claude Code:

1. `2026-07-20-1212-todo-086-v236-followup-post-release`
   - óklárað public `Nánar` / `Einfalt` -> login -> save preference flæði
   - lágt forgangsatvik: hardcoded `#2563eb` í map/info-link styling
   - passa að `.obsidian/workspace.json` fari ekki óvart í commit
2. `2026-07-20-0845-todo-086-v222-codex-ferdalagid-waypoint-plan`
   - bæta einum valkvæðum viðkomustað milli `Frá` og `Til` á fyrsta skrefi `/vedrid/ferdalagid`
   - dæmi: `Reykjavík -> Hólmavík -> Ísafjörður`
   - vista/warm-a leiðaminni fyrir leg 1, leg 2 og composite leið
3. Ný ósk Stebba:
   - samnýta `"Fyrir þá sem eru að elta veðrið"` samanburðaríhlutinn úr summary spjaldi `/ferdalagid` inn á `/vedrid`
   - ekki tvítaka sama markup og helper logic á tveimur stöðum

## Mikilvægt vinnulag

Þetta er framkvæmdarhandoff, en ekki beiðni til Codex um að framkvæma app-kóða.
Claude Code á að framkvæma í litlum áföngum og stoppa eftir hvern stóran áfanga með handoff/review ef umfangið stækkar.

Ekki commit-a, push-a, deploya eða keyra SQL nema Stebbi gefi sérstakt leyfi.
Stebbi keyrir localhost sjálfur.

## Recommended execution order

### Phase A: Klára status-filter-mode login-save flæðið

Markmið: Þegar public notandi velur `Nánar` eða `Einfalt` á `/vedrid`, á sama vistunarhugmynd og vindmörkin að virka:

- public notandi fer í innskráningarflæði
- eftir login kemur hann aftur á `/vedrid`
- valið `statusFilterMode` vistast á notandann
- authenticated notandi getur vistað beint án login redirect

Skoða sérstaklega:

- `components/weather/WeatherOverviewClient.tsx`
  - `STATUS_FILTER_MODE_STORAGE_KEY`
  - `handleStatusFilterModeChange`
  - núverandi `teskeid_pending_wind_thresholds` og `saveDefaults` login-return pattern
- `/api/teskeid/weather/preferences/thresholds`
  - staðfesta að PUT styðji `statusFilterMode` með núverandi SQL88 schema

Tillaga:

- Bæta við pending key, t.d. `teskeid_pending_weather_status_filter_mode`.
- Nota URL param, t.d. `saveStatusFilterMode=simple|detailed`.
- Þegar public notandi velur mode:
  - setja state og localStorage strax svo UI svari
  - skrifa pending mode í `sessionStorage`
  - redirecta í `/innskraning?next=<current /vedrid url með saveStatusFilterMode>`
- Þegar authenticated `/vedrid` mountast eftir login:
  - lesa pending mode úr sessionStorage eða URL param
  - validate-a `simple|detailed`
  - PUT-a í preferences API með núverandi thresholds + `statusFilterMode`
  - hreinsa pending storage og query param

Passa:

- Ekki brjóta núverandi `saveDefaults` vindmarka-flæði.
- Ef bæði wind-threshold pending save og status-mode pending save eru til staðar, vista þau helst í einu PUT-i eða í öruggri röð.
- Ekki gera DB write fyrir anon session án auth.

### Phase B: Bæta einum valkvæðum viðkomustað á /vedrid/ferdalagid

Markmið: Fyrsta skrefið í `/vedrid/ferdalagid` styðji einn optional `Viðkomustaður` milli `Frá` og `Til`.

User story:

- Notandi velur `Frá`: Reykjavík
- smellir á `Bæta við viðkomustað`
- velur `Viðkomustaður`: Hólmavík
- velur `Til`: Ísafjörður
- leiðin reiknast sem ferð gegnum Hólmavík
- route-memory verður gagnlegt fyrir `/vedrid`

Skoða sérstaklega:

- `components/weather/RouteSelectionStep.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/iceland-routes/routeDraft.ts`
- `lib/iceland-routes/routeMemory.server.ts`
- route-memory cleanup/dedup logic úr v195-v197 svo `via:` variantar eyðist ekki sem "rýrri duplicates"

MVP leið sem Codex mælir með:

- Styðja max einn waypoint í fyrsta áfanga.
- Ekki breyta Google provider adapter nema nauðsynlegt sé.
- Í route-options API má fyrst kalla núverandi `provider.getRouteOptions()` tvisvar:
  - `origin -> waypoint`
  - `waypoint -> destination`
- Búa til composed route option:
  - `id`: `via:{waypointKey}:default`
  - `label`: `Gegnum {waypointLabel}`
  - `distance/duration`: summa beggja leggja
  - `points/providerMatchingPoints`: concatenate-a með sanngjarnri dedupe á sameiginlegum enda/byrjunarpunkti
  - `routeCautions`: union af báðum leggjum
  - `isDefault`: true ef þetta er eina waypoint-composite niðurstaðan

Mjög mikilvægt:

- `travel/route` má ekki endurreikna beina `origin -> destination` leið og missa waypointið.
- Þegar `selectedRouteId` er `via:*` þarf result calculation að nota composed geometry/points sem samsvara waypoint route.
- Route-memory þarf að warm-a/vista þrjú route-set:
  1. `Reykjavík -> Hólmavík`
  2. `Hólmavík -> Ísafjörður`
  3. `Reykjavík -> Ísafjörður`, `routeVariantKey=via:{waypointKey}`, `routeVariantLabel=Gegnum {waypointLabel}`
- Composite station rows skulu vera dedupe-uð eftir `(provider, stationId)` og raðast eftir leið.
- Ekki geyma raw Google route geometry, steps, raw address, Google place ID, user ID eða persónulega route history í route-memory.

Route draft:

- Uppfæra `OverviewRouteDraft` í schema v2:
  - `from`
  - `to`
  - `via?: RouteDraftPlace[]`
  - `savedAtIso`
- Halda backwards compatibility fyrir v1 draft án `via`.
- `/vedrid -> Ferðalagið` prefill á að geta borið viðkomustað áfram þegar hann er til.

UX:

- Fyrsta skref: `Frá`, optional `Viðkomustaður`, `Til`.
- `Bæta við viðkomustað` birtist milli `Frá` og `Til`.
- Hægt að fjarlægja viðkomustað án þess að hreinsa `Frá`/`Til`.
- Breyting á waypoint á að invalidate-a route options/result á sama hátt og breyting á origin/destination.
- Mobile-first: input texti minnst 16px, ekkert horizontal overflow, enginn óæskilegur zoom.

### Phase C: Extracta og endurnýta "Fyrir þá sem eru að elta veðrið"

Markmið: Samanburðarhlutinn úr `/ferdalagid` summary verði reusable component og birtist líka á `/vedrid` þegar það er gagnlegt.

Núverandi staða:

- Textar:
  - `messages/is.json`: `weatherCompareSection = "Fyrir þá sem eru að elta veðrið"`
  - `messages/en.json`: `weatherCompareSection = "For weather watchers"`
- Inline implementation í:
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - `compareOriginRows`, `compareDestRows`, `comparisonCols`
  - `compareDrawerOpen`
  - `buildCompareColumns`, `CompareCol`, `CompareThresh`, metric class helpers neðar í skránni

Tillaga:

- Búa til reusable component, t.d.:
  - `components/weather/WeatherWatchersComparison.tsx`
  - og/eða helper í `lib/weather/weatherWatchersComparison.ts`
- Component props ættu að vera gagnadrifin:
  - `originLabel`
  - `destinationLabel`
  - `originRows`
  - `destinationRows`
  - `thresholds`
  - `locale`
  - optional `compactColumnLimit`
  - optional `defaultPreset`
- Component á sjálf að sjá um compact summary og `Skoða samanburð nánar` drawer/dialog.
- Replace-a inline markup í `FerdalagidClient` með component-inu.
- Nota sama component í `WeatherOverviewClient` á `/vedrid`.

Gagnagjafi á `/vedrid`:

- Ekki kalla í Google Routes frá `/vedrid` bara til að sýna comparison.
- Nota núverandi Veðurstofu station/forecast gögn og route-memory/place state ef það er nógu áreiðanlegt.
- Birta component aðeins þegar:
  - bæði `Frá` og `Til` eru valin í route-memory picker, og
  - hægt er að leysa bæði endpoints í forecast rows með sanngjörnum hætti.
- Ef `/vedrid` hefur ekki örugg hnit eða forecast rows fyrir endpointa, ekki sýna samanburð frekar en að sýna villandi gögn.
- Ef canonical staðir í `getCanonicalPlace` eða núverandi station dataset duga:
  - velja næstu Veðurstofu forecast station við `Frá`
  - velja næstu Veðurstofu forecast station við `Til`
  - nota label notandans (`fromMemoryPlace.label`, `toMemoryPlace.label`) en mega birta station-name sem secondary/debug text ef það passar UI.

Placement á `/vedrid`:

- Setja comparison nálægt route-filter UI, ekki ofan á kortið.
- Ekki setja card inni í card.
- Halda þessu compact svo `/vedrid` verði ekki flóknari fyrir einfalda sýn.
- Ef `statusFilterMode === 'simple'`, component má samt vera collapsed/compact eða falið þar til notandi biður um `Nánar`; Claude Code þarf að velja conservative UX sem samræmist nýju einföldu sýninni.

### Phase D: Low-priority polish úr v236

- Skoða hardcoded `#2563eb` í `IcelandOverviewMap.tsx` link style.
- Skipta yfir í project token/CSS variable eða núverandi primary lit ef einfalt.
- Þetta á ekki að tefja Phase A-C ef breytingin reynist meiri en lítur út.

## Files likely to inspect

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/IcelandOverviewMap.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `components/weather/RouteMemoryPicker.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `app/api/teskeid/weather/preferences/thresholds/route.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `lib/iceland-routes/routeDraft.ts`
- `lib/iceland-routes/routeMemory.server.ts`
- `messages/is.json`
- `messages/en.json`
- `Design.md`
- `IcelandRoadmap.md`

## Files likely to change

Expected, but Claude Code should verify exact paths:

- `components/weather/WeatherOverviewClient.tsx`
- `app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `components/weather/RouteSelectionStep.tsx`
- new `components/weather/WeatherWatchersComparison.tsx`
- possible new helper under `lib/weather/` or `lib/iceland-routes/`
- `lib/iceland-routes/routeDraft.ts`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `messages/is.json`
- `messages/en.json`
- tests under existing `__tests__` locations

Do not include `.obsidian/workspace.json` in commit unless Stebbi explicitly asks.

## SQL / Supabase / RLS

No new SQL is expected for this combined handoff.

SQL88 appears to be the relevant schema support for `status_filter_mode`. If SQL88 has already been run on production, make sure `sql/88_weather_user_preferences_status_filter_mode.sql` is committed with the code that depends on it.

For preferences:

- Keep writes scoped to the authenticated user.
- Do not weaken RLS.
- Do not expose preferences across users.
- Do not make anon DB writes.

For route memory:

- Use existing `weather_route_memory_routes` and `weather_route_memory_stations`.
- Keep the privacy guarantees from SQL86/SQL87.
- If Claude Code believes a schema change is required for waypoint/composite routes, stop and produce a separate migration proposal before implementing it.

## Route Intelligence Check

1. Leiðir snertar: general `Frá -> Viðkomustaður -> Til`, especially long Iceland routes such as Reykjavík -> Hólmavík -> Ísafjörður.
2. Ný þekking á ekki að fara í `IcelandRoadmap.md` nema Claude bætir við hand-curated route families/segments. Generic waypoint support belongs in code.
3. Google Routes má nota til calculation, en raw geometry/steps/duration/distance má ekki verða varanlegur cache í route-memory.
4. Route-memory má vista normalized place keys/labels, provider station IDs, route variant key/label og caution IDs.
5. Privacy: enginn user ID, engin raw address, engin Google place ID, engin persónuleg route history.
6. Dedup/cleanup má ekki eyða `via:` variantum sem eru raunverulega aðrar leiðir.
7. Ef roadmap/kjarninn er ekki uppfærður er það vegna þess að þetta er generic waypoint capability, ekki ný curated Iceland route knowledge.

## Design.md Check

Claude Code þarf að passa sérstaklega:

- mobile-first layout
- inputs með minnst 16px texta á mobile
- ekkert horizontal overflow
- enginn óæskilegur mobile zoom við focus/keyboard
- controls mega ekki hoppa eða breyta stærð við loading/hover
- client navigation/login redirect þarf skýrt pending feedback eða obvious state
- ekki card inni í card þegar Weather Watchers component er endurnýtt
- texti má ekki overflow-a pillur, buttons eða compact summary

## Suggested tests and commands

Keyra eftir breytingar:

```bash
npm run type-check
npm run test:run
npm run build
```

Mælt með prófum:

- unit test fyrir `routeDraft` v1/v2 compatibility með `via`
- route-options API test:
  - no waypoint
  - one waypoint
  - more than one waypoint rejected
  - invalid waypoint rejected
- travel result test sem staðfestir að `via:*` valin route endi ekki sem bein leið
- route-memory write/warm test sem staðfestir leg1, leg2 og composite variant
- comparison helper test fyrir `buildCompareColumns` eftir extraction
- status mode test eða component-level coverage fyrir pending login-save state ef núverandi test setup styður það

## Acceptance Criteria

- Public user can choose `Nánar`/`Einfalt`, log in, return to `/vedrid`, and have the chosen mode saved to their user preference.
- Authenticated user can change status mode without login redirect and reload keeps the DB-backed value.
- `/vedrid/ferdalagid` supports exactly one optional `Viðkomustaður`.
- Waypoint route options and final travel result use the same route path.
- Route-memory is populated for both legs and the composite via route.
- `/vedrid` route pills can surface the composite `Gegnum {viðkomustaður}` route when memory exists.
- `"Fyrir þá sem eru að elta veðrið"` is rendered from a shared component, not duplicate markup.
- `/ferdalagid` comparison UI is visually/functionally unchanged except for extraction.
- `/vedrid` shows the comparison only when it has reliable endpoint forecast data.
- Type-check, tests and build pass.

## Localhost checks for Stebbi

### A. Status mode login-save

Setup:

- Open `/vedrid` as signed-out/public user.

Steps:

1. Choose `Nánar` or `Einfalt`.
2. Confirm login flow opens.
3. Log in.
4. Confirm you return to `/vedrid`.
5. Reload `/vedrid`.

Expected:

- Chosen mode is still active after login and reload.
- Wind thresholds still behave as before.
- Hamburger/auth state does not get stuck thinking you are signed out.

Regression watch:

- No endless redirect loop.
- No lost threshold values.
- No 500 from preferences API.

### B. Authenticated status mode

Setup:

- Open `/vedrid` while logged in.

Steps:

1. Switch between `Einfalt` and `Nánar`.
2. Reload.
3. Open `/vedrid/ferdalagid` and return.

Expected:

- The saved status mode persists.
- Simple mode shows only the simple status pills.
- Detailed mode shows the richer pill set.

### C. Viðkomustaður on /vedrid/ferdalagid

Setup:

- Open `/vedrid/ferdalagid`.

Steps:

1. Set `Frá = Reykjavík`.
2. Add `Viðkomustaður = Hólmavík`.
3. Set `Til = Ísafjörður`.
4. Select the route through Hólmavík.
5. Continue through the flow to result.
6. Go back to `/vedrid`.

Expected:

- Route options clearly represent the via route.
- Result weather uses the via route, not a direct route.
- `/vedrid` can show a route pill for Reykjavík -> Ísafjörður through Hólmavík once route-memory has been warmed.

Regression watch:

- Existing direct routes without waypoint still work.
- Vestmannaeyjar/ferry special case is not broken.
- Route pills are not duplicated by cleanup/dedup.

### D. Weather Watchers component reuse

Setup:

- Open `/vedrid/ferdalagid` with a normal route that has origin and destination forecast rows.
- Open `/vedrid` with a selected route where both endpoints can be resolved.

Steps:

1. Check the compact `"Fyrir þá sem eru að elta veðrið"` block on `/ferdalagid`.
2. Open `Skoða samanburð nánar`.
3. Repeat on `/vedrid` when the comparison is available.
4. Test mobile width around 360-430px and desktop.

Expected:

- Same component behavior in both places.
- No horizontal overflow.
- No card-in-card feeling.
- Component is hidden on `/vedrid` when endpoint data is not reliable.

### Safety notes

- Do not casually test production DB writes except through normal UI flows Stebbi has approved.
- Do not run SQL or migrations without explicit approval.
- Do not test with real private addresses; use public place labels.

## Open questions for Claude Code to verify

1. Does `/vedrid` currently have reliable coordinates for selected route-memory endpoints, or does it need a small canonical-place resolver helper?
2. Should public status-mode selection redirect immediately to login, or should it behave like a "save to my user" action only? Stebbi's latest wording points to immediate login-save flow, but UX may be worth confirming if it feels jarring.
3. Does existing route-memory cleanup treat `via:*` variants as distinct enough, or is an adjustment needed to protect composite routes?
4. Can waypoint support be done without schema changes? Codex expectation: yes.

## Suggested next step

Claude Code should start with Phase A because it is the smallest post-release follow-up and has the clearest risk boundary. Then extract the Weather Watchers component as Phase C if that is still small. Treat waypoint support as its own larger phase and stop with a handoff if travel API/result composition becomes broad.
