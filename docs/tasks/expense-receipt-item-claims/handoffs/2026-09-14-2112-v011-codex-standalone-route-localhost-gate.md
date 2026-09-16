# Splitta reikningnum — standalone route localhost gate

Created: 2026-09-14 21:12
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og niðurstaða

`Splitta reikningnum` er nú sjálfstætt Teskeið á heimaskjá. Það er ekki lengur
hnappur eða route undir `Útlagt og endurgreitt`. Þegar splitt er staðfest flyst
fjárhagslega niðurstaðan áfram viljandi í fyrirliggjandi kostnaðarfinalizer og
birtist þar sem skuld milli þátttakenda.

Skjámynd Stebba sýndi 404 á gömlu nested slóðinni. Sú slóð er nú vísvitandi
horfin. Port 3004 var jafnframt ræst úr old-main checkouti sem hefur ekki þessa
candidate route. Þetta handoff supersede-ar v010 og gefur rétta slóð og exact
vinnumöppu.

## Exact candidate

- Worktree:
  `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2`
- Candidate base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`
- Rétt localhost route:
  [http://localhost:3004/auth-mvp/splitta-reikningnum](http://localhost:3004/auth-mvp/splitta-reikningnum)
- Gamla `/auth-mvp/utlagt-og-endurgreitt/splitta` route-ið er ekki til.

## Environment og ræsing

Old-main `.env.local` inniheldur nú, samkvæmt Stebba og name-only athugun,
`ANTHROPIC_API_KEY`, `EXPENSE_RECEIPT_MODEL` og
`EXPENSE_RECEIPT_AI_ENABLED`. Codex las ekki eða afritaði secret-gildi. Exact
candidate worktree hefur enga `.env.local` skrá.

Stebbi þarf með öruggri eigin leið að gera sama private environment tiltækt í
exact worktree. Síðan stöðvar hann núverandi dev server og keyrir sjálfur úr
exact worktree:

```powershell
cd C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2
npm.cmd run dev -- -p 3004
```

Codex má ekki ræsa eða stöðva dev server og secrets eiga ekki að koma í spjall.

## Localhost checks for Stebbi

### Fyrsta gate: staðsetning og route

1. Opnaðu [http://localhost:3004/auth-mvp/heim](http://localhost:3004/auth-mvp/heim).
2. Staðfestu að `Splitta reikningnum` birtist sem eigið Teskeið-kort.
3. Opnaðu kortið og staðfestu að standalone upload-skjár birtist á
   `/auth-mvp/splitta-reikningnum` án 404, redirect eða server exception.
4. Opnaðu `Útlagt og endurgreitt` og staðfestu að `Splitta reikningnum` sé ekki
   hnappur inni á þeirri síðu.

STOPPAÐU og sendu skjámynd eða nákvæman notendasýnilegan texta ef þetta gate er
ekki GREEN. Ekki senda env-gildi eða logs með secrets.

### Synthetic receipt gate eftir route GREEN

Notaðu nýja synthetic JPG/PNG/WebP mynd, mest 10 MB, án nafna, kortanúmera,
heimilisfangs, staðsetningar eða raunverulegra kaupa. Dæmi:

```text
TEST RECEIPT — SYNTHETIC
2026-09-14
3 x Rauðvín @ EUR 300.00 = EUR 900.00
TOTAL EUR 900.00
```

1. Veldu myndina og ýttu einu sinni á `Lesa kvittun`.
2. Staðfestu að yfirferðarhæf drög sýni einn lið, magn 3 og EUR 900 samtals.
3. Búðu tímabundið til total mismatch og staðfestu að confirmation sé hindruð;
   endurstilltu síðan EUR 900.
4. Bættu einum current explicit test-þátttakanda við. Úthlutaðu 0,5 á sjálfan
   þig, reyndu 3 á hinn og staðfestu að over-claim sé hafnað.
5. Úthlutaðu 2,5 á hinn. Staðfestu remaining 0 og að skipting haldist eftir
   refresh.
6. Staðfestu einu sinni. Vænt niðurstaða er einn EUR 900 kostnaður og nákvæmlega
   EUR 750 skuld hins þátttakandans við receipt payer í Útlagt og endurgreitt.
7. Refresh-aðu staðfesta kostnaðinn og staðfestu að kvittunarmyndin sé enn til.

Ekki ýta á eyðingarhnappana í þessu fyrsta smoke-prófi. Ekki retry-a extraction
blindandi, því retry getur valdið annarri Anthropic-sendingu og kostnaði.

## Verification

- Standalone route og báðir canonical loaders: GREEN.
- Old nested route absent: GREEN.
- Home card krefst receipt flag og existing Expense entitlement: GREEN.
- Direct routes og 8/8 receipt actions nota sama receipt access guard: GREEN.
- Standalone delete return route fer heim; Expense-hosted panel heldur eigin
  default return route: GREEN.
- Focused route/access/component tests: GREEN.
- Expense scope: GREEN fyrir candidate.
- Type-check: GREEN.
- Production build: GREEN; standalone routes eru í build manifesti.
- Full suite: 541 files GREEN, 3 files RED utan candidate; 7.847 tests GREEN,
  5 tests RED utan candidate, auk vantaðs ignored road-source artifacts.
- SQL179 apply SHA-256 er óbreytt:
  `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`.
- SQL179 Production: `EXACT_INSTALLED`, `postconditions_ok=true`; ekkert meira
  SQL þarf og Codex keyrði ekkert SQL.
- Engin commit, push eða deploy var framkvæmd.

## Næsta stopp

Þetta er localhost user-test gate. Eftir nákvæmlega GREEN heldur Codex áfram
samkvæmt `WORKFLOW.md`. Release þarf sérstakt umboð síðar.
