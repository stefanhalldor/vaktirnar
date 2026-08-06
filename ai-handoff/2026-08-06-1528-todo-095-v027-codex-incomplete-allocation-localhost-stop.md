# TODO #95 v027 — Ófullgerð skipting sem enduropnanleg UL-færsla

## Plan áfangans

1. Einfalda sýnilegt flæði Skiptingarinnar í greiðandi → þátttakendur → skipting.
2. Leyfa vistun þegar greiðslur eða skipting stemma ekki, án þess að veikja fjárhagsledgerinn.
3. Gera slíka vistun sýnilega og enduropnanlega á UL-forsíðu.
4. Nýta labela og tengslahringi í sameinaða þátttakendavalinu.
5. Staðfesta með litlum markprófum fyrir localhost.

## Hvað var gert

- `+ Skrá útgjald` varð `+ Útlagt`.
- Skiptingarskjárinn sýnir nú í DOM- og tab-röð:
  1. `Hver borgaði?` / `Hverjir borguðu?`
  2. `Hverjir taka þátt í kostnaðinum?`
  3. `Hvernig skiptist greiðslan?`
- `Bæta við greiðanda` varð `Fleiri`.
- Sameinaða þátttakendavalið fékk leit, persónulega label-filtera og tengslahringi.
- Fjarlæging þátttakanda varðveitir raunverulegar eldri krónutölur í fastri skiptingu í stað þess að túlka vægi sem fjárhæðir.
- Ófullgerð föst skipting sýnir mismuninn, t.d. `80.000 kr. eru óúthlutaðar`.
- Ófullgerð skipting hafnar ekki vistun. Hún vistast áfram sem einkadrög, fer ekki í ledger eða uppgjör og notandi fer aftur á UL-forsíðu.
- UL-forsíðan sýnir slík einkadrög undir `Þarf að klára` og opnar þau aftur í réttu samhengi.
- SQL111 bætir aðeins við bounded, actor-exact, service-role read-only RPC til að sækja eigin einkadrög.

## Skoðaðar skrár

- `Design.md`
- `WORKFLOW.md`
- `components/expenses/ExpenseForm.tsx`
- `components/expenses/ExpenseDashboard.tsx`
- `components/expenses/ExpenseParticipantPicker.tsx`
- `lib/expenses/drafts.ts`
- `lib/expenses/repository.server.ts`
- `sql/102_expense_private_drafts.sql`

## Breyttar skrár í þessum áfanga

- `components/expenses/ExpenseForm.tsx`
- `components/expenses/ExpenseParticipantPicker.tsx`
- `components/expenses/ExpenseDashboard.tsx`
- `components/expenses/__tests__/expense-form-multipayer-ui.test.tsx`
- `components/expenses/__tests__/expense-dashboard-consent-ui.test.tsx`
- `lib/expenses/contracts.ts`
- `lib/expenses/drafts.ts`
- `lib/expenses/repository.server.ts`
- `lib/__tests__/expense-draft-attention.test.ts`
- `lib/__tests__/expense-sql111-migration.test.ts`
- `messages/is.json`
- `messages/en.json`
- `sql/111_expense_incomplete_draft_directory.sql`
- `sql/validation/111-expense-incomplete-drafts/preflight.sql`
- `sql/validation/111-expense-incomplete-drafts/postflight.sql`

## Skipanir og niðurstöður

- `npm.cmd run type-check` — exit 0.
- Sex markprófaskrár með Vitest — 28 próf græn, exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi CRLF-viðvaranir.

## Slept

- Engin full test-suite eða build var keyrt samkvæmt ósk Stebba um hraðar localhost-lagfæringar.
- Enginn dev server var ræstur eða endurræstur.
- Ekkert SQL eða migration var keyrt.
- Ekkert var commit-að, push-að eða deployað.

## Ákvarðanir

- Ósamræmd skipting er aldrei skrifuð sem virk fjárhagsfærsla. Hún er einkadrög þar til upphæðir stemma nákvæmlega.
- Einkadrögin sjást samt sem færsla sem þarf að klára, svo notandi týnir ekki vinnunni.
- SQL111 skilar aðeins allt að 100 eigin drögum og síar út edit-drög sem ekki eru lengur heimil eftir uppgjörsatburði.
- Client fær aðeins afmarkað summary; fullt JSON payload fer ekki inn í dashboard contractið.

## Áhætta sem stendur eftir

- SQL111 þarf að vera keyrt af Stebba áður en `Þarf að klára` birtist á UL-forsíðu.
- Migration hefur aðeins verið static-prófað; raunverulegt Supabase postflight er loka-staðfestingin.
- Tengslahringur er valinn beint við stofnun nýrrar færslu. Að tengja nýjan hring við eldri færslu var ekki bætt við í þessum áfanga.

## Tillaga að næsta skrefi

Stebbi keyrir SQL111 preflight, SQL111 og postflight í þessari röð og límir niðurstöðurnar til Codex. Eftir grænt postflight smoke-prófar Stebbi dæmið 100.000 / 10.000 / 10.000 á localhost.

## Localhost checks for Stebbi

Forkrafa: SQL110 er þegar grænt. Keyrðu SQL111 aðeins eftir grænt preflight og aldrei á rangt Supabase project.

1. Opnaðu `/auth-mvp/utlagt-og-endurgreitt` og staðfestu að græni takkinn heiti `+ Útlagt`.
2. Stofnaðu nýja færslu fyrir `100.000 kr.` og farðu í `Skiptingin`.
3. Staðfestu röðina: greiðandi, þátttakendur, skipting.
4. Veldu fasta upphæð og settu `10.000` á þig og `10.000` á annan þátttakanda.
5. Staðfestu gula textann `Skipting þarf lagfæringu` og `80.000 kr. eru óúthlutaðar`.
6. Smelltu `Vista færslu`. Vænt: þú ferð á UL-forsíðuna, engin virk skuld eða uppgjör hefur myndast og færslan birtist undir `Þarf að klára`.
7. Opnaðu færsluna aftur, lagaðu skiptinguna í samtals `100.000 kr.` og vistaðu. Vænt: einkadrögin hverfa og venjuleg UL-færsla/uppgjör verður til.
8. Prófaðu `Bæta við þátttakanda`: leit að nafni, filter eftir persónulegu labeli og val á tengslahring. Á mobile má dialog ekki valda zoomi, láréttu overflowi eða föstum bakgrunni eftir lokun.

Öryggisathugun: Ófullgerð færsla á ekki að senda boð, búa til skuld, activity-event eða uppgjör fyrr en skiptingin hefur verið lagfærð og endanleg vistun tekst.
