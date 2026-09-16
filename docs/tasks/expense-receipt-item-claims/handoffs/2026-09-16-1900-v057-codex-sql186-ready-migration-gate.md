# SQL186 preflight READY

Date: 2026-09-16 19:00
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual preflight-niðurstöðu Stebba, bera artifact-hashes saman við v056 og
afhenda SQL186 migrationina sem næsta afmarkaða handvirka workflow-gátt.

## Hvað var raunverulega gert

- Actual preflight-röð Stebba var skráð: `READY`, með `operator_ok`,
  `predecessor_ok`, `functions_ok` og `targets_absent` öll `true`.
- Migration, preflight og postflight voru endurhash-uð og eru byte-for-byte
  óbreytt frá v056.
- Engin SQL-keyrsla var framkvæmd af Codex.
- GoLive-undirliðurinn var uppfærður með actual READY-niðurstöðu og næstu
  migration-gátt; hann helst `in_progress`.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `sql/186_receipt_split_participant_controls.sql`
- SQL186 preflight og postflight
- Canonical verkefnalýsing og v056

## Skrár sem voru breyttar

- Canonical verkefnalýsing
- Þetta handoff

## Skipanir og niðurstöður

- SHA-256 migration:
  `308D3DE6C04EB62E75BB52B735931CBA431961303606F81200DB6745FB1155B3`
- SHA-256 preflight:
  `C5139071BA65D19504D26F9C94B18AA5459832EE2270E889A767C2CA5FF88FA3`
- SHA-256 postflight:
  `956CA0DD0987A8FBBDEC1436BEAEBFB048FD3F686EA370F9B16CB3E3EA1C8379`
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Migration, postflight, localhost, commit, push og deploy voru
ekki framkvæmd.

## Ákvarðanir

Preflight-gáttin er lokuð sem græn. Aðeins frysta SQL186 migrationin er næsta
leyfilega handvirka skref; hún skal ekki endurkeyrð eftir Success.

## Áhætta sem er enn til staðar

`READY` staðfestir forvera og fjarveru targeta en ekki að migration hafi verið
sett upp. Exact schema, ACL, RLS, functions, constraints og trigger verða ekki
staðfest fyrr en read-only postflight skilar `EXACT_INSTALLED`.

## Næsta skref og workflow-stopp

Stebbi keyrir `sql/186_receipt_split_participant_controls.sql` nákvæmlega einu
sinni í Supabase SQL Editor. Vænt niðurstaða er `Success. No rows returned`.
Senda þarf actual niðurstöðu áður en postflight er afhent sem næsta skref.

## Spurningar fyrir rýni

Engin opin spurning. Staðfesta næst aðeins actual migration-niðurstöðu og
óbreyttan postflight-hash.

## Supabase-áhrif

Migrationin stofnar private forced-RLS `item_dismissals`, service-only invite-
preview og actor-bound dismissal function, uppfærir v2 read projection og bætir
private cleanup-trigger við claims. Hún breytir engum fyrirliggjandi röðum og
stofnar engar client policies. SQL var aðeins skrifað, ekki keyrt af Codex.

## Breytingar á verkefnalýsingu

Current gate var fært úr SQL186 preflight yfir í migration eftir actual `READY`.
Engin product-krafa breyttist.

## Localhost checks for Stebbi

Engin localhost-prófun á að fara fram á milli migration og postflight. Eftir
`EXACT_INSTALLED` gildir v056 checklist fyrir deilihlekk, þátttöku, síur,
hlutfall, „Ekki mitt“, QR, gengi og 360px mobile layout.

Ekki prófa með viðkvæmum kvittunum eða production-notendum áður en exact
postflight og localhost-gátt hafa verið lokuð.

## Óvissa / þarf að staðfesta

Migrationin hefur ekki verið keyrð. Actual Supabase-niðurstaða er næsta sönnun.
