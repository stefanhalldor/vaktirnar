# v036 — SQL184 Success og postflight-gátt

Created: 2026-09-16 07:38 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Mannamál og næsta eigendagátt

Stebbi sýndi SQL184 migration í Supabase SQL Editor með niðurstöðunni
`Success. No rows returned`. Þetta styður að transaction hafi lokið án SQL
villu. Það sannar ekki eitt og sér exact function bodies, grants, schema seal
eða RLS/private boundary; þess vegna kemur catalog-only postflight næst.

**JÁ — STEBBI Á AÐ KEYRA AÐEINS SQL184 POSTFLIGHT NÚNA.**

Skrá: [postflight.sql](../../../sql/validation/184-receipt-split-v2/postflight.sql)

SQL Editor: https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

Vænt nákvæmlega ein röð:

- `operator_state = EXACT_INSTALLED`
- `seal_ok = true`
- `functions_ok = true`
- `tables_ok = true`
- `no_client_policies = true`
- `schema_private = true`
- `tables_private = true`
- `bucket_ok = true`

Ef annað gildi kemur: stoppa, ekki endurkeyra migration, senda Codex alla röðina.
Postflight les aðeins catalog/function bodies/ACL/RLS metadata og private bucket
stillingu. Það les ekki kvittanir, claims, myndir, notendanöfn, netföng eða
deilihlekki og breytir engu schema eða business data. `SET search_path` gildir
aðeins SQL Editor-session. Velja venjulegt `Run`/`Yes`, ekki varanlegt leyfi.

## Actual apply evidence

- Uppruni: skjámynd Stebba úr Supabase SQL Editor.
- Sýnileg skrá: SQL184 migration með réttum fyrirsagnartexta.
- Niðurstaða: `Success. No rows returned`.
- Migration SHA-256 endurstaðfest:
  `86cfc392db870d8c18ce4584e6e1bd5f3158b65bf52411f62fef72202b2af330`.
- Postflight SHA-256 endurstaðfest:
  `57fdbbf750243aac1b4393bd4d1a7ebcd6809eb47e40cb66d947cf4dda3e04e2`.
- `diff --check` á báðum artifacts PASS.

Engin blind inference um exact install er gerð. Postflight þarf actual output.

## Breytingar á verkefnalýsingu

- Current gate færð úr migration apply í read-only postflight.
- Actual `Success. No rows returned` og skjámyndauppruni skráð.
- Migration/postflight hashes skráð sem óbreytt eftir apply evidence.
- Exact vænt postflight schema og sjö boolean gates skráð.
- Skýrt að migration má ekki endurkeyra og að application cutover bíður
  `EXACT_INSTALLED`; Success eitt opnar ekki runtime.

## Skrár skoðaðar og breyttar

Skoðað: lifandi GoLive task, SQL184 migration/postflight, canonical og v035.
Breytt: canonical verkefnalýsing, SQL184 README og þetta immutable handoff.
Engin SQL/code/test artifact bytes breyttust.

## Skipanir og niðurstöður

- SHA-256 migration/postflight → exact v034/v035 hashes, exit 0.
- `git -c core.safecrlf=false diff --check` á báðum SQL artifacts → PASS, exit 0.
- GoLive latest read → in_progress, Codex writer, enginn relation blocker.
- Tests/type/lint/parser ekki endurkeyrt; executable bytes eru óbreytt frá v034
  (304 tests PASS, type/lint/parser PASS).
- Ekkert SQL var keyrt af Codex. Engin app-/server-breyting, commit, push,
  merge, deploy, provider-kall eða dev-server stjórn.

## Eftir exact postflight

Codex skráir installed state og heldur sjálfkrafa áfram í þegar heimilaðan
application cutover: live standalone read/action/UI flyst á v2 samninginn,
focused tests og localhost candidate eru keyrð. Engin ÚL/Expense tenging verður
bætt við. Production/release, commit/push/deploy eru áfram sér gates.

## Localhost checks for Stebbi

Postflight breytir engu í localhost. SQL184 uppsetning er ekki importuð af live
route fyrr en application cutover er gerður eftir exact postflight. Engin v2
vistun á að prófa núna. SQL-fríi skjárinn er áfram á
http://localhost:3004/preview/splitt-v032. Nota ekki raunverulegar kvittanir,
ÚL/Expense eða óviðkomandi notendur í þessari catalog-sannprófun.
