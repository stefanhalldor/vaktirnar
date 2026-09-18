# Dependency security hotfix

- External ID: `dependency-security-hotfix-20260918`
- GoLive project: Vaktirnar (`1bb6e3fa-ab25-48c0-a806-342465ee5ded`)
- Owner/writer: Codex

## Markmið og acceptance criteria

Loka þekktum npm dependency veikleikum án ætlaðrar product- eða UX-breytingar:

1. Uppfæra Next.js úr 15.5.14 í nýjustu öruggu 15.5.x útgáfu og halda `eslint-config-next` samstilltu.
2. Uppfæra PostCSS, Vitest og viðeigandi transitive pakka innan öruggs samhæfissviðs.
3. Uppfæra `next-intl` og sannreyna tungumál, þýðingar og routing.
4. Uppfæra MapLibre úr 5 í 6 og sannreyna sérstaklega Veðrið, markers, popups, zoom, touch og mobile layout.

Acceptance: `npm audit` án þekktra veikleika, focused map/i18n próf, typecheck, full tests, lint, build, diff/scope check og secret scan eru GREEN eða full-suite baseline debt er nákvæmlega flokkað samkvæmt workflowi. Engin SQL eða gagnagrunnsbreyting.

## Current gate

Hotfix commit `ceb74f87f8a0c3e8b7a058092c063827d26a9c23` er á `origin/main` og Vercel Production deployment `dpl_2jJwmFsa6XSaEYKcsqUB9T3w7BqR` er `Ready`. Public smoke á `/` og `/vedrid` skilar HTTP 200. Staðan er `READY_FOR_MANUAL_BROWSER_SMOKE`: handvirk MapLibre touch/zoom/marker/popup/mobile sannprófun bíður Stebba en hindrar ekki útgefna hotfixið. Full suite er `BASELINE_RED_NONBLOCKING`: candidate bætti engum failure ID eða uncaught error við canonical baseline.

## Ákvarðanir og mörk

- Engin ætluð breyting á product-hegðun eða notendatexta.
- Next.js helst innan 15.5.x.
- MapLibre major-uppfærsla fær sértæka source-, type-, build- og korta-regression rýni.
- `IcelandRoadmap.md` og route-domain gögn breytast ekki; dependency hotfixið bætir ekki við route-þekkingu.
- Engin SQL, Supabase mutation, credential-breyting eða Production gagnaaðgerð.
- GoLive external task write bíður vegna þess að `GOLIVE_KANBAN_*` vantar í Vaktirnar `.env.local`; canonical task-skjalið er stofnað núna.

## Dependencies

- Canonical baseline: `de68a16e603c09a3cfa82790bf72e61f45086652`.
- Npm registry fyrir staðfest package metadata og dependency install.

## Shared paths

- `package.json`
- `package-lock.json`
- Kortakóði aðeins ef MapLibre 6 krefst afmarkaðrar compatibility-lagfæringar.
- `docs/tasks/dependency-security-hotfix-20260918/`

## Verification og release evidence

- `npm ci`: PASS.
- `npm audit --json`: PASS, 0 vulnerabilities.
- Focused MapLibre/weather/i18n/routing tests: PASS.
- `npm run type-check`: PASS.
- `npm run lint`: PASS með fyrirliggjandi warnings.
- `npm run build`: PASS á Next.js 15.5.25; 154 static pages.
- Full suite: `BASELINE_RED_NONBLOCKING`. Candidate 30 failed tests í 26 suites; baseline 37 failed tests í 33 suites; engin candidate-only failure ID eða error.
- Diff/scope, `git diff --check` og secret scan: PASS.
- Engin SQL, Supabase eða Production aðgerð var framkvæmd.
- GitHub main push: PASS, fast-forward `de68a16e..ceb74f8`.
- Vercel Production: `dpl_2jJwmFsa6XSaEYKcsqUB9T3w7BqR`, `Ready`, production aliases virk.
- Production HTTP smoke: `/` 200 og `/vedrid` 200.

Localhost-próf þurfa að keyra úr candidate/release-source; root er nú samstillt Production-grunni en dev-server Stebba þarf handvirka endurræsingu eftir source-skiptið.

## Latest handoff

`handoffs/2026-09-18-1134-v002-codex-production-release.md`
