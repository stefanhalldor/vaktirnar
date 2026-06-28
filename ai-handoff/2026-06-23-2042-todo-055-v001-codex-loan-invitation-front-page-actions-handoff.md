# #55 v001 - Lánaboðsás og soft-ack takkar á forsíðu `Lánað og skilað`

## Fyrir Claude Code

Þetta er næsti opni TODO-pakki eftir að #30 var fært í DONE.

Markmiðið er ekki að endurhanna allt lánaboðsflæðið, heldur að leysa sýnilega
vandann sem Stebbi lýsti: badge/ás `1` á heimaskjá má ekki virka fastur, og
notandi á að geta afgreitt pending lánaboð beint á forsíðu/lista
`Lánað og skilað` með `Þekki málið` og `Kannast ekki við þetta`.

## Staða áður en byrjað er

Atriðið á enn rétt á sér.

Codex skoðaði kóðann og fann að:

- `app/auth-mvp/heim/page.tsx` telur pending badge með `get_my_loans` og
  `loan.requires_acknowledgement && loan.invitation_status === 'pending'`.
- `app/auth-mvp/lanad-og-skilad/page.tsx` sækir líka `get_my_loans`, en birtir
  listann í `LoanList`.
- `components/loans/LoanList.tsx` renderar `LoanSummaryCard` fyrir hvert item.
- `components/loans/LoanSummaryCard.tsx` er bara clickable summary-linkur á
  detail-síðu og sýnir ekki acknowledge/decline buttons.
- `components/loans/LoanCard.tsx` er þegar með `Þekki málið` og
  `Kannast ekki við þetta`, en það leysir ekki Stebba-vandann ef takkarnir eru
  ekki sýnilegir á forsíðu/lista `Lánað og skilað`.
- `lib/loans/actions.ts` notar þegar `claimInvitation` og `declineInvitation`,
  ack-ar recent event, býr til creator event og kallar `revalidateLoanViews()`.
  `revalidateLoanViews()` kallar `revalidatePath('/auth-mvp/lanad-og-skilad')`
  og `revalidatePath('/auth-mvp/heim')`.

Niðurstaða: líklegasta einfaldasta fixið er UI/client-refresh fix í
`LoanSummaryCard`/skyldum componentum, ekki SQL migration.

## Manual pre-check fyrir Stebba áður en kóða er breytt

Ef Stebbi getur prófað núverandi hegðun áður en Claude breytir kóða:

1. Vera innskráður sem notandi sem er viðtakandi pending lánaboðs.
2. Opna `/auth-mvp/heim`.
3. Staðfesta hvort `Lánað og skilað` kortið sýnir badge `1`.
4. Smella á `Lánað og skilað`.
5. Á `/auth-mvp/lanad-og-skilad`, finna pending item sem samsvarar badge-inu.
6. Athuga hvort `Þekki málið` og `Kannast ekki við þetta` sjáist strax á listanum
   án þess að opna detail-síðu.
7. Ef takkarnir sjást ekki þar er #55 staðfestur bug.
8. Ef takkarnir sjást, prófa hvort smellt á annan þeirra hreinsar badge á
   `/auth-mvp/heim` eftir refresh/back navigation.

Ekki gera þessa pre-check á production gögnum nema Stebbi vilji virkilega
afgreiða raunverulegt lánaboð, því `Þekki málið` og `Kannast ekki við þetta`
breyta gagnastöðu.

## Implementation plan

1. Byrja á mjög afmarkaðri rýni:
   - `components/loans/LoanSummaryCard.tsx`
   - `components/loans/LoanCard.tsx`
   - `components/loans/LoanList.tsx`
   - `lib/loans/actions.ts`
   - `lib/loans/types.ts`
   - `messages/is.json` og `messages/en.json`
   - viðeigandi tests í `lib/__tests__/loan-card.test.tsx`,
     `lib/__tests__/loan-list.test.tsx`, `lib/__tests__/loan-pages.test.tsx`,
     `lib/__tests__/home-page.test.tsx` og `lib/__tests__/actions.test.ts`

2. Bæta soft-ack actions á listaforsíðu:
   - Pending recipient row er þegar auðkennd með
     `requires_acknowledgement === true` og `invitation_status === 'pending'`.
   - Nota sömu authoritative actions og detail:
     - `claimInvitation(invitationId)` fyrir `Þekki málið`
     - `declineInvitation(invitationId)` fyrir `Kannast ekki við þetta`
   - Ekki búa til nýja DB/RPC leið nema kóðarýni sýni að það sé nauðsynlegt.

3. Varast nested interactive controls:
   - `LoanSummaryCard` er nú outer `<Link>`.
   - Ekki setja `<button>` inni í `<Link>`.
   - Fyrir pending rows þarf annað hvort:
     - breyta cardinu í `<article>` með sér `<Link>` fyrir opnanlegan hluta og
       button row fyrir actions, eða
     - búa til shared `LoanAcknowledgementActions` component og nota það þar sem
       parent er ekki anchor.
   - Fyrir venjulegar rows má halda full-card link hegðun eða samræma yfir í
     `article + Link`, en passa að UX versni ekki.

4. Endurnýja UI eftir action:
   - `claimInvitation`/`declineInvitation` revalidate-a þegar server action skilar
     `ok`.
   - Client componentið ætti samt að kalla `router.refresh()` eftir `ok` til að
     tryggja að current listi og badge-state uppfærist strax eftir action.
   - Ef action mistekst á að sýna stutt error, ekki skilja notanda eftir í
     óútskýrðu pending-state.
   - Disable-a báða takka á meðan action er í gangi.

5. Mobile-first útlit:
   - Takkarnir þurfa að vera sýnilegir á 360-460 px breidd.
   - Ef textinn er langur, nota tveggja-lína/flex-col eða `min-h` í stað þess að
     láta hann flæða út fyrir kort.
   - Ekki fela `Mín skýring`, dagsetningar eða aðalnafn bakvið actions.
   - Ekki nota hover-only affordance fyrir farsíma.

6. Huga að filters/sort:
   - `LoanList` flytur `requires_acknowledgement` rows efst. Halda því.
   - Pending item má ekki hverfa vegna default filter nema action hafi tekist.
   - Eftir decline má row hverfa úr listanum eða birtast sem declined, en það þarf
     að vera productlega skýrt. Fyrir #55 er einfaldast að treysta refreshed
     `get_my_loans` niðurstöðu.

7. Tests:
   - Bæta test sem staðfestir að `LoanSummaryCard`/listaforsíða sýni
     `Þekki málið` og `Kannast ekki við þetta` fyrir pending recipient row.
   - Testa að buttons birtist ekki fyrir creator pending row.
   - Testa að click á `Þekki málið` kalli `claimInvitation` með réttu
     `invitation_id` og kalli `router.refresh()` á success.
   - Testa að click á `Kannast ekki við þetta` kalli `declineInvitation` með
     réttu `invitation_id` og kalli `router.refresh()` á success.
   - Testa failure path: error text birtist og row helst usable.
   - Home-page badge test má vera áfram á `get_my_loans` count, en bæta regression
     ef það hjálpar að sýna að pending count fer ekki eftir recent events einum.

## Ekki gera

- Ekki veikja RLS eða grants.
- Ekki veita client beinan aðgang að `loan_invitations`.
- Ekki afhjúpa recipient email umfram það sem `get_my_loans` skilar þegar
  creator má sjá það.
- Ekki keyra SQL eða breyta production gögnum án sérstakrar staðfestingar frá
  Stebba.
- Ekki gera þetta að fullri #27 mýkingu lánaboðsflæðis. #55 er bara sýnilegur
  front-page action/refresh pakki.

## Suggested commands

Keyra eftir breytingu:

```powershell
npm run test:run -- lib/__tests__/loan-card.test.tsx lib/__tests__/loan-list.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/home-page.test.tsx lib/__tests__/actions.test.ts
npm run type-check
```

Ef breytingin snertir `lib/loans/types.ts` eða SQL static assumptions, bæta við:

```powershell
npm run test:run -- lib/__tests__/loans.test.ts lib/__tests__/sql-migration.test.ts
```

## Localhost checks for Stebbi

Nota localhost sem Stebbi keyrir sjálfur. Ekki nota production nema Stebbi vilji
afgreiða raunveruleg lánaboð.

1. Búa til eða finna account sem er viðtakandi pending lánaboðs.
2. Opna `/auth-mvp/heim`.
3. Vænt: `Lánað og skilað` kortið sýnir badge `1` ef eitt pending boð bíður.
4. Smella á `Lánað og skilað`.
5. Vænt á `/auth-mvp/lanad-og-skilad`:
   - pending item er sýnilegt ofarlega í listanum,
   - `Þekki málið` og `Kannast ekki við þetta` sjást strax á listanum,
   - ekki þarf að opna detail-síðu til að skilja hvað badge-ið var.
6. Prófa `Þekki málið`:
   - takkarnir disabled/loading á meðan action keyrir,
   - eftir success hverfur pending action row eða breytist í venjulegt accepted
     lán eftir refreshed gögn,
   - fara til baka á `/auth-mvp/heim`,
   - badge `1` er horfið eða lækkað rétt.
7. Endurtaka með öðru pending boði og prófa `Kannast ekki við þetta`:
   - boðið hverfur eða fær declined stöðu í samræmi við refreshed gögn,
   - heimaskjás-badge lækkar/hverfur.
8. Mobile próf:
   - 360 px, 390 px og 430 px breidd.
   - Takkarnir mega ekki overflow-a, skarast eða ýta texta út fyrir skjá.
   - Kortið þarf enn að vera auðvelt að opna ef notandi vill sjá detail.
9. Regression:
   - Creator sem sendi boð sér ekki `Þekki málið` / `Kannast ekki við þetta`.
   - Venjuleg samþykkt lán sýna ekki soft-ack takka.
   - Return/edit/delete/add-party controls halda áfram að virka á detail og þar
     sem þau áttu áður að birtast.

## Supabase / SQL

Engin SQL breyting er væntanleg í þessum pakka.

Ef Claude telur SQL nauðsynlegt, stoppa og skila Codex handoff fyrst með:

- hvaða migration væri skrifuð,
- hvort hún breytir gögnum,
- áhrif á RLS, grants, auth, functions og production,
- rollback/recovery plan,
- af hverju UI/server-action fix dugar ekki.

## Spurningar sem Codex á að rýna í closeout

- Er fixið örugglega á listaforsíðu `Lánað og skilað`, ekki bara detail?
- Eru buttons ekki nested inni í `<Link>`?
- Uppfærist heimaskjás-badge eftir action án hard refresh?
- Eru claim/decline enn aðeins möguleg fyrir réttan recipient?
- Var einhver SQL/gagnaáhætta kynnt óvart?
- Eru tests ekki bara að athuga mock-render heldur raunverulegt action-call og
  `router.refresh()` behavior?
