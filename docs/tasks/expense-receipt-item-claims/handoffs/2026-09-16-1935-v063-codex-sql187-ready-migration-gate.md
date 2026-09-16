# SQL187 preflight READY

Date: 2026-09-16 19:35
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual SQL187 preflight, endurstaðfesta artifacts og afhenda function-only
hotfix migrationina sem næsta workflow-gátt.

## Hvað var raunverulega gert

- Actual preflight frá Stebba skilaði `READY`.
- `operator_ok`, `predecessor_ok`, `old_alias_present` og `hotfix_absent` voru
  öll `true`.
- Migration, preflight og postflight hashes eru óbreytt frá v062.
- Ekkert SQL var keyrt af Codex.

## Skrár sem voru skoðaðar

- Actual preflight-röð Stebba
- SQL187 migration/preflight/postflight
- Canonical lýsing og v062

## Skrár sem voru breyttar

- Canonical verkefnalýsing
- Þetta handoff

## Skipanir og niðurstöður

- Migration SHA-256:
  `1B374AD0F904139FF457FBEBC64FD29F75D98583FDE8FAB13A50FFAB6BE2D779`
- Preflight SHA-256:
  `4C29E828E6ACC3504B12FF103C0748A5C2D39D814E127F9EAF1DC4FB76778753`
- Postflight SHA-256:
  `A9885D502942944A09D4B901344AFE7EAE72DC1BED22179AF01A79B1B19ACA9F`
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Migration, postflight, localhost retry, commit, push og deploy
voru ekki framkvæmd.

## Ákvarðanir

Preflight-gáttin er græn. Aðeins frysta SQL187 migrationin er næsta skref og
hún skal ekki endurkeyrð eftir Success.

## Áhætta sem er enn til staðar

Alias-hotfix er ekki virkt fyrr en migrationin hefur verið keyrð og exact
postflight staðfest function body og ACL.

## Næsta skref og workflow-stopp

Stebbi keyrir `sql/187_receipt_split_read_v2_list_alias_hotfix.sql` nákvæmlega
einu sinni. Vænt niðurstaða er `Success. No rows returned`. Actual niðurstaða
þarf að berast áður en postflight er afhent.

## Spurningar fyrir rýni

Engin opin spurning. Næst skal aðeins staðfesta migration-result og hash.

## Supabase-áhrif

Migrationin replace-ar eitt service-only read function og breytir einum alias.
Engin gögn, töflur, RLS policies, auth eða memberships breytast. SQL er enn
ókeyrt.

## Breytingar á verkefnalýsingu

Current gate var fært úr SQL187 preflight yfir í migration. Product-samningur
og app-kóði breyttust ekki.

## Localhost checks for Stebbi

Ekki endurhlaða listann sem release-sönnun fyrr en exact postflight er lokið.
Eftir það á fyrri sharing-reikningur að birtast án `(rpc)` villu.

## Óvissa / þarf að staðfesta

Migrationin hefur ekki verið keyrð.
