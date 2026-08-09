# TODO #090 v198 — Samfélagið mobile/performance production

## Plan áfangans

1. Ljúka Samfélaginu map-first og laga ferskleika, loading og mobile-layout.
2. Flytja aðeins afmarkað v198-diff á hreinan `origin/main` grunn.
3. Staðfesta með feature-prófum, fullri regression-gátt, lint, type-check og production-build.
4. Gefa út án þess að snerta óhreina aðalvinnntréð.

## Hvað var raunverulega gert

- Samfélagið sýnir Ísland og athugasemdapunkta án veðurstöðva; listi er sóttur snemma og sýnir aðgengilegt loading-state.
- Ný athugasemd er sett samstundis í staðbundið collection og verður því smellanleg án endurræsingar.
- Val á athugasemd breytir ekki zoomi; valinn punktur fær sérstaka áherslu og athugasemd birtist í neðri skúffu.
- Aðgerðaskúffa notar náttúrulega innihaldshæð með `75dvh` hámarki, sameinaðan header og tímabil sem eigin aðgerð.
- Minimeruð `Aðgerðir`-aðgerð er hægra megin á mobile og með bili fyrir Safari-neðri stiku.
- MapLibre attribution/info er compact frá byrjun og færist efst hægra megin í Samfélaginu.
- Topbar og síður nota dynamic viewport-hæð til að forðast iOS viewport/scroll frávik.
- Staðaleit er endurraðað í núverandi staðsetningu, kortaleit, textaleit og síðan loader/niðurstöður.
- Community GET fær stutt private browser-cache með stale-while-revalidate til að minnka sýnilega bið.
- Gömul source-contract próf voru gerð óháð CRLF/LF án þess að breyta production-hegðun.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- v197 production handoff og viðeigandi Samfélags-, korta-, routing- og staðaleitarpróf

## Skrár sem voru breyttar

- `app/api/auth-mvp/map-notes/route.ts`
- `app/auth-mvp/vedrid/page.tsx`
- `app/vedrid/page.tsx`
- `components/weather/MapNotesPanel.tsx`
- `components/weather/PlaceSearch.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- átta afmörkuð contract/regression-próf undir `lib/__tests__/`
- þessi handoff-skrá

## Skipanir og niðurstöður

- Feature-próf: exit 0, 36/36.
- Routing/free-drive regressions: exit 0, 77/77.
- Vegagerðin live UI contract: exit 0, 23/23.
- Official-place deterministic generator: exit 0, 6/6.
- `npm.cmd run type-check`: exit 0.
- Full Vitest með `.tmp/**` og tveimur þekktum SQL-fixture-prófum undanskildum: exit 0, 309 skrár, 5.401 passed, 49 skipped, 8 todo.
- `npm.cmd run lint`: exit 0; aðeins fyrirliggjandi warnings.
- `npm.cmd run build` með process-only public Supabase placeholder-gildum: exit 0; 130 síður myndaðar.
- `git diff --check`: exit 0; aðeins Windows line-ending warnings.

## Það sem mistókst eða var sleppt

- Fyrsta build innan netsandbox féll þegar `next/font` gat ekki sótt Inter; sama build með afmörkuðum netaðgangi stóðst.
- Tvö gömul SQL-fixture-próf voru undanskilin þessari útgáfugátt og verða tekin í næsta, sérstaklega heimilaða test-hardening áfanga.
- Codex getur ekki staðfest raunverulegt iPhone Safari hardware í þessu umhverfi. Mobile contracts, dynamic viewport og production-build eru staðfest; loka sjónræn iPhone-staðfesting er hjá Stebba.
- Dev server Stebba var hvorki ræstur, endurræstur né stöðvaður.

## Ákvarðanir

- Breytingin fylgir `Design.md`: mobile-first, dynamic viewport, enginn láréttur overflow, aðgerðir innan þumalsvæðis og sýnilegt pending-feedback.
- Hreint worktree frá `origin/main` var notað. Ócommittaðar og untracked skrár í aðalvinnutrénu voru varðveittar ósnertar.
- Engar routing-, SQL-, auth- eða RLS-breytingar voru teknar inn í v198.

## Eftirstandandi áhætta

- Safari browser-chrome og safe-area geta aðeins fengið endanlega staðfestingu á raunverulegum iPhone.
- Community cache getur sýnt allt að 15 sekúndna gamalt GET-svar, en optimistic insert gerir eigin nýja færslu strax smellanlega.

## Tillaga að næsta skrefi

Eftir production rollout prófar Stebbi checklistann hér að neðan á iPhone. Codex tekur síðan sér commit fyrir Vitest `.tmp` exclude, SQL-fixture-próf og handoff-status mengun.

## Spurningar sem Codex á sérstaklega að rýna

- Heldur Safari topbar stöðugum eftir scroll og orientation breytingu?
- Er minimeruð `Aðgerðir`-aðgerð alltaf fyrir ofan browser-stikuna?
- Er attribution-info compact efst hægra megin án overlap við áttavita eða topbar?

## Supabase / SQL áhrif

- Engin SQL skrifuð eða keyrð.
- Engin migration, RLS, grant, policy, auth, secret eða production-gagnabreyting.
- Aðeins private HTTP cache-header á fyrirliggjandi community GET response.

## Localhost checks for Stebbi

1. Opna `http://localhost:3004/auth-mvp/vedrid` innskráður og velja `Samfélagið`.
2. Vænt: Ísland og allir sýnilegir athugasemdapunktar koma fram; engin veðurstöðvaspjöld birtast og loader segir að færslur séu sóttar.
3. Búa til samfélagsathugasemd. Vænt: nýi punkturinn er smellanlegur strax án refresh/restart.
4. Smella á punkt og listafærslu. Vænt: zoom helst nákvæmlega óbreytt, punktur fær áherslu og athugasemd opnast neðst.
5. Minimize-a skúffu. Vænt: `Aðgerðir` er hægra megin og fyrir ofan Safari-neðri stiku.
6. Opna tímabil, listann og composer. Vænt: spjaldið notar aðeins nauðsynlega hæð en aldrei meira en 75% viewport og skrollar innan frá.
7. Vænt: info/attribution er compact efst hægra megin og opnast aðeins við snertingu.
8. Skrolla á iPhone og snúa símanum. Vænt: topbar helst efst, efnið byrjar ekki óeðlilega neðar og ekkert lárétt overflow myndast.
