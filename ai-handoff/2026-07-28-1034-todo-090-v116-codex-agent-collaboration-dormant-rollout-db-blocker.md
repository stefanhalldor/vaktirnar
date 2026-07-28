# TODO-090 — Samvinna dormant rollout og SQL95 blocker

**Created:** 2026-07-28 10:34

**Timezone:** Atlantic/Reykjavik

**Agent:** Codex

**Status:** Samþykkti kóðapakkinn er kominn á production en er áfram fail-closed. Áfanginn stoppar fyrir SQL95 vegna þess að ekkert öruggt disposable PostgreSQL/Supabase-umhverfi er þegar tiltækt.

## Findings first

1. **High — SQL95 má ekki virkja enn.** Vélin hefur hvorki Docker,
   PostgreSQL/`psql`, Supabase CLI, Podman né uppsettan WSL-dreifingaraðila.
   Repo-ið hefur heldur ekki Supabase local config, Compose-stack eða
   integration-harness sem getur hermt eftir Supabase auth/RLS. Samkvæmt
   stop-reglu Stebba var ekkert sett upp og production var ekki notað sem
   fyrsta SQL-prófunarumhverfi.
2. **Dormant production rollout er grænt.** Commit `fb762d1` er á `main` og
   `origin/main`. Vercel production deployment
   `dpl_Ek6f5ku28fRMCF8EN5d9cLq2tMjN` varð `Ready` eftir 44 sekúndur.
   `AGENT_COLLABORATION_ENABLED` var hvorki lesið né breytt; production
   hegðunin sannar að Samvinna er áfram óvirk.
3. **Fail-closed contractið stenst.** Browser- og bridge-API skila 404
   `not_found` með `private, no-store`. Bein óinnskráð Samvinna-síða skilar
   viljandi 307 á `/`, ekki literal 404, vegna middleware-contractsins. Þetta
   er lokað yfirborð en mikilvægt frávik í orðalagi frá „síða 404“.
4. **Gmail-lagfæringin er með í dormant kóðanum en engin migration var keyrð.**
   SQL95 notar nú `public.normalize_email_canonical()` frá migration 56 á
   báðar hliðar entitlement-samanburðarins. Raunveruleg migration-56
   dependency, SQL syntax, RLS, grants og concurrency eru enn óstaðfest í
   PostgreSQL.

## Samþykkt umfang

Stebbi gaf Codex skýrt leyfi til að:

1. lesa `WORKFLOW.md` og v115-handoffið;
2. gera loka scoped diff-audit;
3. keyra prerelease-gates;
4. commit-a samþykkta Samvinna-pakkann, Gmail-lagfæringuna og v115-handoffið;
5. push-a á `main`, fylgjast með Vercel til `Ready` og smoke-prófa dormant
   production;
6. leita read-only að fyrirliggjandi local disposable PostgreSQL/Supabase
   búnaði og nota hann aðeins ef hann væri þegar tiltækur;
7. skila handoffi og senda Stebba tölvupóst við næsta activation-gate.

Leyfið náði ekki til nýrrar hugbúnaðaruppsetningar, `.env.local`, secrets,
environment-breytinga, SQL-keyrslu, Supabase-skrifa, `feature_access`,
Samvinna-virkjunar eða live-location breytingarinnar. Ekkert af þessu var gert.

## Plan áfangans

1. Staðfesta scope og exclusions.
2. Endurkeyra targeted tests, runner tests, type-check, lint og clean-room
   production build.
3. Commit-a og push-a nákvæmlega samþykktu 59 skrárnar.
4. Fylgjast með sjálfvirku Vercel production deploymenti og smoke-prófa
   fail-closed mörk og núverandi grunnflæði.
5. Meta local disposable database tooling read-only.
6. Keyra SQL95 integration-matrix aðeins ef raunverulegt, einangrað
   test-umhverfi væri þegar til; annars stoppa og skila blocker.

## Hvað var raunverulega gert

- Final scope audit fann 13 samþykktar tracked breytingar og 46 samþykktar
  nýjar skrár, samtals 59.
- `.obsidian/workspace.json`, 14 eldri ótrackuð handoff og allar ótengdar
  breytingar voru útilokuð.
- Staged whitespace-check fann fyrst tvö Markdown/EOF atriði í samþykktu
  scope-i. Þau voru hreinsuð áður en commit var stofnað; loka
  `git diff --cached --check` var hreint.
- Secret-pattern scan á staged Samvinna-scope fann engin PEM-gögn, `sk-`
  lykla eða explicit service-role/auth-code assignments.
- Commit var stofnað og push-að:
  - `fb762d1 feat(agent-collaboration): add private beta bridge (#90)`
- Nýjasta Vercel production deployment varð `Ready`:
  - ID: `dpl_Ek6f5ku28fRMCF8EN5d9cLq2tMjN`
  - URL:
    `https://vaktirnar-13gd5iv4w-stefan-halldor-jonssons-projects.vercel.app`
  - canonical alias: `https://www.teskeid.is`
- Dormant production smoke var keyrt án cookie, tokena, notendagagna eða
  raunpayloads.
- Local database tooling var kannað read-only. Ekkert nothæft disposable
  umhverfi fannst, svo enginn gagnagrunnur var stofnaður og ekkert SQL keyrt.

## Prerelease-gates

### Targeted Vitest

```text
npm.cmd run test:run -- lib/__tests__/sql-migration.test.ts lib/__tests__/agent-collaboration-access.test.ts lib/__tests__/agent-collaboration-api.test.ts lib/__tests__/feature-access-api.test.ts lib/__tests__/middleware.test.ts lib/__tests__/teskeid-menu.test.tsx components/chat/__tests__/ScopedChatPanel.test.tsx components/chat/__tests__/ScopedChatComposer.test.tsx app/auth-mvp/samvinna/__tests__/page.test.tsx app/auth-mvp/samvinna/__tests__/AgentCollaborationClient.test.tsx
```

- Exit code: `0`
- 10 test files passed.
- 483 tests passed.

### Reference runner

```text
node --test tools/teskeid-agent-runner/test/bridge-client.test.mjs tools/teskeid-agent-runner/test/codex-adapter.test.mjs tools/teskeid-agent-runner/test/runner.test.mjs
```

- Exit code: `0`
- 35 tests passed.

### Type-check og lint

- `npm.cmd run type-check`: exit `0`.
- `npm.cmd run lint`: exit `0`; aðeins fyrirliggjandi ótengdar warnings.

### Clean-room production build

- Unique temp copy:
  `C:\Users\Lenovo\AppData\Local\Temp\teskeid-samvinna-rollout-20260728102034802`
- `.git`, `.env*`, `.obsidian`, `.next` og `node_modules` voru útilokuð.
- Existing dependencies voru tengdar inn og child environment var sanitizað
  með augljósum placeholder-gildum; `.env.local` og secrets voru ekki lesin.
- `npm run build`: exit `0`.
- Compilation, lint/type validation, 118 static pages og build traces kláruðust.
- Temp directory var fjarlægð og staðfest `cleanRoomExists=False`.

### Scope checks

- `git diff --cached --check`: exit `0` eftir afmarkaða whitespace-lagfæringu.
- Staged file count: `59`.
- Forbidden staged file count: `0`.
- Secret-pattern scan: `0` findings.

## Commit, push og deployment

- Commit command: afmarkað `git commit` á staged 59-skrá scope.
- Commit result: exit `0`, `fb762d1`.
- `git push origin main`: exit `0`.
- Eftir push:
  - `git rev-parse HEAD` = `fb762d19d7aff8e4e746b3fce41d0e06eea62e2e`
  - `git rev-parse origin/main` = sama hash.
- Fyrsta `vercel ls` tilraun: exit `1` vegna Windows PowerShell
  execution-policy á `vercel.ps1`; engin remote-aðgerð fór fram.
- `vercel.cmd ls` inni í net-sandboxi: exit `1` vegna lokaðs OIDC network fetch;
  engin production-villa.
- Samþykkt read-only `vercel.cmd ls` utan net-sandkassans: exit `0`.
- `vercel.cmd inspect ...`: exit `0`; target `production`, status `Ready`,
  deploymentið stofnað strax eftir push og nýju route-in eru í build-outputi.

## Production smoke

Öll köll voru án cookie, bearer tokena, secrets, persónugagna, heimilisfanga
eða hnita. Tóm `{}` POST-payload voru stöðvuð af global gate áður en auth,
body parsing eða gagnagrunnur var snertur.

| Check | Niðurstaða |
| --- | --- |
| `GET /vedrid` | HTTP 200, Teskeið shell til staðar |
| Óinnskráð `GET /auth-mvp/heim` | HTTP 307 á `/innskraning?next=...` |
| Óinnskráð `GET /api/auth-mvp/vedurpuls/access` | HTTP 401, fyrra auth-contract |
| `GET /api/teskeid/weather/vedurpuls/feed-preview?limitItems=1` | HTTP 200, `items` shape til staðar |
| `GET /auth-mvp/samvinna` | HTTP 307, `Location: /` |
| Browser API: bootstrap, summary, messages GET/POST, read, pairings | Öll HTTP 404 `not_found`, `private, no-store` |
| Bridge API: pair, claim, heartbeat, complete, fail | Öll HTTP 404 `not_found`, `private, no-store` |

Fyrra smoke-script stoppaði eftir rétta HTTP 307 vegna þess að assertionið
túlkaði relative `Location: /` sem absolute URI. Afmarkað header-recheck
staðfesti nákvæmlega `307` og `Location: /`; leiðrétta assertionið og öll
eftirstandandi checks fóru síðan græn. Þetta var test-harness villa, ekki
production-villa.

Authenticated Samvinna-menu var ekki opnað með session Stebba, því það hefði
krafist cookie/credential aðgangs sem var ekki heimilaður. Targeted menu-prófið
er grænt og production 404-gate staðfestir að exact global flaggið er ekki
virkt. Þetta er eina sjónræna smoke-gatið í dormant áfanganum.

## Disposable database audit og blocker

Read-only staðfesting skilaði:

```text
dbCliToolsFound=0
repoSupabaseCli=False
supabaseConfig=False
dockerCompose=False
dbServicesFound=0
wslExecutable=True
wsl.exe -l -v: exit 1, Windows Subsystem for Linux is not installed
```

Leitað var að:

- Docker / Docker Desktop / Compose;
- PostgreSQL, `psql`, `pg_ctl`, `initdb`, `createdb`, `dropdb`;
- Supabase CLI, þar á meðal repo-local `node_modules/.bin/supabase`;
- Podman;
- uppsettum Windows Docker/PostgreSQL services;
- WSL distro;
- `supabase/config.toml`, Compose config og fyrirliggjandi integration-harness.

Ekkert fannst sem getur keyrt SQL95 production-trútt. Static Vitest getur ekki
komið í stað PostgreSQL fyrir:

- migration apply og idempotency;
- migration-56 dependency;
- `auth.users`, `auth.uid()`, anon/authenticated/service-role roles;
- RLS, grants og direct-table denial;
- tenant- og cross-tenant mörk;
- pairing single-use/expiry;
- claim fencing/concurrency;
- lease expiry/retries;
- revoke/regrant generation og credential invalidation.

Þess vegna var enginn test-gagnagrunnur stofnaður, engin prerequisite migration
keyrð, ekkert rollback framkvæmt og ekkert SQL95 integration-próf keyrt.

## Exact committed file manifest

```text
ai-handoff/2026-07-28-1011-todo-090-v115-codex-agent-collaboration-prerelease-and-next-phases.md
app/api/admin/feature-access/route.ts
app/api/agent-bridge/v1/claim/route.ts
app/api/agent-bridge/v1/complete/route.ts
app/api/agent-bridge/v1/fail/route.ts
app/api/agent-bridge/v1/heartbeat/route.ts
app/api/agent-bridge/v1/pair/route.ts
app/api/auth-mvp/agent-collaboration/bootstrap/route.ts
app/api/auth-mvp/agent-collaboration/connectors/[id]/route.ts
app/api/auth-mvp/agent-collaboration/messages/route.ts
app/api/auth-mvp/agent-collaboration/pairings/route.ts
app/api/auth-mvp/agent-collaboration/read/route.ts
app/api/auth-mvp/agent-collaboration/summary/route.ts
app/auth-mvp/samvinna/AgentCollaborationClient.tsx
app/auth-mvp/samvinna/__tests__/AgentCollaborationClient.test.tsx
app/auth-mvp/samvinna/__tests__/page.test.tsx
app/auth-mvp/samvinna/agentCollaborationTransport.ts
app/auth-mvp/samvinna/loading.tsx
app/auth-mvp/samvinna/page.tsx
app/auth-mvp/vedrid/vedurpulsTransport.ts
components/chat/ChatMessageRow.tsx
components/chat/ScopedChatComposer.tsx
components/chat/ScopedChatPanel.tsx
components/chat/__tests__/ScopedChatComposer.test.tsx
components/chat/__tests__/ScopedChatPanel.test.tsx
components/teskeid/TeskeidMenu.tsx
lib/__tests__/agent-collaboration-access.test.ts
lib/__tests__/agent-collaboration-api.test.ts
lib/__tests__/feature-access-api.test.ts
lib/__tests__/middleware.test.ts
lib/__tests__/sql-migration.test.ts
lib/__tests__/teskeid-menu.test.tsx
lib/agent-collaboration/access.server.ts
lib/agent-collaboration/crypto.server.ts
lib/agent-collaboration/http.server.ts
lib/agent-collaboration/pair-rate-limit.server.ts
lib/agent-collaboration/repository.server.ts
lib/agent-collaboration/types.ts
lib/agent-collaboration/validation.ts
messages/en.json
messages/is.json
middleware.ts
sql/95_teskeid_agent_collaboration.sql
tools/teskeid-agent-runner/PROTOCOL.md
tools/teskeid-agent-runner/README.md
tools/teskeid-agent-runner/bin/teskeid-agent-runner.mjs
tools/teskeid-agent-runner/package.json
tools/teskeid-agent-runner/src/adapters/codex.mjs
tools/teskeid-agent-runner/src/adapters/registry.mjs
tools/teskeid-agent-runner/src/bridge-client.mjs
tools/teskeid-agent-runner/src/cli-options.mjs
tools/teskeid-agent-runner/src/cli.mjs
tools/teskeid-agent-runner/src/constants.mjs
tools/teskeid-agent-runner/src/protocol.mjs
tools/teskeid-agent-runner/src/runner.mjs
tools/teskeid-agent-runner/src/safe-log.mjs
tools/teskeid-agent-runner/test/bridge-client.test.mjs
tools/teskeid-agent-runner/test/codex-adapter.test.mjs
tools/teskeid-agent-runner/test/runner.test.mjs
```

Þetta v116-handoff er eina nýja skráin eftir commit og er ócommittuð.
`.obsidian/workspace.json` og 14 eldri ótrackuð handoff eru áfram ósnert og
útilokuð.

## Skrár og gögn sem voru ekki snert

- `.env.local` var hvorki lesin né breytt.
- Engin secrets eða environment variables voru lesin eða breytt.
- Ekkert SQL var keyrt, hvorki local né production.
- Engin Supabase-gögn, auth, RLS, grants, policies eða `feature_access` röð var
  skrifuð eða breytt.
- `AGENT_COLLABORATION_ENABLED` var ekki virkjað.
- Enginn dev server eða port 3004 var ræstur, stöðvaður eða snertur.
- Live-location áfanginn var ekki hafinn.

## Localhost checks for Stebbi

Samvinna hefur enn ekkert jákvætt localhost-flæði sem Stebbi á að prófa, því
SQL95 hefur ekki verið keyrt og global gate á að vera slökkt. Ekki breyta
`.env.local`, ekki keyra SQL95 og ekki stofna `feature_access` röð bara til að
sjá UI-ið.

Öruggt regression-smoke með núverandi localhost server, ef Stebbi vill:

1. Opna `/vedrid` og staðfesta að Veðrið birtist eðlilega.
2. Opna núverandi Veðurpúls-flæði og staðfesta að feed/spjall hegði sér eins og
   áður.
3. Opna `/auth-mvp/samvinna` aðeins ef local global gate er þegar absent/false;
   vænt niðurstaða er fail-closed redirect á `/`.
4. Ekki setja inn pairing-kóða, runner-token, auth-cookie eða raunveruleg
   verkefnaskilaboð á þessu stigi.

Eftir að sérstakt disposable test-umhverfi hefur verið samþykkt þarf sérstaka
SQL95 localhost/staging handbók: migration 56 fyrst, SQL95 tvisvar fyrir
idempotency, RLS/grant matrix með einangruðum tenantum og síðan harmless
pair/claim/complete/revoke flæði. Production má ekki vera það umhverfi.

## Næsta ákvörðun fyrir Stebba

Velja þarf eina örugga leið fyrir SQL95-gate áður en Samvinna má virkjast:

1. **Local leið:** veita sérstakt leyfi til að setja upp Docker Desktop og
   Supabase CLI og byggja disposable local stack. Þetta er stærri local
   uppsetning og var ekki heimiluð núna.
2. **Hosted disposable leið:** stofna sérstakt disposable Supabase
   branch/project sem inniheldur production-trútt prerequisite schema en engin
   production notendagögn. Þetta krefst sérstaks leyfis, aðgangs og mögulegs
   billing-mats, en er líklega hraðasta leiðin ef Supabase-áætlunin styður
   branches.

Mælt er með hosted disposable branch/project ef það er þegar í boði á
Supabase-áætluninni; annars local Docker + Supabase CLI. Í báðum tilfellum þarf
nýtt afmarkað framkvæmdarleyfi. Ekki heimila production SQL95 fyrr en öll
integration-prófin hér að ofan eru græn.
