# 2026-07-18 08:32 - TODO 086 v465 - Codex review of v464 and next Vegagerdin visible-flow step

Created: 2026-07-18 08:32
Timezone: Atlantic/Reykjavik

Review target: `2026-07-18-0827-todo-086-v464-claude-v463-done-prerelease`

Related prior handoff: `2026-07-18-0819-todo-086-v463-codex-v462-review-and-vegagerdin-cache-hydration-next`

## Stutt staða

v464 er rétta næsta skrefið: Vegagerdin current cache er nú með varða warm route og `/api/teskeid/weather/vegagerdin/current` gefur betri diagnostic reason þegar cache vantar.

En þetta er ekki enn “fullbúið” í þeim skilningi að Stebbi geti örugglega hitað cache, séð Vegagerdin-punkta á `/vedrid`, og treyst að warm hafi raunverulega skrifað gögn. Það vantar sérstaklega að sannreyna cache-write árangur og fyrsta live response frá Vegagerdin.

## Findings

1. **Medium: warm route can report success even if cache write fails**

   In `lib/weather/providers/vegagerdinCurrent.server.ts`, `writeToCache()` catches cache-write errors and only logs:

   `lib/weather/providers/vegagerdinCurrent.server.ts:212`

   ```ts
   async function writeToCache(payload: VegagerdinCachePayload): Promise<void> {
     try {
       ...
       await getAdmin().from('weather_cache').upsert(...)
     } catch {
       console.error('[vegagerdin] cache write failed')
     }
   }
   ```

   `fetchVegagerdinCurrent()` then returns the parsed payload even if the upsert failed. That means `/api/cron/warm-vegagerdin` can return:

   ```json
   { "status": "ok", "stationCount": 123 }
   ```

   while `/api/teskeid/weather/vegagerdin/current` still returns `status: "unavailable"` and `/vedrid` still shows `Vegagerðin Engin gögn`.

   Fix: make the warm path verify persistence before returning ok. Options:

   - Make `writeToCache()` return `{ ok: true } | { ok: false }` and make `fetchVegagerdinCurrent()` return null or a structured failure on write failure.
   - Or, after `fetchVegagerdinCurrent()`, have the cron route immediately call `readVegagerdinCurrentFromCache()` and confirm it sees `status !== "unavailable"` and non-empty measurements.

   I prefer the second check as well, even if `writeToCache()` is changed, because it proves the exact user-facing read path sees the warmed data.

2. **Medium: no anti-stampede / cooldown before scheduling**

   `app/api/cron/warm-vegagerdin/route.ts:25` calls `fetchVegagerdinCurrent()` every authorized request. That is okay for one manual localhost test, but before adding Vercel cron or exposing an admin button, add simple protection:

   - If cache is fresh enough, skip with `{ skipped: "alreadyFresh" }`.
   - If a warm is already in progress, skip with `{ skipped: "running" }`.
   - If a warm was attempted moments ago and failed, skip with `{ skipped: "recentlyAttempted" }` or enforce a small cooldown.

   Vegagerdin current is one upstream call, so this is less intense than Veðurstofan's 280-station warm, but repeated concurrent warms are still avoidable and product-wise unnecessary.

3. **Medium: first live parser failure will not provide enough actionable diagnostics**

   v464 handoff says: “Report the actual field names/shape from the server log.” But current parser mostly logs generic messages such as:

   - `[vegagerdin] JSON parse failed`
   - `[vegagerdin] unexpected response shape`
   - `[vegagerdin] parsed 0 measurements from upstream response`

   If the real `vedur2014_1` shape differs from documented assumptions, Stebbi/Claude may not have enough information to fix the parser without rerunning and manually instrumenting.

   Fix: for the protected warm route only, add safe debug metadata on failure, without leaking raw data publicly:

   - top-level type: array/object
   - if object: top-level keys only
   - if array: first item keys only
   - maybe sample count

   Do not return raw values, coordinates, names, body text, secrets, or full payload. This diagnostic should only be available behind `CRON_SECRET` and can be omitted in production if Claude prefers logs over response fields.

4. **Low/Medium: cache read failures are reported as `cache_missing`**

   `readFromCache()` catches all Supabase read errors and returns null:

   `lib/weather/providers/vegagerdinCurrent.server.ts:199`

   Then `readVegagerdinCurrentFromCache()` maps null to `cache_missing`:

   `lib/weather/providers/vegagerdinCurrent.server.ts:296`

   This can hide a DB/service-role/config error as “missing cache”. That is fine for quiet public UI, but diagnostic reason is now part of the endpoint contract. Add a separate `cache_read_failed` internal reason or log the read error with a non-sensitive message.

5. **Low: SQL 81 is still not needed for map display, but needed before compose**

   `sql/81_teskeid_chat_target_type_vegagerdin_station.sql` exists and only extends chat target type. It is not needed for:

   - warming current measurements
   - seeing Vegagerdin markers
   - reading pulse preview

   It is needed before a signed-in user can send a Vegagerdin pulse message. Keep this clear in the next handoff so Stebbi does not run SQL to fix a cache problem.

## Positive checks

v464 has several good choices:

- `/api/cron/warm-vegagerdin` is exact-public in middleware, not prefix-public.
- The route handler checks `Authorization: Bearer ${CRON_SECRET}` before calling upstream.
- No live upstream fetch was made in tests.
- The current API remains cache-only for public users.
- Diagnostics are safe enough for public response: reason is not sensitive.
- SQL 80/81 were not run.

## Commands Codex ran

```bash
npm run type-check
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/pulseTarget.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/weather-vegagerdin-current.test.ts
```

Results:

- `npm run type-check` -> exit 0
- targeted test run -> exit 0, 7 files, 154 tests passed

Codex did not run localhost, SQL, live upstream fetch, commit, push, or deploy.

## Scope recommendation: next large step v466

Goal: make Vegagerdin stations visible and testable on `/vedrid` with a trustworthy cache lifecycle.

### A. Harden cache warm success semantics

Claude Code should change the warm flow so `status: "ok"` means:

1. Upstream fetch succeeded.
2. Parser returned non-empty measurements.
3. Cache write succeeded.
4. The same read path used by `/api/teskeid/weather/vegagerdin/current` can immediately read the persisted data.

Concrete implementation:

- Modify `writeToCache()` to return success/failure or throw a controlled error.
- After writing, call `readVegagerdinCurrentFromCache()`.
- If the read path returns unavailable or zero measurements, return 500 with a safe reason such as:
  - `cache_write_failed`
  - `cache_verify_failed`
  - `zero_stations`
- Add tests for write failure and verify failure.

### B. Add minimal anti-stampede/cooldown

Before scheduling or repeated manual use:

- If cache is fresh, return `{ skipped: "alreadyFresh" }`.
- Add a short in-progress/recent-attempt mechanism.

Preferred route:

- Reuse existing `weather_fetch_runs` if its schema fits provider/run metadata cleanly.
- If it does not fit, keep v466 simpler: use `weather_cache` freshness check first and a very small in-process/DB-light cooldown. Do not overbuild.

Important: no SQL unless clearly necessary and explicitly approved by Stebbi. If a new migration is needed, write it only if the handoff/scope explicitly calls for it, and do not run it.

### C. Add protected first-live diagnostic for parser verification

For the first real live warm, we need useful but safe information if parser assumptions are wrong.

Add safe diagnostics behind `CRON_SECRET`:

- response top-level kind: `array`, `object`, or other
- if object: top-level keys only
- if array with object item: first item keys only
- item count if array

Do not include raw values or full JSON.

### D. Prepare explicit localhost test path for Stebbi

Add handoff instructions that separate three states:

1. Before warm:
   - `/api/teskeid/weather/vegagerdin/current` returns unavailable reason.

2. Approved warm:
   - Stebbi explicitly triggers `/api/cron/warm-vegagerdin` with `CRON_SECRET`.
   - This is a live external fetch to Vegagerdin.

3. After warm:
   - current endpoint returns `status: "ok"` and station count.
   - `/vedrid` shows Vegagerdin points.
   - clicking a point opens detail + `WeatherPulseInline`.

### E. Push persistent Vegagerdin station registry up the roadmap

This does not have to be in v466 unless it is cheap, but it should not stay buried at the end.

Current Vegagerdin station identity for full pulse pages and preview is cache-backed:

- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`
- `app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route.ts`
- `lib/chat/adapters/weather.server.ts`

If cache expires, a valid station can appear invalid. For a production-quality pulse feature, station identity should come from a persistent registry/table/cache of known Vegagerdin stations, while current measurements can expire independently.

Suggested future shape:

- `vegagerdin_stations` product table or generated registry from last known measurements.
- Station detail can show “current measurement unavailable” without making the station/pulse invalid.
- This will also help favorites and route/provider overlays.

### F. Keep Design.md and reusable principles in force

If v466 touches visible UI:

- Reuse provider-neutral overview/detail/pulse components.
- Do not create Vegagerdin-only UI if `ProviderStationPreviewCard`, `WeatherPulseInline`, or provider shell can carry it.
- Keep mobile-first constraints: no horizontal overflow, text wraps cleanly, touch targets stay usable.
- Any navigation into full pulse needs visible pending/loading behavior according to `Design.md`.

## Suggested copy/paste prompt for Claude Code

```text
Workflow

Lestu fyrst:
- ai-handoff/2026-07-18-0832-todo-086-v465-codex-v464-review-and-next-vegagerdin-visible-flow.md
- ai-handoff/2026-07-18-0827-todo-086-v464-claude-v463-done-prerelease.md
- WORKFLOW.md
- Design.md ef þú snertir UI

Markmið næsta stóra skrefs:
Gera Vegagerðin-current warm leiðina nógu trausta til að Stebbi geti samþykkt live warm, séð Vegagerðarpunktana birtast á /vedrid, smellt á þá og prófað pulse preview/full pulse flæðið.

Framkvæmdu afmarkað en stórt skref:

1. Harden warm success semantics.
   - /api/cron/warm-vegagerdin má ekki skila status ok nema cache write hafi raunverulega tekist.
   - Eftir fetch+parse+write skal route eða helper lesa aftur með readVegagerdinCurrentFromCache().
   - Ef read path sér ekki gögnin strax, skila safe 500 reason eins og cache_verify_failed.

2. Bættu við tests fyrir:
   - cache write failure
   - cache verify failure
   - success verifies persisted cache
   - unavailable reasons eru enn öruggar

3. Bættu við lágmarks anti-stampede/cooldown áður en þetta verður schedulable.
   - Ef cache er fresh, skip alreadyFresh.
   - Ef einföld running/recentlyAttempted vörn er hægt að gera án migration, gerðu það.
   - Ef migration þarf, stoppaðu og settu það í handoff; ekki skrifa/keyra SQL nema scope sé skýrt og Stebbi samþykki.

4. Bættu við safe first-live diagnostics á parser failure bakvið CRON_SECRET.
   - Top-level shape og keys, ekki raw values eða raw body.
   - Þetta á að hjálpa okkur að laga parser ef raunverulegt Vegagerðin response er ekki eins og skjölin.

5. Ekki keyra live upstream fetch.
   - Ekki kalla /api/cron/warm-vegagerdin sjálfur.
   - Stebbi þarf að samþykkja fyrsta live fetch sérstaklega.

6. Skilaðu handoff með:
   - changed files
   - tests
   - SQL status
   - exact localhost checks
   - nákvæmri skipun/slóð sem Stebbi getur notað til að hita cache ef hann samþykkir live external fetch
   - skýru hvort SQL 81 þarf fyrir compose en ekki fyrir kortapunkta

Ekki commit-a, push-a, deploy-a eða keyra SQL.
```

## Localhost checks for Stebbi

Before v466:

1. Open `/api/teskeid/weather/vegagerdin/current`.
   - Expected if not warmed: `status: "unavailable"` with a reason such as `cache_missing`.

2. Open `/vedrid`.
   - Expected if not warmed: `Vegagerðin Engin gögn`.
   - This is now expected behavior, not SQL failure.

After v466, but before live warm:

1. Confirm Claude's tests pass.
2. Confirm the handoff says `status: "ok"` requires verified cache readback.

When Stebbi explicitly approves live external fetch:

1. Trigger `/api/cron/warm-vegagerdin` with `Authorization: Bearer <CRON_SECRET>`.
2. Expected success:
   - `status: "ok"`
   - `stationCount > 0`
   - `fetchedAtIso`
   - `oldestMeasuredAtIso`
   - `measurementFreshness`
3. Then open `/api/teskeid/weather/vegagerdin/current`.
   - Expected: `status: "ok"` and same general station count.
4. Then open `/vedrid`.
   - Expected: Vegagerdin markers visible.
5. Click a marker.
   - Expected: detail card with current measurement, not forecast wording.
   - Expected: pulse preview appears.
   - Expected: URL contains `provider=vegagerdin&stationId=...`.
6. Reload that URL.
   - Expected: same selected Vegagerdin point restores.

Do not test sending Vegagerdin pulse messages until SQL 81 has been explicitly run.

## Óvissa / þarf að staðfesta

- Codex did not run the live Vegagerdin warm and did not verify the real upstream response shape.
- The repo has a broad dirty worktree from many previous weather/pulse changes. This review focused on v464 files and directly related current/pulse consumers.
- Need decision soon: when Vegagerdin is proven live, should it be scheduled in Vercel cron, manually warmed first, or both?
