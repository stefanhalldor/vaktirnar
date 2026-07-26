# TODO-090 v083 — ytri útgáfuaðgerðir eftir v082

**Created:** 2026-07-26 22:00
**Timezone:** Atlantic/Reykjavik
**Tengist:** TODO-090 og veður-/söguhluta TODO-091
**Byggir á:** v080, v081 og v082

Þetta er read-only release-stöðumat. Engin production-, Vercel-, Supabase-,
commit-, push- eða deploy-aðgerð var framkvæmd.

## Findings

Enginn nýr release-blocker fannst eftir middleware-lagfæringuna í v082.

1. **Supabase — ekkert eftir að framkvæma fyrir þessa útgáfu.** SQL 92 og 93
   hafa þegar verið keyrð í réttu verkefni. Private Storage bucket er til,
   virkt snapshot er eitt, ekkert snapshot er í byggingu, golden routes eru
   20/20 og virki Storage objectinn er til. met.no warmup hefur áður verið
   staðfest 43/43. Ekki keyra migrations eða bootstrap aftur.

2. **Vercel — engin nauðsynleg breyta vantar að nafni.** Read-only
   `vercel.cmd env ls production` staðfesti Production entries fyrir
   `CRON_SECRET`, `TESKEID_ROUTE_CANDIDATE_ENABLED`, `AUTH_MVP_ENABLED`,
   `WEATHER_ENABLED` og `WEATHER_ELTA_VEDRID_FLAG`. CLI sýnir gildin sem
   `Encrypted`, svo þetta staðfestir ekki innihald þeirra.

3. **Eina handvirka env-staðfestingin:** ef Teskeiðarleiðin á að vera virk í
   production þarf `TESKEID_ROUTE_CANDIDATE_ENABLED` að vera nákvæmlega
   `true`. Þá keyrir road-graph refresh cron einnig. Valfrjálsa
   `TESKEID_ROAD_GRAPH_REFRESH_ENABLED` þarf ekki að bæta við. Hún er aðeins
   nauðsynleg ef candidate-flaggið á að vera slökkt en samt á að halda
   snapshotinu fersku.

4. **Cron jobs þarf ekki að stofna handvirkt.** `vercel.json` skilgreinir
   `/api/cron/warm-metno-points` og `/api/cron/refresh-road-graph`. Production
   deploy skráir þau. Vercel sendir núverandi `CRON_SECRET` sjálfkrafa sem
   Bearer authorization og route handlers bera það saman fail-closed.
   Opinber Vercel skjöl: <https://vercel.com/docs/cron-jobs/manage-cron-jobs>.

5. **Útgáfan sjálf er enn óframkvæmd.** Vinnusvæðið er ócommittað og inniheldur
   bæði tracked og nauðsynlegar untracked skrár. Næsta framkvæmd er curated
   commit, push og production deploy með sérstöku leyfi Stebba. Útiloka
   `.obsidian/workspace.json`; taka með source, tests, `vercel.json`,
   `.env.example`, SQL 92/93 og handoff-skjölin sem tilheyra pakkanum.

6. **Eftir deploy:** fylgjast með Vercel build þar til það er grænt, staðfesta
   undir Settings → Cron Jobs að báðar nýju slóðirnar sjáist og skoða fyrstu
   keyrslu/logg. Virkt snapshot er þegar til, svo ekki þarf að keyra manual
   refresh fyrir deploy.

## Staðfesting eftir v082

- `npm run test:run -- lib/__tests__/middleware.test.ts` — exit 0, 66/66.
- `npm run type-check` — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi line-ending warnings.
- Fyrri full suite — 160 test files passed, 1 skipped; 3810 tests passed.
- Fyrri production build — exit 0.
- Middleware hefur nú exact public path fyrir
  `/api/cron/refresh-road-graph`; route handler ver sig áfram með
  `CRON_SECRET`.
- Snapshot validation krefst nákvæmlega allra 20 golden-route niðurstaðna;
  sérstakt 19/20 rejection-próf er til.

## Ráðlögð röð héðan

1. Stebbi staðfestir í Vercel Dashboard að
   `TESKEID_ROUTE_CANDIDATE_ENABLED=true` í Production. Ekki þarf að lesa,
   afrita eða breyta `CRON_SECRET`.
2. Stebbi gefur sérstakt leyfi fyrir curated commit, push og deploy.
3. Framkvæmdaraðili útilokar `.obsidian/workspace.json`, push-ar og fylgist
   með Vercel build þar til það er grænt.
4. Staðfesta nýju Cron Jobs í Vercel og að fyrstu svör séu ekki 401/500.
5. Stebbi tekur fyrirhugaðan stuttan loka-smoke á production.

## Localhost checks for Stebbi

Engin frekari localhost-prófun er nauðsynleg fyrir þessa litlu v082
middleware-breytingu. Stebbi hefur þegar staðfest helstu weather history,
missing/pending texta, route comparison og Teskeiðarleið á localhost og valið
að taka loka-smoke á production eftir útgáfu. Ekki endurkeyra Supabase SQL,
bootstrap eða manual cron sem hluta af browser-smoke.

## Route intelligence check

- Snertir provider-neutral Íslandsgrafið og production refresh þess, ekki nýja
  route-family eða ný provider-specific gögn.
- Snapshot validation og 20 golden routes verja LKG promotion.
- `IcelandRoadmap.md` og `lib/iceland-routes/` eru þegar uppfærð í pakkanum;
  engin viðbótar route-skráning er nauðsynleg vegna v082.
- Engin persónuleg ferðagögn eða nákvæm heimilisföng eru vistuð með croninu.

## Óvissa / þarf að staðfesta

- Vercel CLI sýnir ekki dulkóðuð env-gildi. Tilvist production-breytanna er
  staðfest en exact boolean-gildi þeirra ekki. Mikilvægasta gildið fyrir þessa
  útgáfu er `TESKEID_ROUTE_CANDIDATE_ENABLED=true`.
- Production cold-start, cron fyrsta keyrsla og mobile/Safari eru eðlilega
  aðeins staðfest eftir deploy.

**Confidence:** Hátt um að ekki þurfi frekari Supabase- eða Vercel-uppsetningu,
að frátalinni einni sjónrænni staðfestingu á candidate-flagggildinu.
