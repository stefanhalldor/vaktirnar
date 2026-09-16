# SQL187 migration Success

Date: 2026-09-16 19:40
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual SQL187 Success, endurstaðfesta frysta artifacts og afhenda read-only
exact postflight.

## Hvað var raunverulega gert

- Stebbi keyrði SQL187 einu sinni eftir grænt preflight.
- Skjámynd sýnir `Success. No rows returned`.
- Migration, preflight og postflight hashes eru óbreytt frá v062-v063.
- Hotfixið má ekki endurkeyra.

## Skrár sem voru skoðaðar

- Actual Supabase SQL Editor skjámynd
- SQL187 artifacts
- Canonical lýsing og v063

## Skrár sem voru breyttar

- Canonical verkefnalýsing
- Þetta handoff

## Skipanir og niðurstöður

- Actual migration: `Success. No rows returned`.
- Migration SHA-256:
  `1B374AD0F904139FF457FBEBC64FD29F75D98583FDE8FAB13A50FFAB6BE2D779`
- Preflight SHA-256:
  `4C29E828E6ACC3504B12FF103C0748A5C2D39D814E127F9EAF1DC4FB76778753`
- Postflight SHA-256:
  `A9885D502942944A09D4B901344AFE7EAE72DC1BED22179AF01A79B1B19ACA9F`
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Ekkert migration-error sást. Postflight og localhost retry voru ekki framkvæmd;
engin commit, push eða deploy.

## Ákvarðanir

Success er ekki exact install. Aðeins catalog-only postflight er næst.

## Áhætta sem er enn til staðar

Nýr alias og varðveitt security/projection eru ekki catalog-staðfest fyrr en
postflight er grænt.

## Næsta skref og workflow-stopp

Stebbi keyrir aðeins
`sql/validation/187-receipt-split-read-v2-list-alias-hotfix/postflight.sql`.
Samþykkja aðeins `EXACT_INSTALLED` með `security_ok`, `new_alias_ok`,
`old_alias_absent` og `projection_ok` öll `true`.

## Spurningar fyrir rýni

Engin opin spurning; actual catalog-state er næsta sönnun.

## Supabase-áhrif

Stebbi keyrði function-only hotfixið. Codex keyrði ekkert SQL. Engin data/RLS-
breyting var ætluð; exact function/ACL staða bíður postflight.

## Breytingar á verkefnalýsingu

Current gate var fært úr SQL187 migration yfir í read-only postflight.

## Localhost checks for Stebbi

Ekki endurhlaða sem release-sönnun fyrr en postflight er exact. Þá á listinn að
hlaðast án `(rpc)` og sýna fyrri sharing-reikning.

## Óvissa / þarf að staðfesta

Exact SQL187 catalog-state er óstaðfest.
