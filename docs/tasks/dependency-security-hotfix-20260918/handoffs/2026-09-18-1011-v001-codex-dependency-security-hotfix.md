# Dependency security hotfix handoff v001

## Findings first

Engin blocking candidate-regression fannst. Nákvæmur full-suite samanburður sýndi enga candidate-only failure ID, assertion, uncaught error eða snapshot drift. Full suite er því rétt flokkað `BASELINE_RED_NONBLOCKING`, ekki GREEN: candidate hafði 30 failed tests í 26 suites en clean canonical baseline hafði 37 failed tests í 33 suites.

MapLibre 6 þurfti eina afmarkaða TypeScript-samhæfingarbreytingu: óskilgreint `line-dasharray` notar nú `undefined` í stað `null`. Engin kortagögn, route-regla, privacy-regla eða notendasýnileg virkni var breytt. Lokastaðfesting á touch, zoom, markers, popups og mobile layout þarf browser-próf Stebba.

GoLive task write tókst ekki vegna þess að Vaktirnar `.env.local` inniheldur ekki `GOLIVE_KANBAN_URL`, `GOLIVE_KANBAN_TOKEN` og `GOLIVE_KANBAN_PROJECT_ID`. Canonical local task er til, en ekki má merkja external GoLive task sem stofnaðan eða `in_progress` fyrr en Vaktirnar-specific credentials eru tiltæk.

## Baseline og scope

- Baseline og `origin/main`: `de68a16e603c09a3cfa82790bf72e61f45086652`.
- Branch: `codex/dependency-security-hotfix-20260918`.
- Isolated worktree: `.tmp/dependency-security-hotfix-20260918`.
- Root var fast-forwardaður á sama canonical commit og er hreinn.
- Fyrra dirty root var varðveitt read-only í stash commit `33265289a30c3ff67f3c525009aae93a83e05395` með heitinu `release-cleanup-20260918-before-sync-to-de68a16e`.
- Engin SQL, migration, Supabase mutation, Production breyting, push eða deploy.

## Breytingar

- `package.json` og `package-lock.json`: Next.js og `eslint-config-next` 15.5.25, next-intl 4.14.5, MapLibre GL 6.10.0, PostCSS 8.5.28 og Vitest 4.1.11. PostCSS override heldur Next transitive resolution á patched útgáfunni.
- `components/weather/DriveRouteMap.tsx`: MapLibre 6 type-compatible reset á `line-dasharray`.
- `lib/__tests__/weather-public-route-client.test.ts`: normaliserar CRLF áður en literal source contract er borið saman.
- `.eslintrc.json`: `root: true` kemur í veg fyrir að nested isolated worktree erfi parent ESLint config.
- `next.config.js`: `outputFileTracingRoot: __dirname` afmarkar production tracing við project root.
- `docs/tasks/dependency-security-hotfix-20260918/`: canonical task og handoff evidence.

## Verification

- `npm ci`: PASS, 619 packages.
- `npm audit --json`: PASS, 0 info/low/moderate/high/critical vulnerabilities.
- `npm ls next next-intl maplibre-gl postcss eslint-config-next vitest --depth=2`: PASS; exact direct versions staðfestar og PostCSS 8.5.28 deduped undir Next.
- Focused weather/MapLibre/i18n/routing tests: PASS. Final clean-state lota: 5 files, 17 tests. Fyrri breiðari lota á sama allowlisted hotfix: 16 files, 141 tests.
- `npm run type-check`: PASS.
- `npm run lint`: PASS; aðeins fyrirliggjandi React hook og `img` warnings.
- `npm run build`: PASS á Next.js 15.5.25; compilation, type/lint phase og 154 static pages kláruð.
- `git diff --check`: PASS.
- Scope check: aðeins allowlistaðar source, package og task/handoff skrár.
- Secret scan á source diffi: PASS, engin matches.

## Full-suite baseline debt

Sama byte-layout og nauðsynlegt ignored route fixture voru notuð til að bera candidate og clean baseline saman. Candidate: 30 failed tests / 26 failed suites / 8080 tests. Baseline: 37 failed tests / 33 failed suites / 8065 tests. `candidateOnly=[]`.

Baseline hafði sjö assertion failures sem candidate hafði ekki: tvö `BookingDetailClient` tilvik, fjögur `BookingRequestForm` tilvik og SQL107 encrypted payment storage import graph. Baseline hafði einnig suite-level `qrcode` resolution failure sem candidate hafði ekki. Sameiginlegar 30 baseline failures voru meðal annars AdminPage provider-context próf og fyrirliggjandi SQL171/174/175/182/183/184, booking API, receipt navigation og tengd contract-próf. Engin þessara óskyldu baseline-vandamála var lagfærð í hotfix scope.

## Fresh review

Fresh diff review fann enga auth-, privacy-, SQL-, route-data- eða product-scope breytingu. Version pins og lockfile resolution samsvara installinu sem var audit-að og byggt. Eftirstandandi áhætta er browser-hegðun MapLibre 6 og þarf handvirku localhost-prófin hér fyrir neðan. Separate sub-agent review var ekki keyrt; núverandi agent-reglur heimila ekki delegation nema Stebbi biðji sérstaklega um hana.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Eftir að hotfix-source er komið í þá checkout sem á að prófa skal stöðva gamla ferlið, keyra `npm ci` og ræsa aftur á porti 3004. Gamalt dev-ferli hleður ekki nýjan dependency graph sjálfkrafa.

1. Opna `http://localhost:3004/vedrid` og `http://localhost:3004/auth-mvp/vedrid` í 360, 390 og 460 px breidd.
2. Staðfesta að kort birtist, markers sjáist, popup opnist og lokist, zoom virki með controls og gesture, og touch/pan valdi hvorki freeze né láréttu overflowi.
3. Prófa leið og staðaval þar sem kortið notar route overlay; staðfesta að solid og dashed línur uppfærist án þess að eldri dash-stíll sitji eftir.
4. Skipta milli íslensku og ensku þar sem tungumálaval er tiltækt; endurhlaða og prófa innri navigation. Textar eiga að haldast þýddir og routes mega ekki 404-a eða missa locale.
5. Smoke-prófa `/auth-mvp/heim` og `/splitt` til að staðfesta að launcher og almenn Next routing hlaðist eðlilega.

Ekki prófa með Production credential eða gagnamutation. Hotfixið hefur enga SQL-gátt og þarf hvorki Supabase né Production gagnaaðgerð.

## Næsta gátt

Eftir local commit þarf Stebbi að staðfesta browser-prófin. Push og deploy eru sér release-aðgerðir og voru ekki framkvæmdar í þessum áfanga. GoLive external task þarf Vaktirnar-specific `GOLIVE_KANBAN_*` stillingar áður en hægt er að stofna hann og staðfesta `in_progress` með readback.
