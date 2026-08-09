# TODO #090 v199 — Herðing prófaumhverfis

## Plan áfangans

1. Útiloka `.tmp/**` varanlega í Vitest í stað CLI-frávika.
2. Greina og laga tvö gömul SQL-fixture-próf án þess að breyta eða keyra migrations.
3. Varðveita staðbundin handoff-skjöl en hætta að láta þau yfirgnæfa `git status`.

## Hvað var raunverulega gert

- Vitest notar nú `configDefaults.exclude` ásamt bæði `.tmp/**` og `**/.tmp/**`.
- Tímabundið, viljandi fallandi sentinel-próf undir `.tmp/__tests__` staðfesti að discovery sér ekki tímabundin próf; sentinel var síðan fjarlægt.
- SQL98-prófið les ekki lengur ócommittað/missing SQL95 validation-fixture.
- SQL95/96/98 assertions endurspegla nú production-skrárnar: SQL95 er legacy explicit union sem varðveitir expense-lykil, SQL96/98 víkka union dynamískt, og SQL98 preflight skráir order-risk ef stale SQL95/96 er endurkeyrt.
- Engri SQL-skrá var breytt eða keyrð.
- `.tmp/` og ný `ai-handoff/*.md` vinnuskjöl eru ignored. Fyrirliggjandi tracked handoff-skjöl halda áfram að vera tracked. README skráir local-first/reglu og deliberate `git add -f` fyrir release records.
- 135 untracked handoff-skjöl í gamla main-trénu voru talin og varðveitt óbreytt á disk; engu var eytt eða fært.

## Skrár sem voru skoðaðar

- `vitest.config.ts`
- `.gitignore`
- `ai-handoff/README.md`
- `sql/95_teskeid_agent_collaboration.sql`
- `sql/96_expenses_core.sql`
- `sql/98_bookkeeping_vat_workbook.sql`
- SQL98 preflight/postflight
- bæði gömlu SQL migration contract-prófin

## Skrár sem voru breyttar

- `vitest.config.ts`
- `.gitignore`
- `ai-handoff/README.md`
- `lib/__tests__/bookkeeping-sql98-migration.test.ts`
- `lib/__tests__/expense-persistence-migration.test.ts`
- þessi handoff-skrá (deliberately force-added samkvæmt nýju reglunni)

## Skipanir og niðurstöður

- Bæði SQL-próf fyrst sér: fyrra féll vegna missing untracked fixture; seinna 28/29 vegna stale SQL95 assumption.
- Bæði SQL-próf eftir lagfæringu: exit 0, 57/57.
- Full `npm.cmd run test:run -- --reporter=dot --silent=passed-only` án `--exclude`: exit 0, 311 skrár, 5.458 passed, 49 skipped, 8 todo.
- Fallandi `.tmp` sentinel var til meðan fulla runnið fór fram og var ekki discovered.
- `npm.cmd run type-check`: exit 0.
- `git diff --check`: exit 0; aðeins Windows line-ending warnings.

## Það sem mistókst eða var sleppt

- Engin migration integration var keyrð gegn Supabase; prófin eru offline source contracts.
- Óhreina main-vinnutréð var ekki pull-að, hreinsað eða endurraðað. Ignore-reglan tekur þar gildi þegar nýr `main` er tekinn inn.
- 135 staðbundin handoff-skjöl voru ekki handflokkað eftir efni, því það hefði annaðhvort bætt stórri sögulegri skjalabylgju í repo eða krafist áhættusamra færslna. Flokkunin er þess í stað skýr: fyrirliggjandi tracked/release records í Git, önnur vinnuskjöl local-first og varðveitt á disk.

## Ákvarðanir

- `configDefaults.exclude` er varðveitt svo explicit Vitest `exclude` opni ekki óvart `node_modules`, `.git` eða önnur default-undanskilin tré.
- Historical migration-skrám var ekki breytt til að láta próf passa; prófin voru leiðrétt að immutable production-sannleikanum.
- Handoff-policy er non-destructive: engin eyðing, archive-move eða auto-clean.

## Eftirstandandi áhætta

- Legacy SQL95 er áfram order-sensitive ef einhver endurkeyrir gömlu migrationina eftir SQL98. Fyrirliggjandi SQL98 preflight varar skýrt við því; engin production SQL keyrsla er heimiluð eða þörf hér.
- Ignored local handoff þarf meðvitað `git add -f` ef það á að verða varanleg release-saga.

## Tillaga að næsta skrefi

Halda áfram í næsta vörufasa frá hreinum `origin/main`: public Kviss, síðan Auglýsendur/Quizbadour og að lokum Bókanir.

## Spurningar sem Codex á sérstaklega að rýna

- Er þörf á að velja síðar fáein af 135 local-first handoff-skjölum inn í Git, eða nægir núverandi 1.619 tracked saga?
- Á að breyta legacy SQL95 með nýrri migration í framtíðinni, eða er skýr no-rerun regla næg þar sem SQL98 er þegar síðari authority?

## Supabase / SQL áhrif

- Engin SQL skrifuð eða keyrð.
- Engin breyting á migration source, schema, gögnum, RLS, grants, auth, policies eða functions.
- Aðeins offline próf/assertions voru leiðrétt.

## Localhost checks for Stebbi

Engin notendasýnileg UI-breyting er í þessum áfanga og því er ekkert sérstakt localhost-flæði að prófa. Ef Stebbi vill staðfesta prófaumhverfið handvirkt má keyra `npm.cmd run test:run` án `--exclude`; vænt niðurstaða er græn heildarkeyrsla þar sem `.tmp`-próf finnast ekki og bæði SQL-prófin keyra.

