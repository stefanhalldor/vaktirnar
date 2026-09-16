# Reikningalisti sýnir lestrarvillu

Date: 2026-09-16 19:20
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims

## Plan áfangans

Greina af hverju eldri reikningur birtist ekki og fjarlægja falska empty-state
framsetningu án þess að breyta samþykktri sharing-only reglu.

## Hvað var raunverulega gert

- Staðfest var úr SQL182 og SQL186 að listinn er afturvirkur; owner-membership
  var stofnuð með reikningnum frá upphafi.
- Staðfest var að síðan síar viljandi á `state=sharing`.
- Silent `catch(() => null)` var breytt þannig að lestrar-/schema-villa birtir
  nú `loadFailed` skilaboð í UI.

## Skrár sem voru skoðaðar

- Listasíða, server reader, contracts og SQL182/SQL186 read functions.

## Skrár sem voru breyttar

- `app/auth-mvp/splitta-reikningnum/page.tsx`
- Canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- `npm.cmd run type-check`: PASS, exit 0.
- Scoped ESLint: PASS, exit 0.

## Hvað mistókst eða var sleppt

Actual browser-niðurstaða eftir hot reload bíður Stebba. Engin SQL-keyrsla,
commit, push eða deploy var framkvæmd.

## Ákvarðanir

Listinn sýnir áfram aðeins reikninga þar sem yfirferð er staðfest og skipting
hafin. Review/uploading/extracting eiga ekki að birtast samkvæmt fyrri ákvörðun.

## Áhætta sem er enn til staðar

Ef engin villa birtist og listinn er tómur þarf að staðfesta state og actor fyrir
tiltekinn reikning. Ekki álykta gagnatap út frá tómum sharing-lista.

## Næsta skref og workflow-stopp

Stebbi endurhleður listasíðuna. Lestrarvilla gefur nú sýnilegt error; annars þarf
að opna fyrri detail-hlekk og staðfesta hvort reikningurinn sé enn í review eða
hvort annar notandi sé skráður inn.

## Spurningar fyrir rýni

Hvaða state sýnir detail-skjár fyrri reikningsins og birtist `loadFailed`?

## Supabase-áhrif

Engin. SQL186 helst exact uppsett.

## Breytingar á verkefnalýsingu

Backwards compatibility og sharing-only birting var skýrð. Silent listavilla var
skráð sem lagfærð. Localhost-gáttin er áfram opin.

## Localhost checks for Stebbi

1. Endurhlaða `/auth-mvp/splitta-reikningnum`.
2. Ef lestrarvilla birtist, senda texta og server-logg línuna.
3. Ef engin villa birtist, opna fyrri detail-hlekk. Sharing-skjár á að koma í
   listann; review-skjár kemur ekki fyrr en staðfest er og skipting hefst.

## Óvissa / þarf að staðfesta

State og actor-binding fyrri reikningsins sjást ekki á skjámyndinni.
