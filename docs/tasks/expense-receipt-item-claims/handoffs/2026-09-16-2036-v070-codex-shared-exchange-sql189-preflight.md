# Sameiginlegt vistað gengi

Date: 2026-09-16 20:36
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Vista birtingarmynt og gengi á splittinu, leyfa öllum skráðum þátttakendum að
uppfæra þau og sýna hlut hvers þátttakanda í báðum myntum inni í skúffunni.

## Hvað var raunverulega gert

- Gengisskúffan sýnir alla þátttakendur og fjárhæð hvers í reikningsmynt og
  umreiknaðri mynt. Óskipt fjárhæð birtist sér þegar hún er til staðar.
- Birtingarmynt er frjáls þriggja stafa innsláttur sem normalíserast í hástafi.
- Allir skráðir þátttakendur geta vistað sameiginleg gildi; síðasta samþykkta
  versioned breyting gildir fyrir alla.
- Vistað gengi breytir hvorki reikningsmynt, línum né claims.
- SQL189 og read-only preflight/postflight artifacts voru skrifuð en ekki keyrð.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `Design.md`, v2 UI/contracts/actions/summary/exchange.
- SQL184, SQL186, SQL187 og SQL188 ásamt SQL188 validation artifacts.

## Skrár sem voru breyttar

- `components/receipt-split/SplitBoardV2.tsx`
- `lib/receipt-split/actions.ts`
- `lib/receipt-split/view-v2.ts`
- `lib/receipt-split/exchange.ts`
- `messages/is.json`, `messages/en.json`
- v2 UI/action/exchange próf og nýtt SQL189 contract-próf
- `sql/189_receipt_split_shared_exchange.sql`
- `sql/validation/189-receipt-split-shared-exchange/*`
- canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- `npm.cmd run type-check`: PASS.
- Scoped ESLint: PASS.
- Fjögur focused test files: 36/36 PASS.
- Locale JSON parse: PASS.
- SQL189 migration SHA-256:
  `87C57ACC260DC1F9B313039268F93F87D33C3615859DCFCC75CBD1933AA792A2`
- Preflight SHA-256:
  `4A2FE43A63A0724215A9A9CE00E1E01F53CECD6F98D3141BFD64E0FFA188A4FB`
- Postflight SHA-256:
  `475B39FEE38BF1377AE939FF06484C14042E08A392F25F4E9B4F7BE6ED8CFAD5`
- GoLive follow-up uppfærsla: HTTP `200`, staða `in_progress`.

## Hvað mistókst eða var sleppt

Fyrsta samhliða test/lint keyrsla rakst á PowerShell execution policy fyrir
`npm.ps1`/`npx.ps1`; sama prófun var keyrð með `.cmd` og stóðst. SQL var ekki
keyrt. Engin commit, push eða deploy voru framkvæmd.

## Ákvarðanir

- Birtingarmynt er frjáls ISO-laga þriggja stafa kóði, ekki dropdown.
- Gengi styður allt að átta aukastafi og er vistað nákvæmlega sem decimal.
- Allir members mega skrifa, en aðeins í `sharing` state og með exact version.
- Request ledger gerir retry með sama request-id idempotent.

## Áhætta sem er enn til staðar

- PostgreSQL actual preflight þarf að staðfesta nákvæman SQL188 predecessor.
- Samtímis claim eða gengisbreyting getur valdið öruggu conflict; notandi þarf
  þá að lesa nýjustu stöðu og vista aftur.
- Frjálsi kóðinn er þriggja stafa myntkóði; hann sækir ekki markaðsgengi.

## Næsta skref og workflow-stopp

Stebbi keyrir aðeins SQL189 `preflight.sql`. Halda áfram aðeins ef niðurstaðan
er `READY` og öll boolean-gildi eru `true`.

## Spurningar fyrir rýni

Staðfestir actual preflight exact SQL188 predecessor, fjarveru dálka og fjarveru
nýja functionsins?

## Supabase-áhrif

SQL189 er aðeins skrifað. Það bætir tveimur nullable dálkum og einu service-only
SECURITY DEFINER falli við. Fallið sannreynir actor, membership, sharing state,
version og idempotency request. Engin RLS policy eða client grants breytast og
engin núverandi gögn eru endurskrifuð.

## Breytingar á verkefnalýsingu

Stebbi breytti upphaflegu local-only gengisreikninum í sameiginlega vistaða
stillingu, opna öllum þátttakendum, og skipti dropdown út fyrir frjálsan
þriggja stafa myntinnslátt.

## Localhost checks for Stebbi

Eftir SQL189 exact postflight:

1. Opna sama sharing-splitt sem eigandi og þátttakandi.
2. Opna „Reikna í annarri mynt“ og slá inn t.d. `PLN` og `4,5`.
3. Staðfesta að allir þátttakendur sjáist með EUR og PLN fjárhæð hvers.
4. Vista sem þátttakandi, endurhlaða báða glugga og staðfesta sömu gildi.
5. Breyta genginu í hinum glugganum; stale vistun á að gefa conflict en ekki
   yfirskrifa nýrra gengi.
6. Prófa 360 px breidd og mobile keyboard: enginn zoom, overflow eða falinn takki.
7. Staðfesta að claims, línufjárhæðir og reikningsmynt breytist ekki.

Ekki prófa með mikilvægum production-gögnum áður en migration hefur farið í
samþykkt rollout. SQL189 á ekki að keyra fyrr en preflight hefur skilað READY.

## Óvissa / þarf að staðfesta

Actual SQL189 preflight er eina opna SQL-gátt þessa undirskrefs.
