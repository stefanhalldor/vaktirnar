# TODO-090 v097 — Fullscreen-label fjarlægt og djúp slitlagsúttekt

Created: 2026-07-27 08:42  
Timezone: Atlantic/Reykjavik

## Samþykkt og umfang

Stebbi samþykkti að fjarlægja gula `Teskeiðarleiðir fundust` status-línuna af stóra leiðakortinu og bað Codex um djúpa greiningu á því hvernig megi minnka óstaðfest slitlag án þess að segja annað en sannleikann. Stebbi bað sérstaklega um að sleppa prófkeyrslum fram að útgáfuhring.

## Hvað var gert

- Fullscreen leiðakortið sendir ekki lengur `alternativesMessage` þegar alternative-leit lýkur með `ready`.
- Lokatakkinn `Leit að fleiri leiðum lokið` og heildarfjöldi leiða halda áfram að veita nægt feedback.
- Loading, `none` og `unavailable` skilaboð halda sér vegna þess að þau veita nýjar upplýsingar.
- Regression-vænting var uppfærð en prófið var ekki keyrt samkvæmt fyrirmælum Stebba.
- Sameiginlegur þýðingarlykill `roadMapPrototypeTeskeidAlternativesFound` var varðveittur þar sem annað summary-feedback notar hann áfram.

## Djúp slitlagsúttekt

### Núverandi hegðun

`normalizeVegagerdinRoadGraphSegments()` tengir opinbert slitlagslag við canonical veglínu með `IDKAFLI`. Ef fleiri en eitt `GERD_SL` gildi finnst fyrir kaflann er allur kaflinn merktur `mixed`. Route-samantekt telur síðan alla lengd kaflans sem óstaðfesta.

Þetta er fail-closed en tapar upplýsingum: Vegagerðin veit nákvæmlega hvar innan kaflans slitlagið breytist.

### Opinber live-gögn, read-only audit 2026-07-27

- Canonical vegafærslur: 1.226
- Slitlagsfærslur: 5.514
- Tómt `GERD_SL`: 0
- `GERD_SL` utan coded domain `0 = Möl`, `1 = Bundið`: 0
- Vegkaflar án slitlagsjoin: 0
- Mixed `IDKAFLI`: 212
- Heildarlengd mixed canonical vegkafla: um 2.028,4 km
- Eyður í opinberum `UPPH_STOD`/`ENDA_STOD` slitlagsbilum: 0
- Slitlagsbil utan `KAFLISTODUPPHAF`/`KAFLISTODENDIR`: 0
- Mismunur `SLITLAGLENGD` gegn stöðvabili yfir 10 m: 0
- Mismunur `KAFLILENGD` gegn vegstöðvum yfir 10 m: 0
- Multipart canonical veglínur: 0

### Niðurstaða

Megnið af `óvíst` er ekki óþekkt í authoritative source. Teskeið er að fletja nákvæm opinber undirbil saman í eitt `mixed` gildi. Gögnin styðja örugga, deterministic linear-reference skiptingu án ágiskunar.

## Mælt framkvæmdarplan fyrir næsta áfanga

1. Bæta `KAFLISTODUPPHAF` og `KAFLISTODENDIR` í allowlist vegalagsins.
2. Bæta `UPPH_STOD` og `ENDA_STOD` í allowlist slitlagslagsins.
3. Geyma fulla ordered surface-interval samantekt fyrir hvert `IDKAFLI`, ekki aðeins `Set<surface>`.
4. Staðfesta fyrir hvert road feature:
   - continuous coverage frá vegupphafi að vegendi,
   - engin skörun,
   - aðeins domain 0/1,
   - interval innan marka,
   - samanlögð lengd í samræmi við canonical kafla innan skýrs tolerance.
5. Skipta canonical LineString eftir cumulative geometry distance í sömu hlutföllum og official station intervals. Nýir undirsegmentar erfa road metadata, direction, road class og F-road flags, en fá surface frá sínu opinbera bili.
6. Nota official interval length sem `lengthM` og deterministic segment-id sem inniheldur road `OBJECTID`, surface record `OBJECTID` og röð.
7. Ef validation bregst fyrir kafla: fallback á núverandi `mixed/unknown`; aldrei giska út frá vegflokki, F-númeri, nafni eða nálægum kafla.
8. Bæta diagnostics við snapshot refresh: paved/gravel/mixed/unknown km, fallback count og coverage failures. Nýtt snapshot má ekki promote-a ef óvissa eykst óvænt.
9. Keyra golden-route samanburð og sérstaklega Akureyri–Ísafjörður/61, route alternatives, F-roads og Öxi.

## Route intelligence check

- Þetta er reusable provider-neutral leiðagrunnsbót í `lib/iceland-routes/`, þótt authoritative import-source sé Vegagerðin.
- Engin Google-specific UI-regla er nauðsynleg.
- Engin persónuleg ferðagögn eða nákvæm heimilisföng eru vistuð.
- `IcelandRoadmap.md` þarf að uppfærast þegar þessi linear-reference útfærsla er samþykkt og framkvæmd.
- Snapshot format gæti haldist óbreytt ef output er áfram `IcelandRoadGraphSegmentInput[]`; meta þarf stærðaraukningu fyrir framkvæmd.

## Skrár skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx`
- `lib/iceland-routes/vegagerdinRoadGraphSource.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts`
- `lib/iceland-routes/roadGraph.ts`
- `lib/iceland-routes/roadGraphTypes.ts`
- `IcelandRoadmap.md`
- tengd unit/live test fixtures
- opinber ArcGIS metadata og read-only query endpoints fyrir Vegir og Slitlag

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- Þessi handoff-skrá

## Skipanir og próf

- Read-only ArcGIS count/coverage audits voru keyrð; engin gögn voru skrifuð.
- `git diff --check` var keyrt og skilaði exit 0, aðeins LF/CRLF viðvörunum.
- Engin unit-, integration-, type-check eða full prófasvíta var keyrð eftir þessari breytingu, samkvæmt skýrum fyrirmælum Stebba.

## Ekki gert

- Slitlagsimporti, route graph eða snapshotum var ekki breytt í þessum áfanga.
- Engin SQL, migration, Supabase, auth, env, commit, push, deploy eða production-breyting var gerð.

## Óvissa / þarf að staðfesta

Confidence í root cause og official station coverage er hátt miðað við núverandi live dataset. Áður en production rollout kemur til greina þarf samt að prófa geometry-splitting, reverse direction, rounding/tolerance, snapshot-size og graph topology á fullri prófasvítu. Live audit er snapshot í tíma og refresh validation þarf að verja framtíðargögn.

## Localhost checks for Stebbi

1. Opnaðu stóra `Veldu leið á korti` samanburðinn eftir alternative-leit.
2. Staðfestu að gula línan `N Teskeiðarleiðir fundust.` birtist ekki þegar leit lýkur.
3. Staðfestu að takkinn breytist áfram í `Leit að fleiri leiðum lokið`, verði disabled og heildarfjöldi leiða sé sýnilegur efst.
4. Prófaðu failure/no-route ef það kemur náttúrulega upp: gagnleg gula villu-/engin-niðurstaða línan á áfram að birtast.
5. Engin slitlagsbreyting er komin í localhost í þessum áfanga; núverandi `óstaðfest slitlag` tölur eiga því að vera óbreyttar þar til Stebbi samþykkir næsta framkvæmdaráfanga.

Engin localhost-athugun krefst Supabase-, production-, auth-policy-, billing-, secrets- eða deployment-breytinga.
