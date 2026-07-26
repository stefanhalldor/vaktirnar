# TODO-090 — Durable road-graph snapshot prerelease handoff

Created: 2026-07-26 16:01  
Timezone: Atlantic/Reykjavik  
Agent: Codex

## Skilningur á samþykki

Stebbi gaf Codex skýrt leyfi til að framkvæma last-known-good graph snapshot
áfangann, þar með talið kóða-, skjala-, prófa- og SQL-skráabreytingar. Stebbi
keyrir SQL sjálfur. Leyfið náði ekki til migration-keyrslu, Supabase- eða
production-breytinga, env/secrets-breytinga, commit, push eða deploy.

## Plan áfangans

1. Geyma fullgerðan, versionaðan og immutable vegagrunn sem private gzip object
   í Supabase Storage og metadata í RLS-varinni töflu.
2. Láta aðskilinn admin/cron worker einn sækja lifandi gögn frá Vegagerðinni.
3. Byggja og staðfesta allan graphinn, þar á meðal diagnostics og allar golden
   routes, áður en snapshot er promote-að atomically.
4. Láta notendabeiðnir aðeins lesa síðasta staðfesta active snapshot og halda
   áfram að nota warm last-known-good graph ef ný metadata/object-lestur bilar.
5. Setja lease, unchanged-skip, retention, rollback og örugga rollout-röð.

## Hvað var raunverulega gert

- Bætt var við `teskeid_road_graph_snapshots` metadata-töflu með einu active
  snapshot, einu building lease og afmörkuðum stöðum fyrir ready/retired/failed/
  unchanged.
- Bætt var við private Storage bucket fyrir immutable `v1/<uuid>.json.gz`
  objects. Engar client `storage.objects` policies voru stofnaðar.
- Refresh worker sækir lifandi Vegagerðarsegin, raðar þeim deterministic,
  reiknar canonical SHA-256, byggir graph, keyrir diagnostics og golden-route
  audit og promote-ar aðeins snapshot sem stenst öll skilyrði.
- Active promotion er atomic undir advisory lock. Sama function getur promote-að
  known-good retired snapshot til rollback.
- Abandoned building lease rennur út eftir 20 mínútur. Storage-path er skráður
  áður en upload hefst svo orphan object sé rekjanlegt og hreinsanlegt.
- Óbreytt source er aðeins skip-að ef active Storage object er enn læsilegt og
  schema-valid; annars er snapshot endurbyggt.
- Runtime notendabeiðna hefur enga import/call leið í lifandi provider. Cold
  process failar closed án active snapshot. Warm process heldur staðfestum LKG
  graph og notar fimm mínútna retry-backoff ef nýtt snapshot eða metadata bilar.
- Daglegur Vercel cron og admin-only bootstrap endpoint voru sett inn.
- Sérstakt optional `TESKEID_ROAD_GRAPH_REFRESH_ENABLED=true` má prewarm-a
  snapshot áður en candidate-virknin er opnuð. Cron keyrir einnig þegar
  `TESKEID_ROUTE_CANDIDATE_ENABLED=true`.
- Runtime parser takmarkar schema, fjölda segmenta/punkta, reiti, Íslandsmörk,
  compressed/uncompressed stærð og staðfestir bæði bytes og canonical hash.
- Retention heldur active snapshot og tveimur nýjustu retired snapshots;
  eldri failed/unchanged metadata eru hreinsuð eftir 30 daga.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `AGENTS.md`
- `Design.md` (UI var ekki breytt í þessum áfanga)
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- núverandi graph/source/candidate/API/Supabase admin helpers og tengd próf

## Skrár sem voru breyttar í þessum áfanga

- `.env.example`
- `IcelandRoadmap.md`
- `vercel.json`
- `app/api/teskeid/weather/travel/route-candidate/route.ts` (athugasemd)
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/roadGraphRuntime.server.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts` (ownership-doc)
- `app/api/admin/weather/refresh-road-graph/route.ts` (ný)
- `app/api/cron/refresh-road-graph/route.ts` (ný)
- `lib/iceland-routes/roadGraphRefresh.server.ts` (ný)
- `lib/iceland-routes/roadGraphSnapshotFormat.ts` (ný)
- `lib/iceland-routes/roadGraphSnapshotStore.server.ts` (ný)
- `sql/92_teskeid_road_graph_snapshots.sql` (ný; **ekki keyrð**)
- `lib/__tests__/road-graph-refresh-routes.test.ts` (ný)
- `lib/__tests__/road-graph-refresh.test.ts` (ný)
- `lib/__tests__/road-graph-runtime-cache.test.ts` (ný)
- `lib/__tests__/road-graph-snapshot-format.test.ts` (ný)
- `lib/__tests__/road-graph-snapshot-migration.test.ts` (ný)
- `lib/__tests__/road-graph-snapshot-store.test.ts` (ný)

Athugið að worktree inniheldur einnig breytingar úr fyrri TODO-046/TODO-090
áföngum og user-owned `.obsidian/workspace.json`; þeim var ekki rúllað til baka.

## Skipanir sem voru keyrðar

- `git status --short` — exit 0
- `git diff --check` — exit 0 (aðeins line-ending warnings)
- `npm run type-check` — exit 0
- `npm run test:run -- <8 snapshot/candidate test files>` — exit 0,
  8 test files og 46 tests passed
- `npm run test:run` — exit 0, 156 test files passed, 1 skipped;
  3766 tests passed, 28 skipped, 8 todo
- `npm run build` — exit 0, production build compiled og allar 103 static pages
  voru generated

Build sýndi fyrirliggjandi React hook/img lint warnings, þar á meðal í stórum
weather components. Þær stöðvuðu ekki build og voru ekki lagaðar utan scope.

## Supabase / SQL áhrif

Migration: `sql/92_teskeid_road_graph_snapshots.sql`  
Staða: skrifuð en **ekki keyrð**.

- Schema: bætir við einni metadata-töflu og tveimur service-role-only RPC
  functions.
- Storage: býr til/tryggir private bucket með 50 MiB compressed object limit.
- RLS/grants: RLS er enabled; `PUBLIC`, `anon` og `authenticated` fá engin
  table/function réttindi; aðeins `service_role` fær aðgang.
- Auth/notendagögn: engin áhrif á Supabase Auth. Engar persónulegar ferðir,
  heimilisföng, veðurstillingar eða user IDs eru geymd.
- Production: engin breyting var framkvæmd af Codex.
- Recovery: promote RPC getur sett retained retired snapshot aftur active.
  Migration inniheldur einnig teardown-leiðbeiningar, en drop á ekki að keyra
  nema með sérstöku samþykki og staðfestu rollback-plani.

## Örugg rollout-röð

1. Stebbi/Claude Code rýnir migration og kóða.
2. Stebbi keyrir `sql/92_teskeid_road_graph_snapshots.sql` í réttum Supabase
   environment. Þetta breytir schema og Storage og á ekki að keyra kæruleysislega.
3. Deploya kóðanum með candidate flag enn lokað fyrir almenna notendur.
4. Ef prewarm á að keyra áður en candidate flag er virkt, setur Stebbi
   `TESKEID_ROAD_GRAPH_REFRESH_ENABLED=true` sjálfur. Annars dugar virkt global
   candidate flag fyrir daglega refresh eftir bootstrap.
5. Innskráður admin keyrir eitt bootstrap:
   `POST /api/admin/weather/refresh-road-graph`.
6. Staðfesta í Supabase að nákvæmlega ein metadata-röð sé `active`, að golden
   pass/total séu jöfn og að private Storage object sé til. Ekki opna bucket
   public.
7. Prófa candidate-flæði fyrir einn flaggaðan notanda. Per-user flag og global
   `TESKEID_ROUTE_CANDIDATE_ENABLED` halda áfram að gilda.
8. Fyrst eftir það má víkka user rollout.

Ef kóði fer út áður en migration/active snapshot er til, failar Teskeiðar-
candidate closed sem unavailable; Google-flæðið á að halda áfram. Admin/cron
refresh skilar þá öruggri villu þar til migration er komin.

## Localhost checks for Stebbi

Forsenda: localhost notar Supabase environment þar sem Stebbi hefur sjálfur
keyrt migration 92. Dev server er áfram keyrður/stýrður af Stebba.

1. Innskrá sem Teskeið-admin og opna localhost `/auth-mvp/vedrid`.
2. Í browser console á sama origin má keyra eitt bootstrap þegar ætlunin er að
   skrifa snapshot og sækja lifandi Vegagerðargögn:
   `fetch('/api/admin/weather/refresh-road-graph', { method: 'POST' }).then(r => r.json())`
3. Vænt: `status: "ok"` við fyrsta bootstrap, eða `status: "skipped"` með
   `reason: "unchanged"` síðar. `already_running` er eðlilegt ef lease er virk.
4. Staðfesta í Supabase dashboard/read-only query að ein röð sé active, engin
   building-röð sitji eftir og golden pass sé jafnt total. Staðfesta að object
   sé í private bucket og ekki public URL.
5. Með global og per-user candidate flags virkum: reikna leið, biðja um fleiri
   Teskeiðarleiðir og staðfesta að leið komi án live-provider timeout í
   notendabeiðninni.
6. Endurtaka strax: sama active snapshot á að endurnýtast og svara hratt.
7. Slökkva per-user flag eða global flag og staðfesta að Teskeiðarvalið sé falið
   en Google-flæði virki áfram.
8. Helstu regressions: 401/403 á candidate endpoint, cold `route_unavailable`
   þrátt fyrir active snapshot, mismunandi route niðurstaða frá sömu inputs,
   eða Storage bucket sem hefur óvart orðið public.

Varúð: admin bootstrap er ekki read-only. Það sækir lifandi provider-gögn og
skrifar metadata og Storage object í Supabase environmentinu sem localhost
vísar á. Ekki keyra það gegn production eða ítrekað nema það sé meðvitað val.

## Route intelligence check

- Breytingin snertir allan provider-neutral Íslandsgrafkjarnann, ekki eina
  tiltekna leið eða Google-specific UI.
- Raw official Vegagerðarsegment eru snapshot-uð; engar notendaleiðir eru
  geymdar og því verður ekki til privacy-sensitive route history.
- `IcelandRoadmap.md` var uppfært með LKG ownership, refresh og rollback.
- Weather UI er áfram consumer, en snapshot/runtime kjarninn er í
  `lib/iceland-routes/` og getur nýst öðrum Teskeiðar-consumers.

## Hvað var ekki gert

- SQL migration var ekki keyrð.
- Engin Supabase-, Storage-, production-, env- eða secret-breyting var gerð.
- Ekkert var commit-að, push-að eða deployað.
- Dev server var hvorki ræstur né endurræstur.
- Raunveruleg snapshot-stærð, live fetch-tími og bootstrap gegn Supabase voru
  ekki mæld; það krefst meðvitaðrar external write/fetch keyrslu Stebba.
- Ný hugmynd Stebba um að sýna öll gildi dagsins og fletta aftur í retained
  forecast history var greind en ekki framkvæmd; hún er sér data/API/UI scope.

## Áhætta sem er enn til staðar

- Fyrsta bootstrap er nauðsynlegt. Án active snapshot failar cold runtime closed.
- Vercel function hefur 300 sekúndna max duration, Storage 50 MiB compressed
  limit og runtime 100 MiB uncompressed bound. Raunpayload þarf að staðfesta.
- Warm process getur haldið áfram á eldra staðfestu snapshot í allt að fimm
  mínútur eftir promotion eða retry failure. Það er viljandi availability/
  consistency tradeoff.
- Full suite/build warnings eru til frá fyrri kóða; engin þeirra varð error.

## Ákvarðanir Codex

- Full snapshot strax, ekki in-process provider cache eða stytta leið.
- Private immutable Storage object + transactional metadata fremur en stórt
  JSONB payload.
- Service-role-only refresh/read; enginn client aðgangur þó source gögnin séu
  opinber.
- Golden routes og count/connectivity gates áður en promotion er leyft.
- Keep 2 retired snapshots til rollback og fail closed á cold start.
- Dagleg refresh er næg fyrir vegagrunn; user requests mega aldrei triggera live
  refresh.

## Tillaga að næsta skrefi

Claude Code geri production-minded code/SQL review á þessu handoffi og
breytingunum, sérstaklega migration idempotency, Storage cleanup, atomic
promotion/rollback og cold/warm failure semantics. Að review loknu keyrir
Stebbi migration og localhost bootstrap/prófanir samkvæmt rollout-röðinni.

Eftir það ætti sérstakt plan að taka fyrir „dagurinn í dag + bounded history“ í
spátöflunni. Þar þarf fyrst að samræma Veðurstofu- og met.no history contract,
ekki aðeins breyta dagsetningarfilteri í UI.

## Spurningar sem Claude Code á sérstaklega að rýna

1. Eru function grants/RLS og skortur á `storage.objects` client policies rétt
   afmörkuð miðað við núverandi Supabase policies verkefnisins?
2. Er update-then-upload-then-ready cleanup öruggt í öllum crash-gluggum?
3. Er rollback með promotion á retained `retired` snapshot fullnægjandi og
   atomic?
4. Eru 20 mínútna lease, 50 MiB compressed og 100 MiB uncompressed mörk
   raunhæf fyrir fyrsta payload?
5. Er fimm mínútna warm LKG retry-backoff rétt availability tradeoff?

## Óvissa / þarf að staðfesta

Confidence: high fyrir kóðaflæði og staðbundin próf; medium-high fyrir live
operational mörk þar til fyrsta raun-bootstrap hefur mælt payload og tíma.
Núverandi external Storage policies og raunpayload eru ekki sannreynd með
production aðgangi.
