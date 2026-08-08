# TODO #090 v193 — Samfélagið, admin-ábyrgð og V4 production rollout

## Plan áfangans

Afmarka v193 við vandamálin sem komu í ljós eftir v192:

1. Opna `Samfélagið` í kortasýn með færsluyfirliti, ekki sjálfkrafa í ritli.
2. Sýna ótvíræð success-skilaboð eftir samfélagsathugasemd og einkarábendingu.
3. Gefa Teskeiðaradmin öruggt yfirlit yfir einkarábendingar.
4. Bæta við admin-varðri leið til að keyra núverandi fail-closed road-graph refresh og virkja V4 aðeins þegar allar golden-route staðfestingar standast.
5. Gefa aðeins út routing- og Samfélagsbreytingar; halda Kviss/Auglýsanda og öðrum dirty breytingum utan release.

## Hvað var gert

- Heitinu `Frá fólkinu` var breytt í `Samfélagið` á íslensku og `Community` á ensku.
- Samfélagshliðin opnast nú map-first. Kortið er sýnilegt og virkt fyrir utan lágmarks botn-/hliðarspjald, en ritill opnast aðeins eftir skýra aðgerð notanda.
- Bætt var við `Bæta við athugasemd`, `Senda ábendingu` og `Hætta við` aðgerðum.
- Eftir 201 svar birtast skýr, tegundarsértæk success-skilaboð; færslan er endursótt og staðankeri fær fókus ef hann er til staðar.
- Ný admin-varin GET leið og admin-hluti sýna einkarábendingar með höfundi, tíma, leiðarsamhengi og staðarheiti.
- Nýr admin-hluti keyrir núverandi `/api/admin/weather/refresh-road-graph`. Endpointið er áfram varið með `requireAdmin`, keyrir fail-closed validation og varðveitir eldri active snapshot ef eitthvað bregst.
- `.env.example` skjalfestir production writer-flaggið `TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED`.
- Sanitized refresh-logg sýnir snapshot/policy/teljara en engin secrets, leiðargögn eða notendagögn.
- Engin SQL var skrifuð eða keyrð. SQL118 var þegar keyrt og staðfest af Stebba fyrir v192.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `app/api/admin/weather/refresh-road-graph/route.ts`
- `app/api/auth-mvp/map-notes/route.ts`
- `lib/iceland-routes/roadGraphRefresh.server.ts`
- `lib/map-notes/contracts.ts`
- `lib/map-notes/repository.server.ts`
- `lib/teskeid/admin-auth.ts`
- viðeigandi v192/v190 routing-, map-note- og admin-próf

## Skrár sem voru breyttar

- `.env.example`
- `app/(admin)/admin/page.tsx`
- `app/api/admin/map-notes/route.ts` (ný)
- `components/teskeid/MapFeedbackAdminSection.tsx` (ný)
- `components/teskeid/RoadGraphAdminSection.tsx` (ný)
- `components/weather/MapNotesPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/admin-page.test.tsx`
- `lib/__tests__/map-notes-admin-api.test.ts` (ný)
- `lib/__tests__/map-notes-contracts.test.ts`
- `lib/iceland-routes/roadGraphRefresh.server.ts`
- `lib/map-notes/repository.server.ts`
- `messages/is.json`
- `messages/en.json`
- þessi handoff-skrá

## Skipanir og niðurstöður

- `npm.cmd run type-check` — exit 0.
- `npm.cmd run test:run -- lib/__tests__/road-graph-refresh.test.ts lib/__tests__/map-notes-contracts.test.ts lib/__tests__/admin-page.test.tsx lib/__tests__/map-notes-admin-api.test.ts --reporter=dot` — exit 0, 4 skrár og 63 próf.
- `npm.cmd run test:run -- --exclude ".tmp/**" --exclude "lib/__tests__/bookkeeping-sql98-migration.test.ts" --exclude "lib/__tests__/expense-persistence-migration.test.ts" --reporter=dot` — exit 0.
- `npm.cmd run lint` — exit 0; aðeins fyrirliggjandi warnings.
- `npm.cmd run build` með tímabundnum public Supabase placeholder-gildum — exit 0, 130 síður myndaðar; engin `.env.local`-lesning eða gagnatenging.
- `git diff --check` — exit 0; aðeins line-ending warnings á Windows.

## Það sem mistókst eða var sleppt

- Tvö fyrirliggjandi SQL95 fixture-próf voru undanskilin fullu runni: `bookkeeping-sql98-migration.test.ts` og `expense-persistence-migration.test.ts`. Þau bila þegar á hreinu `origin/main` og tengjast ekki v193.
- Dev server og browser voru ekki ræst eða stjórnað.
- Engin SQL, Supabase migration eða gagnabreyting var keyrð.
- Engar Kviss/Auglýsanda breytingar voru teknar með.
- Engin óvarin cron-/refresh-framhjáleið var búin til. V4 er virkjað með núverandi admin-varða refresh-endpointinu eftir deployment.

## Ákvarðanir og öryggismörk

- Kortasýn er primary state; composer er explicit secondary state. Þetta fylgir mobile app-reglum í `Design.md`, heldur kortinu sýnilegu og varðveitir innri scroll.
- Einkarábendingar eru aðeins lesnar server-side eftir `requireAdmin`; browser fær afmarkað DTO en engin auth-id eða óþarfa metadata.
- V4 writer er tvöfalt varinn: fail-closed production env flagg og admin/cron refresh. Reader-færni var þegar komin í v192.
- Refresh publish-ar aðeins snapshot sem stenst schema, topology receipt, LKG og 23/23 golden-route gates. Eldri snapshot helst virkt við bilun.

## Eftirstandandi áhætta

- V4 activation sækir lifandi opinber Vegagerðargögn. Source-drift eða tímabundin bilun getur gert refresh rautt, en á þá ekki að breyta active snapshot.
- Admin-yfirlitið er einfaldur newest-first MVP listi án resolved/triage workflow.
- Staðfesting á Reykjavík → Þingeyri þarf production browserpróf eftir að V4 snapshot hefur verið virkjað.

## Tillaga að næsta skrefi

Eftir push/deploy skal setja production flaggið nákvæmlega á `true`, opna `/admin` sem Teskeiðaradmin og ýta einu sinni á `Uppfæra og virkja V4 leiðagrunn`. Aðeins grænt 23/23 svar telst virk V4 útgáfa. Síðan skal prófa Reykjavík → Þingeyri og einkarábendingaflæðið á production.

## Spurningar sem Codex á sérstaklega að rýna

- Staðfestir production refresh V4 policy fingerprint og 23/23 golden routes?
- Er Reykjavík → Þingeyri Teskeiðarleiðin í gegnum Hólmavík og án afturhvarfs á varasama kaflann?
- Birtist success strax eftir ábendingu og kemur sama færsla fram í admin-yfirliti?

## Supabase / SQL áhrif

- Engin ný migration.
- Engin SQL keyrsla.
- Engin breyting á RLS, grants, policies, auth eða functions.
- Admin-lestrarleið notar fyrirliggjandi service-role repository eingöngu eftir `requireAdmin`.

## Production configuration

- `TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED=true` var sett í Vercel production environment með `vercel env add ... --force` — exit 0.
- Engin önnur environment-breyta var lesin eða breytt.
- Flaggið eitt virkjar ekki snapshot; admin-varinn refresh eftir deployment þarf enn að standast öll publication-gates.

## Localhost checks for Stebbi

1. Opnaðu `http://localhost:3004/auth-mvp/vedrid` innskráður.
2. Ýttu á `Samfélagið`. Vænt: kortið helst sýnilegt og listi/leitarstýringar sjást; ritill er lokaður.
3. Ýttu á `Bæta við athugasemd`, veldu stað og sendu. Vænt: græn staðfesting birtist, ritill lokast og athugasemdin kemur í listann/kortið.
4. Í leiðarvali ýtirðu á `Láttu okkur endilega vita hvað Teskeiðarleiðarkerfið gæti gert betur`, sendir ábendingu og sérð skýra staðfestingu um að hún hafi borist Teskeið.
5. Opnaðu `http://localhost:3004/admin` sem admin. Vænt: `Ábendingar úr Samfélaginu` sýnir nýju einkarábendinguna með frá/til þegar hún kom úr leiðarvali.
6. Staðfestu á 360, 390 og desktop breidd að spjaldið skrollar sjálft, kortið er sýnilegt og lokatakki aðgengilegur.
7. Ekki ýta á V4 refresh á localhost gegn production-tengdu umhverfi. Production activation skal aðeins gerð eftir afmarkað deployment og með staðfestu production flaggi.
