# TODO-090 v080 — loka prerelease-staðfesting release-pakkans

**Created:** 2026-07-26 21:46  
**Timezone:** Atlantic/Reykjavik  
**Tengd atriði:** TODO-046 OTP, TODO-090 route comparison/LKG og TODO-091 spátöflusaga  
**Fyrri lykilhandoff:** v072, v073, v075–v079 og leiðrétt localhost-röð v022

## Findings fyrst

### Enginn release-blocking kóðagalli fannst

Eftir browser-smoke Stebba, loka full-test, sjálfstætt TypeScript-check, production-build og afmarkað diff-/öryggismat fann Codex engan óleystan kóðablocker.

Release-pakkinn er **prerelease-grænn fyrir curated commit/deploy**, með tveimur skýrum skilyrðum:

1. ekki commit-a ótengdu `.obsidian/workspace.json` fyrir slysni;
2. Stebbi tekur loka smoke á production eftir deploy.

### Miðlungs — release hygiene: ekki nota blindt `git add -A`

Vinnusvæðið er vísvitandi stórt og dirty: 34 tracked skrár breyttar auk nauðsynlegra nýrra route/history/graph/test/SQL skráa og handoff-skjala. Það inniheldur einnig breytta `.obsidian/workspace.json`, sem Codex snerti ekki og tengist ekki release-pakkanum.

Release-commit þarf því curated staging. Sérstaklega skal útiloka `.obsidian/workspace.json` nema Stebbi ákveði sérstaklega annað. Ekki má rugla þessu saman við að SQL 92/93 og nýjar ótracked implementation-/test-skrár eigi að gleymast; þær eru hluti af release-pakkanum og þurfa meðvitaða staging-yfirferð.

### Samþykkt non-blocking performance-áhætta

Teskeiðarleið kom eftir um 30 sekúndur í fyrstu cold localhost-keyrslu og mun hraðar í annarri, en samt um 10 sekúndum á eftir Google-valkostunum. Greining sýndi sequential client-flæði og retry-backoff. Stebbi samþykkti að halda functional hegðun óbreyttri í þessari útgáfu og taka parallel-fetch/performance sem sérverk eftir stóru útgáfuna.

Þetta er ekki blocker: candidate birtist, warm hegðun er hraðari og Google er áfram örugg baseline/default. Það er þó skráð sem þekkt latency-atriði.

### Post-deploy smoke er enn ólokið

Stebbi ákvað að taka loka mobile/rauntækja-smoke eftir deploy á production fremur en á localhost. Það er ásættanlegt sem rollout-check en þarf að gerast áður en útgáfan er talin endanlega staðfest í raun.

## Lokabreytingar eftir v072

- Samfelld met.no/Veðurstofu spásaga og `Eldri spár` flæði.
- `Sögugildi vantar` og `Spá vantar` eftir successful fetch.
- `Sæki spá...` í auðum reitum meðan viðkomandi provider/history er enn að sækja.
- Nett `← Eldri spár` control í sticky efra-vinstra hornreitnum; compact ghost-action við 1–3 stöðvar.
- Canonical Google Maps varúðartexti endurheimtur og áherslumálsgreinin renderuð feitletruð neðst.
- `enlargeMap` notar rétt `ferdalagid` namespace.
- Nákvæm public `/api/place/search` fær að ná eigin bounded handler-gates; subpaths eru áfram private.
- Road graph connectivity-gate lagfæring, active snapshot bootstrap og cold/pending retry-hegðun.
- OTP delivery-uncertainty/reuse/resend breytingar úr sameinaða pakkanum.

## Browser-smoke sem Stebbi staðfesti

Stebbi staðfesti „virkar“/„virkar allt“ fyrir:

- auth spátöflu með met.no og Veðurstofu;
- pending-, missing history- og missing forecast-texta;
- `Eldri spár`, samfellda sögu og stöðvaskipti;
- tíma- og veðurviðmiðabreytingar án stale state;
- provider-only og blandað val;
- public `/vedrid`, Spágögn, Kort og Akstur;
- public staðaleit án fyrri 401, route calculation og console-smoke;
- canonical varúðartexta, feitletraða áherslu og `Stækka kort` án missing-message;
- OTP/innskráningu og resend;
- route comparison, preview/apply og fullscreen;
- Teskeið candidate: cold leið kom að lokum og warm endurtekning var mun hraðari.

## Infrastructure-staða sem Stebbi staðfesti

- SQL 92 og SQL 93 keyrð á réttu Supabase verkefni.
- Bucket `teskeid-road-graph-snapshots` er private.
- Road graph: `active_count = 1`, `building_count = 0`.
- Active snapshot: golden routes `20/20`.
- Active Storage object exists = `true`.
- met.no warmup hafði áður verið staðfest 43/43 í release-flæðinu.

Engin SQL-, Supabase-, production-, commit-, push- eða deploy-aðgerð var framkvæmd af Codex í þessari lokastaðfestingu.

## Sjálfvirk lokaprófun

### Fyrsta sameiginlega keyrsla

- `npm run build` — exit 0; production-build, Next type/lint phase og 105 static pages græn.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- `npm run test:run` — eitt nýtt history-corner test féll vegna þess að testið spurði eftir async `role="group"` áður en history-discovery lauk. Product-hegðunin var þegar browser-staðfest.
- Samhliða `npm run type-check` féll með vantaðar `.next/types` skrár vegna þess að build og type-check skrifuðu/lásu `.next` samtímis. Build sjálft fór í gegnum TypeScript; þetta var execution race, ekki source-villa.

Test-fixture var leiðrétt til að bíða eftir async hornreitnum. Enginn production-kóði breyttist eftir græna buildið.

### Lokaniðurstöður eftir leiðréttingu

- Markpróf `weather-chase-panel-hydration.test.tsx` — exit 0, **16/16**.
- Sjálfstætt `npm run type-check` eftir build — exit 0.
- Lokalegt `npm run test:run` — exit 0:
  - **160 test files passed**, 1 skipped;
  - **3.810 tests passed**, 28 skipped, 8 todo.
- `npm run build` — exit 0.
- `git diff --check` — exit 0.
- JSON parse fyrir `messages/is.json` og `messages/en.json` — exit 0.

Build sýnir fyrirliggjandi hook-/`img` warnings í eldri ótengdum backlog-skrám. Engin build-villa eða ný staðfest release-blocking warning fannst.

## Öryggis- og gagnamat

- Public place search er aðeins exact middleware-leið; subpaths fá áfram 401.
- Route-handlerinn heldur weather-mode/access, rate-limit, query bounds, provider check og Iceland-coordinate filtering.
- Engin RLS policy, grant, auth policy eða secret var veikt í síðustu UI/public lagfæringum.
- History endpoints taka canonical provider/station/place auðkenni, ekki arbitrary user route history.
- Road graph runtime les aðeins validated active private snapshot og heldur LKG fallback.
- OTP óvissa lekur ekki netföngum/secrets í client response eða logs samkvæmt fyrri prerelease-rýni og grænum prófum.

## Design.md

Browser-smoke og kóði styðja mobile-first markmiðið: progressive loading, skýr pending/empty/error state, sticky history-control innan innri lárétta töfluscrollsins, 40 px control target, fullscreen focus/close og engin staðfest page-level overflow/zoom regression. Endanleg iPhone/Safari/safe-area staðfesting verður post-deploy.

## Route intelligence check

Release-pakkinn snertir provider-neutral road graph snapshot, connectivity validation, candidate routing og route comparison. Canonical gögn og skjöl eru í `lib/iceland-routes/` og `IcelandRoadmap.md`; client-performance atriðið verður framtíðarverk en ekki Google-specific domain fork. Engin ný nákvæm heimilisföng eða persónulegar ferðir eru geymdar með þessum lokabreytingum.

## Localhost checks for Stebbi

Localhost/browser pakkarnir sem skipta máli fyrir þessa útgáfu hafa verið staðfestir af Stebba. Engin frekari localhost-prófun er krafa áður en curated commit/deploy er undirbúið.

## Post-deploy checks for Stebbi

Á production, helst á raunverulegum síma:

1. Public `/vedrid` og auth `/auth-mvp/vedrid`: Spágögn og nýr `Eldri spár` hornreitur.
2. Kort og Akstur Reykjavík → Ísafjörður: staðaleit, canonical varúð, leiðasamanburður og fullscreen.
3. Route-enabled notandi: Google áfram default; Teskeið candidate birtist eftir cold/warm bið án varanlegs `pending`/`route_unavailable`.
4. OTP request og resend með controlled test mailbox.
5. Console/Network: engar væntanlegar rauðar 401/404/503 eða `MISSING_MESSAGE` villur.
6. Mobile: ekkert page-level overflow, overlap, input zoom eða safe-area vandamál.

Ef blocker kemur upp skal stöðva rollout eða rollback-a viðkomandi deployment; ekki keyra SQL 92/93 aftur og ekki endurbyggja snapshot nema sérgreining sýni infrastructure-vanda.

## Næsta skref

Claude Code eða Stebbi gerir curated staging/diff-yfirferð, sérstaklega fyrir untracked skrár og `.obsidian/workspace.json`, síðan commit/push/deploy aðeins með nýju skýru framkvæmdarleyfi. Eftir grænt Vercel build tekur Stebbi post-deploy smoke-listann hér að ofan.

## Óvissa / þarf að staðfesta

- Production mobile/Safari og raunveruleg Vercel cold-start latency verða aðeins staðfest eftir deploy.
- Teskeið candidate performance er vísvitandi deferred og ekki hluti af þessari útgáfu.
- Codex hefur ekki stage-að, commit-að, push-að eða deployað og hefur því ekki staðfest nákvæman framtíðar-commit file list eða Vercel build þessa enn óstofnaða commits.

**Confidence:** hátt fyrir prerelease code/test/build stöðu; endanleg rollout-confidence verður hátt fyrst eftir curated commit, grænt Vercel build og post-deploy smoke Stebba.
