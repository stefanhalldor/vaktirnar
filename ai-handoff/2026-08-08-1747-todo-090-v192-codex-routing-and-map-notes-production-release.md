# TODO #090 v192 — routing og „Frá fólkinu“ production release

## Plan áfangans

Gefa aðeins út samþykktar routing-breytingar og samfélagsathugasemdirnar „Frá fólkinu“. Kviss, Auglýsandi, live-studio, admin-flögg og SQL 115–117 eru sérstaklega utan útgáfunnar.

## Hvað var gert

- Routing-kjarninn fékk versionaða V3/V4 topology-policy, örugg receipt-/graph-boundary, afturvirka runtime-materialiseringu og almenn golden-route promotion-gates.
- Teskeiðarleið um Hólmavík er eigin Teskeiðarleið, ekki merkt eða breytt Google-leið. Hún varðveitir undirritaða leiðarsönnun og nákvæma edge-röð í route-sections.
- Malarkaflar eru endursmíðaðir úr nákvæmum signed route-edge gögnum; retry/loading texti gefur vinnslunni tíma í stað þess að gefa til kynna tafarlausa niðurstöðu.
- Leiðarfilterar og Vegagerðarstöðvar nota samræmda, nákvæma stöðufiltera; full zoom sýnir eligible stöðvar á eigin hnitum.
- Kortspjall var endurnýtt sem staðbundnar samfélagsathugasemdir og einkarábendingar til Teskeiðar, með staðaleit, kortavali, núverandi staðsetningu og „Óháð staðsetningu“.
- Header-heitið er „Frá fólkinu“ / “From people”.
- Map-note API notar almennan same-origin JSON-mutation helper og hefur engin Kviss-tengsl.
- SQL118 var ekki keyrt af Codex. Stebbi keyrði migration og sendi græna postflight niðurstöðu: anchor/closed-scope/message/RLS checks `true`, browser grants/policies og violations `0`.

## Skrár skoðaðar og breyttar

Routing/API/UI/docs:

- `IcelandRoadmap.md`
- `app/api/teskeid/weather/travel/route-candidate/route.ts`
- `app/api/teskeid/weather/travel/route-sections/route.ts`
- `components/weather/PlaceSearch.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RouteSelectionStep.tsx`
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/goldenRoutes.ts`
- `lib/iceland-routes/roadGraph.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts`
- `lib/iceland-routes/roadGraphCandidateV2.ts`
- `lib/iceland-routes/roadGraphRefresh.server.ts`
- `lib/iceland-routes/roadGraphRuntimeMaterialization.ts`
- `lib/iceland-routes/roadGraphSnapshotFormat.ts`
- `lib/iceland-routes/roadGraphTopologyReconciliation.ts`
- `lib/iceland-routes/routeAssessmentCandidateEvidence.server.ts`
- `lib/iceland-routes/routeAssessmentRoadAnchor.server.ts`
- `lib/iceland-routes/routeOptionEnvelope.server.ts`
- `lib/iceland-routes/routeOptionEvidence.server.ts`
- `lib/iceland-routes/vegagerdinRoadGraphTopology.ts`
- `lib/weather/freeDriveMapPresentation.ts`
- `lib/weather/google.server.ts`
- `lib/weather/routeCautionConstants.ts`
- `lib/weather/routeCautions.ts`

„Frá fólkinu“ / chat-kjarni / SQL:

- `app/api/auth-mvp/map-notes/route.ts`
- `components/chat/ScopedChatComposer.tsx`
- `components/weather/MapNotesPanel.tsx`
- `lib/chat/repository.server.ts`
- `lib/chat/types.ts`
- `lib/map-notes/contracts.ts`
- `lib/map-notes/repository.server.ts`
- `lib/security/sameOrigin.server.ts`
- `sql/118_map_notes_chat_context.sql`
- `sql/validation/118-map-notes/README.md`
- `sql/validation/118-map-notes/preflight.sql`
- `sql/validation/118-map-notes/postflight.sql`
- `sql/validation/118-map-notes/recovery.sql`
- `messages/is.json`
- `messages/en.json`

Próf:

- `components/chat/__tests__/ScopedChatComposer.test.tsx`
- `lib/__tests__/free-drive-map-presentation.test.ts`
- `lib/__tests__/map-notes-api.test.ts`
- `lib/__tests__/map-notes-contracts.test.ts`
- `lib/__tests__/place-search-ui.test.tsx`
- `lib/__tests__/road-graph-akranes-real-artifact.test.ts`
- `lib/__tests__/road-graph-assessment-candidate.test.ts`
- `lib/__tests__/road-graph-candidate-v2.test.ts`
- `lib/__tests__/road-graph-holmavik-real-artifact.test.ts`
- `lib/__tests__/road-graph-refresh.test.ts`
- `lib/__tests__/road-graph-runtime-cache.test.ts`
- `lib/__tests__/road-graph-snapshot-format.test.ts`
- `lib/__tests__/road-graph-topology-integration.test.ts`
- `lib/__tests__/road-graph-topology-reconciliation.test.ts`
- `lib/__tests__/road-map-free-drive-ui.test.ts`
- `lib/__tests__/road-map-route-loading-ui.test.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/route-option-envelope.test.ts`
- `lib/__tests__/route-option-evidence.test.ts`
- `lib/__tests__/vegagerdin-road-graph-topology.test.ts`
- `lib/__tests__/weather-google.test.ts`
- `lib/__tests__/weather-route-candidate-api.test.ts`
- `lib/__tests__/weather-route-cautions.test.ts`
- `lib/__tests__/weather-route-sections-api.test.ts`

## Skipanir og niðurstöður

- `npm run type-check` — exit 0.
- `npm run lint` — exit 0; aðeins fyrirliggjandi warnings.
- `npm run test:run -- --exclude ".tmp/**"` í aðal dirty worktree — exit 1, 5557 pass / 1 unrelated Kviss/Auglýsandi menu failure. Þetta staðfesti að útilokaða vinnan mátti ekki fara með.
- Hrein release-svíta án tveggja fyrirliggjandi SQL95 fixture-prófa: `npm run test:run -- --exclude ".tmp/**" --exclude "lib/__tests__/bookkeeping-sql98-migration.test.ts" --exclude "lib/__tests__/expense-persistence-migration.test.ts" --reporter=dot` — exit 0.
- Markpróf fyrir Hólmavík/evidence/route-sections/map-notes/chat — exit 0, 32 pass / 1 local-artifact skip.
- UI source-contract markpróf — exit 0, 74/74.
- `npm run build` án env — exit 1 við `supabaseUrl is required`; engin secret lesin.
- `npm run build` með staðbundnum placeholder Supabase-gildum í minni, innan sandbox — exit 1 vegna lokaðs Google-font netaðgangs.
- Sama build utan net-sandkassa, aðeins read-only Google-font fetch — exit 0, 129 static pages.
- `git diff --check` — exit 0.
- Scope-audit — engar Kviss/Auglýsandi/live-studio/SQL115–117/admin/middleware/TeskeidMenu skrár og engin `lib/kviss` import í map-notes.

## Hvað var sleppt

- Kviss, Auglýsandi, live-studio, admin per-user flags og SQL115–117.
- Engin SQL var keyrð af Codex.
- Engin `.env.local` eða secrets voru lesin.
- Engin production-gögn voru skrifuð í staðfestingu.
- Local real-artifact prófið skippar ef offline artifact er ekki til í einangraða release-trénu; það hafði áður verið staðfest í routing-hotfix vinnunni.
- Tveir baseline SQL95 fixture-prófar eru ekki keyranlegir úr hreinu `origin/main` án ótengdra, ócommittaðra SQL95-vinnuskráa og voru því afmarkað útilokaðir.

## Ákvarðanir og áhætta

- Production push verður non-force beint úr einangraða release-commitinu til `main`, svo dirty aðalvinnutré Stebba og ótengd vinna varðveitast.
- V3/V4 routing reader/writer rollout er fail-closed og varðveitir eldri fingerprints. Production refresh/activation þarf áfram núverandi feature-/cron-gates; þessi útgáfa á ekki að handvirkt keyra cron eða SQL.
- Opinber route og map-notes smoke-prófun eftir deploy er read-only. Full notendaprófun samfélagsathugasemda skrifar notendagögn og er því Stebba-test eftir útgáfu.

## Næsta skref

1. Commit-a aðeins skráðar skrár.
2. Push-a non-force á `origin/main`.
3. Bíða eftir grænu Vercel production deploymenti.
4. Keyra read-only production smoke og senda Stebba meil þegar hægt er að skoða á raun.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` innskráður og velja Reykjavík → Þingeyri.
2. Staðfesta að ein Teskeiðarleið heiti „Gegnum Hólmavík“, fari norður fyrir Hólmavík og að Google-leið beri enga Teskeiðarmerkingu.
3. Velja Hólmavíkurleiðina og sækja malarkafla. Staðfesta skýrt loading-state og að 8,6 km malarkaflinn birtist þegar vinnslu lýkur.
4. Opna „Frá fólkinu“. Staðfesta desktop-scroll, staðaleit, sýnilegt „Leita á korti“, núverandi staðsetningu og „Óháð staðsetningu“.
5. Senda samfélagsathugasemd og einkarábendingu til Teskeiðar. Staðfesta að samfélagsfærsla sjáist í straumi/korti en einkarábending birtist ekki öðrum.
6. Prófa 360/390/460 px og desktop: enginn láréttur overflow, input minnst 16 px, sýnilegt pending/focus feedback.
7. Prófa ekki production með viðkvæmum texta. Athugasemdir eru notendagögn; hreinsa aðeins með samþykktu admin/recovery-ferli ef þarf.

## Production checks eftir deploy

- Vercel deployment verður að vera `Ready` fyrir commit SHA útgáfunnar.
- Read-only HTTP smoke á production forsíðu og veðurroute verður að skila væntum 2xx/redirect, ekki 5xx.
- Stebbi staðfestir síðan sjónrænt Hólmavíkurleið, malarkafla og „Frá fólkinu“ á raun.
