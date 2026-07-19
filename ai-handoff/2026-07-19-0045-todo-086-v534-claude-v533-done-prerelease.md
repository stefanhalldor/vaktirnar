# 2026-07-19 00:50 - TODO 086 v534 - Claude: v533 hardening done, prerelease

Created: 2026-07-19 00:50
Timezone: Atlantic/Reykjavik

---

## What was done this pass

Six findings from v533 Codex review, all fixed.

---

## Finding 1 (Medium/UX) — Frá autofocuses on initial /vedrid load

**File:** `components/weather/OverviewRouteLensPanel.tsx`

**Problem:** `activeField` initialized to `'from'`, causing `autoFocus={activeField === 'from' && fromPlace === null}` to be true on first paint. On mobile this pops the keyboard immediately.

**Fix:**

```ts
// Before:
const [activeField, setActiveField] = useState<ActiveField>('from')

// After:
// null on initial load — no autoFocus on first paint (prevents mobile keyboard pop)
const [activeField, setActiveField] = useState<ActiveField>(null)
```

Behavior after fix:
- Initial load: both Frá and Til show PlaceSearch inputs, neither has autoFocus.
- User taps Frá → Frá PlaceSearch is already showing (no chip yet), can type immediately.
- User selects Frá → `activeField` advances to `'to'` → Til PlaceSearch gets `autoFocus={true}` (deliberate continuation).
- After clear or chip tap → appropriate field re-focuses (user-initiated, expected).

No change to Til behavior: `autoFocus={activeField === 'to'}` remains correct.

---

## Finding 2 (Medium) — routeDraft=1 + expired draft still restored old trip

**File:** `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**Problem:** When `?routeDraft=1` was present but the draft had expired or gone missing, the code fell through with a comment `// fall through to session restore`. That meant the user explicitly tapped Ferðalagið on `/vedrid` but landed in yesterday's unrelated trip result.

**Fix:** When the draft marker is present but no valid draft exists, clean the marker and return immediately. An empty route step is the correct outcome — it matches user intent (they wanted to start a new trip, not restore an old one).

```ts
// Before:
if (hasDraftMarker) {
  const draft = readOverviewRouteDraft()
  if (draft) {
    // ... consume, return
  }
  // Draft marker present but draft expired or missing — fall through to session restore.
}
// 1. Try to restore ...

// After:
if (hasDraftMarker) {
  const draft = readOverviewRouteDraft()
  if (draft) {
    // ... consume, return
  }
  // Draft marker present but draft expired or missing.
  // The user explicitly came from /vedrid — do NOT restore an unrelated stale trip.
  // Clean the marker and show an empty route step.
  const url = new URL(window.location.href)
  url.searchParams.delete('routeDraft')
  window.history.replaceState(null, '', url.toString())
  return
}
// 1. Try to restore (only reached without routeDraft=1 marker)...
```

Full priority table after this fix:

| Situation | Outcome |
|-----------|---------|
| `?routeDraft=1` + valid draft | Draft wins, ROUTE_RESTORE_KEY cleared, URL cleaned |
| `?routeDraft=1` + expired/missing draft | Empty route step, URL cleaned. No old trip shown |
| No marker + valid session restore | Session restore wins (existing behavior) |
| No marker + no session restore + draft in storage | Draft used as fallback (same-tab nav) |
| No marker + nothing | Empty route step |

---

## Finding 3 (Medium/Scope) — RouteObservation missing Vegagerðin, segment, caution IDs

**File:** `lib/iceland-routes/routeObservation.ts`

**Problem:** v531's proposed type included `vegagerdinStationIds`, `routeSegmentIds`, `routeCautionIds`. v532 only implemented `vedurstofanStationIds`. This left the type incomplete for the `/vedrid` filter (which must filter both Veðurstofan and Vegagerðin markers).

**Fix:** Type extended, builder returns empty arrays for now:

```ts
// RouteObservation type — new fields:
/** Vegagerðin station IDs matched to this route. Empty until /ferdalagid exposes Vegagerðin matching. */
vegagerdinStationIds: string[]
/** IcelandRoadmap segment IDs detected for this route. Empty until segment matching is wired. */
routeSegmentIds: string[]
/** IcelandRoadmap caution IDs detected for this route. Empty until caution matching is wired. */
routeCautionIds: string[]
```

`buildRouteObservation` returns `vegagerdinStationIds: [], routeSegmentIds: [], routeCautionIds: []`.

`getStoredRouteObservations` backfills these arrays to `[]` when reading older stored entries that predate this change (backwards-compatible read).

`sql/85_route_observation_aggregate.sql` updated to include all four ID columns:
- `vedurstofan_station_ids text[] not null default '{}'`
- `vegagerdin_station_ids text[] not null default '{}'`
- `route_segment_ids text[] not null default '{}'`
- `route_caution_ids text[] not null default '{}'`

---

## Finding 4 (Medium/Test) — test asserted old ?from=...&to=... URL shape

**File:** `lib/__tests__/overview-route-draft.test.ts`

**Problem:** The `activeTripHref query-string shape` describe block still asserted `?from=Reykjav%C3%ADk&to=Akureyri` — the opposite of the new privacy contract.

**Fix:** Replaced with `routeDraft=1 marker and priority contract` block, three tests:

1. **CTA URL uses `?routeDraft=1`, no place names** — asserts `routeDraft=1` present, `from` and `to` params absent.
2. **marker + valid draft** — draft is readable and clearable once (documents the consumption pattern).
3. **marker + expired draft** — `readOverviewRouteDraft()` returns null, so FerdalagidClient must show empty route step, not old trip (documents why finding 2 fix is correct).

---

## Finding 5 (Low/SQL) — sql/85 not production-hardened

**File:** `sql/85_route_observation_aggregate.sql`

Rewritten with:
- Prominent `!! DRAFT — DO NOT RUN !!` header listing what is required before running
- `begin` / `commit` transaction wrapper
- `public.` schema qualification on all table and function references
- All four ID array columns aligned with final `RouteObservation` type
- Upsert function signature extended to accept all four ID array params

**The migration must not be run until Stebbi explicitly approves.**

---

## Finding 6 (Low) — route-family keys had non-ASCII character

**Files:** `lib/iceland-routes/routeObservation.ts`, `lib/__tests__/route-observation.test.ts`, SQL comment

`hofudborgarsvædi` → `hofudborgarsvaedi` (pure ASCII slug).

Labels (`Höfuðborgarsvæðið`) are unchanged — they remain human-readable Icelandic.

All other area keys were already ASCII: `akureyri`, `austurland`, `vestfirdir`, `sudurland`, `hofn`, `snaefellsnes`, `skagafjordur`, `nordurland`.

---

## Files changed

- `components/weather/OverviewRouteLensPanel.tsx` — initial `activeField` null, no autoFocus on load
- `app/auth-mvp/vedrid/FerdalagidClient.tsx` — routeDraft=1 + missing/expired draft returns early, no fall-through
- `lib/iceland-routes/routeObservation.ts` — type extended, builder returns all four ID arrays, reader backfills, ASCII key
- `lib/__tests__/overview-route-draft.test.ts` — CTA URL test replaced, 3 new priority tests
- `lib/__tests__/route-observation.test.ts` — ASCII key throughout, OBS constant includes all four ID arrays
- `sql/85_route_observation_aggregate.sql` — DRAFT header, transaction, public. schema, all four ID columns

---

## Commands and exit codes

```
npm run type-check    exit 0

npm run test:run -- lib/__tests__/overview-route-draft.test.ts lib/__tests__/route-observation.test.ts lib/__tests__/iceland-routes-lens.test.ts
  71 passed (3 test files)
```

---

## SQL status

No SQL run. `sql/85_route_observation_aggregate.sql` is a draft. Must not be run without Stebbi's explicit permission and a production-hardening review.

---

## Route intelligence check

- Route/domain area: `/vedrid` overview panel, `/ferdalagid` draft handoff, RouteObservation shape
- Roadmap impact: RouteObservation type is now aligned with v531's proposed full shape
- Provider neutrality: type includes Vegagerðin and IcelandRoadmap fields (empty for now, ready to populate)
- Cache/store key: `routeFamilyKey` is now a strict ASCII slug — safe for URLs, logs, Postgres primary key
- Privacy: `?routeDraft=1` + expired draft no longer surfaces unrelated stale trips
- Google storage: no change — raw Google content is still not stored
- IcelandRoadmap.md: no update needed; RouteObservation is within R4 scope already described

---

## Open after this pass

### v531 R3 — /vedrid observed-route dropdown

Still deferred. Needs:
1. Stebbi to confirm R2 intake is recording observations correctly on localhost (localStorage check).
2. UI decision: dropdown that replaces/augments PlaceSearch, or separate "recent routes" row above it?
3. For the dropdown to show anything, observations must exist (user must have calculated at least one trip in /ferdalagid on the same device).

### Vegagerðin station IDs in RouteObservation

`vegagerdinStationIds` is in the type and SQL schema but currently always `[]`. Populating it requires:
- `/api/teskeid/weather/travel` (or `/ferdalagid`) exposing matched Vegagerðin station IDs in the response.
- `buildRouteObservation` reading them.
- No new UI work needed — the `/vedrid` filter already has separate Vegagerðin station sets.

### IcelandRoadmap segment and caution matching

`routeSegmentIds` and `routeCautionIds` always `[]`. Populating requires running the Route Intelligence Intake described in `IcelandRoadmap.md` R2 against the Google polyline.

---

## Localhost checks for Stebbi

### No keyboard on /vedrid load (Finding 1)
1. Open `/vedrid` on a mobile-width viewport (or Chrome DevTools mobile emulation at 390px).
2. Scroll to Frá/Til section.
3. Expected: page renders without the keyboard appearing. Both Frá and Til inputs are visible but neither is focused.
4. Tap Frá manually.
5. Expected: Frá input focuses and keyboard opens (deliberate user action).
6. Select a place from Frá.
7. Expected: Til immediately focuses (autoFocus after deliberate selection is correct).

### Expired draft does not restore old trip (Finding 2)
8. Calculate a full route in `/ferdalagid` (e.g. Reykjavík → Akureyri). Result appears.
9. Go to `/vedrid`. Select a different Frá/Til (e.g. Reykjavík → Ísafjörður).
10. Wait 5+ minutes without clicking Ferðalagið (let draft expire).
11. Click Ferðalagið.
12. Expected: `/ferdalagid` opens on an empty route step. URL bar shows `/ferdalagid` (no `?routeDraft=1`). The old Akureyri result does NOT appear.

### Valid draft still wins (Finding 2 — happy path regression)
13. Go to `/vedrid`. Select Reykjavík → Ísafjörður.
14. Click Ferðalagið within 5 minutes.
15. Expected: `/ferdalagid` opens pre-filled with Reykjavík and Ísafjörður on the route step.
16. Expected: URL bar shows `/ferdalagid` (marker removed after use).
17. Refresh.
18. Expected: fresh empty form (ROUTE_RESTORE_KEY was cleared when draft was consumed).

### RouteObservation in localStorage (R2 intake)
19. Calculate a route in `/ferdalagid` (e.g. Reykjavík → Akureyri).
20. Open DevTools → Application → localStorage → key `vaktirnar:route-observations`.
21. Expected: one entry with:
    - `routeFamilyKey: "hofudborgarsvaedi--akureyri"` (ASCII slug)
    - `routeFamilyLabel: "Höfuðborgarsvæðið → Akureyri"`
    - `vedurstofanStationIds`: non-empty array of station ID strings
    - `vegagerdinStationIds: []` (empty for now)
    - `routeSegmentIds: []`
    - `routeCautionIds: []`
22. Confirm no raw street address, no Google route content, no user ID anywhere in the entry.

No SQL, Supabase, Vercel, commit, push, or deploy action is part of this pass.
