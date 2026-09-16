# SQL187 exact og listaretry

Date: 2026-09-16 19:45
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá exact SQL187 postflight, loka hotfix-gáttinni, hreinsa tímabundna diagnostic
copy og endurprófa fyrri sharing-reikning á localhost.

## Hvað var raunverulega gert

- Actual postflight skilaði `EXACT_INSTALLED`.
- `security_ok`, `new_alias_ok`, `old_alias_absent` og `projection_ok` voru öll
  `true`.
- Tímabundin `(rpc)/(contract)` merking var fjarlægð úr user-facing villu.
- Almennt load-error og safe server diagnostic code haldast.

## Skrár sem voru skoðaðar

- Actual SQL187 postflight-röð
- Listasíða og server reader
- Canonical lýsing og v064

## Skrár sem voru breyttar

- `app/auth-mvp/splitta-reikningnum/page.tsx`
- `lib/receipt-split/server.ts`
- Canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- Postflight actual: `EXACT_INSTALLED`, 4/4 booleans true.
- Type-check: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Actual browser-listaretry bíður Stebba. Engin SQL-keyrsla var framkvæmd af
Codex; engin commit, push eða deploy.

## Ákvarðanir

SQL187-gáttinni er lokað. Enga SQL-skrá á að keyra aftur. Sharing-only regla
reikningalistans helst óbreytt.

## Áhætta sem er enn til staðar

Þótt function body og ACL séu exact þarf actual RPC/browser-kall að staðfesta að
42702 sé horfið og fyrri reikningur komi í listann.

## Næsta skref og workflow-stopp

Stebbi endurhleður `/auth-mvp/splitta-reikningnum` á localhost:3004. Vænt:
engin load-error og fyrri sharing-reikningur með heiti og dagsetningu.

## Spurningar fyrir rýni

Kemur fyrri reikningur nú í listann og opnast detail án villu?

## Supabase-áhrif

SQL187 er exact uppsett. Function er security-definer, empty search_path og
service-only samkvæmt postflight. Engin data/RLS breyting.

## Breytingar á verkefnalýsingu

Current gate var fært úr SQL187 postflight yfir í localhost listaretry.

## Localhost checks for Stebbi

1. Endurhlaða listasíðuna á 3004.
2. Staðfesta að rauða load-error sé horfið.
3. Staðfesta að fyrri sharing-reikningur sjáist með dagsetningu.
4. Opna hann og staðfesta eðlilegan detail-skjá.

## Óvissa / þarf að staðfesta

Actual browser-listaretry er óstaðfest.
