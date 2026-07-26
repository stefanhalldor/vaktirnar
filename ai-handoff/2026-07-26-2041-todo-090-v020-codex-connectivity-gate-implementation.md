# TODO-090 v020 — connectivity-gate implementation handoff

**Created:** 2026-07-26 20:41  
**Timezone:** Atlantic/Reykjavik  
**Framkvæmdarplan:** `2026-07-26-2032-todo-090-v019-codex-live-connectivity-gate-review.md`  
**Tengt release-handoff:** `2026-07-26-1720-todo-091-v072-codex-v071-deep-prerelease-review.md`

## Samþykki

Stebbi sagði: **„Codex, framkvæmdu v019 connectivity-gate lagfæringuna.“**

Samþykkið náði til afmarkaðra kóða-, prófa-, README-, `IcelandRoadmap.md`- og handoff-breytinga. Það náði ekki til SQL, Supabase/Storage-breytinga, bootstrap-endurkeyrslu, dev-server, commit, push, deploy eða production.

## Plan áfangans

1. Innleiða 60% absolute bootstrap-floor og 90% relative LKG connectivity-drift.
2. Halda canonical 20 m topology tolerance og öllum 20 gullleiðum óbreyttum.
3. Gera failed snapshot metadata greinanlegra án schema-breytingar.
4. Bæta við regression-prófum fyrir live baseline, boundaries, normalized drift og golden-route count.
5. Uppfæra provider-neutral route skjöl.
6. Keyra markpróf, full tests, type-check, diff-check og production build.

## Hvað var raunverulega gert

### Connectivity validation

Í `lib/iceland-routes/roadGraphRefresh.server.ts`:

- `MIN_LARGEST_COMPONENT_SHARE` var lækkað úr ágiskuðu `0.75` í mælingatengt `0.60`.
- `MIN_RELATIVE_LARGEST_COMPONENT_SHARE = 0.90` var bætt við.
- Previous active metadata notar nú bæði `nodeCount` og fyrirliggjandi `largestWeakComponentNodeCount` til að bera saman normalized share, ekki hráan largest-node count.
- Nýtt `largestComponentShareStable` check krefst að current share sé að minnsta kosti 90% af share síðasta active snapshots.
- Fyrsta bootstrap hefur ekkert previous baseline og notar því 60% absolute floor, minimum count checks og gullleiðir.
- `previousLargestComponentShare` er vistað með validation-resulti fyrir greiningu.

### Nákvæmlega 20 gullleiðir

- `allGoldenRoutesPass` krefst nú bæði:
  - nákvæmlega sama fjölda niðurstaðna og `ICELAND_GOLDEN_ROUTES` skilgreinir;
  - að hver niðurstaða sé `ok`.
- Því geta 19/19 eða 1/1 ekki lengur litið út eins og fullur pass.

### Failure diagnostics

Áður en validation getur kastað eru nú sett í `validationDetails`:

- full `diagnostics`;
- `goldenRoutePassCount`;
- `goldenRouteTotalCount`;
- bæði absolute og relative connectivity thresholds;
- failed golden route IDs;
- current og previous component share.

Failed row getur því áfram haft schema-safe `null` í staged payload-dálkum, en read-only SQL getur greint raunverulegar tölur úr `validation` JSON. Engin migration eða schema-breyting þurfti.

### Skjöl

- `lib/iceland-routes/README.md` lýsir nú 854/1.363 live baseline, 60% absolute floor, 90% relative drift, föstu 20 m tolerance og 20 mandatory gullleiðum.
- `IcelandRoadmap.md` skráir sama provider-neutral validation-mynstur og rök þess.

## Skrár skoðaðar

- `WORKFLOW.md`
- `IcelandRoadmap.md`
- `lib/iceland-routes/README.md`
- `lib/iceland-routes/roadGraph.ts`
- `lib/iceland-routes/roadGraphRefresh.server.ts`
- `lib/iceland-routes/roadGraphSnapshotStore.server.ts`
- `lib/iceland-routes/roadGraphSnapshotFormat.ts`
- `lib/iceland-routes/vegagerdinRoadGraphSource.server.ts`
- `lib/iceland-routes/goldenRoutes.ts`
- tengd road-graph snapshot/runtime/refresh próf
- v017, v018, v019 og v072 handoff-skjöl

## Skrár breyttar í þessum áfanga

- `lib/iceland-routes/roadGraphRefresh.server.ts`
- `lib/__tests__/road-graph-refresh.test.ts`
- `lib/iceland-routes/README.md`
- `IcelandRoadmap.md`
- þetta handoff

Vinnusvæðið var þegar með stóran ócommittaðan prerelease-pakka. Codex varðveitti allar þær breytingar og snerti ekki user-owned `.obsidian/workspace.json` eða ótengdar skrár.

## Prófunarþekja sem bættist við

- Live bootstrap baseline `854 / 1.363 = 62,66%` stenst.
- Gildi undir 60% fellur.
- Nákvæmlega 60% stenst.
- Normalized share collapse fellur jafnvel þegar raw largest-node count hækkar.
- Eðlileg normalized breyting stenst jafnvel þegar raw largest-node count lækkar.
- 19 all-`ok` gullleiðaniðurstöður falla; nákvæmlega 20 eru nauðsynlegar.
- Failure payload inniheldur diagnostics, golden counts og bæði connectivity thresholds.
- Golden-route failure blokkar áfram stage og promotion.

## Skipanir og niðurstöður

### Fyrri read-only live greining sem v019 byggði á

- Live audit innan sandbox: náði ekki neti, `EACCES`; engin assertion keyrði.
- Sama live audit með afmörkuðu netleyfi: exit 0, 1/1 pass.
- Audit með console sýnilegt: exit 0, staðfesti 20/50/100/200 m mælingar og 20/20 gullleiðir.

### Eftir implementation

- Fyrstu markpróf: 3 files, 22/22 pass.
- Breið road-graph suite: 9 files, 60/60 pass.
- Fullt `npm run test:run`: exit 0; **160 files passed, 1 skipped; 3.806 tests passed, 28 skipped, 8 todo**.
- Eftir normalized test-herðingu: road-graph refresh 12/12 pass.
- Eftir 20/20 count-herðingu: 2 files, 21/21 pass.
- Lokalegt road-graph refresh próf með exact 60% boundary: 14/14 pass.
- `npm run type-check`: exit 0 í lokin.
- `git diff --check`: exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- `npm run build`: exit 0 bæði fyrir og eftir loka 20/20 hardening; compile, type/lint og 105 static pages pass.

Build sýnir fyrirliggjandi React hook warnings, eina `<img>` warning og gamalt Browserslist-gagnasafn. Engin ný warning eða villa tengdist connectivity-breytingunni.

## Hvað mistókst eða var sleppt

- Engin localhost/browser keyrsla var framkvæmd af Codex; Stebbi á dev serverinn.
- Codex endurkeyrði ekki admin bootstrap eftir fixið.
- Engin SQL, migration, Supabase, Storage, RLS, grant, auth, env eða production breyting var gerð.
- Ekkert var commit-að, push-að eða deployað.
- Fyrri failed audit-row `d72b3684-ba62-41a0-b5f2-d63bac7e7efd` var ekki eytt; hún er gagnleg saga.

## Ákvarðanir og rök

- 20 m tolerance helst fast: hærra tolerance náði ekki 75% og jók topology-áhættu.
- 60% er measured bootstrap floor með 2,66 prósentustiga headroom frá live baseline.
- 90% relative share drift ver framtíðar-refresh gegn connectivity-rýrnun eftir að active baseline er komið.
- Normalized shares eru bornar saman; raw counts geta verið villandi þegar heildarhnútafjöldi breytist.
- Nákvæmlega 20 gullleiðir eru mandatory, ekki aðeins „allar niðurstöður sem bárust“.
- Failure observability fer í `validation` JSON svo ekki þurfi migration eða hálf-staged payload metadata.

## Áhætta sem er enn til staðar

- Fyrsta raunverulega bootstrap með nýja kóðanum hefur ekki enn verið keyrt.
- Live source getur breyst milli audit og bootstrap; nýju vörnin á að meta þá útkomu fail-closed.
- 60% floor er byggt á einu staðfestu live baseline. Relative LKG check verður sterkari vörnin eftir fyrsta active snapshot.
- Fyrirliggjandi build-warning backlog er áfram utan scope.
- Candidate er tilraun og má áfram aðeins birtast með global + per-user gate; Google er áfram default.

## SQL / Supabase / Storage / öryggi

- SQL 92 var áður keyrt af Stebba.
- Bucket `teskeid-road-graph-snapshots` var áður staðfestur private (`public = false`).
- Engin active eða building row var til eftir fyrra validation failure.
- Þessi breyting krefst engrar nýrrar migration og veikir ekki RLS/grants.
- Admin bootstrap er skrifandi aðgerð og verður framkvæmd af Stebba aðeins einu sinni eftir þetta handoff/review.
- Failed metadata inniheldur engar notendaleiðir, heimilisföng, auth-gögn eða persónuupplýsingar.

## Route intelligence check

- Scope er all-Iceland provider-neutral road graph validation.
- `IcelandRoadmap.md` var uppfært með canonical measured baseline og validation-vörnum.
- Engin Google-specific binding, station matching, route cache key eða canonical segment breyting þurfti.
- Engin user route history er geymd; aðeins provider-level snapshot og validation metadata.

## Localhost checks for Stebbi

### A. Endurkeyra bootstrap einu sinni

**Forsendur:** localhost notar Supabase project `bpjwgutpzsifjaucvkbk`, SQL 92 er keyrt, Stebbi er innskráður admin og Fast Refresh/build er lokið.

Í browser Console á localhost:

```js
fetch('/api/admin/weather/refresh-road-graph', {
  method: 'POST'
}).then(async r => ({
  httpStatus: r.status,
  body: await r.json()
})).then(console.log)
```

Vænt:

- HTTP 200;
- `body.status = 'ok'`;
- snapshot ID;
- `goldenRoutePassCount = 20`;
- `goldenRouteTotalCount = 20`;
- segment/node/edge counts nálægt live baseline.

Ekki tvísmella eða endurkeyra meðan request er pending. Þetta sækir opin Vegagerðar-gögn og skrifar metadata/private Storage object, en snertir ekki auth eða notendagögn.

### B. Deployment-skref #4 — read-only staðfesting

Eftir HTTP 200:

- `active_count = 1`;
- `building_count = 0`;
- active golden pass = total = 20;
- active Storage object exists;
- bucket `public = false`.

Ef bootstrap skilar 500 skal ekki endurkeyra strax. Lesa nýjustu failed `validation` JSON; hún inniheldur nú full diagnostics.

### C. Candidate smoke eftir active snapshot

1. Með global `TESKEID_ROUTE_CANDIDATE_ENABLED=true` og einum per-user `teskeid-routing-v1` notanda:
   - reikna Reykjavík → Akureyri;
   - reikna eina Vestfjarðaleið;
   - Google helst fyrsta/sjálfvalda leiðin;
   - Teskeið candidate birtist aðeins flaggaða notandanum.
2. Endurtaka sömu leið:
   - warm/LKG state á að svara hratt;
   - engin live Vegagerðin source-sókn á user request path.
3. Slökkva annaðhvort global eða per-user gate:
   - Teskeið candidate hverfur;
   - Google heldur áfram óbreytt.

Ekki breyta production flags, deploya eða víkka per-user rollout án sérstaks samþykkis.

## Tillaga að næsta skrefi

Stebbi endurkeyrir admin bootstrap einu sinni samkvæmt A og sendir `httpStatus` + `body`. Ef það er `200/ok`, keyrir Stebbi read-only #4 sannprófunina. Aðeins eftir að #4 er grænt á Claude Code eða Codex að gera loka prerelease diff-review fyrir commit/deploy ákvörðun.

## Óvissa / þarf að staðfesta

- Raunbootstrap með nýju 60%/90% kóðaleiðinni er enn ókeyrt.
- Engin óvissa er um live 20 m baseline sem olli fyrri failure; Supabase-gildið og tvær read-only live keyrslur pössuðu.

**Confidence:** hátt.
