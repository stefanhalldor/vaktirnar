# TODO-067 v211 - Codex review: release with known route-duration limitation

Created: 2026-07-08 14:28  
Timezone: Atlantic/Reykjavik  
Relevant TODO: TODO-067 and new TODO-070  
Reviewed handoff: `2026-07-08-1425-todo-067-v210-claude-v209-static-duration.md`

## Findings

### No blocker - OK to park the ETA mismatch if Stebbi accepts the known limitation

The v210 static-duration pass did not solve the product discrepancy enough:

- Google Maps screenshot: Þrengslavegur about 45 min / 55 km, Route 427 about 59 min / 67.2 km.
- Teskeið after v210 localhost test: Þrengslavegur about 55 min / 56 km, Route 427 about 56 min / 67 km.
- Terminal diagnostics show `durationS: 3352` vs `durationS: 3363`, only an 11-second difference.

That is not the desired final product behavior. However, it is not a release blocker if Stebbi is comfortable shipping with a known limitation, because the core route-fidelity issue is substantially better than before:

- the Þrengslavegur route is now found,
- it is shown as its own route,
- it is labelled `Um Þrengslaveg`,
- the distance/geometry are close to the expected 55-56 km route.

Codex recommendation: stop chasing this before prerelease, ship the current route-fidelity improvement if the rest of Ferðaveðrið passes localhost, and continue the ETA/provider question later under TODO-070.

### Medium - Commit/release staging must stay very narrow

The working tree contains unrelated changes and many untracked handoff files. If this goes to commit/release, Claude Code should stage intentionally. Do not use broad `git add .`.

Known unrelated or separately-scoped items include:

- `TODO.md` now includes TODO-069 and TODO-070 advisory entries.
- `sql/70_update_ready_card_descriptions.sql` is unrelated ready-card copy work.
- Many `ai-handoff/` files are untracked context/review artifacts.
- `.claude/` and `.obsidian/` are untracked and should not be included accidentally.

For a TODO-067 weather release commit, stage only the intended implementation files plus any handoff files Stebbi explicitly wants in Git.

### Low - v210 diagnostics still do not show static vs traffic duration side-by-side

v209 asked for diagnostics that expose both `staticDurationS` and `trafficDurationS`. v210 adds `durationNote`, but the terminal output Stebbi pasted only shows final `durationS`.

This is not a release blocker. It does mean the next TODO-070 investigation should add clearer side-by-side provider diagnostics before changing behavior again.

### Low - malformed duration fallback to 0 is worth cleaning later

In `lib/weather/google.server.ts`, v210 uses fallback logic equivalent to:

```ts
const durationS = staticDurationS ?? trafficDurationS ?? 0
```

Google should normally return `duration`, so this is unlikely to bite in normal operation. But if a malformed route ever reaches this code, `0` could make that route sort first. Not a blocker for this release, but TODO-070 or a future provider-cleanup pass should skip malformed route options or preserve a safer fallback.

## TODO Update

Codex added a new open item to `TODO.md`:

- `#70 Veður: leiðartími og route-provider samanburður`

It records Stebbi's localhost evidence, the v210 terminal diagnostics, and the decision to revisit this later with:

- Google Routes `TRAFFIC_AWARE`,
- Google Routes `TRAFFIC_UNAWARE`,
- Mapbox Directions / route alternatives,
- a small set of Icelandic comparison routes.

The item is explicitly marked as not a release blocker for the current Ferðaveður prerelease.

## Verification

Codex ran:

- `npm run type-check` -> exit 0
- `npm run test:run` -> exit 0

Test result:

- 59 test files passed
- 1902 tests passed
- 27 skipped
- 8 todo

The output included the known jsdom line `Not implemented: navigation to another Document`, but the suite exited green.

## Recommendation

Proceed with prerelease only if Stebbi is satisfied with the current localhost behavior:

- route picker finds and labels Þrengslavegur,
- final result works after selecting it,
- the remaining 55 min vs Google Maps 45 min mismatch is accepted as a known TODO-070 limitation.

Do not do more route-provider experimentation before this release unless Stebbi explicitly decides the ETA mismatch is a blocker. The risk of overworking this right now is higher than the value of squeezing one more uncertain Google/Mapbox experiment into the prerelease.

This is not approval to commit, push, deploy, run SQL, or change production. Those require separate explicit approval from Stebbi.

## Localhost checks for Stebbi

Before release:

1. Open `/auth-mvp/vedrid`.
2. Test `Garðabær -> Þorlákshöfn`.
3. Expected: route picker includes `Um Þrengslaveg` and `Sjálfgefin Google-leið`.
4. Expected: Þrengslavegur is about 56 km and Route 427 about 67 km.
5. Accepted known limitation: the durations may still be too close, around 55-56 min.
6. Select `Um Þrengslaveg` and click `Nota þessa leið`.
7. Expected: final Ferðaveður result loads, no `Valin leið fannst ekki`, and the map follows Þrengslavegur.
8. Test `Garðabær -> Selfoss`.
9. Expected: no false `Um Þrengslaveg` curated route.
10. Test at least one long route, e.g. `Garðabær -> Akureyri`.
11. Expected: route picker, map, weather points and final submit still work.
12. If saved places are used, also test one fresh Google autocomplete selection, because saved places may still lack `placeId` until the saved-place data path is fully refreshed.

No Supabase migration, production data, auth config, billing, secrets, commit, push or deploy is part of these localhost checks.

