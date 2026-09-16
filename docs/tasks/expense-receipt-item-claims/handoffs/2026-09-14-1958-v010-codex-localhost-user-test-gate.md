# Expense receipt item claims — localhost user-test gate

Created: 2026-09-14 19:58
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og current gate

SQL179 Production schema er nú staðfest GREEN:
`installation_state=EXACT_INSTALLED`, öll target predicates eru exact og
`postconditions_ok=true`. Ekkert meira SQL er nauðsynlegt og ekkert SQL má
endurkeyra.

Næsta gate er localhost notendapróf á frysta app candidate. Stebbi þarf fyrst
að veita exact v2 worktree private local environment með öruggri eigin leið
og ræsa serverinn sjálfur. Codex ræsti ekki dev server og las, afritaði eða
tengdi engin secret-gildi.

## Exact candidate og route

- Worktree:
  `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2`
- Candidate base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`
- Canonical project port úr `C:\Users\Lenovo\Documents\localhost.txt`: `3004`
- Direct route eftir ræsingu:
  [http://localhost:3004/auth-mvp/utlagt-og-endurgreitt/splitta](http://localhost:3004/auth-mvp/utlagt-og-endurgreitt/splitta)
- Ræsing er aðgerð Stebba úr exact worktree, til dæmis
  `npm run dev -- -p 3004`. Codex má ekki keyra skipunina.

Worktree hefur lockfile-samhæft `node_modules` og `next.cmd`, `vitest.cmd` og
`tsc.cmd`. Það hefur einnig ignored `.next` build output. Það hefur hvorki
`.env.local` né `.env.development.local`.

## Environment og auth prerequisites

Þessi nöfn þurfa að vera virk í processi sem ræsir exact v2 candidate:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_MVP_ENABLED=true`
- `EXPENSES_ENABLED=true`
- `EXPENSE_RECEIPT_AI_ENABLED=true`
- `ANTHROPIC_API_KEY`
- `EXPENSE_RECEIPT_MODEL`

Til að prófa gegn schema sem var staðfest GREEN þarf Supabase URL að vísa á
Production project ref `bpjwgutpzsifjaucvkbk`. Stebbi skal staðfesta það
sjálfur án þess að líma URL eða lykla í spjall eða evidence.

Innskráður test-account þarf gilt Supabase session, netfang og explicit
`feature_access` fyrir `utlagt-og-endurgreitt`. Ef ný innskráning er
nauðsynleg þarf fyrirliggjandi auth-flæði einnig gilt `AUTH_CODE_SECRET`;
`RESEND_API_KEY` þarf að vera til staðar ef kóði á að berast með provider.

Name-only athugun, án birtingar gilda, sýndi:

- `.env.example` skilgreinir öll receipt-provider nöfn en hefur aðeins örugg,
  tóm dæmigildi.
- Exact v2 worktree hefur enga private env skrá.
- Fyrirliggjandi old-main `.env.local` lýsir Supabase/auth/Expenses nöfnunum,
  en lýsir ekki `ANTHROPIC_API_KEY`, `EXPENSE_RECEIPT_AI_ENABLED` eða
  `EXPENSE_RECEIPT_MODEL`.

Því er provider enablement, gildur Anthropic key og valið image-capable model
**óstaðfest**. Ekki afrita eða tengja old-main `.env.local` sjálfkrafa. Stebbi
þarf að setja gildin með sinni öruggu secret-leið og staðfesta aðeins að
serverinn sé ræstur á porti 3004; engin gildi eiga að koma til Codex.

## Localhost checks for Stebbi

Ekki byrja fyrr en environment-prerequisites hér að ofan eru uppfyllt. Prófið
notar Production Supabase og stofnar raunveruleg, en synthetic, testgögn.

### Prófsgögn

Notaðu nýja synthetic JPG/PNG/WebP mynd, mest 10 MB, án nafna, kortanúmera,
heimilisfangs, staðsetningar eða raunverulegra kaupa. Dæmi um skýran texta á
myndinni:

```text
TEST RECEIPT — SYNTHETIC
2026-09-14
3 x Rauðvín @ EUR 300.00 = EUR 900.00
TOTAL EUR 900.00
```

Notaðu aðeins einn samþykkjandi test-þátttakanda til viðbótar við sjálfan þig.
Sá þátttakandi þarf að vera current explicit participant í drögunum áður en
úthlutun er gerð.

### Skref og expected niðurstaða

1. Opnaðu direct route og staðfestu að `Splitta reikningnum` upload-skjár
   birtist án redirect eða server error.
2. Veldu synthetic myndina og ýttu einu sinni á `Lesa kvittun`.
   Vænt: loading feedback birtist, ein Anthropic extraction fer fram og
   yfirferðarhæf drög opnast. Myndin er private; provider payload er ekki
   sýnt eða vistað í appinu.
3. Yfirfarðu að heiti, dagsetning, EUR 900 heild og einn liður með magni 3 og
   EUR 900 séu leiðréttanleg. Opnaðu myndina, lokaðu henni og refresh-aðu.
   Vænt: myndin og yfirferðin eru áfram til staðar eftir refresh.
4. Gerðu tímabundið total mismatch, til dæmis breyttu line total í EUR 899
   en haltu receipt total EUR 900. Vænt: mismatch warning birtist og ekki er
   hægt að staðfesta kostnað. Endurstilltu line total í EUR 900 og vistaðu.
5. Veldu `Velja fólk og deila`, bættu nákvæmlega einum samþykkjandi current
   explicit participant við og deildu drögunum með venjulegu flæði.
6. Úthlutaðu `0,5` af liðnum á sjálfan þig. Reyndu síðan `3` á hinn
   þátttakandann þegar aðeins `2,5` eru eftir. Vænt: over-claim er hafnað,
   engin umframúthlutun vistast og remaining helst `2,5`.
7. Úthlutaðu nákvæmlega `2,5` á hinn þátttakandann. Vænt: remaining verður
   `0`, brotaskiptingin helst eftir refresh og beneficiary er sá sem var
   valinn þótt actor hafi gert úthlutunina.
8. Staðfestu kostnaðinn einu sinni. Vænt: einn staðfestur EUR 900 kostnaður
   verður til; eigin 0,5 hluti myndar enga skuld til sjálfs og 2,5 hluti hins
   þátttakandans myndar nákvæmlega eina EUR 750 skuld gagnvart receipt payer í
   `Útlagt og endurgreitt`.
9. Opnaðu staðfesta kostnaðinn og refresh-aðu. Vænt: kvittunarmyndin er enn
   tiltæk, financial detail er óbreytt og aðeins owner sér image/split delete
   controls.

### Error/STOP skilyrði

STOPPAÐU og sendu aðeins notendasýnilegt error/hegðun ef:

- route redirectar óvænt eða server exception kemur;
- extraction segir unavailable/failed;
- myndin hverfur við refresh án explicit eyðingar;
- mismatch leyfir confirmation;
- over-claim vistast eða remaining verður rangt;
- beneficiary verður actor í stað valins þátttakanda;
- meira eða minna en ein EUR 750 skuld verður til;
- óviðkomandi sér mynd eða delete controls.

Ekki retry-a extraction eða hlaða upp aftur blindandi; hvert retry getur sent
myndina aftur til Anthropic og skapað nýjan API-kostnað. Skráðu fyrst exact
notendasýnilega stöðu án lykla, UUID, signed URL eða private logga.

### Ekki prófa núna

- Ekki nota raunverulega kvittun eða persónu-/greiðsluupplýsingar.
- Ekki prófa með óupplýstum þátttakanda.
- Ekki líma env, API key, UUID, signed image URL eða provider response í
  evidence.
- Ekki ýta á `Eyða kvittun` eða `Eyða splittuðum reikningi` í þessu fyrsta
  smoke; presence og varðveisla eftir refresh nægja. Eyðing er óafturkræf og
  verður aðeins prófuð afmarkað ef kjarnaniðurstaðan er GREEN.
- Ekki keyra SQL, preflight, apply, postflight eða diagnostic aftur.
- Ekki nota Production app route fyrir unreleased feature; þetta gate er
  aðeins exact localhost candidate á porti 3004.

Eftir að Stebbi hefur ræst exact candidate og staðfest port 3004 heldur Codex
sjálfkrafa áfram með þær afmörkuðu localhost-athuganir sem eru mögulegar án
þess að taka yfir serverinn.

## Candidate og verification preservation

- SQL179 corrected Production postflight: exact GREEN; ekkert meira SQL.
- Operator-cycle static/focused tests: 2 files, 23/23 GREEN.
- Type check eftir operator breytingu: GREEN.
- Independent review á product candidate og corrected operator contract:
  GREEN.
- SQL179 apply/product artifact er óbreytt:
  `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`.
- Operator breytingin snerti aðeins preflight, postflight, SQL179 README og
  static regression test; app/runtime/UI/message bytes breyttust ekki.
- `package.json`, `package-lock.json` og `vercel.json` eru exact við base.
- Engin commit, push eða deploy hefur verið framkvæmd.
- Codex keyrði ekkert SQL og ræsti engan dev server.

## Næsta ákvörðun

Stebbi þarf nú að útvega receipt-provider environment með sinni öruggu leið,
ræsa exact v2 worktree á porti 3004 og segja aðeins að serverinn sé ræstur.
Ef hann vill ekki tengja localhost candidate við Production Supabase er
release permission næsta raunhæfa gate í stað localhost-prófs; ekkert annað
schema-umhverfi er staðfest með SQL179 núna.
