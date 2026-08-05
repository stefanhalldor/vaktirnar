# TODO #95 v008 — Útlagt autosave, samantekt og SQL102 stop-gate

## Plan áfangans

Einfalda skiptingu í fasta upphæð, prósentu og hluti; vista einkadrög við skrefaskipti; gera vistað Útlagt að samantekt með fjórum smellanlegum líftímaflipum; og laga að skráður aðili valinn úr Tengslum verði boðinn notandi en ekki gestur.

## Hvað var raunverulega gert

- SQL102 var **skrifað en aldrei keyrt**. Það bætir við default-deny einkadrögum með CAS og service-role RPC-um.
- SQL102 bætir einnig við atomic wrapper utan um SQL96 create-RPC. Þekkt Tengsl eru staðfest sem eign actor og uppfærð í `invited` innan sömu transactionar; bilun rollback-ar allri stofnuninni.
- Formið autosave-ar við næsta/fyrra skref og top-menu navigation, en fer ekki af skrefinu ef vistun mistekst.
- Skipting sýnir aðeins `fixed`, `percentage` og `weighted`; `weighted` með einum hlut á mann er sjálfgefin jöfn skipting.
- Vistað útlagt opnast á high-level samantekt. `Útlagt`, `Aðilar`, `Skipting` og `Uppgjör` eru allir smellanlegir read-only flipar; breytingarhlekkir eru aðeins sýndir með heimild.
- Eldri sex SQL split-methods eru áfram studdar í backend. Eldri skipting er varðveitt þar til notandi velur að breyta henni.

## Skrár sem voru skoðaðar

`WORKFLOW.md`, `Design.md`, SQL96/97, expense actions/repository/contracts/flow, expense routes/components/tests og þýðingar.

## Skrár sem voru breyttar

Tengdar routes undir `app/auth-mvp/utlagt-og-endurgreitt/`, `components/expenses/ExpenseForm.tsx`, `ExpenseFlowNav.tsx`, `ExpenseItemDetail.tsx` og tengd próf; `lib/expenses/actions.ts`, `drafts.ts`, `flow.ts`, `participants.server.ts`, `repository.server.ts`, `validation.ts`; `messages/is.json`, `messages/en.json`; `sql/102_expense_private_drafts.sql`; `sql/validation/102-expense-private-drafts/*`; og tvö tengd lib regression-próf.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check` — exit 0.
- `npm.cmd run test:run` — exit 0; 287 test files passed, 1 skipped; 5.244 tests passed, 28 skipped, 8 todo.
- `npm.cmd run build` — exit 0; production build grænt. Aðeins fyrirliggjandi ótengdar lint warnings birtust.
- `git diff --check` á tengdu umfangi — exit 0.

## Hvað mistókst eða var sleppt

Fyrsta fulla type-check fann ES target-ósamhæfan regex flagga í nýju static prófi; það var lagað og endurkeyrsla varð græn. Engin SQL var keyrð. Ekkert commit, push, Vercel deployment, production smoke eða Gmail var framkvæmt vegna SQL102 stop-gate.

## Ákvarðanir

- Einkadrög eru sérstök private JSON snapshot-töfla; fjárhagsleg lokaútgáfa er áfram normalized í núverandi expense-töflum.
- Þekktur skráður viðtakandi verður `invited`, ekki `active`, svo samþykki og privacy haldist.
- Enginn backfill er gerður á eldri röngum gestaröðum þar sem relationship source var ekki vistað og örugg auðkenning er því ekki möguleg.

## Áhætta sem er enn til staðar

- PostgreSQL migrationin hefur ekki verið keyrð í production; appið má ekki deploya fyrr en postflight er grænt.
- Fyrirliggjandi Berglind-gestaröð lagast ekki sjálfkrafa. Nýtt val úr Tengslum verður rétt eftir rollout; eldri röð þarf síðar afmarkaða, staðfesta gagnaleiðréttingu ef hún á að varðveitast.
- UI þarf handprófun á raunverulegum mobile viewport og með Berglindi eftir migration.

## Næsta skref

Stebbi keyrir í production Supabase, í þessari röð:

1. `sql/validation/102-expense-private-drafts/preflight.sql` — aðeins halda áfram ef `prerequisites_ok=true`, target relation er null, target functions er tómt og engin gömul transaction er til.
2. `sql/102_expense_private_drafts.sql` — einu sinni.
3. `sql/validation/102-expense-private-drafts/postflight.sql` — öll boolean true og `draft_rows=0` strax eftir uppsetningu.

Síðan sendir Stebbi Codex postflight röðina. Codex staðfestir, commit-ar aðeins tengdar skrár, push-ar `main`, fylgist með Vercel, gerir read-only production smoke og sendir Gmail.

## Spurningar fyrir Codex-rýni

- Staðfesta að postflight sé að fullu grænt áður en app code fer út.
- Staðfesta eftir rollout að þekktur viðtakandi birtist sem `Boðið`/Teskeiðarnotandi og að gestatengiboð sé ekki í boði.

## Supabase

- SQL-skrá: `sql/102_expense_private_drafts.sql`.
- Keyrð af Codex: **Nei**.
- Gögn: enginn backfill; private draft rows verða aðeins til við síðari app-notkun.
- RLS/grants: FORCE RLS, engar policies og engin direct table grants; public/anon/authenticated function execute er afturkallað; aðeins service-role fær execute á public RPC-um; private helper er ekki executable fyrir service-role.
- Auth/privacy: relationship owner og registered counterpart eru staðfest innan transactionar; boðinn notandi sér engar fjárhagsupplýsingar fyrr en samþykki liggur fyrir.

## Localhost checks for Stebbi

Localhost-prófun á nýja flæðinu krefst fyrst SQL102 í gagnagrunninum sem localhost notar. Ekki keyra app-prófið gegn production áður en preflight/migration/postflight er lokið.

1. Opna `/auth-mvp/utlagt-og-endurgreitt/nytt` sem flaggaður notandi.
2. Skrá heiti/upphæð og fara áfram. Vænt: `Vista breytingar...`, svo `Breytingar vistaðar`; refresh heldur réttu skrefi og gögnum.
3. Staðfesta að aðeins `Föst upphæð`, `Prósenta` og `Hlutir` sjáist; `Hlutir` er default og `Skipta jafnt` setur 1 á alla.
4. Velja Berglindi úr Þekktum aðilum, vista og opna Aðilar. Vænt: Berglind er `Boðið`/skráður notandi, ekki `Gestur`, og ekki er hægt að senda henni guest identity invitation.
5. Opna vistaða færslu. Vænt: samantekt með „X lagði út“, þinni stöðu og opnum greiðslum. Allir fjórir top-bar flipar virka og sýna pending feedback.
6. Prófa við 360–460 px breidd: ekkert horizontal overflow, zoom eða overlap; controls minnst 44 px og browser back skilar stöðugu scroll/form state.
7. Regression: stofna nafngreindan gest og staðfesta að hann sé enn gestur sem má tengja síðar; breyta eldri equal/mixed færslu án skiptingarbreytingar og staðfesta að authoritative shares breytist ekki.
