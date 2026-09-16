# v038 — canonical loader við myndgreiningu

Created: 2026-09-16 07:57 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Plan og niðurstaða

Markmiðið var að gera biðina við myndinnlestur sýnilega með fyrirliggjandi
Teskeið-loader. `SplitImport` heldur nú sérstöku image-pending state frá því að
undirbúningur hefst, gegnum private storage-upload og meðan server-side
myndgreining bíður. Formið víkur þá fyrir canonical `TeskeidLoader`; loaderinn
hverfur ekki við async transition áður en detail-route tekur við. Undirbúnings-
eða upload-villa endurheimtir formið og sýnir fyrri villuhegðun.

Engin provider-, storage-, auth-, gagnagrunns- eða navigation-regla breyttist.
JSON-innlestur er áfram óháður mynd og fær ekki mynd-loader.

## Skoðað og breytt

Skoðað: `WORKFLOW.md`, `AGENTS.md`, `Design.md`, canonical task, v037 handoff,
`TeskeidLoader.tsx`, `ExpenseRouteLoading.tsx`, `SplitImport.tsx`, þýðingar og
standalone receipt UI-próf.

Breytt:

- `components/receipt-split/SplitImport.tsx`
- `components/receipt-split/__tests__/standalone-receipt-ui.test.tsx`
- `messages/is.json`
- `messages/en.json`
- canonical task document og þetta handoff

## Skipanir og niðurstöður

- `npm.cmd run test:run -- components/receipt-split/__tests__/standalone-receipt-ui.test.tsx`
  → 1 skrá, 11 próf PASS, exit 0.
- `npm.cmd run type-check` → PASS, exit 0.
- `npm.cmd run lint -- --file ...` á báðum breyttum TSX-skrám → PASS, exit 0.
- Fyrsta lint-tilraun notaði positional filenames sem `next lint` túlkaði sem
  project directory; hún endaði 1 án lint-niðurstöðu. Rétt `--file` keyrsla
  hér að ofan leysti invocation-villuna.
- `git diff --check` → PASS, exit 0; aðeins fyrirliggjandi line-ending warnings.
- Read-only leit og diff voru notuð til afmörkunar.

Ekkert SQL var skrifað eða keyrt. Enginn dev server var ræstur eða stöðvaður.
Engin provider-köll, commit, push, merge eða deploy voru framkvæmd.

## Ákvarðanir, áhætta og næsta skref

Loaderinn er inni í myndakortinu svo notandinn sér strax hvaða aðgerð bíður og
mobile layout heldur sama ramma. Accessible `role=status` og skýrt aria-label
koma úr canonical component. Prófið heldur extraction-promise opinni og sannar
að loaderinn sé enn sýnilegur áður en navigation fer af stað.

Eftirstandandi gate er sjónræn, innskráð localhost-prófun Stebba. Raunverulegur
provider-tími, mobile rendering og failure-recovery hafa ekki verið keyrð í
browser af Codex. Engin ný code-review finding er opin.

## Breytingar á verkefnalýsingu

- Bætt við skýrum samningi um canonical loader frá undirbúningi í gegnum upload
  og myndgreiningu fram að navigation.
- Leiðrétt úrelt framtíðarorðalag um v2 cutover; exact postflight og live cutover
  hafa þegar átt sér stað.
- Bætt v038 við breytingasögu og haldið localhost-gátt óbreyttri.

## Localhost checks for Stebbi

Á `http://localhost:3004/auth-mvp/splitta-reikningnum`, innskráður í staðfestum
candidate:

1. Veldu synthetic/eigin JPG, PNG eða WebP kvittun og ýttu á „Lesa kvittun úr mynd“.
2. Vænt: input og hnappur víkja strax fyrir stóra Teskeið-loadernum með textanum
   „Les kvittunina og finn liðina…“. Hann á að vera sýnilegur meðan greining bíður.
3. Vænt: þegar greiningu lýkur opnast vistaða yfirferðin; enginn stuttur glampi
   af virku upload-formi á að sjást á undan navigation.
4. Regression: JSON-svar má enn líma inn án myndar og „Búa til drög úr svari“
   notar ekki mynd-loader eða myndakröfu. Athugaðu sérstaklega 360–390px breidd:
   engin lárétt skrunun, zoom eða overlap.

Nota aðeins eigin/synthetic mynd án viðkvæmra gagna. Prófið gerir raunverulegt
provider-kall og private upload samkvæmt núverandi flæði; það getur haft billing-
áhrif. Ekki prófa production-gögn eða eyðingar kæruleysislega. **Ekki keyra SQL.**
