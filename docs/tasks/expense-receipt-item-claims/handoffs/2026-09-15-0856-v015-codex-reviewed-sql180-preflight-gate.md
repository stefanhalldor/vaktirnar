# SQL180 zero-total receipt review — reviewed preflight gate

## Mannamálsniðurstaða

SQL180 operator-pakkinn er fullrýndur GREEN. Hann varðveitir núll-línur úr
kvittun í sérstaka yfirferð, en þær eru óclaimable og fjárhagslega óvirkar þar
til owner velur línuna og skráir jákvæða fjárhæð. Neikvæðar item-línur eru
áfram bannaðar. Codex keyrði ekkert SQL.

Næsta skref er ein handvirk, read-only preflight keyrsla hjá Stebba. Ekki keyra
apply, postflight, rehearsal eða recovery núna.

## Operator scope og öryggi

- Apply breytir aðeins `expense_receipt_items_total_check`, sex SQL179 function
  bodies og catalog seal úr SQL179 í SQL180.
- Preflight, apply guard, postflight, rehearsal og recovery nota sama
  classifier yfir 16 functions, 5 relations, columns, constraints, indexes,
  RLS/force RLS, policy absence, non-internal trigger absence, private bucket
  og version-bound catalog seal.
- Dynamic ACL comparison ber nákvæmlega saman grantor, grantee, privilege og
  grant option og krefst þess að `service_role` sé til. Óvænt réttindi eða
  metadata skila drift.
- Recovery breytir engu nema installed SQL180 sé exact og engin varðveitt
  zero-total item-röð sé til. Þá endurheimtir hún exact SQL179 bodies,
  constraint og SQL179 seal.
- Engar breytingar eru á actor scope, RLS, grants, greiðslum, claims,
  adjustments eða largest-remainder útreikningi fyrir jákvæða liði.

## Lokarýni og gates

- Óháð exact-byte SQL review: GREEN, engin actionable findings.
- SQL179/SQL180 static og contract próf: 3 files, 30/30 GREEN.
- Type check: GREEN.
- Production build: GREEN, 151 routes; aðeins þekkt ótengd lint warnings.
- `git diff --check`: GREEN.
- Preflight og postflight: static read-only GREEN.
- Rehearsal parity: GREEN.
- SQL179 SHA-256 varðveitt:
  `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`.
- Gamla aðalvinnumappan varðveitt: HEAD
  `7fdabefbbc51d2fc5d7574c71e7446fa0cc88238`, 111 status paths og 0 staged.

## Exact reviewed hashes

- Apply: `681d415f667a866099244415ce088906a1e89f69813d36d5c9dee5549d505a47`
- Preflight: `333adba4334efff597d7c7786c6e4266dc71c01724d5094a61fab06cf26984f4`
- Postflight: `afedbb8f7d0fe557201889542af64d16223f27ab40ee5bec852e33be13ef0d5a`
- Rehearsal: `60d0e42b3950cb03d99bc8c4c4edf81095a0130b252ec207353d7de93992008f`
- Recovery: `70ab0c7beee58003a54fa7c338fe1209dbf3b81c045360adebb6130a47217f45`
- Operator README: `6e3247b60b6f09b1e9c365d31bdbaefad611405d553ef9166942c5cf0cdc52be`
- Static test: `c98a8ec1aed81720760e7c813da7b43d015a3cf1bfc05a391d1d8397e15a5b32`

## Handvirk SQL-gátt

Stebbi keyrir alla `preflight.sql` skrána í Production Supabase SQL Editor,
óbreytta og einu sinni. Expected:

- `PREDECESSOR_READY` og `operator_state_ok = true`: næst er reviewed apply
  afhent sérstaklega.
- `EXACT_INSTALLED` og `operator_state_ok = true`: apply er ekki endurkeyrt;
  næst er postflight.
- Annað output, false, vöntun á outputi eða error: STOP.

## Localhost checks for Stebbi

Ekki localhost-prófa zero-total flæðið í þessu skrefi. App og SQL180 schema
þurfa síðar að vera í sama staðfesta umhverfi. Eftir schema og app útgáfu skal
prófa að zero-total línan sé sýnileg í sér yfirferð, sjálfgefið undanskilin og
krefjist jákvæðrar fjárhæðar áður en hægt er að taka hana inn í uppgjör.
