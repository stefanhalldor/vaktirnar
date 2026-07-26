# TODO-090 v019 — live connectivity-gate prerelease review

**Created:** 2026-07-26 20:32  
**Timezone:** Atlantic/Reykjavik  
**Fyrra TODO-090 handoff:** `2026-07-26-1700-todo-090-v018-claude-sql92-review.md`  
**Tengt release-handoff:** `2026-07-26-1720-todo-091-v072-codex-v071-deep-prerelease-review.md`

## Findings fyrst

### Hátt — deployment blocker: 75% absolute connectivity-gate hafnar staðfestu live-grafi

Fyrsta admin bootstrap gegn réttu Supabase projecti `bpjwgutpzsifjaucvkbk` skilaði HTTP 500 `snapshot_validation_failed`. Fail-closed vörnin virkaði rétt: ekkert snapshot var staged/promoted og enginn active Storage object varð til.

Failed metadata sýndi að öll validation stóðust nema `largestComponentShare`:

- actual: `0.6265590608950844`
- required: `0.75`
- `allGoldenRoutesPass = true`
- `failedGoldenRouteIds = []`
- minimum segment/node/edge og stability checks = true

Live read-only audit endurtók sömu official source-sókn og staðfesti:

| Node tolerance | Nodes | Edges | Segments | Weak components | Largest component | Share | Route |
|---:|---:|---:|---:|---:|---:|---:|---|
| 20 m | 1.363 | 2.452 | 1.226 | 199 | 854 | 62,66% | ok |
| 50 m | 1.344 | 2.448 | 1.224 | 191 | 889 | 66,15% | ok |
| 100 m | 1.331 | 2.436 | 1.218 | 186 | 890 | 66,87% | ok |
| 200 m | 1.307 | 2.406 | 1.203 | 180 | 890 | 68,09% | ok |

75% er því ekki raunhæft absolute baseline fyrir þetta opinbera lag. Jafnvel 200 m nær því ekki og byrjar á sama tíma að fella saman stutt segment: isolated nodes fara úr 0 við 20 m í 16 við 200 m.

### Hátt — ekki laga með hærra topology tolerance

Canonical 20 m tolerance finnur allar 20 gullleiðir innan skilgreindra vegalengdarmarka, Reykjavík–Akureyri og þrjár Ísafjarðar-alternatives. Að hækka tolerance væri rangt fix: það bætir share aðeins um 5,43 prósentustig, nær ekki 75% og eykur hættu á fölskum vegtengingum.

20 m skal haldast óbreytt.

### Miðlungs — absolute floor eitt og sér ver ekki nógu vel eftir bootstrap

Við 20 m eru 509 hnútar utan stærsta components, dreifðir á 198 component; meðalstærð þeirra er aðeins 2,57 hnútar og enginn isolated node er til. Þetta styður langan hala af stuttum aðskildum opinberum vegstubbum fremur en eitt annað stórt brotið landsnet.

Lækkun úr 75% í 60% er rétt baseline-leiðrétting, en ætti að fylgja relative drift-vörn miðað við síðasta active snapshot. Metadata geymir þegar `nodeCount` og `largestWeakComponentNodeCount`, svo ekki þarf SQL-breytingu.

Tillaga:

- `MIN_LARGEST_COMPONENT_SHARE = 0.60`
- nýtt `largestComponentShareStable` check þegar previous active er til
- current share þarf að vera að minnsta kosti 90% af previous share
- fyrsta bootstrap notar absolute 60% floor + öll núverandi minimum checks + allar 20 gullleiðir
- áfram 20 m topology tolerance

Með live baseline 62,66% er 60% floor nægilega nálægt til að verja gegn stórri source/parser-rýrnun en ekki svo þröngt að eðlileg smábreyting valdi daglegum false failure. Relative 90% check myndi síðan hafna umtalsverðu connectivity-falli frá staðfestu active baseline.

### Lágt — failed snapshot observability má bæta án schema-breytingar

Failed röðin hafði `segment_count`, `node_count`, `edge_count` og golden count dálka `null`, því þeir eru aðeins skrifaðir við staging eftir validation. `validation` JSON geymdi checks og share en ekki full diagnostics.

Setja ætti `diagnostics` og golden pass/total counts inn í `validationDetails` áður en validation getur kastað. Þá er næsta failure greinanlegt með read-only SQL án þess að skrifa hálf-staged metadata eða nýja migration.

## Rök fyrir 60% + relative drift

- Live actual 62,66% er mælt, ekki ágiskun.
- 60% gefur um 2,66 prósentustiga absolute headroom við fyrsta bootstrap.
- 20/20 golden routes ná yfir suðvestur, suðurströnd, Austurland, Norðurland, Vestfirði og Snæfellsnesleiðir; þær verja mikilvæga landsleiða-connectivity betur en krafa um að litlir vegstubbar séu allir í sama component.
- Existing segment/node/edge relative checks verja gegn 20% count collapse.
- Ný relative share-vörn ver gegn connectivity-rýrnun eftir að baseline er komið.
- Candidate er áfram strict global + per-user opt-in og Google er áfram default.

## Afmarkað implementation plan fyrir Claude Code

1. Í `lib/iceland-routes/roadGraphRefresh.server.ts`:
   - lækka absolute share-floor úr `0.75` í `0.60`;
   - víkka previous input með `largestWeakComponentNodeCount`;
   - reikna previous share úr previous largest/node count;
   - bæta `largestComponentShareStable` við checks, true á fyrsta bootstrap og annars `currentShare >= previousShare * 0.90`;
   - bæta fullum `diagnostics` og golden pass/total counts við `validationDetails`.
2. Láta `refreshRoadGraphSnapshot()` senda fyrirliggjandi active metadata inn í nýja checkið; engin breyting á Storage, promotion eða SQL.
3. Í `lib/__tests__/road-graph-refresh.test.ts`:
   - fixture sem samsvarar live `854/1363` þarf að standast fyrsta bootstrap;
   - absolute share undir 60% þarf að falla;
   - >10% relative share collapse miðað við active þarf að falla;
   - eðlileg lítil breyting þarf að standast;
   - failed validation þarf að geyma diagnostics í failure payload;
   - golden-route failure þarf áfram að blokka promotion.
4. Uppfæra `lib/iceland-routes/README.md` og `IcelandRoadmap.md` með mældu live baseline og tveggja laga connectivity-vörn.
5. Keyra markpróf, full tests, type-check, diff-check og build.
6. Stebbi endurkeyrir admin bootstrap aðeins eftir code review; staðfesta síðan deployment-skref #4 aftur.

## Ekki gera

- Ekki hækka node tolerance yfir 20 m sem workaround.
- Ekki fjarlægja connectivity check.
- Ekki veikja eða fækka gullleiðum.
- Ekki promote-a failed snapshot handvirkt.
- Ekki breyta SQL 92, RLS, grants eða bucket policy; ekkert í live niðurstöðunni kallar á slíkt.
- Ekki endurkeyra bootstrap með óbreyttum 75% kóða; það myndi aðeins búa til aðra failed metadata-röð.

## Route intelligence check

- Breytingin snertir provider-neutral all-Iceland road graph validation, ekki eina leið eða Google-specific flæði.
- `IcelandRoadmap.md` á að skrá 62,66% measured baseline og 60% + relative drift varnarmynstrið.
- Engin canonical segment/control-point/station matching breyting þarf; allar 20 golden routes stóðust.
- Engin notendaleið, heimilisfang eða persónuleg ferðagögn eru lesin eða vistuð.
- Vegagerðin er aðeins live source fyrir verndað refresh; runtime heldur áfram að lesa LKG snapshot.

## SQL / Supabase / production

- SQL 92 er keyrt og private bucket er staðfestur `public = false`.
- Ein failed metadata-röð er til: `d72b3684-ba62-41a0-b5f2-d63bac7e7efd`.
- Engin active eða building röð er til eftir failure.
- Ekkert Storage object var promoted.
- Engin SQL-, RLS-, grant-, auth-, env- eða production-breyting er hluti af fyrirhuguðu fixi.
- Codex framkvæmdi aðeins read-only live GET audit gegn opinberum Vegagerðar-gögnum; ekkert Supabase-write var gert af Codex.

## Prófanir og skipanir í greiningu

- Fyrsta live-audit innan sandbox: féll á network `EACCES`; engin test assertion keyrði.
- Live audit utan net-sandbox: exit 0, 1/1 live test pass.
- Sama audit með console sýnilegt: exit 0, 1/1 pass; mælingar í töflunni hér að ofan.
- Engar skrár voru breyttar nema þetta review-handoff.

## Localhost checks for Stebbi

Eftir að Claude Code hefur framkvæmt og Codex rýnt fixið:

1. Ekki endurræsa dev server nema Stebbi sjálfur telji þess þörf; leyfa Fast Refresh/build að klárast.
2. Sem innskráður admin á sama projecti `bpjwgutpzsifjaucvkbk`, kalla einu sinni:
   `fetch('/api/admin/weather/refresh-road-graph',{method:'POST'}).then(async r=>({httpStatus:r.status,body:await r.json()})).then(console.log)`
3. Vænt: HTTP 200, `body.status = 'ok'`, 20/20 golden routes og snapshot ID.
4. Keyra read-only DB-check:
   - nákvæmlega eitt `active`;
   - ekkert `building`;
   - golden pass = total;
   - active Storage object exists;
   - bucket áfram private.
5. Prófa flaggaðan `teskeid-routing-v1` notanda á localhost/preview:
   - Google er áfram sjálfvalið;
   - Teskeið candidate birtist aðeins með global + per-user gate;
   - Reykjavík–Akureyri og ein Vestfjarðaleið skila candidate;
   - endurtekin beiðni nýtir warm/LKG state.
6. Slökkva annað gate-ið og staðfesta að candidate hverfi en Google haldi áfram.

Bootstrap er skrifandi Supabase/Storage aðgerð og má aðeins keyra einu sinni eftir samþykkta kóðabreytingu. Ekki keyra recovery SQL, handvirkt promotion eða eyða failed röðinni; failed metadata er gagnleg audit-saga.

## Niðurstaða

Deployment-skref #4 er áfram blokkerað. Einfaldasta örugga lausnin er afmörkuð kóðabreyting: 60% measured absolute floor, 90% relative share stability, óbreytt 20 m tolerance, óbreyttar 20 gullleiðir og betri failure diagnostics. Eftir implementation review má Stebbi endurkeyra bootstrap og staðfesta #4 áður en deploy-skref #5 er metið.

**Confidence:** hátt. Live source var mæld tvisvar, canonical 20 m talan passar nákvæmlega Supabase failure og allar 20 gullleiðir stóðust.
