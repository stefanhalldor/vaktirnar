# TODO #67 Vedrid - Codex review of v024 and places growth question

Created: 2026-07-03 14:12
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi and Claude Code
Status: Review / planning handoff. No code, SQL, env, Supabase, commit, push, deploy, or production changes made.

## Stebbi question

Stebbi asked, regarding v024 option A:

> Radum vid ekki hversu innihaldsrikt places.ts er? Getum vid ekki sett einhverja bakgrunnslogik af stad sem fyllir i places.ts i hvert skipti sem stadarheiti er othekkt?

## Short answer

Yes, Teskeid controls what is in `places.ts`.

But no, runtime background logic should not automatically fill `places.ts` every time an unknown place is resolved, at least not in the simple MVP.

There are two separate issues:

1. **Technical/deployment issue:** `places.ts` is source code. Production runtime should not edit source files. On Vercel/serverless, source files are effectively build artifacts; changing them at runtime would not be a durable, reviewed app update.
2. **ToS issue:** If the background logic uses Mapbox temporary geocoding to discover coordinates, writing those coordinates into `places.ts` or Supabase is still caching/storing Mapbox geocoding results. Renaming the cache to "places.ts growth" does not avoid Mapbox's Geocoding storage rules.

Official Mapbox Geocoding docs say temporary results are not cacheable, while permanent results may be stored indefinitely when using permanent mode and meeting account requirements:
https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results

## Review of v024 option A

v024's recommendation, "Option A - places.ts only, stækka handvirkt", is still the safest MVP path.

But it should be worded more precisely:

- `places.ts` may be expanded manually or through reviewed code changes.
- Coordinates added to `places.ts` should come from Teskeid-owned/manual/independently verified sources, not Mapbox temporary geocoding output.
- Unknown place names can be recorded as suggestions, but not automatically promoted to canonical coordinates unless the coordinate source is allowed for storage.
- If Mapbox is used to populate a persistent place registry, that is not option A anymore. That becomes option C/permanent geocoding or a separate approved data-source workflow.

## Better future pattern

For MVP:

- Keep `places.ts` curated.
- Add high-value Icelandic route/golf/travel places by hand: Apavatn first, then common roads/places as Stebbi prioritizes.
- Unknown place -> friendly "eg thekki ekki thennan stad enn" answer.

For a later phase:

- Add an `unknown_place_suggestions` mechanism that stores only normalized candidate names and counts, not full user questions and not Mapbox coordinates.
- Let Stebbi/admin review the common missing names.
- Promote reviewed places into a trusted place registry.

That trusted registry can be either:

- code-reviewed `places.ts` additions, best for small curated list;
- an admin-managed Supabase table, best if the list grows large, but that requires a separate SQL/RLS/security plan;
- Mapbox permanent geocoding storage, only if Stebbi accepts billing/account requirements and ToS terms.

## Privacy caution

Do not casually log full user weather questions just to learn place names. A route query can reveal travel intent, timing, home/work locations, or personal plans.

If Teskeid later records unknown-place suggestions, store the smallest useful value:

- normalized candidate place string;
- count / last_seen_at;
- no user id unless there is a clear product need;
- no full raw question;
- no route pair unless explicitly needed and approved.

## Recommendation

Tell Claude Code:

- Keep v024 option A as the MVP.
- Add Apavatn and a small manually curated list to `places.ts`.
- Do not add background self-population from Mapbox.
- If Stebbi wants learning, create a future reviewed "unknown place suggestions" plan, not an automatic `places.ts` writer.

## Localhost checks for Stebbi

This review file has no localhost checks because it changes no app code.

For the eventual implementation:

1. Ask a known curated place, e.g. `Er mer ohaett ad keyra med hjolhysi fra Reykjavik ad Apavatni?`
   - Expected: local `places.ts` resolution works without Mapbox geocoding cache.
2. Ask an unknown place.
   - Expected: friendly unsupported/unknown-place answer.
3. Verify no browser payload exposes Mapbox token.
4. Verify no persistent table or source-file mutation is created from Mapbox temporary geocoding output.
5. If unknown-place suggestions are later added, verify full user questions are not stored.

## Suggested message to Claude Code

Stebbi asked whether `places.ts` can be made richer automatically when unknown places appear.

Codex answer: `places.ts` can be richer, but not by runtime auto-writing Mapbox temporary geocoding results into source code or Supabase. That would still be persistent storage of geocoding results and would also be a bad deployment pattern. For MVP, keep v024 option A: manually curated `places.ts`, add Apavatn and the first high-value Icelandic places, and return a friendly unknown-place answer for missing entries.

If learning is desired later, plan a separate unknown-place-suggestions mechanism that stores only normalized candidate names/counts, avoids full user questions, and requires manual/admin review before promotion. If promotion uses Mapbox coordinates, it must use an explicitly allowed permanent-geocoding/billing/ToS path.
