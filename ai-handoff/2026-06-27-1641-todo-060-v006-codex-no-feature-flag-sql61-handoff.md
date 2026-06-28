# TODO #60 - Codex v006 - spjall í sögu án feature flag

## Staða

Codex kláraði staðbundna yfirferð eftir að Stebbi hafnaði feature-flag
nálguninni úr v005. Spjallið á ekki að vera bakvið feature flag. Það þýðir að
SQL61, PostgREST schema reload og app release þurfa að fara í réttri röð.

SQL61 hefur ekki verið keyrt af Codex. Codex keyrði ekki deploy, schema reload,
dev server eða Supabase skipanir.

## Niðurstaða fyrir Claude Code

Enginn stöðvandi galli fannst í staðbundinni type/test yfirferð eftir að feature-flag
hugmyndin var tekin út úr virku plani.

Mikilvægasta áhættan er rollout-röðin:

1. Ef app-kóði með sýnilegu spjallformi fer í notkun áður en SQL61 er keyrt og
   schema cache reloadað, mun formið kalla á RPC sem er ekki til eða ekki sýnilegt
   í PostgREST.
2. Ef SQL61 er keyrt en schema cache er ekki reloadað, getur sama villa birst
   þótt fallið sé komið í gagnagrunninn.
3. Lausnin á ekki að fara bakvið feature flag nema Stebbi biðji sérstaklega um
   það síðar.

## Plan þessa áfanga

1. Staðfesta að `LOAN_CHAT_ENABLED`/`chatEnabled` sé ekki lengur hluti af virku
   #60 plani.
2. Rýna SQL61 og viðeigandi app-kóða með áherslu á SQL-first rollout.
3. Keyra type-check og próf staðbundið.
4. Uppfæra TODO #60 svo v006 sé nýjasta handoff, og merkja v005 sem leyst af
   hólmi.
5. Skila þessari handoff skrá til Claude Code fyrir loka-review áður en Stebbi
   keyrir SQL61, schema reload og release.

## Hvað var raunverulega gert

- Feature-flag nálgunin úr v005 var afturkölluð í handoffinu og er ekki notuð
  sem release-plan.
- Staðfest með leit að `LOAN_CHAT_ENABLED` og `chatEnabled` að þau eru ekki í
  virkum #60 kóða.
- Staðfest að `LoanHistory` renderar `LoanChatForm` beint.
- Staðfest að `sendLoanChatMessage` kallar `create_loan_chat_message` RPC beint
  og skráir `loan_chat_message` í `recent_events` fyrir ólesið, án þess að setja
  skilaboðatextann í recent-event payload.
- Staðfest að SQL61 geymir raunveruleg skilaboð í `loan_chat_messages`, sameinar
  þau inn í `get_loan_event_history`, og síar `loan_chat_message` recent-events
  úr venjulegum history-events til að forðast tvítekningu.
- `TODO.md` var uppfært þannig að #60 vísi í þessa v006 skrá sem nýjustu stöðu.

## Skrár sem voru skoðaðar

- `ai-handoff/2026-06-27-1625-todo-060-v004-claude-post-release-review.md`
- `ai-handoff/2026-06-27-1633-todo-060-v005-codex-post-release-fix-review.md`
- `Design.md`
- `TODO.md`
- `sql/61_loan_chat_messages_in_history.sql`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
- `components/loans/LoanHistory.tsx`
- `components/loans/LoanChatForm.tsx`
- `lib/loans/actions.ts`
- `lib/loans/history.server.ts`
- `lib/__tests__/actions.test.ts`
- `lib/__tests__/loan-pages.test.tsx`

## Skrár sem voru breyttar í þessum Codex áfanga

- `TODO.md`
- `ai-handoff/2026-06-27-1641-todo-060-v006-codex-no-feature-flag-sql61-handoff.md`

Athugið: kóðaskrár sem tengjast #60 voru rýndar og prófaðar, en Codex bætti ekki
við nýjum feature-flag kóða í lokaástandinu. Eldri v005 handoff er úrelt sem
release-plan vegna skýrrar ákvörðunar Stebba.

## Skipanir sem voru keyrðar

- `git status --short`
  - Exit code: 0
  - Sýndi ócommittaðar breytingar í vinnutrénu, þar á meðal eldri breytingar í
    `AGENTS.md`, `DONE.md`, `Design.md` og `TODO.md`, auk margra óskráðra
    handoff-skráa.
- `git diff --name-only`
  - Exit code: 0
  - Sýndi raunverulegan diff í `AGENTS.md`, `DONE.md`, `Design.md` og `TODO.md`.
    Kóðaskrár fyrir #60 komu ekki fram sem innihaldsmismunur.
- `rg -n "LOAN_CHAT_ENABLED|chatEnabled|LoanChatForm|create_loan_chat_message|loan_chat_message|loan_chat_messages|row_kind|chat_body|chat_message_id" ...`
  - Exit code: 0
  - Staðfesti að feature-flag heitin eru ekki í virkum #60 kóða og sýndi hvar
    spjall/RPC/history tengingar eru.
- `npm run type-check`
  - Exit code: 0
  - `tsc --noEmit` fór grænt.
- `npm run test:run -- lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts`
  - Exit code: 0
  - 2 test files passed, 133 tests passed, 5 todo.
- `npm run test:run`
  - Exit code: 0
  - 42 test files passed, 1309 tests passed, 22 skipped, 8 todo.
  - Vitest prentaði `Not implemented: navigation to another Document` tvisvar,
    en keyrslan féll ekki.

## Hvað mistókst eða var sleppt

- Codex keyrði ekki SQL61.
- Codex reloadaði ekki PostgREST schema cache.
- Codex deployaði ekki appinu.
- Codex ræsti ekki dev server.
- Codex gerði ekki browserpróf á localhost.
- Codex breytti ekki `sql/61_loan_chat_messages_in_history.sql` í þessum v006
  áfanga.

## Ákvarðanir

- Stebbi vill ekki feature flag fyrir spjallið. Því skal release-plan byggja á
  skýrri SQL-first röð, ekki runtime flaggi.
- `loan_chat_messages` er áfram canonical geymsla skilaboða.
- `recent_events` fyrir `loan_chat_message` eru notuð fyrir `Ólesið`, en history
  sækir skilaboðatextann úr `loan_chat_messages`.
- Ekki setja skilaboðatexta í recent-event payload eða client-facing
  notification payload.

## Áhætta sem er enn til staðar

- SQL61 breytir return contracti `get_loan_event_history`. App-kóði og DB þurfa
  að vera samstillt í release.
- Ef schema cache reload gleymist eftir SQL61 getur appið séð gömul RPC
  contracts.
- `loan_chat_messages` taflan hefur RLS enabled og engar broad `authenticated`
  heimildir; það er rétt. Claude Code þarf samt að rýna að allur aðgangur fari
  aðeins í gegnum service-role RPC/server actions.
- Pending-recipient access þarf að haldast í samræmi við SQL60 history-reglur.
- Browser/mobile próf eru enn eftir hjá Stebba eða Claude Code eftir SQL61.

## Sérstakt fyrir Supabase og SQL61

SQL-skrá:

- `sql/61_loan_chat_messages_in_history.sql`

Staða:

- Skráin er til í repo.
- Codex hefur ekki keyrt hana.
- Codex hefur ekki snert production, auth, secrets, billing, deployment eða
  notendagögn.

Áhrif samkvæmt rýni á skrá:

- Bætir við `public.loan_chat_messages`.
- Kveikir á RLS fyrir töfluna.
- Veitir ekki `anon` eða `authenticated` almennan aðgang.
- Veitir `service_role` aðgang að töflu og RPC.
- Bætir við `public.create_loan_chat_message(...)`.
- Endurskilgreinir `public.get_loan_event_history(...)` með aukadálkum fyrir
  chat rows.
- Bætir við index fyrir `loan_chat_messages`.
- Skráir engin gögn við deploy, en rollback með `DROP TABLE` myndi eyða
  spjallskilaboðum ef þau eru komin inn.

Ráðlögð röð áður en Stebbi gefur út:

1. Claude Code rýnir þessa v006 skrá og SQL61.
2. Stebbi samþykkir sérstaklega að keyra SQL61.
3. Keyra SQL61 á Supabase.
4. Reloada PostgREST schema cache.
5. Staðfesta með service-role RPC að:
   - `create_loan_chat_message` sé sýnilegt.
   - `get_loan_event_history` skili nýja contractinu.
6. Gefa út app-kóðann.
7. Prófa localhost eða staging/production flæði samkvæmt kaflanum hér að neðan.

Ef app-kóðinn er þegar kominn í umhverfi þar sem notendur sjá spjallformið, er
SQL61 + schema reload skrefið sem vantar til að virkja spjallið almennilega. Þá
þarf samt Claude-review og skýrt samþykki Stebba áður en SQL er keyrt.

## Spurningar sem Claude Code á að rýna sérstaklega

1. Er SQL61 örugglega nógu idempotent fyrir endurkeyrslu í þessu repo-flowi?
2. Er return contract `get_loan_event_history` samræmt við
   `lib/loans/history.server.ts`?
3. Eru engin skilaboð, netföng eða user-id að leka í `recent_events.payload`,
   client payload eða logs?
4. Virkar pending recipient access áfram eins og í SQL60?
5. Er `Ólesið` hegðunin rétt: mótaðili fær notification, en saga hlutarins sýnir
   canonical message row, ekki duplicate recent-event row?
6. Er íslenski textinn í `messages/is.json` náttúrulegur og samræmdur Teskeið?
7. Þarf einhver browser/mobile leiðrétting áður en Stebbi prófar þetta?

## Tillaga að næsta skrefi

Claude Code ætti að gera stutta review yfir SQL61 og útgáfuröðina án feature
flags. Ef Claude Code finnur ekki stöðvandi galla, má Stebbi taka meðvitaða
ákvörðun um að keyra SQL61, reloada schema cache og gefa út.

## Localhost checks for Stebbi

Þessi kafli á við, því breytingin er beint notendasýnileg á detail-síðu lánaðar
Teskeiðar.

Áður en SQL61 er keyrt:

- Ekki búast við að spjallsending virki gegn Supabase sem vantar SQL61.
- Ekki nota production notendagögn í tilraunum nema þú ætlir viljandi að búa til
  raunveruleg spjallskilaboð og `Ólesið` events.

Eftir að SQL61 hefur verið keyrt og schema cache reloadað:

1. Opnaðu lánaðan hlut á localhost sem innskráður aðili að láninu.
2. Staðfestu að `Saga hlutarins` sé sýnileg og að spjallformið sé neðst í sama
   ferli.
3. Sendu stutt skilaboð.
4. Vænt niðurstaða: skilaboðin birtast í `Saga hlutarins` í réttri tímaröð, með
   nafni sendanda og án tvítekningar.
5. Skráðu þig inn sem mótaðili eða notaðu annan prófnotanda sem hefur aðgang að
   sama láni.
6. Vænt niðurstaða: mótaðili sér skilaboðin í sömu sögu.
7. Staðfestu `Ólesið`: mótaðili fær event um ný skilaboð, en skilaboðatextinn
   sjálfur lekur ekki í ólesið payload ef það er ekki hannað.
8. Opnaðu detail-síðuna á mobile breiddum 360, 390 og 460 px.
9. Vænt niðurstaða: textasvæði, senda-hnappur og history færslur valda ekki
   zoomi, overlapi eða láréttu overflowi.
10. Prófaðu að óviðkomandi innskráður notandi opni direct detail-hlekk.
11. Vænt niðurstaða: hann sér ekki lán, sögu eða spjall.

Regressions sem þarf sérstaklega að passa:

- Venjuleg history events, til dæmis `Breytt nafn`, `Skilað` og `Afturkallað`,
  birtast enn og ekki tvöfalt.
- Pending recipient history access frá SQL60 brotnar ekki.
- `Merkja sem skilað`, `Afturkalla`, edit og back-navigation halda áfram að
  virka eins og áður.
