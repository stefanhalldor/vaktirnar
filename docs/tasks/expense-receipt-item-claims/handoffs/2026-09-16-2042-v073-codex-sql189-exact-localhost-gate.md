# SQL189 exact og localhost-gátt

Date: 2026-09-16 20:42
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual exact postflight, loka SQL-gáttinni og færa sameiginlegt gengi í localhost-próf.

## Hvað var raunverulega gert

- Actual postflight skilaði `EXACT_INSTALLED`.
- `security_ok`, `projection_ok`, `member_version_ok` og `columns_ok` voru öll `true`.
- Artifact-hashes voru endurstaðfest óbreytt.

## Skrár sem voru skoðaðar

- Actual postflight-röð, SQL189 artifacts, v072 og canonical verkefnalýsing.

## Skrár sem voru breyttar

- Canonical verkefnalýsing og þetta handoff.

## Skipanir og niðurstöður

- Postflight actual: `EXACT_INSTALLED`, 4/4 booleans true.
- Migration SHA-256: `87C57ACC260DC1F9B313039268F93F87D33C3615859DCFCC75CBD1933AA792A2`.
- Preflight SHA-256: `4A2FE43A63A0724215A9A9CE00E1E01F53CECD6F98D3141BFD64E0FFA188A4FB`.
- Postflight SHA-256: `475B39FEE38BF1377AE939FF06484C14042E08A392F25F4E9B4F7BE6ED8CFAD5`.
- GoLive follow-up uppfærsla: HTTP `200`, staða `in_progress`.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Browser-próf er ólokið. Engin commit, push eða deploy.

## Ákvarðanir

SQL189-gáttinni er lokað. Enga SQL-skrá á að keyra aftur.

## Áhætta sem er enn til staðar

Vistað gengi, þátttakendaraðir, refresh milli tveggja notenda, stale conflict og
mobile keyboard þurfa actual browser evidence.

## Næsta skref og workflow-stopp

Stebbi prófar sameiginlegt gengi á localhost:3004 með eiganda og þátttakanda.

## Spurningar fyrir rýni

Sjá báðir notendur sömu vistuðu mynt/gengi og rétta upphæð hvers þátttakanda?

## Supabase-áhrif

SQL189 er exact uppsett. Service-only fallið er member-bound og versioned;
projection og tveir nullable dálkar eru til staðar. Engin RLS/client grant víkkun.

## Breytingar á verkefnalýsingu

Current gate var færð úr SQL postflight yfir í localhost gengispróf.

## Localhost checks for Stebbi

1. Endurhlaða sama sharing-splitt sem eigandi og annar þátttakandi.
2. Opna „Reikna í annarri mynt“, slá inn `PLN` og `4,5`.
3. Staðfesta að allir þátttakendur sjáist með hlut hvers í reikningsmynt og PLN.
4. Vista sem þátttakandi; endurhlaða báða glugga og sjá sömu vistuðu gildi.
5. Breyta genginu í öðrum glugga. Stale vistun má gefa conflict en má ekki
   yfirskrifa nýrri breytingu.
6. Staðfesta að óskipt fjárhæð birtist sér þegar hún er til staðar.
7. Prófa 360 px breidd og mobile keyboard án zoom, overflow eða falins takka.
8. Staðfesta að claims, línufjárhæðir og reikningsmynt breytist ekki.

Owner-only eyðingarprófið úr v069 er áfram opið og má prófa á synthetic duplicate.

## Óvissa / þarf að staðfesta

Actual localhost-gengispróf er eina opna gátt þessa undirskrefs.
