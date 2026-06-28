# #55 v003 - Reopen: list actions not verified + returned pending badge

## Af hverju #55 er opið aftur

Stebbi prófaði raunflæði eftir v002 og staðfesti að product-upplifunin er enn
ekki rétt:

- Hann fann pending boðið `tengslatest` undir `Skilað`.
- Það var hægt að losna við heimabóluna með því að opna detail og smella á
  `Þekki málið`.
- `Þekki málið` / `Kannast ekki við þetta` voru ekki sýnileg á forsíðulistanum í
  því umhverfi sem Stebbi var að prófa.
- Stebbi vill ekki þurfa að samþykkja skilaðan hlut til að losna við bóluna.

Þetta þýðir að #55 má ekki vera í DONE enn.

## Staða í local repo þegar Codex skoðaði

`git status --short` sýndi meðal annars:

- `M components/loans/LoanSummaryCard.tsx`
- `M lib/__tests__/loan-card.test.tsx`

Codex sá að local `LoanSummaryCard.tsx` er þegar með ócommittað #55 fix:

- pending rows nota `<article>` + `<Link>` + button row;
- `claimInvitation` og `declineInvitation` eru notuð;
- `router.refresh()` er kallað á success;
- buttons eru ekki nested inni í `<Link>`.

Möguleg skýring á Stebba-prófinu: fixið er local/uncommitted og ekki komið í
production eða það build/umhverfi sem hann var að nota.

## Staðfest gagnatilvik

Stebbi keyrði read-only SQL sem Codex gaf og fékk þessa röð:

```text
invitation_id: a2661c9c-04eb-4a0a-b3a1-d3e57d09d57a
loan_id:       441b16c4-1c24-4ddd-8c6f-433089c64f04
item_name:     tengslatest
loaned_at:     2026-06-22
due_at:        null
returned_at:   2026-06-22 21:33:08.261805+00
status:        pending
expires_at:    2026-07-22 07:15:38.072409+00
recipient_role: borrower
recipient_email_normalized: stebbishj@gmail.com
```

Þetta er pending invitation á skiluðum hlut. Heimaskjár telur pending
acknowledgement rows, en default `Lánað og skilað` view er `Enn í láni`, þannig
röðin er ekki þar sem notandi byrjar.

## Markmið

Klára #55 í raun, ekki bara í handoffi:

1. `Þekki málið` og `Kannast ekki við þetta` þurfa að sjást á forsíðulista
   `Lánað og skilað` í því umhverfi sem Stebbi prófar.
2. Heimabólan má ekki krefjast þess að notandi samþykki pending boð á hlut sem
   er þegar skilaður.
3. Bólutalning og sýnilegt/actionable UI þurfa að passa saman.

## Ráðlögð leið

### A. Staðfesta hvort v002 fixið sé bara ódeployað

Byrja á að staðfesta hvort `LoanSummaryCard.tsx` og test breytingarnar séu:

- ócommittaðar local breytingar,
- committaðar en ekki pushed,
- pushed en ekki deployed,
- eða Stebbi sé að prófa gamlan dev-server/build.

Ekki endurimplementa sama `LoanSummaryCard` fix ef það er nú þegar til.

### B. Laga returned pending badge edge-case

Product-regla sem Codex mælir með fyrir þennan áfanga:

> Heimaskjás-badge fyrir `Lánað og skilað` á aðeins að telja pending
> acknowledgement rows sem eru ekki skilaðar (`returned_at === null`).

Rök:

- Stebbi vill ekki þurfa að smella `Þekki málið` á skiluðum hlut til að hreinsa
  bóluna.
- Default listinn `Enn í láni` felur skiluð lán.
- Skilað pending invitation getur enn verið til í gögnum, en það á ekki að halda
  heimabólunni fastri.

Líkleg breyting:

- Í `app/auth-mvp/heim/page.tsx`, breyta `pendingCount` filter úr:

```ts
loan.requires_acknowledgement && loan.invitation_status === 'pending'
```

í:

```ts
loan.requires_acknowledgement &&
loan.invitation_status === 'pending' &&
loan.returned_at === null
```

Meta hvort sama regla eigi að fara í helper/test ef count logic er til annars
staðar.

### C. Tryggja forsíðutakka

Fyrir pending open invitations:

- `LoanSummaryCard` á að sýna `Þekki málið` og `Kannast ekki við þetta` beint á
  listasíðu.
- Ekki fela takkana undir detail.
- Ekki setja `<button>` inni í `<Link>`.
- Eftir success þarf `router.refresh()`.

Ef takkarnir sjást ekki þrátt fyrir local code:

- staðfesta að item í listanum hafi `requires_acknowledgement === true`;
- staðfesta að rétt build sé í gangi;
- staðfesta að user sé ekki á deployed útgáfu án breytinganna.

## Tests

Keyra að lágmarki:

```powershell
npm run test:run -- lib/__tests__/loan-card.test.tsx lib/__tests__/home-page.test.tsx
npm run type-check
```

Bæta við eða staðfesta test fyrir:

- `LoanSummaryCard` sýnir báða takka fyrir pending recipient row.
- `LoanSummaryCard` sýnir þá ekki fyrir creator/accepted rows.
- `claimInvitation` / `declineInvitation` kalla `router.refresh()` á success.
- Heimaskjár telur ekki pending acknowledgement row með `returned_at !== null`.
- Heimaskjár telur áfram pending acknowledgement row með `returned_at === null`.

## Localhost checks for Stebbi

Nota localhost eða það staging/production umhverfi sem á að staðfesta eftir
deploy. Ekki nota raunboð í production nema Stebbi vilji breyta stöðu þeirra.

1. Pending open boð:
   - Opna `/auth-mvp/heim`.
   - Vænt: badge birtist.
   - Opna `/auth-mvp/lanad-og-skilad`.
   - Vænt: pending row sést á forsíðulistanum og sýnir `Þekki málið` og
     `Kannast ekki við þetta` án detail-smells.
2. Click `Kannast ekki við þetta` á pending open boði:
   - Vænt: row/badge uppfærist eftir action.
3. Click `Þekki málið` á öðru pending open boði:
   - Vænt: row verður accepted/venjulegt lán og badge lækkar.
4. Pending returned boð:
   - Nota eða endurskapa tilvik eins og `tengslatest`.
   - Vænt: heimaskjár heldur ekki badge vegna þessa tilviks.
   - Notandi á ekki að þurfa að fara í `Skilað`, opna detail og samþykkja skilaðan
     hlut til að losna við bóluna.
5. Mobile:
   - Prófa 360 px, 390 px og 430 px.
   - Takkarnir mega ekki overlap-a, overflow-a eða vera aðeins hover/desktop.

## Ekki gera án nýs samþykkis

- Ekki keyra SQL eða gagnaleiðréttingu á production.
- Ekki breyta RLS/grants.
- Ekki eyða eða accept-a pending invitations sjálfkrafa í gagnagrunni nema það sé
  sér product/Supabase handoff.
- Ekki commit-a/push-a/deploy-a nema Stebbi biðji sérstaklega um það.

## Spurningar til Codex í næsta closeout

- Var #55 fixið raunverulega komið í prófað umhverfi?
- Eru forsíðutakkar sýnilegir á listanum, ekki bara detail?
- Telur heimabólan returned pending invitations ennþá?
- Var einhver SQL eða gagnabreyting gerð?
- Eru tests að ná bæði list-actions og returned badge edge-case?
