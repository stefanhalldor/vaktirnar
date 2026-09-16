# Splitta reikningnum — launcher-visible localhost gate

Created: 2026-09-14 21:50
Timezone: Atlantic/Reykjavik
Task: `expense-receipt-item-claims`
Base/HEAD: `57a57d33c093a89ef38dd087acfa2b789897435d`

## Mannamál og niðurstaða

Skjámynd Stebba staðfesti að fyrri útfærsla birtist ekki sem eitt af Teskeiðunum.
Orsökin var tvíþætt: exact candidate hafði ekkert private environment og
fyrri útfærsla setti sérkort á heimaskjá án þess að skrá feature-ið í canonical
launcher catalog og authenticated valmynd.

Candidate er leiðréttur. `Splitta reikningnum` er nú eigið Teskeið bæði sem
heimakort og valmyndarfærsla. Sýnileiki krefst enn nákvæmlega
`EXPENSE_RECEIPT_AI_ENABLED=true` og núverandi aðgangs notandans að
`utlagt-og-endurgreitt`; ekkert nýtt feature-access grant, schema eða SQL þarf.
Feature-ið er ekki CTA inni í Útlagt og endurgreitt. Aðeins atomic staðfesting
af fullunnu splitti notar fyrirliggjandi fjárhagsfinalizer þar.

Standalone receipt namespace er jafnframt lokað fyrir third-party analytics og
fær `private, no-store`, `no-referrer` og `noindex` headers á root og deep routes.

## Exact candidate og environment

- Worktree:
  `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2`
- Rétt route:
  [http://localhost:3004/auth-mvp/splitta-reikningnum](http://localhost:3004/auth-mvp/splitta-reikningnum)
- Exact worktree hefur nú enga `.env.local` skrá.
- Old-main `.env.local` inniheldur öll þrjú receipt-provider nöfnin samkvæmt
  name-only athugun. Codex las ekki eða afritaði gildi.

Stebbi þarf að gera sama private environment tiltækt í exact worktree með
öruggri eigin leið, stöðva núverandi dev server og ræsa sjálfur úr exact
worktree:

```powershell
cd C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2
npm.cmd run dev -- -p 3004
```

## Localhost checks for Stebbi

1. Opnaðu [http://localhost:3004/auth-mvp/heim](http://localhost:3004/auth-mvp/heim).
2. Staðfestu að `Splitta reikningnum` sé eigið kort í listanum yfir tilbúnar
   Teskeiðar.
3. Opnaðu valmyndina og staðfestu að `Splitta reikningnum` sé þar eigin færsla
   með kvittunartákni.
4. Opnaðu kortið eða valmyndarfærsluna. Vænt: standalone upload-skjár á
   `/auth-mvp/splitta-reikningnum`, án 404, redirect eða server exception.
5. Opnaðu `Útlagt og endurgreitt`. Vænt: enginn `Splitta reikningnum` CTA er
   inni á þeirri síðu.

STOPPAÐU eftir þetta route/launcher gate og sendu aðeins niðurstöðuna. Ef það
er GREEN heldur Codex áfram með synthetic receipt smoke samkvæmt v011, án SQL.
Ekki senda `.env.local`, lykla eða logs sem geta innihaldið secrets.

## Verification

- Launcher/menu/route/access/security focused: 9 files, 211/211 GREEN í
  óháðri exact endurkeyrslu.
- Expense scope fyrir receipt candidate: 133 files, 1.370/1.370 GREEN.
- Full suite: 542 files og 7.852 tests GREEN; aðeins fjögur varðveitt booking
  date-fixture föll og vantað ignored road-source artifact utan candidate.
- Type-check: GREEN.
- Production build: GREEN, 151 routes; receipt root og draft route til staðar.
- Independent final review: GREEN, engin findings.
- SQL179 Production: `EXACT_INSTALLED`, `postconditions_ok=true`.
- SQL179 apply SHA-256 óbreytt:
  `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`.
- Codex keyrði ekkert SQL. Engin commit, push eða deploy var framkvæmd.

## Næsta stopp

Næsta skref er aðeins launcher/route localhost-próf Stebba. Release þarf
sérstakt umboð síðar.
