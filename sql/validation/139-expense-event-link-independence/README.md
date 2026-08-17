# SQL139: sjálfstæð tenging kostnaðar og viðburðar

SQL139 skilur á milli þess að velja þátttakendur úr viðburði og þess að merkja
kostnað inn á viðburð. Ný Event-valin Expense-færsla geymir ekki varanlegt
`event_guest_id` provenance. Sýnileg tenging er ein röð í
`teskeid_event_expense_links` og attach/detach breytir engum fjárhagsröðum.
Event-val einn og sér stofnar hvorki Expense-boð né aðgang; venjulegt,
sérstaklega valið Expense-boð heldur áfram að virka óháð Event-uppruna.
Viðburðaruppgjör notar Expense-aðilana sjálfa og örugg nöfn, ekki provenance.

## Handvirk keyrsluröð

1. Keyra `preflight.sql` og stoppa nema `prerequisites_ok=true`.
2. Keyra `sql/139_expense_event_link_independence.sql` einu sinni.
3. Keyra `postflight.sql` og stoppa nema `postconditions_ok=true`.
4. Deploya samhæfða app-breytingu fyrst eftir grænt postflight.

Codex skrifaði skrárnar en keyrði ekkert SQL. Ekki endurkeyra eldri SQL132–138.

## Recovery

Migrationin er ein transaction og rollback-ar sjálfkrafa við villu fyrir
`COMMIT`. Eftir commit skal ekki eyða tengingum eða participant-source sögu í
blindni. Keyrðu `recovery.sql` (read-only) og útbúðu sértækt recovery út frá
raunverulegri stöðu. Event-link er metadata; Expense members, payments, shares,
obligations, invitations og repayments eiga alltaf að haldast ósnert.

## Localhost checks for Stebbi

- Veldu þátttakendur úr viðburði, haltu hakinu virku og vistaðu: backlink og
  Event settlement eiga að birtast.
- Taktu hakið af og vistaðu: sömu þátttakendur/split eiga að haldast en enginn
  backlink eða settlement-tenging birtist.
- Opnaðu ótengdan stakan kostnað, tengdu við gjaldgengan viðburð og sannreyndu
  að fjárhagsupplýsingar breytast ekki.
- Aftengdu og sannreyndu aftur að aðeins backlink/settlement hverfi.
- Prófaðu með Event owner og accepted attendee. Óviðkomandi Event eða Expense
  á aldrei að birtast í picker eða leyfa aðgerð.
