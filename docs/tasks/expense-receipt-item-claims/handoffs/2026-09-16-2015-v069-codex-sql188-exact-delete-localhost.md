# SQL188 exact og delete-próf

Date: 2026-09-16 20:15
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual SQL188 exact postflight, loka SQL-gáttinni og færa owner-only list
delete í localhost-prófun.

## Hvað var raunverulega gert

- Actual postflight skilaði `EXACT_INSTALLED`.
- `security_ok`, `alias_ok`, `owner_projection_ok` og `detail_projection_ok`
  voru öll `true`.
- Artifacts voru endurhash-uð og eru óbreytt.

## Skrár sem voru skoðaðar

- Actual SQL188 postflight-röð, artifacts, canonical lýsing og v068.

## Skrár sem voru breyttar

- Canonical verkefnalýsing og þetta handoff.

## Skipanir og niðurstöður

- Postflight actual: `EXACT_INSTALLED`, 4/4 booleans true.
- Migration SHA-256:
  `EB5FAEAD61FCD46D4048D2FF5AE313D185D042AA417FC559F455F23C52A2F9C6`
- Preflight SHA-256:
  `A6A22B51094E0F6D266D37E5CD6851B3D3D3C78BCE83612549911D15F97FCED0`
- Postflight SHA-256:
  `1415F77C8CD3F92BBB9144345BA26475CAA329F9D9262C11D1C34EA0690DF61C`
- GoLive follow-up var uppfært með exact niðurstöðu og localhost-gátt;
  HTTP `200`, staða `in_progress`.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Browser-delete er óprófað; engin commit, push eða deploy.

## Ákvarðanir

SQL188-gáttinni er lokað. Enga SQL-skrá á að keyra aftur. Delete er aðeins
eiganda; leave/remove-from-my-list fyrir þátttakanda er ekki þetta scope.

## Áhætta sem er enn til staðar

Actual confirm, pending, storage cleanup og list refresh þurfa browser evidence.
Eyða skal synthetic duplicate en ekki mikilvægri kvittun.

## Næsta skref og workflow-stopp

Stebbi endurhleður listann á localhost:3004 og prófar owner-only eyðingu.

## Spurningar fyrir rýni

Sést ruslatunnan aðeins eiganda og hverfur reikningurinn eftir staðfesta eyðingu?

## Supabase-áhrif

SQL188 er exact uppsett: read function heldur service-only security og skilar
actor-derived owner/version metadata. Engin data/RLS/client grant breyting.

## Breytingar á verkefnalýsingu

Current gate var fært úr postflight yfir í localhost delete-próf.

## Localhost checks for Stebbi

1. Endurhlaða `/auth-mvp/splitta-reikningnum` á 3004.
2. Eigandi sér ruslatunnu við eigin reikninga; þátttakandi sér hana ekki.
3. Prófa Cancel og staðfesta að ekkert breytist.
4. Velja synthetic duplicate, staðfesta eyðingu og sjá pending spinner.
5. Reikningurinn hverfur úr listanum og gamli detail-hlekkurinn verður óvirkur.
6. Staðfesta að annar reikningur og participant-aðgangur hafi ekki breyst.

## Óvissa / þarf að staðfesta

Actual localhost-delete er eina opna gátt þessa undirskrefs.
