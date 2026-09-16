# SQL187 alias-hotfix preflight

Date: 2026-09-16 19:30
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Laga staðfesta PostgreSQL 42702 runtime-villu í SQL186 listagrein með minnsta
mögulega function-only hotfix og stöðva við read-only preflight.

## Hvað var raunverulega gert

- Server diagnostic staðfesti `column reference "s.id" is ambiguous`.
- SQL187 endurnefnir aðeins töflualiasinn `s` í `split_row` í null-ID listagrein
  `receipt_split_read_v2`; PL/pgSQL record variable `s` fyrir detail helst óbreytt.
- Preflight sannreynir exact gamla aliasið og að hotfixið sé absent.
- Postflight sannreynir nýja aliasið, fjarveru gamla aliasins, projection og ACL.
- Runtime diagnostic notar nú `console.warn` og birtir ekki reikningsgögn.

## Skrár sem voru skoðaðar

- Actual localhost error code/message/details
- SQL186 read function, list server og contract
- SQL186 security/postflight samningur

## Skrár sem voru breyttar

- `lib/receipt-split/server.ts`
- `app/auth-mvp/splitta-reikningnum/page.tsx`
- `sql/187_receipt_split_read_v2_list_alias_hotfix.sql`
- `sql/validation/187-receipt-split-read-v2-list-alias-hotfix/*`
- `lib/__tests__/receipt-split-sql187-hotfix.test.ts`
- Canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- Type-check: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- Tvær focused SQL contract skrár: 4/4 PASS, exit 0.
- Fyrsta static-próf var ranglega að leita að predecessor-texta í guard og féll;
  það var þrengt að replacement function body og síðan 4/4 PASS.
- SHA-256 migration:
  `1B374AD0F904139FF457FBEBC64FD29F75D98583FDE8FAB13A50FFAB6BE2D779`
- SHA-256 preflight:
  `4C29E828E6ACC3504B12FF103C0748A5C2D39D814E127F9EAF1DC4FB76778753`
- SHA-256 postflight:
  `A9885D502942944A09D4B901344AFE7EAE72DC1BED22179AF01A79B1B19ACA9F`
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Python SQL parser er enn ótiltækur í environmentinu. SQL187 var ekki keyrt.
Engin commit, push eða deploy var framkvæmd.

## Ákvarðanir

Hotfixið breytir ekki listareglum, gögnum eða aðgangi. Það leysir aðeins alias-
collision milli PL/pgSQL record `s` og table alias `s`.

## Áhætta sem er enn til staðar

SQL187 þarf actual preflight, eina migration-keyrslu og exact postflight áður en
listinn er prófaður aftur. Function replacement varðveitir security-definer,
empty search_path og service-only execute.

## Næsta skref og workflow-stopp

Stebbi keyrir aðeins
`sql/validation/187-receipt-split-read-v2-list-alias-hotfix/preflight.sql`.
Halda aðeins áfram ef `operator_state=READY` og `operator_ok`, `predecessor_ok`,
`old_alias_present` og `hotfix_absent` eru öll `true`.

## Spurningar fyrir rýni

Engin opin product-spurning. Næsta rýni er actual predecessor catalog-state.

## Supabase-áhrif

SQL187 er aðeins skrifað, ekki keyrt. Það `CREATE OR REPLACE`-ar eitt service-only
read function. Engin tafla, röð, RLS policy, membership eða auth-gögn breytast.

## Breytingar á verkefnalýsingu

Actual 42702 orsök og SQL187 workflow-gátt voru skráð. Localhost-listaprófun
bíður exact hotfix-installation.

## Localhost checks for Stebbi

Ekkert localhost-retry fyrr en SQL187 postflight er exact. Eftir það endurhlaða
listasíðuna: `(rpc)` diagnostic á að hverfa og fyrri sharing-reikningur að birtast
með heiti og dagsetningu.

## Óvissa / þarf að staðfesta

Actual SQL187 catalog-state er óþekkt þar til preflight er keyrt.
