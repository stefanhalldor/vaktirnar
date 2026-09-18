# Dependency security hotfix production release v002

## Findings first

Dependency hotfixið er útgefið á Production. Exact product commit
`ceb74f87f8a0c3e8b7a058092c063827d26a9c23` var push-að fast-forward á
`origin/main`. Vercel deployment `dpl_2jJwmFsa6XSaEYKcsqUB9T3w7BqR` varð
`Ready` og fékk production aliasa, þar á meðal `www.teskeid.is`.

Public read-only smoke skilaði HTTP 200 á `/` og `/vedrid`. Engin SQL,
Supabase mutation eða gagnabreyting var framkvæmd. Full suite er áfram
`BASELINE_RED_NONBLOCKING`, ekki GREEN: engin candidate-only failure identity
fannst í exact baseline comparison.

## Release evidence

- Baseline: `de68a16e603c09a3cfa82790bf72e61f45086652`.
- Product commit: `ceb74f87f8a0c3e8b7a058092c063827d26a9c23`.
- Push: `de68a16..ceb74f8`, exact fast-forward á `main`.
- Remote readback: `origin/main=ceb74f87f8a0c3e8b7a058092c063827d26a9c23`.
- Vercel: `dpl_2jJwmFsa6XSaEYKcsqUB9T3w7BqR`, target `production`, status `Ready`.
- Production aliases: `www.teskeid.is`, `teskeid.is`, `www.vaktirnar.is`,
  `vaktirnar.is` og canonical Vercel aliases.
- HTTP smoke: `https://www.teskeid.is/` 200 og
  `https://www.teskeid.is/vedrid` 200.
- Home response var `private, no-cache, no-store, max-age=0, must-revalidate`.
- Fyrir push: npm audit 0, focused tests, typecheck, lint, build, diff/scope og
  secret scan PASS; 154 static pages í production build.

## GoLive

Repository connection var staðfest fyrir `Vaktirnar / Gott vibe ehf` með
`issues:read` og `issues:write`. Task `dependency-security-hotfix-20260918`
var stofnaður og exact readback staðfesti `status=in_progress` og
`priority=urgent`.

## Localhost checks for Stebbi

Staðan er `READY_FOR_MANUAL_BROWSER_SMOKE`. Smoke hindraði ekki commit, push
eða release, en útgáfan er ekki lýst endanlega sjónrænt notendasannreynd fyrr
en þessi skref eru staðfest:

1. Opna `/vedrid` og `/auth-mvp/vedrid` á 360, 390 og 460 px.
2. Prófa markers, popup open/close, zoom controls, pinch zoom, touch/pan og
   mobile overflow.
3. Prófa route overlay og staðfesta að solid/dashed línur uppfærist án stale
   dash-stíls.
4. Prófa íslensku/ensku, refresh og innri navigation.
5. Smoke-prófa `/auth-mvp/heim` og `/splitt`.

Þegar Stebbi staðfestir exact PASS má merkja GoLive taskið `done` með release
evidence. Engin SQL-gátt fylgir þessu dependency hotfixi.
