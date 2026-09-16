# Provider egress approval gate

## Mannamál

Samþykkti reikni- og gagnasamningurinn er kominn í keyranlegan, markvisst
prófaðan domain helper. Næsta skref er server-only myndgreining, en sjálfvirk
öryggisrýni hafnaði því að skrifa kóða sem sendir kvittunarmynd til Anthropic.
Hún krefst beins samþykkis fyrir þessa viðkvæmu gagnaflutninga, provider-vinnslu
og mögulegan kostnað. Engin mynd var send og enginn provider-kóði var skrifaður.

## Plan áfangans

1. Staðfesta exact current base og dependency parity í nýju worktree.
2. Flytja canonical task evidence efnislega úr stale worktree.
3. Útfæra og prófa canonical fractional allocation domain.
4. Hefja server-only OCR adapter eftir samþykktum product samningi.

## Hvað var gert

- Exact clean base 57a57d33c093a89ef38dd087acfa2b789897435d staðfestur.
- Hotfix 7521e376 staðfestur sem ancestor.
- Package og lockfile staðfest gegn donor dependency uppsetningu og ignored
  node_modules junction tengt.
- Canonical task overview og Gate A handoffs varðveitt í nýju worktree.
- receipt-split.ts útfærir strict action/view schemas, 3-decimal quantity og
  deterministic largest-remainder skiptingu, þar með talið adjustments.
- Fimm markviss domain/contract próf skrifuð og keyrð GREEN.
- Shared path viðbót fyrir atomic finalizer og author presentation var
  tilkynnt og samþykkt af root.

## Skrár skoðaðar

- Root og repo WORKFLOW.md, AGENTS.md og Design.md
- Expense draft, publication, repository, action og participant contracts
- SQL103, SQL159, SQL168, SQL175 og SQL177 lineage
- Existing private attachment upload/storage pattern
- Existing Anthropic SDK usage og cron patterns

## Skrár breyttar

- docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md
- docs/tasks/expense-receipt-item-claims/handoffs/2026-09-13-2233-v001-codex-task-activated.md
- docs/tasks/expense-receipt-item-claims/handoffs/2026-09-13-2243-v002-codex-gate-a-product-decisions.md
- docs/tasks/expense-receipt-item-claims/handoffs/2026-09-13-2317-v003-codex-provider-egress-approval-gate.md
- lib/expenses/receipt-split.ts
- lib/__tests__/expense-receipt-split.test.ts

Ignored local-only tooling: node_modules junction, utan Git diff.

## Skipanir og niðurstöður

- Git base/status/ancestor checks: GREEN.
- Package/lock SHA-256 parity: GREEN.
- npm.cmd run test:run -- lib/__tests__/expense-receipt-split.test.ts:
  exit 0, 1 file og 5 próf GREEN.
- Fyrsta npm keyrsla lenti í PowerShell execution-policy; endurkeyrsla með
  npm.cmd breytti engu og var GREEN.
- Tilraun til að bæta receipt-split.server.ts við var hafnað af sjálfvirkri
  approval review áður en patch var skrifað. Engin partial skrá varð til.
- git diff --check: exit 0, GREEN.

## Exact current candidate evidence

- lib/expenses/receipt-split.ts SHA-256:
  14A39BC24F7231E1C3530F76E6AE6B4E960E524BA082227E42D1B85FB58F310A
- lib/__tests__/expense-receipt-split.test.ts SHA-256:
  0B6B3549166440B13A8317BD0A65A39AC6BB354F3F5C90D7EC88EF316F78A9DD
- package.json SHA-256, unchanged:
  E47E29AC451E6467798D28108CF73595587194D26ABD642E5D650C2BE1FD04D6
- package-lock.json SHA-256, unchanged:
  140302EC1119DFD42D78C0151D95D601B56A1CE94F44092B54C08E901581EAA5
- Git status contains only the task-owned docs directory and the two new
  receipt domain/test paths. node_modules remains ignored.
- receipt-split.server.ts does not exist.

## Preservation

No write, Git mutation, dependency command, cleanup, reset, stash or checkout
was run in the old main workspace. Its HEAD remains
7fdabefbbc51d2fc5d7574c71e7446fa0cc88238 and its ambient tracked/untracked
state was only read. No package, SQL, app, provider, environment or Production
state was changed.

## Finding og STOP

Approval reviewer sagði að kóðinn myndi senda uploaded receipt images og
mögulega viðkvæm fjárhags-/persónugögn til Anthropic með API lykli. Hún taldi
að Stebbi hefði ekki samþykkt sérstaklega provider destination, provider-vinnslu,
mögulegan provider/billing kostnað og retention/data-processing afleiðingar.

Reviewer bannaði workaround eða indirect implementation. Því er þetta
raunveruleg privacy/provider gate, þótt fyrri product ákvörðun hafi nefnt
server-only Anthropic Vision adapter.

## Minnsta örugga næsta ákvörðun

Stebbi þarf að samþykkja skýrt að server Teskeiðar megi senda bytes úr
kvittunarmynd til Anthropic í eina extraction beiðni, með mögulegum
provider-kostnaði og vinnslu hjá Anthropic. Teskeið varðveitir ekki provider
payload; raw mynd er private og eyðist við confirm/delete eða innan 7 daga.

Eftir slíkt samþykki heldur Codex áfram með server adapter, SQL179 operator
package, UI, static/focused/full gates og sameinaða rýni án nýs millistopps.

## Supabase

Engin SQL skrá hefur enn verið skrifuð í þessum áfanga og ekkert SQL var
keyrt. Enginn Production lestur eða gagnabreyting fór fram.

## Áhætta

Án provider-egress samþykkis er ekki heimilt að byggja samþykkta
myndgreiningarleiðina. Að halda áfram með fake/local OCR væri önnur
vöruniðurstaða og er ekki heimilað.

## Localhost checks for Stebbi

Ekki tilbúið. Enginn localhost server var ræstur. Þegar candidate nær reviewed
manual SQL gate mun síðara handoff skilgreina upload, extraction review,
fractional/delegated claim, remaining quantity, total mismatch, finalization og
ledger-próf. Engin raunveruleg kvittun má senda fyrr en provider-egress
samþykki og nauðsynleg SQL/app lineage er til staðar.
