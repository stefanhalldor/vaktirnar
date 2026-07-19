# 2026-07-18 08:41 - TODO 086 v467 - Codex review of v466 and first-live-warm gate

Created: 2026-07-18 08:41
Timezone: Atlantic/Reykjavik

Review target: `2026-07-18-0838-todo-086-v466-claude-v465-done-prerelease`

## Stutt niðurstaða

v466 er skýrt framfaraskref. Það lagar stærsta vandamálið úr v465: warm route staðfestir nú readback áður en hún skilar `status: "ok"`.

Ég myndi samt biðja Claude Code um eitt lítið en mikilvægt hardening-pass áður en þetta fer í scheduling eða production-ready stöðu:

1. `weather_cache.upsert()` þarf að skoða Supabase `{ error }`, ekki bara `catch`.
2. Warm route þarf að staðfesta að readback sé sama nýja cache key/payload og var nýlega sótt, ekki bara að einhver gamall cache sé lesanlegur.

Eftir það er næsta eðlilega skref að Stebbi samþykki fyrsta live warm sérstaklega og sendi niðurstöðuna til baka.

## Findings

1. **Medium: Supabase upsert errors may be ignored**

   `writeToCache()` now returns `boolean`, which is good. But it currently treats `await upsert(...)` as success unless it throws:

   `lib/weather/providers/vegagerdinCurrent.server.ts:212`

   ```ts
   await getAdmin()
     .from('weather_cache')
     .upsert(...)
   return true
   ```

   Supabase/PostgREST operations often resolve with `{ data, error }` rather than throwing. If `upsert` returns `{ error }`, `writeToCache()` can still return `true`.

   Fix:

   ```ts
   const { error } = await getAdmin()
     .from('weather_cache')
     .upsert(...)

   if (error) {
     console.error('[vegagerdin] cache write failed', error.message)
     return false
   }
   return true
   ```

   Do not log full error objects if they might include request metadata. Message/code/details are probably enough if not sensitive.

2. **Medium: readback verify should verify the new payload, not only any readable cache**

   Warm route currently verifies:

   `app/api/cron/warm-vegagerdin/route.ts:58`

   ```ts
   const verify = await readVegagerdinCurrentFromCache()
   if (verify.status === 'unavailable') ...
   ```

   This proves that the public read path sees something, but not necessarily the just-written payload.

   Edge case:

   - cache is stale but still within 30-minute fallback
   - new upsert returns an error object that is ignored
   - verify reads old stale payload
   - route returns `status: "ok"` using the newly fetched payload, while `/vedrid` may still show old data

   Fix:

   - After verify, compare `verify.payload.fetchedAtIso` with `result.payload.fetchedAtIso`.
   - Also compare station count if useful.
   - Return `cache_verify_failed` or `cache_verify_mismatch` if readback does not match.

3. **Low/Medium: first-live `shapeInfo` may be too shallow for object-wrapped arrays**

   `buildSafeShapeInfo()` is safe, but if Vegagerdin returns an object wrapper such as:

   ```json
   { "results": [ { "...": "..." } ] }
   ```

   and parser returns zero because field names differ inside items, current `shapeInfo` for object only returns top-level keys such as `["results"]`.

   That may not be enough to fix field mapping.

   Fix: if top-level object has `results` or `data` array, include:

   - wrapper key name
   - item count
   - first item keys

   Still do not include raw values.

4. **Low: anti-stampede is enough for first manual test, not enough for cron scheduling**

   v466 skips when cache is already fresh. That is good for manual use and low-risk first test.

   It does not yet prevent two concurrent cold/stale warm calls from both calling upstream. Because this is one Vegagerdin endpoint, it is not urgent for localhost validation, but before adding Vercel schedule, add either:

   - a small DB-backed run row/cooldown, or
   - reuse existing fetch-run metadata cleanly if it fits provider semantics.

   Do not block first localhost validation on this unless Claude Code finds an easy reuse.

## Positive checks

- v466 respects “no live fetch without approval”.
- `/api/cron/warm-vegagerdin` remains protected by `CRON_SECRET`.
- Middleware opens exact route only, while handler enforces auth.
- Public current endpoint remains cache-only.
- `shapeInfo` is keys/counts only, not raw payload.
- SQL 80/81 were not run.

## Commands Codex ran

```bash
npm run type-check
npm run test:run -- lib/__tests__/warm-vegagerdin-cron.test.ts lib/__tests__/weather-vegagerdin-current-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/overviewSelectionUrl.test.ts lib/__tests__/weather-vegagerdin-current.test.ts lib/__tests__/vedurpuls-vegagerdin-preview-api.test.ts lib/__tests__/pulseTarget.test.ts
```

Results:

- `npm run type-check` -> exit 0
- targeted test run -> exit 0, 7 files, 161 tests passed

Codex did not run localhost, SQL, live upstream fetch, commit, push, or deploy.

## Recommended next step

### v468 - small hardening before first live warm

This should be a compact Claude Code pass:

1. Inspect `{ error }` from `weather_cache.upsert()`.
2. Make readback verify compare the just-fetched `fetchedAtIso` against persisted `fetchedAtIso`.
3. Improve `shapeInfo` for `results` / `data` object wrappers.
4. Add tests for:
   - Supabase upsert returns `{ error }`
   - verify reads old stale cache with different `fetchedAtIso`
   - object-wrapped array shapeInfo includes first item keys

No live fetch. No SQL. No commit/push/deploy.

### Then: first approved live warm

After v468, Stebbi can explicitly approve the live fetch and run the warm route locally.

The first live warm is not “deploy”; it is an external HTTP fetch to Vegagerdin and a write to local/connected Supabase `weather_cache`.

If it returns:

- `status: "ok"` -> test `/vedrid` markers immediately.
- `reason: "parse_zero"` + `shapeInfo` -> send shapeInfo to Codex/Claude for parser correction.
- `reason: "write_failed"` or `cache_verify_failed` -> inspect Supabase/service-role/cache write path before touching UI.

## Suggested copy/paste prompt for Claude Code

```text
Workflow

Lestu fyrst:
- ai-handoff/2026-07-18-0841-todo-086-v467-codex-v466-review-and-first-live-warm-gate.md
- ai-handoff/2026-07-18-0838-todo-086-v466-claude-v465-done-prerelease.md
- WORKFLOW.md

Markmið:
Taktu eitt lítið hardening-pass áður en Stebbi samþykkir fyrsta live warm fyrir Vegagerðin.

Framkvæmdu:

1. Lagaðu `writeToCache()` þannig að Supabase upsert `{ error }` sé meðhöndlað sem failure.
   - Ekki treysta bara á `catch`.
   - Ekki logga secrets eða raw payload.

2. Lagaðu readback verify í `/api/cron/warm-vegagerdin`.
   - `status: "ok"` má bara koma ef readback sér sama `fetchedAtIso` og var skrifað.
   - Ef readback sér gamalt/stale payload, skila safe error reason, t.d. `cache_verify_mismatch`.

3. Bættu `shapeInfo` þannig að ef upstream response er object með `results` eða `data` array, þá komi first item keys með.
   - Bara keys/counts, ekki raw values.

4. Bættu tests fyrir þessi þrjú atriði.

5. Keyrðu targeted tests og type-check.

Ekki:
- Ekki kalla live Vegagerðin upstream.
- Ekki keyra SQL.
- Ekki commit-a, push-a eða deploy-a.

Skilaðu handoff strax eftir framkvæmd með Localhost checks fyrir Stebba og nákvæmri leið fyrir fyrsta live warm sem hann samþykkir sérstaklega.
```

## Localhost checks for Stebbi

After v468 hardening:

1. Open `/api/teskeid/weather/vegagerdin/current`.
   - Expected before warm: `status: "unavailable"` with reason.

2. When ready, explicitly approve and trigger first live warm:

   ```bash
   curl -s -H "Authorization: Bearer <your-CRON_SECRET>" http://localhost:3004/api/cron/warm-vegagerdin
   ```

   Use the port your localhost is actually running on.

3. Expected success:

   ```json
   {
     "status": "ok",
     "stationCount": 100,
     "fetchedAtIso": "...",
     "oldestMeasuredAtIso": "...",
     "measurementFreshness": "fresh"
   }
   ```

4. Then open `/api/teskeid/weather/vegagerdin/current`.
   - Expected: `status: "ok"` and `stations.length > 0`.

5. Open `/vedrid`.
   - Expected: Vegagerdin provider is not `Engin gögn`.
   - Expected: Vegagerdin markers are visible.

6. Click a Vegagerdin marker.
   - Expected: current measurement detail and pulse preview.
   - Expected: URL has `provider=vegagerdin&stationId=...`.

Do not test Vegagerdin compose/send until SQL 81 has been explicitly run.

## Óvissa / þarf að staðfesta

- Codex did not live-verify Vegagerdin response shape.
- It is possible v466 works fine for a first cache-missing localhost warm already, but the two verify/write fixes above make the result much more trustworthy before Stebbi spends time debugging UI.
- Before Vercel cron scheduling, add stronger running/recent-attempt protection.
