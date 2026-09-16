# Expense receipt item claims — provider retry security gate

## Mannamálsstaða

Candidate getur varðveitt private kvittunarmynd þegar Anthropic extraction
mistekst, en núverandi skjár tryggir ekki að notandi geti fundið og endurkeyrt
myndgreininguna eftir navigation. Þetta breytir ekki fjárhagsgögnum, en þarf
skýran server authority samning áður en release gates halda áfram.

## Gate og recommendation

Auto-review hafnaði fyrirhuguðu owner-scoped retry þar sem client mætti sleppa
`upload_id` og server finna það út frá staðfestum actor + draft. Ástæða
auto-review var að það breytti SQL security/identity contracti og fleiri
runtime/UI paths án sérstaks samþykkis. Enginn hluti þess patches var skrifaður.

Stebbi þarf að velja eina leið:

- **A, ráðlagt:** heimila server-authorized retry þar sem session actor þarf að
  vera exact receipt owner á exact draft; server finnur bundið upload ID og
  staðfestir object metadata áður en sama einnar-beiðni Anthropic extraction er
  endurtekin. Enginn upload ID eða identity hash kemur frá browser sem authority.
- **B:** extraction failure verður eingöngu eyðanlegt state og ný tilraun krefst
  nýrrar myndhleðslu/nýs drafts. Þá þarf notandatexti og UI að segja það skýrt.

Recommendation A varðveitir samþykkta mynd-retention reglu, minnkar orphan
private objects og notar þrengri authority en client-supplied upload ID.

## Hvað er útfært

- Receipt domain validation, 3-decimal quantity og deterministic largest remainder.
- Server-only Anthropic Vision adapter með strict validated tool output og engri
  provider request/response vistun.
- Private signed upload/read, SHA-256 og image magic/size/MIME verification.
- Review, delegated fractional claims og atomic v2 confirmation inn í canonical
  Expense ledger.
- Opaque receipt-scoped party handles; internal identity hashes fara ekki í browser.
- Owner-only explicit image/split deletion; mynd varðveitist eftir confirmation.
- Mobile routes/loading, receipt review/claim UI og confirmed image controls.
- SQL179 apply + read-only preflight/postflight operator package.

## Operator contract

Preflight og postflight eru `SET TRANSACTION READ ONLY`, taka ekkert actor input,
lesa engin application/identity/receipt rows og enda í `ROLLBACK`. Sameiginleg
classification er `PREDECESSOR_READY`, `EXACT_INSTALLED` eða `DRIFT_STOP`.
Static contract pinn-ar canonical LF `prosrc` MD5 fyrir öll 16 target functions,
exact search_path/owner/language/volatility/SECURITY DEFINER/ACL, fimm exact
force-RLS relations án policies eða table grants, núll non-internal triggers og
exact private storage bucket. Apply guard hafnar partial targets og sama
prerequisite/lineage drift. SQL var aldrei keyrt.

## Gates sem eru GREEN

- SQL179 static/operator/source/security: 10/10, exit 0.
- Focused domain/server/UI og tengd expense regression: 123/123, exit 0.
- TypeScript `tsc --noEmit`: exit 0.
- `git diff --check`: exit 0 (eingöngu Git line-ending warnings).

Full expense suite, full Vitest suite, Production build og lokarýni bíða þar
til retry authority ákvörðun er leyst svo þau keyri á endanlegum bytes.

## Exact current candidate scope og SHA-256

```text
abc78d96c580625f918b91ff4ed6824f655e74efc1b568da43bcb55d15e7188a  .env.example
08fa31d6cd2bf83e08a2adefca3eb7eabebb235ced2f78002bf2a1f78de72efc  app/auth-mvp/utlagt-og-endurgreitt/drog/[publicationId]/page.tsx
ab3397eb9fda781ee85cf88ed2c4bb91c08653c3b45a45d4b100ce55561befd6  app/auth-mvp/utlagt-og-endurgreitt/nytt/page.tsx
c2dc54dee908e297b95adfaa213e739be61bed0116c96970a45e3d390bfe97af  app/auth-mvp/utlagt-og-endurgreitt/splitta/[draftId]/loading.tsx
90b05169356f9496974fa2d81996b72c55cc2a05dafd564f49cd0755799587fe  app/auth-mvp/utlagt-og-endurgreitt/splitta/[draftId]/page.tsx
d253f576401c5906b7cbce66e925ff60fa3a01a35372fcd4dc26d1ee23fcf124  app/auth-mvp/utlagt-og-endurgreitt/splitta/loading.tsx
fb63d483364d7298ae4f5d5d8db5c17e81c318de277abbf3857079bf12d5eda5  app/auth-mvp/utlagt-og-endurgreitt/splitta/page.tsx
c16dd1f620d6b4a4c3a2759f8f14b872105f481a11041ad07077e5902fbcdc63  app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/page.tsx
d9f0bde32782d4e95f478edd8f3fc85e0ebada2837859836b157fd6ea8daacea  components/expenses/__tests__/expense-receipt-split-panel.test.tsx
02daf8a0bf8e07c0b4fcf816cecf5666c092f9ca230bdc57b8436cb68cebba0d  components/expenses/ExpenseDashboard.tsx
2120b48e16351ef5b53589f9cb59fd73444fab0a51af706a9b1c3318c829f492  components/expenses/ExpenseForm.tsx
07812f1c830064d9bb4ab4c257d6864621411c98a1717ca51351c38b59c2cb0e  components/expenses/ExpenseReceiptImageControls.tsx
b0ae8b08a6c5f37b7ce65a05220aae8fa73aed6cd716e3278d252a28f8fa7234  components/expenses/ExpenseReceiptSplitPanel.tsx
c20ecd30ef83532d4de3ac82d57b3c80383db443775e1d9f4d734dfcdc7bc482  components/expenses/ExpenseReceiptUpload.tsx
4bb0fb46ba4984b037aaeef038cf65e9639242cd739781146cb24b552638b4fc  docs/tasks/expense-receipt-item-claims/handoffs/2026-09-13-2233-v001-codex-task-activated.md
2f7de68fb06f4844b2b7fff2ec06f0e879f28bdb4fb6ead783a8921f67e7f88d  docs/tasks/expense-receipt-item-claims/handoffs/2026-09-13-2243-v002-codex-gate-a-product-decisions.md
d92addb6a407c20c41f9b995d575f576ba00caea2b0c4753ce563033950444ac  docs/tasks/expense-receipt-item-claims/handoffs/2026-09-13-2317-v003-codex-provider-egress-approval-gate.md
0c744c00cab1ac1458d7a9670242da1d06c53a028dab4516752e2347ab668e5a  lib/__tests__/expense-receipt-server.test.ts
0b6b3549166440b13a8317bd0a65a39ac6bb354f3f5c90d7ec88ef316f78a9dd  lib/__tests__/expense-receipt-split.test.ts
0531b83588f5bbe37aa085f3bc9769d61e2bc193188abb7d2fe819728ef1ff6c  lib/__tests__/expense-sql179-receipt-item-claims.test.ts
8836ead92abab53833f4d217191b898b318163a8e74a6995315ff1c9034046cf  lib/expenses/actions.ts
a3e8a9c55f167816d493c743a13e80a22319c5044335179067a2d0ad112b15d9  lib/expenses/receipt-actions.ts
f37a275264e70b5b84ba96df5f1fc99b317247ff4b60e5d661dc9919cbfa471f  lib/expenses/receipt-split.server.ts
874695f1df9d900b2373207d0369c11b4ec3e79c34fc78b17ae192889c2546aa  lib/expenses/receipt-split.ts
8c55f578a210d05260098887a5635e94a0a8e69a8e72837bce8e26acf45d623f  lib/expenses/unconfirmed-publication.ts
5418e4f3333e4936d18240a283fd3d04610a9e134d5c50c52457dc3e4f3bff13  messages/en.json
4cd92c7247dc161b83e3b94bf1c987f64cc09cd69d1263eaba37f6dfcbc0d64a  messages/is.json
b4c033e504af8fe5a8d177d2ab41e24d00b17d8cabc8c6d336ba07ccf2cc4592  sql/179_expense_receipt_item_claims.sql
229745d3ec47b1646b6673881513c7de6313f9deef82c69e38485cf4450798a2  sql/validation/179-expense-receipt-item-claims/postflight.sql
772986e396426dc11d2ac370ca9b76082bb3dd01d6969a11fad7d46d5e42f110  sql/validation/179-expense-receipt-item-claims/preflight.sql
82860cefcf04502a517da278c8db26415378520ddd6725e1fe36a5eee68095c8  sql/validation/179-expense-receipt-item-claims/README.md
```

Canonical overview file itself is part of scope and changes when this immutable
handoff is linked. This handoff file is also newly added, so their final hashes
are intentionally computed at the next resumed gate rather than self-referenced.

## Preservation

- Release worktree HEAD remains exact base
  `57a57d33c093a89ef38dd087acfa2b789897435d`.
- `package.json`, `package-lock.json` and `vercel.json` are outside diff.
- Weather key `roadMapPrototypeBasemapFallback` is not copied into this candidate;
  it remains a future shared-message reconciliation item.
- Main workspace was read-only to this task. Its observed HEAD is
  `7fdabefbbc51d2fc5d7574c71e7446fa0cc88238`; its ambient dirty state belongs to
  Stebbi/root/other task and was not modified, stashed, reset, cleaned or indexed
  by this task.

## Localhost checks for Stebbi

Ekki keyra localhost núna. Candidate er STOP við provider retry authority gate,
SQL179 er óuppsett og app/schema mega ekki prófast sitt í hvoru umhverfi. Eftir
GREEN review og handvirka SQL-gátt verður gefin nákvæm mobile/desktop prófun á
upload, retry, review, delegated fractional claim, total mismatch, confirmation,
owner-only deletion og canonical Útlagt og endurgreitt niðurstöðu.

