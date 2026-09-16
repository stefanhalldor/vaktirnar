# v043 — opið splitt og aðskildar innlestrarleiðir

Created: 2026-09-16 15:36
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims

## Plan áfangans

Fjarlægja lokaða-prófunarmerkingu, halda notkun á bak við Teskeiðarinnskráningu,
gera Teskeiðina sýnilega óinnskráðum, fela tóma reikningavalmynd og aðgreina
innbyggða myndgreiningu frá leiðinni sem notar annað gervigreindarapp.

## Hvað var raunverulega gert

- `Splitta reikningnum` er nú `open` í sameiginlegri rollout-stefnu og báðar
  private route-síðurnar hætta að biðja `ExpenseShell` um prófunarborða.
- Opinber forsíða og opinber hugmyndasíða senda óinnskráðan notanda í
  `/innskraning` með varðveittum `next` á split-síðuna.
- Kortatextinn er nú „Taktu mynd af reikningnum og splittaðu honum svo.“
- Upphafsskjárinn sýnir „Leið 1 — Myndgreining Teskeiðar“ og „Leið 2 — Nota
  aðra gervigreind“ sem tvö aðskilin kort.
- `Reikningarnir mínir` er aðeins renderað þegar listinn inniheldur a.m.k. eitt
  splitt í `sharing` stöðu. Aðrar stöður og tóm/error-listi sýna ekki valmyndina.
- Mock-samningur heimaprófa var leiðréttur svo split-sýnileiki sé óháður ÚL/
  Expenses entitlement, í samræmi við raunverulega launcher-reglu.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `Design.md` (fyrra session-evidence)
- split routes, `SplitImport.tsx`, split contracts/server
- launcher/rollout, public/auth home og public idea detail
- íslenskar/enskar þýðingar og tengd UI/launcher próf
- canonical task og v042 handoff

## Skrár sem voru breyttar

- `app/auth-mvp/splitta-reikningnum/page.tsx`
- `app/auth-mvp/splitta-reikningnum/[draftId]/page.tsx`
- `components/receipt-split/SplitImport.tsx`
- `app/auth-mvp/heim/page.tsx`
- `app/page.tsx`
- `app/hugmyndir/[slug]/page.tsx`
- `lib/teskeid/featureRollout.server.ts`
- `messages/is.json`, `messages/en.json`
- `components/receipt-split/__tests__/standalone-receipt-ui.test.tsx`
- `lib/__tests__/closed-testing-rollout.test.tsx`
- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/public-landing.test.ts`
- canonical task og þetta handoff

## Skipanir og niðurstöður

- `npm.cmd run test:run -- components/receipt-split/__tests__/standalone-receipt-ui.test.tsx lib/__tests__/closed-testing-rollout.test.tsx lib/__tests__/public-landing.test.ts lib/__tests__/home-page.test.tsx`
  - Endanleg niðurstaða: exit 0, 4 skrár og 150 próf PASS.
- `npm.cmd run type-check`
  - Exit 0.
- `git diff --check`
  - Exit 0; repo-wide line-ending warnings komu frá fyrirliggjandi worktree-noise.

## Hvað mistókst eða var sleppt

Fyrsta focused test keyrsla fann eina úrelta væntingu um gamla kortatextann;
hún var uppfærð og endurkeyrsla varð græn. Enginn dev server var ræstur og engin
browserprófun framkvæmd af Codex. Full test suite var ekki endurkeyrt þar sem
breytingin er afmörkuð UI/route-copy breyting og focused suite + type-check eru græn.

## Ákvarðanir

- „Sýnileg öllum“ merkir að launched Teskeið-kortið sé sýnilegt óinnskráðum;
  opnun þess leiðir í innskráningu og aftur á split-síðuna.
- `sharing` er nákvæma stöðumerkið fyrir reikning sem hefur haldið áfram í
  skiptingu. Draft/review á því ekki heima undir `Reikningarnir mínir`.
- Listavilla er falin með valmyndinni á upphafsskjánum í stað þess að sýna
  villuskilaboð um valmynd sem á ekki að birtast án sharing-reiknings.
- Engin ÚL-virkni eða ÚL-entitlement var tengd við þennan áfanga.

## Áhætta sem er enn til staðar

Opinber birting kortsins byggir áfram á því að hugmyndafærslan sé `launched` og
feature env-breyturnar séu virkar í deployment. Mobile útlit kortanna tveggja þarf
sjónræna localhost-staðfestingu. Engin gagnalíkan-, RLS- eða concurrency-áhætta
bættist við.

## Næsta skref og workflow-stopp

Næsta stopp er localhost-yfirferð Stebba. Ekki commit-a, push-a eða deploya þennan
áfanga fyrr en Stebbi hefur staðfest útlitið og gefið sérstakt útgáfuleyfi.

## Spurningar fyrir rýni

- Eru leiðirnar tvær nógu skýrt aðgreindar á litlum skjá?
- Er rétt að `Reikningarnir mínir` sýni bæði eiganda- og þátttakandaaðgang að
  sharing-splittum, eins og núverandi örugga list-RPC skilar?
- Varðveitir public CTA rétta áfangastað eftir innskráningu í raunverulegu flæði?

## Supabase / SQL

Ekkert SQL var skrifað eða keyrt. Engar breytingar voru gerðar á gögnum, RLS,
auth, grants, policies, functions, storage eða production.

## Breytingar á verkefnalýsingu

Canonical task var uppfært með fjórum nýjum product-ákvörðunum: Teskeiðin er
opin í kynningu, innskráning er nauðsynleg til notkunar, prófunarborðinn á ekki
við, og upphafsskjárinn sýnir tvær aðskildar innlestrarleiðir. Einnig var
skilgreint að `Reikningarnir mínir` innihaldi aðeins `sharing`-splitt og sé falin
án slíkra reikninga. ÚL-scope helst frestað og óbreytt.

## Localhost checks for Stebbi

Notaðu núverandi dev server og opnaðu fyrst óinnskráða forsíðuna:

1. Staðfestu að „Splitta reikningnum“ sé sýnilegt án innskráningar og beri textann
   „Taktu mynd af reikningnum og splittaðu honum svo.“
2. Smelltu á kortið. Vænt niðurstaða: innskráning birtist; eftir innskráningu ferðu
   á `/auth-mvp/splitta-reikningnum`.
3. Á split-síðunni á enginn „Í lokuðum prófunum“ borði að sjást.
4. Ef notandinn hefur ekkert `sharing`-splitt á `Reikningarnir mínir` hvorki að
   sjást né sýna tóma-/villutilkynningu.
5. Staðfestu tvö aðskilin mobile-væn kort: „Myndgreining Teskeiðar“ og „Nota aðra
   gervigreind“. Prófaðu að file input/button virki í fyrra og Afrita/JSON í seinna.
6. Hefðu skiptingu á synthetic reikningi, farðu aftur á upphafssíðuna og staðfestu
   að `Reikningarnir mínir` birtist þá með þeim reikningi.

Notaðu aðeins synthetic/eigin kvittun. Ekki eyða eða breyta raunverulegum
notendagögnum, ekki prófa SQL og ekki breyta production env í þessu UI-prófi.

## Óvissa / þarf að staðfesta

Confidence er hátt á auth/rollout/filter-samningi og automated checks. Sjónræn
mobile-staðfesting og raunverulegt login-next round trip bíða localhost-prófs.
