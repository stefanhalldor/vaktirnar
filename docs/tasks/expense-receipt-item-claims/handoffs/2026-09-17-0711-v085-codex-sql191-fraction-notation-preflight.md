# v085 — SQL191 nákvæm brotaskrift og preflight-gátt

Created: 2026-09-17 07:11
Timezone: Atlantic/Reykjavik

## Plan áfangans

Varðveita brotið nákvæmlega eins og notandinn slær það inn, án þess að breyta
canonical magni eða útreikningsreglum.

## Hvað var raunverulega gert

- Claim-samningurinn ber nú valfrjálsan teljara og nefnara ásamt `inputMode`.
- Brot eins og `2/10` er vistað og birt sem `2/10` í pillu, við slider og í
  nákvæmu innsláttarskúffunni.
- Slider, magn og prósenta hreinsa brotaskriftina og nota sína eigin framsetningu.
- Server-samningurinn krefst þess að teljari og nefnari komi saman, séu jákvæðir
  og samsvari nákvæmlega canonical magni liðarins.
- SQL191 migration, read-only preflight og exact postflight voru skrifuð.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- SQL190 migration og validation artifacts
- V2 claim contracts, read model, session adapter, UI og tengd próf
- v081–v084 handoff

## Skrár sem voru breyttar

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `lib/receipt-split/view-v2.ts`
- `lib/receipt-split/contracts-v2.ts`
- `lib/receipt-split/session-v2.ts`
- `lib/__tests__/standalone-receipt-session-v2.test.ts`
- `lib/__tests__/standalone-receipt-v2-summary.test.ts`
- `lib/__tests__/receipt-split-sql191-fraction-notation.test.ts`
- `sql/191_receipt_split_fraction_notation.sql`
- `sql/validation/191-receipt-split-fraction-notation/preflight.sql`
- `sql/validation/191-receipt-split-fraction-notation/postflight.sql`
- `sql/validation/191-receipt-split-fraction-notation/README.md`
- canonical task-skjal og þetta immutable handoff

## Skipanir og niðurstöður

- Scoped ESLint: PASS, exit 0.
- `npm.cmd run type-check`: PASS.
- Focused Vitest, 6 files / 29 tests: PASS, exit 0.
- `npm.cmd run build`: PASS, exit 0. Build sýndi aðeins eldri ótengdar warnings.
- `git diff --check`: PASS.

## Hvað mistókst eða var sleppt

- Fyrra lint-session var útrunnið þegar það var pollað; sama scoped lint var
  keyrt aftur og lauk með exit 0.
- SQL191 hefur ekki verið keyrt.
- Browserprófun bíður þar til SQL191 er exact uppsett.

## Ákvarðanir

Upprunalega brotið er presentation metadata, en `quantity_units` er áfram eina
canonical reiknigildið. Söguleg fraction-claims án metadata eru áfram gild og
falla aftur á reiknað, stytt brot.

## Áhætta sem er enn til staðar

- Localhost client gerir nú ráð fyrir nýju projection-reitunum og því á ekki að
  prófa candidate gegn SQL190 schema meðan SQL191 er óuppsett.
- Native slider og brotamerki þurfa enn sjónræna mobile-rýni eftir SQL-gáttina.

## Tillaga að næsta skrefi

**JÁ — STEBBI Á AÐ KEYRA SQL NÚNA**, en aðeins read-only SQL191 preflight:
`sql/validation/191-receipt-split-fraction-notation/preflight.sql`.

Vænt niðurstaða er ein röð með:

- `operator_state = READY`
- `operator_ok = true`
- `predecessor_ok = true`
- `targets_absent = true`

Ekki keyra migration fyrr en þessi actual röð hefur verið rýnd.

## Spurningar sem Codex á sérstaklega að rýna

- Staðfestir actual preflight nákvæman SQL190 predecessor?
- Eru báðir nýju dálkarnir fjarverandi fyrir migration?
- Eru hash og SQL-artifacts óbreytt milli gátta?

## Supabase

SQL191 er aðeins skrifað og ókeyrt. Fyrirhuguð breyting bætir tveimur nullable
dálkum við private `receipt_split.claims`, constraint, service-only read
projection og service-only claim command. Hún breytir engri RLS policy, auth
reglu eða client grant og flytur engin eldri gögn. Eldri fraction-claims mega
vera með null metadata.

Artifacts við þessa gátt:

- migration SHA-256: `62ABFCBDDC85702E068EB407981D79D112705941E8975ED69B785B720A06525F`
- preflight SHA-256: `4F9B5002EBEDCFDC1B26BC316AB6D7C458E1227DFE68C851A92AE3FDBF7D8E70`
- postflight SHA-256: `02CB02C207E9B729ABE017A7508ACE7BCBB1A428D4F43B75F00F329A3890DF9E`

## Localhost checks for Stebbi

Ekki prófa þetta flæði enn. Eftir successful SQL191 migration og exact
postflight:

1. Opna innskráð split á `http://localhost:3004`.
2. Opna „Nákvæmari mælieiningar“, velja Brot og vista `2/10`.
3. Staðfesta að pillan, merkið undir slider og innsláttarreitir sýni `2/10`,
   einnig eftir refresh.
4. Staðfesta að magnið sé samt rétt canonical magn, til dæmis 0,8 af 4.
5. Hreyfa sliderinn og staðfesta að framsetningin skipti í Magn og hoppi á
   hálfum.
6. Prófa 360, 390 og 460 px án zoom, overflow eða overlap.

Ekki prófa production og ekki endurkeyra SQL190.
