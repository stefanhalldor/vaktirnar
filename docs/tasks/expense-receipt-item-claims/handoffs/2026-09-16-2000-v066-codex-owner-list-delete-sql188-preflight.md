# Eyða reikningi úr lista og SQL188

Date: 2026-09-16 20:00
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Bæta öruggri owner-only eyðingu við „Reikningarnir mínir“, endurnýta delete-
lifecycle og stoppa við SQL188 read-only preflight.

## Hvað var raunverulega gert

- Eigandi fær ruslatunnuhnapp við sinn sharing-reikning; þátttakandi fær hann ekki.
- Staðfesting nefnir reikninginn og skýrir að allir þátttakendur missa aðgang.
- Client sýnir pending spinner og safe error; successful delete refreshar listann.
- Server endurstaðfestir session actor, ownership og exact version áður en hann
  notar núverandi tombstone, private-image removal og complete-delete röð.
- SQL188 bætir aðeins `version` og actor-derived `isOwner` við list projection.
- Núverandi „Annað magn“ var yfirfarið: commandið notar `previousUnits=mine` og
  setur eigið claim sem absolute total; það breytir ekki line quantity eða claims
  annarra. Stebbi þarf að staðfesta hvort nýjasta athugasemdin óski eftir additive
  hegðun í stað þessa áður samþykkta total-semantics.

## Skrár sem voru skoðaðar

- Listasíða, v2 actions/delete lifecycle, list contract og SplitBoardV2 ItemRow
- SQL187 function/projection og núverandi tests

## Skrár sem voru breyttar

- `app/auth-mvp/splitta-reikningnum/page.tsx`
- `components/receipt-split/SplitList.tsx` og test
- `lib/receipt-split/actions.ts`, `contracts.ts` og action test
- `messages/is.json`, `messages/en.json`
- `sql/188_receipt_split_owner_list_controls.sql`
- `sql/validation/188-receipt-split-owner-list-controls/*`
- `lib/__tests__/receipt-split-sql188-owner-list.test.ts`
- Canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- Type-check: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- Þrjár focused test skrár: 21/21 PASS, exit 0.
- Locale JSON parse: PASS.
- Fyrsta test-run hafði tvær rangar test-væntingar (escaped SQL literal og safe
  conflict fyrir non-owner); implementation breyttist ekki og rerun var 21/21.
- Migration SHA-256:
  `EB5FAEAD61FCD46D4048D2FF5AE313D185D042AA417FC559F455F23C52A2F9C6`
- Preflight SHA-256:
  `A6A22B51094E0F6D266D37E5CD6851B3D3D3C78BCE83612549911D15F97FCED0`
- Postflight SHA-256:
  `1415F77C8CD3F92BBB9144345BA26475CAA329F9D9262C11D1C34EA0690DF61C`
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

SQL188 var ekki keyrt. Eyðing var ekki browser-prófuð. Engin commit, push eða
deploy var framkvæmd.

## Ákvarðanir

Delete er aðeins fyrir owner. Participant-removal/leave er annað product-scope.
Client-sent owner/version er aldrei authoritative; server rechecks bæði.

## Áhætta sem er enn til staðar

Storage delete getur bilað eftir tombstone eins og í núverandi detail-flæði;
idempotent retry/recovery contract helst. SQL188 projection þarf exact gates.

## Næsta skref og workflow-stopp

Stebbi keyrir aðeins
`sql/validation/188-receipt-split-owner-list-controls/preflight.sql`.
Halda aðeins áfram á `READY` með `operator_ok`, `predecessor_ok`,
`old_projection_ok` og `addition_absent` öll true.

## Spurningar fyrir rýni

- Á „Annað magn“ að setja **mitt heildarmagn** (núverandi samningur), eða á
  innslátturinn að **bætast við** mitt núverandi magn? Þetta breytir merkingu
  `10%`/`1/10` og þarf skýra ákvörðun.

## Supabase-áhrif

SQL188 er aðeins skrifað. Það bætir tveimur listareitum við service-only read
function. Engin data, RLS, policy, client grant eða auth breyting. Delete notar
fyrirliggjandi actor-bound lifecycle.

## Breytingar á verkefnalýsingu

Owner-only list delete og SQL188 gate voru bætt við. Magnmerkingin var skráð sem
opin vegna nýjustu athugasemdar Stebba; engin semantics-breyting var gerð í laumi.

## Localhost checks for Stebbi

Ekki prófa delete fyrr en SQL188 er exact. Eftir það:

1. Owner sér ruslatunnu; participant sér hana ekki.
2. Cancel í confirm breytir engu.
3. Confirm eyðir reikningnum úr lista og detail-hlekkur verður óaðgengilegur.
4. Prófa aðeins synthetic duplicate, ekki eina mikilvæga kvittun.
5. Staðfesta pending spinner, safe error og 360px layout.

## Óvissa / þarf að staðfesta

SQL188 catalog-state og additive-vs-total merking „Annað magn“.
