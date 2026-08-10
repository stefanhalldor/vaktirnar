# TODO #095 / v222 — UL, SQL122 og privacy-safe deep-link metadata

Created: 2026-08-10 21:36
Timezone: Atlantic/Reykjavik

## Plan áfangans

Loka v220/v221 UL-pakkanum án þess að tapa fyrirliggjandi breytingum, skrá
grænt SQL122 postflight frá Stebba og laga metadata sem gat valdið því að
Messenger einfaldaði private Teskeiðarhlekk í `teskeid.is`. Stöðva við
localhost-gátt vegna ósamræmis í útgáfuleyfi í síðasta prompti.

## Hvað var gert

- Fasta arfgenga `openGraph.url = https://teskeid.is` var fjarlægð úr root
  layout. Root metadata heldur almennum Teskeiðar title, description, mynd og
  Twitter preview.
- `/innskraning` fékk route-sértækt `generateMetadata`.
- `next` fer aðeins í metadata eftir `resolveSafeLoginNext`.
- Gilt innra `next` verður nákvæm absolute `https://teskeid.is/...` `og:url`.
  Ógilt eða vantað `next` fellur á `https://teskeid.is/innskraning`.
- Login metadata er `noindex, nofollow` og inniheldur aðeins almennt
  Teskeiðarcopy. Engin UL repository-, hópa-, færslu-, þátttakenda-, fjárhæða-
  eða greiðsluupplýsingalesning var sett í metadata.
- Núverandi login redirect, middleware, auth og feature flags voru óbreytt.
- Nýr login-title var settur í bæði íslensk og ensk messages.
- Fyrirliggjandi v220/v221 UL-breytingar og SQL122-pakki voru varðveitt.
- Stebbi keyrði SQL122 sjálfur. Pasted postflight 2026-08-10 21:29 var grænt:
  öll `*_ok = true`, `encrypted_profile_rows = 1` og engin gömul transaction.
- Óskylda `.obsidian/workspace.json` breytingin var hvorki breytt né hreinsuð.

## Skrár skoðaðar

- `WORKFLOW.md`
- `AGENTS.md`
- `Design.md`
- `ai-handoff/README.md`
- `app/layout.tsx`
- `app/innskraning/page.tsx`
- `lib/auth/loginNext.ts`
- `lib/__tests__/loginNext.test.ts`
- fyrri v220/v221 UL- og SQL122-breytingar í dirty worktree

## Skrár breyttar í v222

- `app/layout.tsx`
- `app/innskraning/page.tsx`
- `lib/auth/loginMetadata.ts` (ný)
- `lib/__tests__/login-metadata.test.ts` (ný)
- `messages/is.json`
- `messages/en.json`

Messages-skrárnar innihalda einnig varðveitt v220/v221 UL-copy.

## Varðveittar v220/v221 skrár

- `components/expenses/ExpensePayAll.tsx`
- `components/expenses/__tests__/expense-pay-all-ui.test.tsx`
- `lib/expenses/contracts.ts`
- `lib/expenses/pay-all.ts`
- `lib/expenses/repository.server.ts`
- `lib/__tests__/expense-pay-all.test.ts`
- `lib/__tests__/expense-payment-instruction-contract.test.ts`
- `sql/122_expense_current_debtor_payment_profile.sql`
- `sql/validation/122-expense-current-debtor-payment-profile/*`
- `lib/__tests__/expense-sql122-current-debtor-payment-profile.test.ts`

## Skipanir og niðurstöður

- Focused metadata Vitest: 3 skrár, 34/34 próf græn, exit 0.
- Sameinað focused Vitest:
  `npm.cmd run test:run -- components/expenses/__tests__/expense-pay-all-ui.test.tsx lib/__tests__/expense-pay-all.test.ts lib/__tests__/expense-payment-instruction-contract.test.ts lib/__tests__/expense-sql122-current-debtor-payment-profile.test.ts lib/__tests__/loginNext.test.ts lib/__tests__/login-metadata.test.ts lib/__tests__/root-layout-locale-contract.test.ts --exclude ".tmp/**"`
  — 7 skrár, 49/49 próf græn, exit 0.
- Scoped TypeScript með tímabundnu tsconfig sem útilokaði `.next`:
  `npm.cmd exec tsc -- --project tsconfig.deep-link-local.json --noEmit --incremental false`
  — exit 0. Tímabundna skráin var síðan fjarlægð.
- Fyrsta `npm exec` tilraun var stöðvuð af Windows PowerShell execution policy;
  hún breytti engu. `npm.cmd` keyrslan að ofan var græn.
- Scoped tracked `git diff --check` — exit 0; aðeins LF/CRLF warnings.
- No-index checks á nýjum metadata-skrám fundu engar whitespace-villur;
  exit 1 var væntanlegur því skrárnar eru nýjar og því sjálft diffið er til.

## Hvað var ekki gert

- Engin localhost/browser keyrsla eða dev-server breyting.
- Engin `.next` hreinsun.
- Engin Supabase tenging eða SQL-keyrsla frá Codex.
- Ekkert commit, push eða deploy.
- Enginn tölvupóstur sendur, þar sem production útgáfa fór ekki fram.

## Ákvarðanir

- Metadata URL er leyst með litlum pure helper og sama
  `resolveSafeLoginNext` allowlist og auth notar. Enginn annar URL-parser eða
  víðari allowlist var kynntur.
- URL má innihalda leyfilegan query-string, en preview-copy er alltaf almennt.
- Engin sýnileg layout-breyting var gerð; mobile/loading reglur Design.md
  breytast því ekki.

## Áhætta sem er eftir

- Messenger cache getur haldið eldra previewi um stund þótt HTML metadata sé
  rétt eftir útgáfu. Prófa þarf með nýjum/deililega cache-busted hlekk.
- Global metadata án `url` treystir á route/request samhengi fyrir síður sem
  skilgreina ekki eigið canonical `og:url`; það er viljandi öruggara en að
  ljúga að allar síður séu forsíðan.
- Production rollout er ekki heimilað ótvírætt: fyrsti hluti promptsins sagði
  deploy, en lokaákvæði þess bannaði commit, push og deploy. Hard stop í
  WORKFLOW krefst nýrrar skýrrar staðfestingar.

## Næsta skref

1. Stebbi keyrir localhost checks hér að neðan.
2. Ef niðurstaðan er góð staðfestir Stebbi ótvírætt að Codex megi commit-a,
   push-a og deploya sameinaðan v220/v221/v222 pakka.
3. Við release skal `.obsidian/workspace.json` sérstaklega útilokuð frá commit.
4. Eftir grænt Vercel build og production smoke-test sendir Codex tölvupóst.

## Spurningar til rýni

- Staðfestir Stebbi að fyrri útgáfubeiðni eigi að yfirskrifa síðasta bannið
  og heimili commit, push og production deploy?
- Vill Stebbi prófa Messenger með sama hlekk eftir cache-bið eða með nýjum
  query-string til að aðgreina preview-cache frá metadata-regression?

## Supabase / SQL122

- Migration: `sql/122_expense_current_debtor_payment_profile.sql`.
- Codex skrifaði/varðveitti migration, preflight, postflight, recovery og
  static-próf en tengdist ekki Supabase og keyrði ekkert SQL.
- Stebbi keyrði migration og postflight í production.
- Postflight staðfestir exact resolver overload/security, sameiginlega
  skuldaraheimild, current settlement context, creditor profile projection,
  read-only encrypted payload, service-role-only execute/select og owner/RLS
  invariants. Engar töflu-, policy-, auth- eða gagnabreytingar voru hluti af
  SQL122; function contract var skipt út transactionally.

## Localhost checks for Stebbi

### Deep-link metadata og auth

1. Opna private UL-hlekk í nýjum logged-out/incognito glugga, t.d.
   `/auth-mvp/utlagt-og-endurgreitt/hopar/<groupId>`.
2. Vænt: browser fer á
   `/innskraning?next=%2Fauth-mvp%2Futlagt-og-endurgreitt%2Fhopar%2F...`.
3. Skrá inn. Vænt: nákvæm upprunaleg UL-slóð opnast; ekki forsíðan.
4. Skoða page source/metadata á login redirecti. Vænt:
   - `og:url` er absolute private pathið á `https://teskeid.is`;
   - `robots` er `noindex, nofollow`;
   - title/description eru almenn Teskeiðarorð;
   - ekkert hópnafn, færslutitill, fjárhæð, þátttakandi eða greiðsluupplýsing.
5. Prófa `?next=https://example.com`, `?next=//example.com` og
   `?next=/admin`. Vænt: `og:url` fellur á
   `https://teskeid.is/innskraning` og login fer ekki út af Teskeið.
6. Prófa leyfilegan innri `next` með query-string. Vænt: query-string helst
   nákvæmlega í `og:url` og login redirecti.

Ekki deila raunverulegum private groupId í opinberan crawler/debugger sem
geymir preview. Notaðu incognito/page source fyrir metadata-prófið; Messenger
production preview skal aðeins prófa eftir sérstakt release-samþykki.

### UL Gera allt upp

1. Notandi þarf tvær opnar skuldir til sama greiðanda og greiðandinn þarf að
   hafa vistað greiðsluupplýsingar.
2. Opna `Gera allt upp`. Vænt: eitt sameinað greiðsluspjald sýnir heild,
   „2 greiðslur til þessa aðila“, greiðsluupplýsingarnar og aðgerðina
   „Búinn að borga“.
3. Smella á efri „Búinn að borga“. Vænt: Nánar-skúffan opnast; engin óskýr
   aggregate greiðsla er skrifuð.
4. Í skúffunni eiga báðar færslur að sýna nákvæma upphæð,
   „Nánar um færslu“ og sinn eigin context-bound „Búinn að borga“.
5. Smella á hvora færslu og fara til baka. Vænt: rétt exact expense opnast og
   heild/sundurliðun helst stöðug.
6. Tilkynna aðeins raunverulega testgreiðslu ef það er óhætt gagnvart
   production gögnum; annars stoppa fyrir mutation-skrefið.

Prófa við 360, 390 og 460 px að skúffa, upphæðir, greiðsluupplýsingar og
aðgerðir valdi ekki láréttu overflowi eða fari undir browser chrome.
