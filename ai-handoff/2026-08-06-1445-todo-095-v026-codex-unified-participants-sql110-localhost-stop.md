# TODO #95 v026 — Sameinað þátttakendaflæði UL / SQL110 localhost-stop

## 1. Plan áfangans

Sameina „Bæta við þátttakanda“ í stofnun og breytingu UL-færslu, greina nafn/netfang, senda samþykkisboð án þess að pre-binda Teskeiðarnotanda, leyfa nákvæmlega viðtakanda að afgreiða sitt boð, tengja sama fjárhagsaðila eftir samþykki og tengja samþykktan aðila við Tengsl. Bæta einnig við öruggri fjarlægingu þátttakanda sem hefur ekki greitt. Skrifa en aldrei keyra SQL110 með read-only preflight/postflight.

## 2. Hvað var raunverulega gert

- Nýtt endurnýtanlegt Radix bottom-sheet `ExpenseParticipantPicker` er notað bæði í stofnun/breytingu færslu og aðilastýringu.
- Notandi velur þekktan aðila eða slær inn nafn/netfang í sama flæði.
- Nafn eitt verður virkur nafngreindur þátttakandi án pósts.
- Netfang verður nafnlaus virkur fjárhagsaðili með pending identity invitation. Netfang er ekki notað sem sameiginlegt display-name.
- Þekktur aðili er leystur yfir í mótaðilanetfang server-side en er ekki bundinn við `user_id` fyrr en viðtakandi samþykkir.
- V2 tölvupóstur inniheldur beina, invitation-id-scoped claim slóð. Gamla V1 retry-sniðið helst óbreytt.
- Parent UL layout krefst session/env en sérhver venjuleg UL-síða heldur fullum per-user feature guard. Claim-síðan notar exact-email scoped RPC.
- Eftir samþykki er sami `expense_group_members` row tengdur við notandann; hlutdeildir, greiðslur og fyrri saga eru ekki endurskrifuð. Best-effort `relationship_sources` enrichment helst í appinu.
- Í breytingaham má fjarlægja annan þátttakanda ef hann hefur ekki lagt út og engin endurgreiðsla tengist honum. Skipting/uppgjör er endurreiknað og SQL110 endurstaðfestir að engar financial references séu eftir áður en member er merktur `removed`.
- SQL110, preflight og postflight voru skrifuð. Ekkert SQL var keyrt.

## 3. Skrár sem voru skoðaðar

`WORKFLOW.md`, `Design.md`, UL routes/components/actions/validation/repository/guards, SQL96/97/102/103/105/107–109, Tengsl participant lookup/upsert og tengd próf.

## 4. Skrár sem voru breyttar

- `app/auth-mvp/utlagt-og-endurgreitt/layout.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/bod/adili/[invitationId]/page.tsx`
- `app/auth-mvp/utlagt-og-endurgreitt/utgjold/[expenseId]/breyta/page.tsx`
- `components/expenses/ExpenseForm.tsx`
- `components/expenses/ExpenseMemberInvitationActions.tsx`
- `components/expenses/ExpenseMemberManager.tsx`
- `components/expenses/ExpenseParticipantPicker.tsx` (ný)
- `components/expenses/__tests__/expense-participant-picker.test.ts` (ný)
- `components/expenses/__tests__/expense-member-invitation-ui.test.tsx`
- `lib/expenses/actions.ts`
- `lib/expenses/drafts.ts`
- `lib/expenses/email.ts`
- `lib/expenses/guard.ts`
- `lib/expenses/participants.server.ts`
- `lib/expenses/repository.server.ts`
- `lib/expenses/validation.ts`
- `lib/__tests__/expense-create-action-contract.test.ts`
- `lib/__tests__/expense-edit-and-member-invitation-actions.test.ts`
- `lib/__tests__/expense-member-invitation-email.test.ts`
- `lib/__tests__/expense-member-invitation-repository.test.ts`
- `lib/__tests__/expense-sql110-migration.test.ts` (ný)
- `messages/is.json`
- `messages/en.json`
- `sql/110_expense_unified_participant_invitations.sql` (ný)
- `sql/validation/110-expense-unified-participants/preflight.sql` (ný)
- `sql/validation/110-expense-unified-participants/postflight.sql` (ný)

Ótengdar dirty/untracked skrár voru ekki afturkallaðar eða teknar með í þessa vinnu.

## 5. Skipanir sem voru keyrðar

- Afmarkað `rg`/`Get-Content`/`git diff`/`git status` til lestrar og yfirferðar.
- `npm.cmd run type-check`
- `npm.cmd run test:run -- lib/__tests__/expense-create-action-contract.test.ts lib/__tests__/expense-edit-and-member-invitation-actions.test.ts lib/__tests__/expense-member-invitation-repository.test.ts lib/__tests__/expense-member-invitation-email.test.ts lib/__tests__/expense-sql110-migration.test.ts components/expenses/__tests__/expense-participant-picker.test.ts components/expenses/__tests__/expense-form-multipayer-ui.test.tsx components/expenses/__tests__/expense-member-invitation-ui.test.tsx`
- `git diff --check`

## 6. Niðurstöður og exit codes

- TypeScript type-check: exit 0.
- 8 markprófaskrár / 43 próf: öll græn, exit 0.
- `git diff --check`: exit 0; aðeins fyrirliggjandi Windows LF/CRLF warnings.

## 7. Hvað mistókst eða var sleppt

- Fyrsta keyrsla eldri markprófa sýndi væntanlegar gamlar RPC/redirect væntingar; tengd próf voru uppfærð og lokakeyrsla varð græn.
- Engin full suite, build, lint eða browser automation var keyrð samkvæmt ósk um litlar localhost-prófanir.
- SQL parser/gagnagrunnur var ekki keyrður. SQL110 hefur aðeins static regression-próf þar til Stebbi keyrir preflight/migration/postflight.
- Dev server var hvorki ræstur né endurræstur.

## 8. Ákvarðanir Codex

- Samþykki tengir identity við sama durable member row; aldrei stofna nýjan financial member við samþykki.
- Feature flag er ekki gefið viðtakanda. Invitation scope heimilar eingöngu exact-email claim/response. Eftir afgreiðslu fer viðtakandi á `/auth-mvp/heim`.
- Netfang er ekki sameiginlegt heiti fyrir samþykki; „Boðinn þátttakandi“ er notað í sameiginlegu ledger-samhengi.
- V1 email retry er byte/idempotency-stöðugt; aðeins ný boð nota V2.
- Eyðing þátttakanda er fail-closed ef payment/share/obligation/repayment reference er eftir eftir endurreikning.
- Þver-Teskeiða activity og „Útistandandi“ Tengsl-filter eru ekki sett í SQL110; accepted UL identity/source verður grunnur að sér `RelationshipActivityProvider` áfanga.

## 9. Áhætta sem er enn til staðar

- SQL110 er ekki raunprófað fyrr en Stebbi keyrir það. Ekki smoke-testa nýja flæðið áður en postflight er grænt.
- Póstsending er raunveruleg ef `RESEND_API_KEY` er til staðar. Nota prófunarnetfang sem Stebbi ræður yfir.
- Boðstitill er sýndur í boðspósti/claim-skjá fyrir samþykki, en engar upphæðir, greiðslur eða skýringar.
- Aðili sem hefur þegar lagt út eða tengist endurgreiðslu er viljandi ekki eyðanlegur í þessu flæði.
- Tengsl enrichment eftir samþykki er best-effort; ledger identity-link helst gilt þó tímabundin Tengsl-villa verði.

## 10. Tillaga að næsta skrefi

Stebbi keyrir fyrst read-only preflight og sendir Codex eina niðurstöðuröð. Aðeins ef hún er græn keyrir Stebbi SQL110 og svo postflight. Eftir grænt postflight framkvæmir Stebbi localhost checks hér fyrir neðan.

## 11. Atriði fyrir Codex-review

- Staðfesta postflight object counts, security-definer/search-path, grants og constraint niðurstöður.
- Smoke-testa að direct email og known relationship búi til nákvæmlega eitt pending boð og að retry tvíriti ekki member/invitation.
- Staðfesta að fjarlæging Gretu endurreikni share/obligation en hafni ef hún á payment/repayment history.
- Í næsta Tengsl-áfanga skilgreina provider-contract fyrir loans + expenses activity og sameiginlegt outstanding projection án domain-leka.

## 12. Supabase / SQL

- Migration: `sql/110_expense_unified_participant_invitations.sql`.
- Hún var **aðeins skrifuð, aldrei keyrð**.
- Breytingar: tveir invitation metadata dálkar/constraints og 8 afmarkaðar security-definer functions/wrappers.
- RLS/table grants eru ekki víkkuð. Browser roles fá hvorki table access né function execute. Service role fær aðeins opinberu app-RPC-in; private helper hefur ekki service-role execute.
- Engin feature_access-röð er stofnuð/breytt. Engin auth-röð er stofnuð af migration.
- Samþykki breytir aðeins identity/status/display name á sama member og skráir audit event; það breytir ekki financial rows.
- Fjarlæging eftir edit merkir member `removed` aðeins eftir að financial references eru horfnar og skráir audit event.

## 13. Localhost checks for Stebbi

### A. Gagnagrunnsstopp áður en appið er prófað

1. Í réttum Supabase project/branch keyrir þú **aðeins** `sql/validation/110-expense-unified-participants/preflight.sql`.
2. Sendu Codex eina niðurstöðuröðina. Ekki keyra SQL110 ef `prerequisites_ok` er false, `missing_required_functions` er ekki tómt, target functions eru þegar óvænt til eða gömul transaction hangir.
3. Eftir grænt svar keyrir þú sjálfur `sql/110_expense_unified_participant_invitations.sql`.
4. Keyrðu síðan `sql/validation/110-expense-unified-participants/postflight.sql` og sendu Codex röðina. Allir `_ok` dálkar eiga að vera true, counts réttir og violations/overloads 0.

Þessar SQL-aðgerðir breyta schema/functions í þeim Supabase gagnagrunni sem editorinn er tengdur við. Ef hann er production hafa þær production-áhrif. Ekki nota óvart annað project og ekki líma neina secret-lykla í niðurstöður.

### B. Sameinað val við stofnun

1. Opnaðu `/auth-mvp/utlagt-og-endurgreitt/nytt` innskráður með UL flagg.
2. Farðu í `Skiptingin` og ýttu `Bæta við þátttakanda`.
3. Veldu þekktan aðila: vænt niðurstaða er að aðilinn bætist við en verði ekki pre-bundinn sem Teskeiðarnotandi; við vistun fer V2 boðspóstur.
4. Endurtaktu með netfangi sem þú ræður yfir. Vænt: póstur með beinum claim-hlekk; ekkert netfang birtist öðrum sem display-name.
5. Endurtaktu með aðeins nafni. Vænt: þátttakandi vistast án pósts og má tengja síðar.

### C. Greta: eyða og bæta aftur inn

1. Opnaðu breytingu á færslunni þar sem Greta er nú röng guest-færsla.
2. Ef Greta hefur ekki lagt út og tengist engri endurgreiðslu á kross að birtast. Ýttu á hann og staðfestu.
3. Vænt: hún hverfur, skipting/uppgjör endurreiknast og færsla vistast. Ef financial history er til á server að aðgerðin hafnast án gagnataps.
4. Ýttu `Bæta við þátttakanda`, sláðu inn netfang Gretu eða veldu hana úr Tengslum og vistaðu.
5. Vænt: Greta fær einn póst, opnar exact claim, skráir sig inn með sama netfangi og samþykkir. Sama member row verður Teskeiðarnotandi og upphæð/saga breytist ekki við samþykkið.

### D. Invitation scope og regressions

1. Opnaðu claim-hlekkinn með öðru innskráðu netfangi: vænt `not found`/engin gögn.
2. Opnaðu með réttu netfangi án UL per-user flags: boðið á að sjást og vera svaranlegt, en notandinn á ekki að fá að stofna eða skoða önnur UL gögn.
3. Samþykktu tvisvar/reload-aðu: enginn tvöfaldur member, boð eða activity.
4. Prófaðu mobile viewport: bottom-sheet, input/select og takkarnir eiga ekki að valda zoom, overlap eða láréttu overflowi; route/loading feedback á að haldast.
5. Prófaðu venjulegt nafn-only flæði og núverandi greiðslu/skiptingu til að tryggja að þau hafi ekki breyst.
