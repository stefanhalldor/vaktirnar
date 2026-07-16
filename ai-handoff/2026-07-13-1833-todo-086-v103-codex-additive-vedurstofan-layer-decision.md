# TODO 086 v103 - Additive Veðurstofan layer decision

Created: 2026-07-13 18:33  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Supersedes/clarifies: `2026-07-13-1828-todo-086-v102-codex-v101-scope-review.md`

## Context

Stebbi had not sent `v102` to Claude Code yet.

After `v102`, Stebbi clarified the product direction:

- `elta-vedrid` has served its validation purpose enough for the next phase:
  - all 280 Veðurstofan station registry rows are visible
  - product-table warming works locally
  - we can continue filling/classifying unavailable stations over time
  - Stebbi may contact Veðurstofan directly to ask whether missing `forec` data for some stations is expected
- The next desired step is to bring Veðurstofan into `ferðaveðrið`, but only as an extra/additive layer.
- MET/Yr remains the current baseline and should not be replaced.
- Users should be able to show/hide Veðurstofan values in the UI.
- The UI must clearly say Veðurstofan values are still experimental/under validation.
- The UI must clearly say Vegagerðin data still needs separate investigation and is not included yet.

## Revised decision

Codex agrees with Stebbi's updated direction.

The correct next step is not "v101 as-is" if v101 is interpreted as silently switching the main travel route to product-table reads.

The correct next step is:

> Add Veðurstofan as an optional, clearly experimental overlay/layer on top of the existing MET/Yr travel weather flow.

That means:

- MET/Yr remains the source of truth for the current travel-weather result, scoring, and warnings.
- Veðurstofan product-table data may be fetched alongside the existing result.
- Veðurstofan data should not alter route safety status, thresholds, warnings, or trip recommendation yet.
- The API may include Veðurstofan enrichment in the response, but it must be treated as additional context.
- The UI must offer a visible show/hide control for Veðurstofan values.
- Default visibility should be conservative. Codex preference: hidden by default or visible only behind the `elta-vedrid`/internal feature access while still in validation.
- Text must be explicit that this is a test layer and Vegagerðin is not included yet.

## How this changes v102

`v102` was correct to flag scope-drift because v101 changed the main travel route without Stebbi's clarified approval.

Now Stebbi has given product direction for the next phase:

- it is acceptable to start integrating with `ferðaveðrið`
- but only as an additive experimental layer
- not as a replacement for the existing weather system
- not as a hidden behavioral change to user-facing scoring

So Claude Code should not simply revert everything and stop. Instead, Claude Code should reshape v101 into the additive-layer approach.

## Implementation guardrails

### API behavior

`app/api/teskeid/weather/travel/route.ts` may read `readVedurstofanProductForStations(...)`, but the result must remain enrichment-only.

Guardrails:

- MET/Yr fetch path stays intact.
- Existing travel warnings/status/scoring stay based on MET/Yr only.
- If product tables are empty, stale, unavailable, or throw, route response still works as before.
- No user-facing hard failure because of Veðurstofan product data.
- Prefer returning explicit metadata so UI can explain quality:
  - `source: "vedurstofan"`
  - `experimental: true`
  - `isStale` / `expiresAt` / `fetchedAt` where available
  - station distance and station name
  - unavailable/missing state where relevant

### Feature flag / access

Do not expose this broadly without a guard.

Recommended options:

1. Reuse the current `elta-vedrid` per-user feature access to show the Veðurstofan layer only to validation users.
2. Or add a dedicated server-side flag, e.g. `VEDURSTOFAN_TRAVEL_LAYER_ENABLED`, default false.
3. Best for now: use both if practical:
   - server flag protects rollout by environment
   - per-user access protects who sees it

Do not confuse this with `WEATHER_ENABLED`; that flag controls the weather feature generally.

### UI behavior

UI should make Veðurstofan an overlay/layer, not a replacement.

Expected UX:

- A clear control to show/hide Veðurstofan values.
- Label should feel like product UI, not dev jargon. Example: `Veðurstofan (í prófun)`.
- Very visible disclaimer when shown:
  - values are in testing/validation
  - MET/Yr remains the current base forecast
  - Vegagerðin data is not included yet and still needs separate review
- If values are missing for a station:
  - say data is unavailable for that station/time
  - do not present missing data as an app failure

### Vegagerðin

Do not imply Vegagerðin is included.

Visible copy should say that Vegagerðin/road-station data still needs a separate investigation before those values can be treated as complete.

### Unavailable stations

The 34 unavailable stations are not a blocker for beginning an experimental layer, as long as the UI clearly communicates validation status.

Next classification work:

- map all unavailable station IDs to names
- determine which are `forec` unsupported
- determine which are obs-only
- determine which are inactive/temporary
- decide if the registry should show `forecSupported`, `obsSupported`, or similar metadata later

## Suggested instruction to Claude Code

```text
Claude Code, ekki senda v101 áfram sem silent replacement á ferðaveðurhegðun.

Stebbi er búinn að skýra nýjan ramma:
- elta-vedrid validation hefur náð nógu langt til að byrja næsta skref
- Veðurstofan má koma inn í ferðaveðrið
- en aðeins sem auka/prófunarlag ofan á óbreyttan MET/Yr grunn
- MET/Yr á áfram að vera grunnur fyrir núverandi niðurstöðu, viðvaranir og scoring
- Veðurstofan má ekki breyta route safety/status/warnings ennþá
- UI þarf show/hide fyrir Veðurstofugildi
- UI þarf mjög sýnilegt að Veðurstofugildin séu í prófun
- UI þarf líka að segja skýrt að Vegagerðin sé ekki inni enn og þurfi sérstaka rannsókn

Endurforma v101 í þessa stefnu:
1. Halda eða bæta product-table read í travel route aðeins sem fail-open enrichment.
2. Gæta þess að núverandi MET/Yr niðurstaða sé óbreytt þegar Veðurstofan layer er falinn, tómur, stale eða óaðgengilegur.
3. Setja birtingu Veðurstofu í UI bakvið show/hide control og helst feature/access guard meðan validation stendur.
4. Bæta skýrum UI texta/disclaimer: "Veðurstofan (í prófun)" og "Vegagerðin ekki komin inn".
5. Ekki nota Veðurstofan til að breyta scoring/warnings enn.
6. Uppfæra tests þannig að þau sanni:
   - MET/Yr baseline breytist ekki
   - Veðurstofan er optional enrichment
   - missing/stale product data fail-open
   - UI/response getur falið eða sýnt layerið eftir guard/control

Ekki commit-a, push-a, deploya, keyra migration/Supabase eða invoke-a production cron nema Stebbi biðji sérstaklega um það.
```

## Localhost checks for Stebbi

After Claude Code reshapes v101 into the additive-layer implementation:

1. Open the normal `ferðaveðrið` flow on localhost.

2. Run a route that previously worked with MET/Yr.

3. Confirm baseline behavior:
   - route loads normally
   - current warnings/status still make sense
   - no obvious change when Veðurstofan layer is hidden/off

4. Enable/show the Veðurstofan layer:
   - confirm Veðurstofan values appear as additional context
   - confirm they are clearly labelled as testing/validation
   - confirm the UI says Vegagerðin is not included yet

5. Test missing/unavailable station behavior:
   - route should still work
   - missing Veðurstofan values should appear as unavailable/empty context, not as a crash

6. Do not test production route behavior, production cron, or Vercel env changes without explicit approval.

## Open questions

- Should the layer be hidden by default or visible by default for users with `elta-vedrid` access? Codex preference: visible for validation users, hidden/not present for everyone else.
- Should we add a dedicated `VEDURSTOFAN_TRAVEL_LAYER_ENABLED` server flag, or is per-user `elta-vedrid` enough for now? Codex preference: dedicated server flag plus per-user access if implementation cost is modest.
- Where exactly should the show/hide control live: map toolbar, detail cards, or settings panel? Codex preference: near existing weather display controls, not buried in settings.
