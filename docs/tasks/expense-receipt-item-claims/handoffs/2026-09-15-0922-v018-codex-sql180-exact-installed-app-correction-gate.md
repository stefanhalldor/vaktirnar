# SQL180 exact installed — app correction gate

## Mannamálsniðurstaða

SQL180 er staðfest `EXACT_INSTALLED` í Production með `targets_exact=true` og
`postconditions_ok=true`. Ekkert frekara SQL þarf og Codex keyrði ekkert SQL.

Næsta tæknilega skref er tveggja skráa app-candidate leiðrétting áður en
localhost-prófun er lögð fyrir Stebba. Hún samræmir test-reference allocation
við uppsetta zero-total samninginn og merkir manual gjaldmiðilsinput með
decimal mobile keyboard hinti. Engin ný vöruhegðun, SQL eða gagnabreyting
felst í því.

## Staðfest postflight

- `executor_ok=true`
- `prerequisites_exact=true`
- `service_role_exists=true`
- `target_functions_exact=true`
- `target_relations_exact=true`
- `target_triggers_exact=true`
- `target_bucket_exact=true`
- `target_constraint_exact=true`
- `target_catalog_exact=true`
- `targets_exact=true`
- `installation_state=EXACT_INSTALLED`
- `postconditions_ok=true`

## Afmörkuð app-leiðrétting

1. `lib/expenses/receipt-split.ts`: zero-total item er ekki claimable, er
   sleppt úr claimable allocation-summu og claim sem vísar á það er hafnað.
2. `components/expenses/ExpenseReceiptSplitPanel.tsx`: conditional manual
   amount input notar `inputMode="decimal"`.
3. `lib/__tests__/expense-receipt-split.test.ts`: mixed positive, zero og
   adjustment largest-remainder regression ásamt höfnun claim á zero item.

## Localhost checks for Stebbi

Ekki prófa enn. Eftir þessa leiðréttingu, markviss próf, type-check, build og
ferska lokarýni verður afhent eitt afmarkað localhost-próf þar sem zero-total
lína birtist sérstaklega, er sjálfgefið undanskilin og krefst jákvæðrar
fjárhæðar þegar hún er valin.
