# TODO 086 v071 - Codex review of v070 seed script and next steps

Created: 2026-07-13 08:45
Timezone: Atlantic/Reykjavik
Agent: Codex
Input: `2026-07-13-0842-todo-086-v070-claude-seed-script-and-next-steps.md`

## Findings

### P1 - Do not run the seed script yet: registry parser starts at `Entry[]`, not the array literal

`scripts/seed-vedurstofan-stations.mjs:56-65`

The script uses:

```js
const arrayStart = registryTs.indexOf('[', registryTs.indexOf('VEDURSTOFAN_STATIONS_REGISTRY'))
```

But the registry declaration is TypeScript:

```ts
export const VEDURSTOFAN_STATIONS_REGISTRY: readonly VedurstofanStationRegistryEntry[] = [
```

So the first `[` after `VEDURSTOFAN_STATIONS_REGISTRY` is the `[]` in the type annotation, not the actual array literal.

Codex confirmed read-only that the extracted slice starts with:

```text
[] = [
  {
    slug: "aedey",
```

That means `new Function('return ' + slice)()` will likely fail before any upsert happens. This is good in the sense that it should fail before writing, but Stebbi should not run it as-is.

Recommended fix:

- find the assignment array, not the type annotation, e.g. search for `= [` after the const declaration or use a safer regex
- add `--dry-run` or `--parse-only` mode that parses and reports count/first/last station without requiring Supabase credentials
- add a small test or script check that validates parsing returns 280 rows and Hellisheiði `31392`

### P1 - Current repo type-check fails on new SQL/74 test regex

`lib/__tests__/sql-migration.test.ts:1110`

Codex ran:

```bash
npm run type-check
```

Result:

```text
lib/__tests__/sql-migration.test.ts(1110,73): error TS1501: This regular expression flag is only available when targeting 'es2018' or later.
```

The issue is the `/s` dotAll regex flag in:

```ts
expect(sql74).toMatch(/mapping_status.*CHECK \(mapping_status IN \(/s)
```

Recommended fix:

- replace `/s` with `[\s\S]*`, or
- avoid regex dotAll and use section slicing plus ordinary regex/string assertions

This is a release blocker until fixed because type-check is not clean.

### P2 - The script should not require service-role credentials just to validate parsing

`scripts/seed-vedurstofan-stations.mjs:34-42`

The script reads env and exits on missing Supabase credentials before parsing the registry. For a service-role seed script, it is safer to let Claude Code and Stebbi run a no-write validation without requiring secrets.

Recommended behavior:

- `node scripts/seed-vedurstofan-stations.mjs --dry-run`
  - parses registry
  - validates expected count
  - prints summary
  - does not read or require `SUPABASE_SERVICE_ROLE_KEY`
  - does not create a Supabase client
- normal run requires credentials and performs the upsert

This would have caught the `Entry[]` bug without getting anywhere near Supabase.

### P3 - `.env.local` parsing is simple and may not handle quoted values

`scripts/seed-vedurstofan-stations.mjs:17-32`

The manual env parser keeps the raw value after `=`. If `.env.local` contains quoted values or trailing inline comments, credentials may include quotes/comments and authentication can fail.

This is not the main blocker, but if Claude Code is touching the script anyway, either:

- strip matching surrounding quotes, or
- use the same env-loading pattern used elsewhere in project scripts if one exists

Do not log secrets.

## Answers to v070 open questions

### 1. Should the seed script be run before or after review?

After review and after the P1 script fix. Do not run the current script.

Once fixed, Stebbi can run a dry-run first, then the real seed with explicit approval/intent because it writes 280 rows to Supabase using service-role.

### 2. Cache warmer design choice

Codex recommends a staged hybrid approach:

1. First, seed `vedurstofan_stations`.
2. Then build a product-table projector that can populate `vedurstofan_forecasts_latest` from existing `weather_cache` without live Veðurstofan calls.
3. Then add the real background warmer that is allowed to live-fetch all 280 stations because it runs outside the user request path.
4. The warmer should preserve stale existing product rows on fetch failure and write a `weather_fetch_runs` row with success/failure counts.

So:

- Option A is good as a first no-external-call step.
- Option B is necessary eventually to keep data fresh.
- Option C/hybrid is the best product architecture, but implement it in small phases.

The user-facing app should continue to avoid live Veðurstofan fetches in page/API request paths.

### 3. Is Elta veðrið ready to push/release now?

Not in the current repo state, because `npm run type-check` fails.

After the type-check failure is fixed, Codex still thinks the Elta veðrið UI/API can be released independently of the full product-table pipeline:

- `elta-vedrid` is feature-gated.
- v064 cache-only station explorer was reviewed as acceptable.
- SQL/74 empty/product tables do not need to be populated for the current UI, because current UI still reads registry + `weather_cache`.

Do not include/run a broken seed script in the release path.

### 4. Next implementation priority

Recommended order:

1. Fix `sql-migration.test.ts` type-check failure.
2. Fix seed script parser and add `--dry-run`.
3. Run dry-run locally, no Supabase writes.
4. Send Codex a short handoff with dry-run output.
5. If approved, Stebbi runs the real seed.
6. Then plan product-table projector/cache warmer.

## Verification run by Codex

Codex ran a read-only slice check against the registry parser logic and confirmed the extracted slice begins with `[] = [` from the TS type annotation.

Codex ran:

```bash
node --check scripts\seed-vedurstofan-stations.mjs
```

Result:

- Exit code: 0
- Syntax check passes
- Caveat: this does not execute the dynamic registry parser, so it does not catch the P1 parser bug

Codex ran:

```bash
npm run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/weather-vedurstofan-registry.test.ts
```

Result:

- Exit code: 0
- 2 files passed
- 196 tests passed

Codex ran:

```bash
npm run type-check
```

Result:

- Exit code: 1
- Failed with TS1501 in `lib/__tests__/sql-migration.test.ts:1110`

Codex did not run the seed script and did not touch Supabase.

## Localhost checks for Stebbi

No browser localhost checks are useful for the seed script itself before it is fixed.

Before any Supabase write:

1. Confirm `npm run type-check` is green.
2. Run the seed script in `--dry-run` mode after Claude Code adds it.
3. Confirm dry-run reports 280 parsed stations.
4. Confirm Hellisheiði exists with station ID `31392`.
5. Confirm no Supabase write happens during dry-run.

After Stebbi eventually runs the real seed:

1. Confirm `vedurstofan_stations` has 280 rows in Supabase.
2. Confirm representative rows such as Hellisheiði, Akureyri and Reykjavík have expected metadata.
3. Confirm RLS remains enabled and there are no anon/authenticated policies.
4. Open `/auth-mvp/vedrid/elta-vedrid` and confirm the UI still loads as before.

Do not run cron/cache warmer/live Veðurstofan all-station refresh until that is separately designed and approved.

## Bottom line

The product-table direction is good, but v070 should not proceed to seeding yet.

Fix the seed parser and the type-check failure first. Then dry-run the seed. Only after that should Stebbi run the real Supabase write.
