# TODO-090 v115 — Agent Collaboration canonical email prerelease and next phases

Created: 2026-07-28 10:11
Timezone: Atlantic/Reykjavik
Owner: Codex
Status: Local prerelease; not committed, pushed, deployed or applied to a database

## Findings first

1. The Gmail entitlement mismatch in the unexecuted SQL95 is fixed locally.
   `teskeid_agent_has_beta_access()` now calls the existing
   `public.normalize_email_canonical()` helper from migration 56 on both
   `feature_access.email` and `auth.users.email`. Dotted Gmail aliases and
   `googlemail.com` therefore follow the same canonical rule in TypeScript and
   SQL, while dots remain significant for non-Gmail domains.
2. The focused regression gate is green: 10 files and 483 tests passed. The
   SQL migration test was rerun after the final comment-only edit: 292 tests
   passed. Type-check, lint and the clean-room production build are green.
3. SQL95 remains unexecuted and has never been validated against a real
   PostgreSQL/Supabase instance. Static tests cannot prove SQL syntax, RLS,
   grants, RPC return shapes, pairing races, lease fencing or tenant isolation.
   This remains the release blocker for positive Samvinna traffic.
4. Samvinna v1 opens a dedicated Codex CLI thread through the reference
   runner. It does not attach to the current Codex IDE/API conversation. It is
   deliberately `read_only_reply`; ordinary chat text is not execution
   authority for file writes, commits, deploys, SQL or production actions.
5. The live-location follow work must be a separate code/release scope from
   the Samvinna schema and activation rollout. The blast radius and rollback
   paths are unrelated.

## Approval understood for this phase

Stebbi authorized Codex to:

- fix Gmail canonicalization in the unexecuted SQL95;
- add a regression test;
- run targeted tests, type-check, lint and a clean-room build;
- create this prerelease handoff with the large next steps and an execution
  prompt.

Stebbi did not authorize and Codex did not perform:

- SQL or migration execution;
- Supabase reads or writes;
- `.env.local`, secret or real environment-value access;
- persistent environment-variable changes;
- commit, push, deploy or Vercel changes;
- live-location implementation.

## What changed

### SQL95

The private-beta entitlement join changed from the incomplete comparison:

```sql
access.email = lower(trim(account.email))
```

to the shared, two-sided canonical comparison:

```sql
public.normalize_email_canonical(access.email)
  = public.normalize_email_canonical(account.email)
```

Both sides are normalized deliberately. The admin API already writes
canonical values, but the database constraint does not guarantee that a
service-role or legacy write used the application helper. Normalizing both
sides keeps the authoritative SQL gate tolerant of such rows without
weakening entitlement scope.

No new normalizer was added. SQL95 depends on
`public.normalize_email_canonical(text)` created in
`sql/56_normalize_email_canonical.sql`.

### Regression test

The SQL95 static-security suite now isolates the
`teskeid_agent_has_beta_access()` definition and asserts:

- the shared canonicalizer is applied to both email columns;
- the old `access.email = lower(trim(account.email))` pattern is absent.

Migration 56 already tests Gmail dot removal, `googlemail.com` to `gmail.com`,
and preservation of dots for other domains, so duplicating that function-level
test matrix in SQL95 would add noise rather than protection.

## Files inspected

- `WORKFLOW.md`
- `AGENTS.md`
- `Design.md`
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-28-0007-todo-090-v114-v015-codex-agent-collaboration-private-beta-gate.md`
- `ai-handoff/2026-07-27-2330-todo-090-claude-prerelease-agent-collaboration-v113-v014.md`
- `lib/auth/email-normalization.ts`
- `sql/56_normalize_email_canonical.sql`
- `sql/95_teskeid_agent_collaboration.sql`
- `lib/__tests__/sql-migration.test.ts`
- current Samvinna access, API, UI and runner test inventory
- current browser-local live-location helper and Vegagerðin route-map UI

## Files changed in this phase

- `sql/95_teskeid_agent_collaboration.sql`
  - canonicalized both sides of the beta entitlement email join;
  - added a short dependency comment for migration 56.
- `lib/__tests__/sql-migration.test.ts`
  - added the scoped SQL95 regression assertion.
- `ai-handoff/2026-07-28-1011-todo-090-v115-codex-agent-collaboration-prerelease-and-next-phases.md`
  - this handoff.

The working tree already contained the larger uncommitted Samvinna package and
unrelated user-owned `.obsidian/workspace.json` state. Codex did not alter or
revert those unrelated changes.

## Commands and results

1. Focused Samvinna/access suite:

   ```text
   npm.cmd run test:run --
     lib/__tests__/sql-migration.test.ts
     lib/__tests__/agent-collaboration-access.test.ts
     lib/__tests__/agent-collaboration-api.test.ts
     lib/__tests__/feature-access-api.test.ts
     lib/__tests__/middleware.test.ts
     lib/__tests__/teskeid-menu.test.tsx
     components/chat/__tests__/ScopedChatPanel.test.tsx
     components/chat/__tests__/ScopedChatComposer.test.tsx
     app/auth-mvp/samvinna/__tests__/page.test.tsx
     app/auth-mvp/samvinna/__tests__/AgentCollaborationClient.test.tsx
   ```

   Exit 0 — 10 files and 483 tests passed.

2. TypeScript:

   `npm.cmd run type-check`

   Exit 0.

3. Lint:

   `npm.cmd run lint`

   Exit 0. Only existing unrelated React-hook and image warnings were emitted.

4. Clean-room production build:

   - Created a unique Windows-temp copy excluding `.git`, `.env*`, `.obsidian`,
     `.next` and `node_modules`.
   - Linked the existing dependency directory and ran the build in a sanitized
     child process with only obvious process-local Supabase placeholders.
   - No actual environment value or secret was read or persisted.
   - First offline attempt: exit 1 solely because `next/font` could not fetch
     the public Inter font through the network sandbox.
   - One-time network retry: exit 0. Compilation, lint/type validation, page
     data, all 118 static pages and build traces completed.
   - The verified temp directory was removed. PowerShell emitted its known
     junction-removal `NullReferenceException`, but the guarded parent cleanup
     completed and a follow-up check returned `cleanRoomExists=False`.

5. Final SQL migration regression rerun:

   `npm.cmd run test:run -- lib/__tests__/sql-migration.test.ts`

   Exit 0 — 1 file and 292 tests passed.

6. `git diff --check`

   Exit 0; line-ending notices only.

## SQL, auth, RLS and data impact

- The SQL95 file is a schema-changing migration when eventually run. It creates
  provider-neutral Agent Collaboration tables, functions, constraints, RLS,
  grants and the private-beta feature key. None of that was applied here.
- This phase changes only the entitlement comparison inside an already planned
  `SECURITY DEFINER` helper. It does not add grants, broaden RLS, change auth
  identity derivation or write data.
- Canonicalization does not merge non-Gmail dotted addresses. Only Gmail and
  Googlemail aliases receive Gmail semantics, matching the existing app and
  migration 56 contract.
- Before SQL95 is applied anywhere, preflight must confirm that
  `public.normalize_email_canonical(text)` exists. A missing migration-56
  dependency is a hard stop, not a reason to recreate the helper ad hoc.
- Performance risk is negligible for private beta: `auth.users.id` selects one
  account and the feature key narrows the entitlement lookup. Real Postgres
  validation is still required.

## Next large steps — A: controlled Teskeið Samvinna rollout

Keep every stop gate explicit.

1. Perform a final scoped diff audit. Include only the approved Samvinna
   package and this prerelease delta. Exclude `.obsidian/workspace.json`, older
   unrelated untracked handoffs and unrelated changes.
2. Commit, push and deploy the source while
   `AGENT_COLLABORATION_ENABLED` remains absent or `false`. Monitor Vercel to
   `Ready`. Smoke-test that the menu, direct page, browser APIs and agent bridge
   fail closed/404, while existing auth, Veðurpúls chat and Veðrið remain
   unchanged.
3. Apply and test SQL95 in a disposable/staging Supabase-like database, never
   first on production. Test migration apply/idempotency, the migration-56
   dependency, grants/RLS, anon/auth direct-table denial, browser-RPC tenant
   scope, cross-tenant denial, service bridge access, pairing single-use and
   expiry, claim fencing/concurrency, lease expiry, retries, revoke/re-grant
   credential invalidation and rollback on an empty test schema.
4. If no genuine disposable/staging PostgreSQL environment is available, stop
   and ask Stebbi to choose one. Do not silently substitute production.
5. After all database tests are green, obtain separate explicit production SQL
   authority. Keep the global feature flag off, run a read-only preflight, apply
   SQL95 once, then verify objects, constraints, RLS, grants and function
   privileges.
6. Through the approved admin feature-access path, grant only canonical
   `stefanhalldor@gmail.com` the exact key
   `agent-collaboration-private-beta`. This is a production data write and needs
   explicit authority.
7. Set only `AGENT_COLLABORATION_ENABLED=true`, redeploy and smoke-test both
   sides of the gate: Stebbi can see Samvinna; an authenticated non-entitled
   account and public traffic remain denied.
8. Create a one-time pairing code without logging it. Stebbi starts the
   reference runner under an isolated OS user or container against a
   secret-free/sanitized checkout. Read-only mode is not a filesystem read
   allowlist.
9. Complete one harmless read-only message roundtrip, then verify connector
   revoke and the global kill switch. Stop before expanding access or adding
   write-capable actions.

### Samvinna v1 boundary

- The runner creates a new dedicated Codex CLI thread; it cannot inject into
  this current Codex conversation.
- The terminal runner must remain active. A restart requires a fresh pairing.
- The current flow is reactive: a Teskeið message queues a run and the runner
  replies. Proactive agent-originated messages and native push notifications
  are not part of this release.
- Text in Teskeið is conversation input, never implicit authority to mutate a
  repository or external system. A future write-capable product requires a
  separate typed action/approval protocol.

## Next large steps — B: live-location map following

Implement and release this separately from Track A.

1. Preserve the existing boundary: authenticated user, active route,
   `Vegagerðin` plus `Núna`, explicit opt-in, browser-local coordinates.
2. Extend `LiveLocationPoint` with nullable heading and speed. Use the browser's
   course-over-ground only when finite and credible; otherwise derive bearing
   from consecutive valid GPS points over a minimum movement threshold. Hold
   the last trusted direction while stationary instead of showing noise.
3. Do not request DeviceOrientation/compass permission in the first phase.
   Mobile browsers, especially iOS, add a separate permission and produce noisy
   stationary headings. This phase tracks travel direction, not a guaranteed
   compass direction while standing still.
4. Extract provider-neutral pure helpers and a small state machine rather than
   adding more intertwined state to the large map component:
   `idle -> waiting -> following -> free`, with bounded error/stop paths.
5. In `following`, continuously center on the latest valid point and rotate to
   a trusted travel heading. A user drag, zoom, rotate or pitch moves to `free`;
   the GPS watch and marker keep updating. Programmatic camera moves must not
   be mistaken for user gestures.
6. In `free`, show a compact `Elta mig aftur` map overlay. It resumes following
   at the latest point, trusted heading and configured follow zoom.
7. Add accessible `+/-` follow-zoom controls, proposed bounds 10–18, step 1 and
   default 14. While following they update immediately; while free they update
   only the next recenter behavior. Persist only the bounded zoom preference in
   localStorage, never coordinates, heading, speed, route or history.
8. Replace the plain dot with a directional puck only when heading is trusted.
   Its orientation must remain geographically correct as the MapLibre bearing
   changes. Continue to show honest accuracy and respect reduced motion.
9. Preserve cleanup when the control is hidden, route/mode is left, document is
   hidden or the component unmounts. No fetch, reverse-geocoding, analytics,
   logging, Supabase or other coordinate transmission.
10. Add unit/state/map-mock regression tests, then run targeted tests,
    type-check, lint and a clean-room build. Manually verify mobile HTTPS on
    Safari/iOS and Chrome/Android before release.

## Design check

- Controls must be mobile-first, stable and at least 40–44 px touch targets.
- `Elta mig aftur` and zoom controls must respect safe areas and mobile browser
  chrome, retain focus-visible feedback, avoid horizontal overflow and not
  cover attribution, station labels or the sticky route CTA.
- All visible text belongs in `messages/is.json` and `messages/en.json`.
- Waiting, following, free, unavailable and denied states must have explicit
  feedback; controls must never appear dead.

## Route intelligence check

- The proposed live-location phase is browser-local map presentation for the
  currently selected route. It does not add knowledge about a route family,
  canonical road segment, caution, station match or provider route.
- No change is needed in `lib/iceland-routes/` or canonical route fixtures.
- No exact trip, address or GPS history is stored or aggregated.
- `IcelandRoadmap.md` was not changed because this phase explicitly excludes
  GPS-to-road snapping, off-route detection, ETA/navigation and route-history
  storage. Any of those additions would enter Live Road OS R8 and require a
  separate privacy, safety and route-domain plan.

## Localhost checks for Stebbi

### Current Gmail canonicalization phase

There is no visible localhost behavior to test yet because SQL95 was not run
and Samvinna remains gated. Do not casually run SQL95, add feature-access rows
or set production flags just to observe this patch. Those steps require the
database and rollout gates above.

### After a future local/disposable Samvinna setup

1. Sign in as the one entitled test account and open `/auth-mvp/samvinna`.
2. Confirm the same Gmail account is accepted whether the test entitlement was
   created from its canonical Gmail spelling or a dotted/Googlemail alias.
3. Confirm a non-entitled account sees neither the menu entry nor the page/API.
4. Pair an isolated test runner without placing the pairing code or token in
   shell history, logs, screenshots or the handoff.
5. Send one harmless read-only question. Expect queued/working/completed state
   and exactly one agent reply. Confirm existing Teskeið chat is unaffected.

### After the future live-location implementation

Setup: use HTTPS or localhost with location permission, an authenticated test
account, an active route, `Vegagerðin` and `Núna`. Test 360, 390 and 460 px
widths plus desktop.

1. Tap `Sýna núverandi staðsetningu`. Expect waiting feedback followed by the
   current marker, accuracy and automatic follow.
2. Move with the device. Expect smooth centering and direction tracking without
   rapid rotation while stationary or with poor GPS.
3. Drag, zoom or rotate the map. Expect following to pause, the marker to keep
   updating and `Elta mig aftur` to remain visible on screen.
4. Use `+/-` while free. Expect no camera hijack. Tap `Elta mig aftur`; expect
   latest location, trusted heading and the selected zoom.
5. Use `+/-` while following. Expect immediate bounded zoom and no layout jump.
   Reload and confirm only that zoom preference persists.
6. Hide location, leave `Núna`, change route, background the page and return.
   Expect the watch to stop/restart only through the documented explicit flow;
   no stale marker or repeated permission prompt should remain.
7. Deny permission and test unavailable/timeout. Expect short, actionable text
   and no broken map. Verify wind arrows, station filters, attribution, sticky
   CTA, map rotation and route cards still behave normally.

Do not use real driving to interact with controls. A passenger should perform
moving-device tests. Do not inspect network payloads by posting coordinates or
screenshots containing precise private locations.

## Recommended execution prompt

The following prompt intentionally grants substantial future authority,
including commit, push, deployment, production SQL, a single feature-access
write and one Vercel flag change. Stebbi should paste it only when ready to
grant every explicitly named action. It still keeps the live-location change
local for separate approval.

```text
Codex, framkvæmdu næstu tvo afmörkuðu áfanga í þessari röð samkvæmt 2026-07-28-1011-todo-090-v115-codex-agent-collaboration-prerelease-and-next-phases.md. Lestu WORKFLOW.md, Design.md, IcelandRoadmap.md og handoffið fyrst. Ekki lesa eða breyta .env.local eða secrets og ekki snerta .obsidian/workspace.json, eldri ótrackuð handoff eða ótengdar breytingar.

Áfangi A — controlled private-beta Teskeið Samvinna rollout fyrir Stebba:

1. Staðfestu Gmail-normaliseringarlagfæringuna og græn prerelease-gates. Gerðu scoped diff-audit og stoppaðu við óvænta breytingu eða rauða niðurstöðu.
2. Stofnaðu afmarkað commit fyrir samþykkta Samvinna-pakkann, push-aðu á main og fylgstu með Vercel þar til deployment er Ready, en haltu AGENT_COLLABORATION_ENABLED áfram absent eða false og breyttu engri environment variable. Smoke-prófaðu að Samvinna-menu, bein síða, browser API og agent bridge séu fail-closed/404 og að núverandi auth, Veðurpúls-spjall og Veðrið séu óbreytt. Stoppaðu við fyrstu test-, build-, deploy- eða smoke-villu.
3. Validate-a sql/95_teskeid_agent_collaboration.sql í disposable/staging Supabase-like gagnagrunni, aldrei fyrst á production. Prófaðu migration-56 dependency, apply/idempotency, RLS og grants, anon/auth direct-table denial, browser-RPC tenant scope, cross-tenant denial, service-role bridge, single-use/expired pairing, claim fencing/concurrency, lease expiry/retries, revoke/regrant generation og stale token/pairing. Prófaðu destructive rollback aðeins á tómu test-schema. Ef raunverulegt disposable/staging umhverfi er ekki tiltækt skaltu stoppa og skila blocker; ekki nota production sem staðgengil.
4. Ef og aðeins ef öll fyrri gates eru græn hefurðu afmarkað leyfi til að gera read-only production preflight og keyra nákvæmlega SQL95 einu sinni á production með AGENT_COLLABORATION_ENABLED enn absent/false. Ekki keyra annað SQL og ekki breyta öðrum Supabase-gögnum. Staðfestu objects, constraint, RLS, grants og function privileges eftir keyrslu. Stoppaðu við fyrstu SQL- eða verification-villu.
5. Ef production SQL-verification er græn hefurðu leyfi til að veita aðeins canonical Stebba-reikningnum stefanhalldor@gmail.com feature_access fyrir agent-collaboration-private-beta gegnum samþykktu admin-leiðina. Ekki veita öðrum aðgang. Settu síðan aðeins AGENT_COLLABORATION_ENABLED=true í Vercel Production, breyttu engum öðrum environment variables, redeployaðu main og fylgstu með til Ready.
6. Smoke-prófaðu fail-closed aðgang fyrir notanda án entitlement og græna Samvinna-síðuna fyrir Stebba, án secrets eða raunverulegs framkvæmdarverks. Búðu til einn stuttan einnota pairing-kóða í UI en birtu hann ekki í logs eða handoffi. Stoppaðu við pairing-hliðið og sendu Stebba nákvæma skipun til að ræsa reference-runner sjálfur undir einangruðum OS-notanda eða container með secret-free checkout. Taktu skýrt fram að þetta stofnar nýjan dedicated Codex CLI thread, styður aðeins read_only_reply og tengist ekki þessu opna Codex-samtali. Sendu Stebba tölvupóst með nákvæmum prófunarskrefum þegar pairing-skrefið er tilbúið.

Áfangi B — live-location follow/free/recenter/heading/follow-zoom, aðeins local og í sér scope:

7. Eftir að production er örugglega komið að pairing-hliðinu máttu útfæra live-location breytinguna local. Ekki commit-a, push-a eða deploya hana í þessari keyrslu. Haltu featureinu eingöngu fyrir innskráðan notanda með virka leið í Vegagerðin/Núna og explicit opt-in.
8. Extend-a browser-local staðsetningarpunkt með nullable ferðastefnu og hraða. Notaðu trausta native GPS-heading þegar hún er tiltæk, annars pure fallback bearing úr gildum samfelldum punktum með lágmarkshreyfingu og noise-vörn. Ekki biðja um DeviceOrientation/compass-leyfi í þessum áfanga og ekki láta UI lofa nákvæmri stefnu í kyrrstöðu.
9. Settu upp following/free state þannig að following fylgi nýjustu staðsetningu og traustri ferðastefnu; handvirkt drag, zoom, rotate eða pitch setji kortið í free en GPS-watch og marker haldi áfram; Elta mig aftur miðji á nýjasta punkt, noti trausta stefnu og valda fylgiþysjun. Aðgreindu programmatic map moves frá user gestures.
10. Bættu við mobile-first Elta mig aftur og +/- controls með a.m.k. 40–44 px touch targets, focus-visible, safe-area og íslenskum/enskum textum. Notaðu bounded fylgiþysjun 10–18, step 1 og default 14. Vistaðu aðeins bounded zoom preference í localStorage; aldrei hnit, heading, hraða, leið eða staðsetningarsögu. Meðan following uppfæra +/- zoom strax; meðan free breyta þau aðeins næstu recenter-stillingu og mega ekki ræna kortinu af notandanum.
11. Láttu directional puck halda réttri landfræðilegri stefnu þegar kortið snýst og virða prefers-reduced-motion. Stöðvaðu watch við hide, mode/route exit, document hidden og unmount. Engin fetch, reverse-geocoding, analytics, logging, Supabase eða önnur sending staðsetningar er leyfð.
12. Bættu við targeted regression-prófum fyrir heading/speed normaliseringu, fallback bearing/noise/wrap, follow/free state, user-vs-programmatic events, recenter, zoom bounds/persistence, cleanup og auth/mode scope. Staðfestu að Vegagerðin vindörvar, filterar, route UI, attribution og sticky CTA regressi ekki. Keyrðu targeted próf, type-check, lint og clean-room build. Stoppaðu við fyrstu raunverulegu villu.
13. Skilaðu nýju prerelease-handoffi með findings fyrst, öllum breyttum skrám, skipunum og exit codes, Route intelligence check, privacy/safety mati og nákvæmum Localhost checks for Stebbi fyrir 360/390/460 px, iOS/Safari og Android/Chrome. Ekki commit-a, push-a eða deploya live-location breytinguna fyrr en Stebbi samþykkir hana sérstaklega.
```

## Remaining risk and stop gates

- SQL95 has not run against PostgreSQL. This is the only current blocker to a
  positive Samvinna private-beta flow.
- The clean-room build proves bundling, not database correctness.
- No staging/disposable database availability was assumed. Production must not
  become the first SQL test environment.
- Mobile heading availability differs by browser, device, motion and accuracy.
  Confidence is high for the proposed state/privacy design and medium for the
  exact motion thresholds until device testing.
- Do not combine the two scopes in one commit or production release.

## Suggested next decision

Stebbi should first decide where SQL95 can be validated as real PostgreSQL
without touching production. Once that disposable gate exists, the execution
prompt above can move Samvinna to a controlled Stebbi-only pairing point and
then use the remaining local work window for the separate live-location phase.
