# TODO-091 v012 — Subtle Korttilraun-hlekkur undir Ferðalagið

## Plan áfangans

1. Fjarlægja Korttilraun-hlekkinn úr innri veðurblokkinni.
2. Flytja hann í sameiginlega shellið beint undir Ferðalagið CTA.
3. Gera hann miðjaðan og mun daufari en aðal-CTA.
4. Varðveita feature-gate og keyboard-aðgengi.

## Hvað var raunverulega gert

- `WeatherOverviewShell` tekur nú valfrjáls `experimentalHref` og `experimentalLabel`.
- Þegar þau eru til staðar birtist miðjaður textahlekkur beint undir Ferðalagið.
- Hlekkurinn:
  - er 9 px;
  - notar `text-muted-foreground/35`;
  - hefur engan ramma, bakgrunn eða takkaútlit;
  - verður aðeins skýrari á hover;
  - fær sýnilegan focus-ring fyrir keyboard-notendur.
- `WeatherOverviewClient` sendir hlekkinn aðeins þegar `hasRoadIntelligence=true`.
- Gamli hlekkurinn og border-línan inni í route/veðurblokkinni voru fjarlægð.
- Slóð og texti eru óbreytt:
  - `/auth-mvp/vedrid/road-map-prototype`
  - `Korttilraun →`

## Skrár sem voru skoðaðar

- `Design.md`
- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár sem voru breyttar

- `components/weather/WeatherOverviewClient.tsx`
- `components/weather/WeatherOverviewShell.tsx`
- `ai-handoff/2026-07-24-2124-todo-091-v012-codex-subtle-map-prototype-link.md`

Fyrri ócommittaðar v011 gate/admin-breytingar voru varðveittar. Ótengdar breytingar á `.obsidian/workspace.json` og endurnefning v006 handoffs voru ekki snertar.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/guard.test.ts`
  - Exit code 0; 121 af 121 prófum stóðust.
- `npm.cmd run build`
  - Exit code 0.
  - Production build kláraðist með fyrirliggjandi lint-viðvörunum.
- `git diff --check`
  - Engar whitespace-villur; aðeins line-ending viðvaranir.

## Hvað mistókst eða var sleppt

- Engin skipun mistókst.
- Engin browser-/sjónræn prófun var keyrð þar sem Stebbi stýrir localhost.
- Engum Vercel-breytum var breytt.
- Ekkert commit, push eða deploy var gert.

## Ákvarðanir

- Experimental hlekkurinn var gerður að shell-prop í stað þess að hardcode-a Road Intelligence skilyrði í provider-neutral shellið.
- Sjónræna stærðin er viljandi mun minni en venjulegt CTA, en focus-ring var varðveittur svo hlekkurinn verði ekki óaðgengilegur.
- Textanum var ekki breytt þar sem nýjasta beiðnin vísaði sérstaklega í „Korttilraun“.
- Lausnin fylgir `Design.md` að öðru leyti: enginn overflow, miðjuð mobile-röðun og skýrt navigation feedback frá venjulegum Next Link.

## Áhætta sem er enn til staðar

- `text-muted-foreground/35` getur verið nær ósýnilegt á sumum skjám, sem er viljandi samkvæmt beiðninni. Keyboard-focus er þó sýnilegt.
- Hlekkurinn birtist aðeins ef Road Intelligence gate skilar true.
- V011 gate-breytingarnar eru enn í sama ócommittaða worktree og þurfa að fylgja með ef markmiðið er að opna hlekkinn fyrir alla veðurnotendur.

## Tillaga að næsta skrefi

Staðfesta staðsetningu og subtle styrk á mobile og desktop. Ef hann er enn of áberandi má lækka opacity lítillega; ef hann er ótappanlegur má halda textanum 9 px en stækka ósýnilega hit-area.

## Spurningar fyrir næstu rýni

1. Á textinn að haldast `Korttilraun →` eða breytast í `Útgáfa 2 (í þróun)`?
2. Er 35% muted litur réttur styrkur á raunverulegum mobile skjá?

## Supabase

Engin SQL- eða Supabase-breyting var gerð.

## Localhost checks for Stebbi

Slóð:

`/auth-mvp/vedrid`

State:

- Notandi þarf Road Intelligence aðgang samkvæmt núverandi env/gate stillingu.
- Ferðalagið CTA þarf að vera sýnilegt.

Skref:

1. Skrunaðu neðst að Ferðalagið.
   - `Korttilraun →` á að vera miðjað beint fyrir neðan takkann.
2. Staðfestu að gamli Korttilraun-hlekkurinn sjáist ekki lengur inni í route/veðurblokkinni.
3. Berðu saman sjónrænan styrk:
   - Ferðalagið er áfram skýrt primary CTA.
   - Korttilraun er mjög lítill og daufur texti án ramma eða bakgrunns.
4. Hover/focus:
   - Hover gerir textann aðeins skýrari.
   - Tab-focus sýnir focus-ring.
5. Smelltu á hlekkinn.
   - Hann á að opna `/auth-mvp/vedrid/road-map-prototype`.
6. Prófaðu notanda án Road Intelligence aðgangs þegar per-user gate er virkt.
   - Hlekkurinn á ekki að sjást.
7. Prófaðu mobile og desktop.
   - Hlekkurinn á að vera miðjaður og ekki valda láréttu overflowi.
