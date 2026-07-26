# TODO #90 — Rýni á v002 og næsti tæknilegi áfangi

Created: 2026-07-25 23:23  
Timezone: Atlantic/Reykjavik

## Findings — raðað eftir alvarleika

### High — `void` tryggir ekki að shadow-vinnan klárist í serverless

`app/api/teskeid/weather/travel/route.ts:343-351` ræsir promise með `void` en
skráir það ekki hjá lifecycle primitive. Serverless invocation getur lokið eða
fryst eftir að response er sent. Þetta virkar líklega með núverandi provider af
því hann hefur enga raunverulega I/O bið, en er ekki traustur grunnur fyrir
framtíðar routing engine, network request eða telemetry.

Next.js 15.1.4 í repo styður stable `after()` frá `next/server`; samkvæmt
opinberum Next.js docs byggir serverless stuðningurinn á `waitUntil`, sem lengir
líftíma invocation þar til skráð promise hefur settled:
https://nextjs.org/docs/app/api-reference/functions/after

**Krafa fyrir næsta áfanga:** færa scheduling í `after(() =>
runIcelandRoutingShadow(...))` eða einangraðan wrapper sem notar `after`. Ekki
bara `void promise`.

### High — corridor fixture getur fullyrt ranga leið og gefur ósamanburðarhæfar tölur

`lib/iceland-routes/teskeidRoutingProvider.server.ts:54-60,65-86` samþykkir
uppruna innan 120 km frá Reykjavík og áfangastað innan 80 km frá síðasta
waypoint. Geometry og distance eru síðan öll corridor-waypoints, án actual
origin/destination legs (`:89-94,111-123`).

Dæmi úr prófinu: Akureyri er samþykkt sem áfangastaður fyrir family sem endar á
Húsavík. Niðurstaðan teiknar/reiknar áfram til Húsavíkur og sleppir actual
origin/destination tengingum. Slíka tölu má ekki bera saman við Google distance
eða duration eins og hún sé route-quality mæling.

**Krafa:** næsta telemetry má aðeins mæla `matched_family`/`no_match` þar til
fixture contractið hefur sérstakt `resultKind: 'corridor_fixture'` og útilokar
distance/duration comparison. Eða þrengja fixture að nákvæmri, staðfestri
route-family fixture með endpoint legs og golden expected ranges.

### High — villuboð innihalda nákvæm ferðahnit

`lib/iceland-routes/teskeidRoutingProvider.server.ts:103-108` setur origin og
destination hnit í thrown error. Shadow runnerinn skilar `error` áfram í outcome
(`routingShadow.server.ts:53-56`). Um leið og `onOutcome` logging er bætt við er
auðvelt að leka ferðum notenda í server logs.

**Krafa:** provider failure verður stable error code, t.d.
`no_corridor_fixture`, án hnita, labels, heimilisfangs eða place ID. Logger má
aðeins lesa allowlistað summary, aldrei serializa `error`, request eða result
óhreinsað.

### Medium — `onOutcome` getur sjálft rofið failure containment

`routingShadow.server.ts:48-56` kallar `onOutcome` inni í `try`. Ef callback
kastar eftir success fer control í `catch`, sem kallar sama callback aftur. Ef
seinna kallið kastar rejectar runnerinn þrátt fyrir loforð um að gleypa shadow
villur.

**Krafa:** callback skal vera sérstaklega varið, aðeins kallað einu sinni og
callback-villa má hvorki endurflokka provider success né rejecta runner.

### Medium — v002 lýsir hnitasannprófun of sterkt

Í v002 segir að `originCandidate`/`destCandidate` séu „staðfest af Google
provider“. Í `travel/route.ts:276-293` eru þau smíðuð beint úr request body.
Fyrri validation staðfestir íslensk bounds og gerð, ekki að Google hafi
sannreynt staðinn.

**Krafa:** skjöl og comments segi `validated Icelandic coordinates from the
confirmed-place request contract`, ekki Google-verified.

### Medium — shadow metur alltaf fólksbíl

`travel/route.ts:349` hardcode-ar `vehicleProfile: 'car'` þó endpointinn hafi
þegar `trailerKind` og thresholds. Þetta verður rangt þegar markmiðið er að
forðast malar-/fjallvegi fyrir hjólhýsi og húsbíla.

**Krafa:** bæta við pure mapping úr núverandi trailer kind í routing profile,
með tests. Fyrsti fasi má styðja `car` og `caravan`; óþekkt gildi faila í `car`
aðeins ef það er skjalfest og ekki notað til safety fullyrðinga.

### Medium — engin integration-prófun ver primary response

Provider- og runner-unit tests eru græn, en ekkert próf staðfestir að travel API:

- kalli aldrei provider þegar flagg er off,
- skili sömu response/status þegar shadow kastar,
- schedule-i nákvæmlega einu sinni þegar flagg er on,
- serializi aldrei shadow-result í client response.

Þetta er mikilvægasta regression-vörnin fyrir „engin notendaáhrif“ kröfuna.

### Low — canonical roadmap er nú rangur

`IcelandRoadmap.md:285-288` segir að runnerinn sé ekki tengdur route API og að
provider stub sé næsta skref. v002 hefur gert bæði. Uppfæra eftir að blockerarnir
eru leystir, ekki áður.

## Niðurstaða rýni

Provider experimentið er gagnlegt sem end-to-end wiring proof og unit tests eru
góð byrjun. Það er ekki tilbúið til að kveikja á shadow flagginu, hvorki local
með raunbeiðnum né í Vercel, fyrr en lifecycle, privacy og false-comparison
blockerarnir að ofan eru leystir.

## Næsti afmarkaði framkvæmdaráfangi fyrir Claude Code

Claude Code á fyrst að rýna findings. Ef engin blocking spurning vaknar og
Stebbi gefur afmarkað framkvæmdarleyfi/`Workflow`, framkvæma aðeins eftirfarandi:

1. Bæta við server-only scheduler sem notar stable `after()` frá `next/server`.
2. Láta travel route schedule-a shadow aðeins þegar flaggið er exact `true`;
   flagg off á ekki einu sinni að smíða provider/request að óþörfu.
3. Skipta hnitaberandi error út fyrir stable, privacy-safe failure code.
4. Herða `onOutcome` þannig að callback sé one-shot og non-throwing gagnvart
   runner contractinu.
5. Bæta við privacy-safe allowlistuðu diagnostic summary:
   - status,
   - provider ID,
   - routeFamilyId ef match,
   - resultKind=`corridor_fixture`,
   - execution duration bucket eða integer ms ef engin privacy áhætta,
   - aldrei hnit, labels, addresses, place IDs, raw error eða geometry.
6. Ekki logga eða bera saman fixture distance/duration við Google enn.
7. Mappa `trailerKind` í routing vehicle profile með pure helper og tests.
8. Bæta við route-level integration tests fyrir flag off, success og failure.
9. Uppfæra `IcelandRoadmap.md` og README í samræmi við raunverulega stöðu.

## Explicit non-goals næsta áfanga

- Engin UI eða aukaleið sýnileg notanda.
- Engin routing-engine uppsetning.
- Engin open-data ingestion.
- Engin Supabase, migration eða varanleg telemetry.
- Engin production env breyting eða Vercel flag activation.
- Enginn commit, push eða deployment nema Stebbi samþykki sérstaklega.

## Prófanir sem Claude Code á að keyra

- Ný targeted scheduler/logger/integration tests.
- `npm run test:run -- lib/__tests__/teskeid-routing-provider.test.ts lib/__tests__/iceland-routing-shadow.test.ts <ný test-skrá>`
- `npm run type-check`
- `git diff --check`

Full suite/build má bíða þar til áfanginn er rýndur, nema breytingin rekist á
breið shared contracts.

## Prófanir sem Codex keyrði í þessari rýni

- Targeted routing tests: exit 0; 2 files, 13 tests passed.
- `npm run type-check`: exit 0.

## Route intelligence check

1. Snertir fjórar capital route families, sérstaklega north-family þar sem
   Akureyri/Húsavík sýnir false-match vandann.
2. Provider contract, fixture og scheduler eiga heima í `lib/iceland-routes/`;
   route-handler wiring á heima í travel API.
3. Contractið er provider-neutral, en current fixture er corridor-specific og
   má ekki dulbúast sem full route.
4. Næsti áfangi þarf `resultKind`, privacy-safe failure code, vehicle mapping og
   integration fixtures; canonical segments bíða open-data/graph áfanga.
5. Engin persistence er nú, en error-textinn er privacy-risk um leið og logging
   bætist við.
6. Google geometry er ekki vistuð. Ekki bæta við comparison persistence eða raw
   Google-derived logs.
7. Roadmap þarf uppfærslu eftir hardening.

## Localhost checks for Stebbi

Ekki kveikja á `TESKEID_ROUTING_SHADOW_ENABLED` enn. Núverandi code path er
ósýnilegur en background lifecycle er ekki tryggður og niðurstaðan gefur engar
traustar comparison tölur.

Eftir næsta hardening-handoff:

1. Opna `/vedrid` sem public og innskráður notandi.
2. Reikna Reykjavík → Akureyri og óstudd route.
3. Með flagg off: engin shadow diagnostics; primary response óbreytt.
4. Með flagg on á localhost: eitt privacy-safe diagnostic per final travel
   calculation; engin hnit/nöfn í loggi; primary UI og response óbreytt.
5. Prófa hjólhýsi og venjulegan bíl; diagnostic sýnir rétt vehicle profile.
6. Shadow failure má ekki breyta status, loader, route, veðurgögnum eða UI.

Engin Supabase/production gögn eiga að snertast í þessum checks. Production
flag activation krefst sérstaks samþykkis.

## Óvissa / þarf að staðfesta

- Hvort diagnostic eigi að nota `console.info` tímabundið eða existing sanitized
  usage pipeline þarf ákvörðun; ráðlegging núna er structured server log án DB.
- `after()` er rétta Next.js primitive miðað við repo Next 15.1.4 og opinber docs,
  en þarf integration test/mocking pattern í þessu repo.
- Confidence: high á lifecycle/privacy findings; high á false-comparison issue;
  medium á nákvæmri logging-lendingu þar til existing observability er valin.

