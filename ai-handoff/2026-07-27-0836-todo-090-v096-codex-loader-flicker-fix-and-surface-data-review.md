# TODO-090 v096 — Loader-blikk lagfært og slitlagsgögn rýnd

Created: 2026-07-27 08:36  
Timezone: Atlantic/Reykjavik

## Samþykkt og plan

Stebbi samþykkti að Codex fjarlægði summary-leiðarspjöld úr first-ready millistigi áður en stóra leiðakortið opnast. Stebbi bað einnig um greiningu á því hvort opinber gögn geti minnkað óstaðfest slitlag án ágiskunar.

## Hvað var gert

- `isRouteLoading && firstReadyRouteChoice` sýnir nú aðeins provider-ready texta og canonical Teskeið-loader.
- `renderRouteSurfaceChoices()` var fjarlægt úr þessu millistigi. Summary-spjöld birtast því ekki áður en fullscreen-kortið opnast.
- Bætt var við regression-prófi sem tryggir að loading-greinin kalli ekki á route-choice renderer.

## Slitlagsgreining

Núverandi importer tengir slitlagsfærslur við topology-kafla með `IDKAFLI`. Ef fleiri en eitt `GERD_SL` gildi finnast fyrir kaflann verður allur kaflinn `mixed`; ef engin samsvörun finnst verður hann `unknown`.

Opinbera Vegagerðar-lagið býður upp á sannleiksríkari leið:

- `GERD_SL` er coded domain með aðeins `0 = Möl` og `1 = Bundið`.
- Hver slitlagsfærsla inniheldur `UPPH_STOD`, `ENDA_STOD`, `SLITLAGLENGD` og eigin línugeómetríu.
- Núverandi fetch-listi sækir ekki `UPPH_STOD` eða `ENDA_STOD` og normalizer nýtir hvorki stöðvabil né slitlagsgeómetríu.

Mælt næsta skref er því að linear-reference-skipta canonical vegkaflanum eftir opinberum `UPPH_STOD`/`ENDA_STOD` bilum og úthluta `GERD_SL` á undirsegment. Það minnkar `mixed` án þess að giska. Surface geometry má nota til sannprófunar/map-matching, en ekki sem einan topology-grunn fyrr en samfelldni hefur verið sannreynd.

Áður en slíkt er framkvæmt ætti read-only audit að sundurliða óvissuna í:

1. vegkaflar án samsvarandi `IDKAFLI` í slitlagslagi,
2. kaflar með fleiri en einu opinberu slitlagi sem nú verða `mixed`,
3. ólögleg/tóm `GERD_SL` gildi,
4. stöðvabil sem ná ekki yfir allan `KAFLILENGD`, skarast eða fara út fyrir kaflann.

## Route intelligence check

- UI-lagfæringin breytir engri route-domain reglu.
- Slitlagstillagan er provider-neutral eftir import: Vegagerðin er authoritative source við boundary, en niðurstaðan verður áfram canonical `IcelandRoadGraphSegmentInput`.
- Engar persónulegar ferðir eða heimilisföng eru geymd.
- `IcelandRoadmap.md` lýsir núverandi `IDKAFLI` attribute-join rétt; það þarf uppfærslu þegar linear-referencing áfanginn er samþykktur og framkvæmdur.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md` (fyrri UI-áfangi þessa sessions)
- `IcelandRoadmap.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/iceland-routes/vegagerdinRoadGraphSource.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts`
- tengd road-graph próf
- Opinber ArcGIS layer metadata fyrir Vegir og Slitlag

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/road-map-route-loading-ui.test.ts`
- Þessi handoff-skrá

## Skipanir og niðurstöður

- `npm run test:run -- lib/__tests__/road-map-route-loading-ui.test.ts lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/iceland-road-graph.test.ts` — exit 0, 29/29 próf græn.
- `npm run type-check` — exit 0.
- `git diff --check -- ...` — exit 0; aðeins LF/CRLF viðvörun.
- Read-only opnun á opinberu Vegagerðin ArcGIS schema — engin skrif eða ytri breyting.

## Ekki gert

- Engin breyting var gerð á slitlagsimporti, snapshotum eða route-reikningi.
- Engin full prófasvíta var keyrð; hún bíður útgáfuhrings samkvæmt fyrirmælum Stebba.
- Engin SQL, migration, Supabase, auth, env, commit, push, deploy eða production-breyting var gerð.

## Áhætta og næsta skref

UI-lagfæringin er lítil. Regression-prófið les source-greinina beint og ver þessa nákvæmu UX-reglu, en samþætt browser-próf væri sterkara síðar.

Linear referencing þarf sérstaklega að höndla stefnu, multipart geometry, rounding í stöðvum, eyður og skörun. Fyrst skal byggja read-only coverage audit og fixtures; síðan split-normalizer með fail-closed fallback. Ekki má breyta `mixed/unknown` í paved eða gravel á grundvelli vegflokks, F-númers eða leiðarheits.

## Localhost checks for Stebbi

1. Opnaðu `http://localhost:3004/auth-mvp/vedrid`, skráðu þig inn og reiknaðu leið sem skilar first-ready Teskeiðar- eða Google-leið.
2. Þegar textinn „Teskeiðarleið er tilbúin. Reikna veðurskilyrði…“ eða samsvarandi provider-texti birtist á loadernum eiga engin route-summary spjöld að sjást fyrir ofan loaderinn.
3. Þegar veðurgögn eru tilbúin á stóra `Veldu leið á korti` kortið að birtast beint, án þess að summary-spjaldið blikki á undan.
4. Prófaðu bæði hraða/cached leið og kaldari leið. Passaðu að loaderinn verði ekki auður og að varasöm-first leið haldi sérstöku „Leita að fleiri valkostum“ hegðuninni.
5. Lokaðu/veldu leið á stóra kortinu og staðfestu að summary-upplýsingar birtist eðlilega eftir það.

Engin localhost-athugun krefst production-, Supabase-, auth-policy-, billing-, secret- eða deployment-breytinga.
