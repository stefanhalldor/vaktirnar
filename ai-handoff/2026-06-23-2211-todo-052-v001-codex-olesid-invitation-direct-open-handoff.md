# #52 v001 - Lánaboð birtist í `Ólesið` og opnast beint

## Fyrir Claude Code

Stebbi staðfesti #5 mobile closeout 2026-06-23. Næsta opna TODO er #52:
pending lánaboð sem gefur badge á `Lánað og skilað` á líka að birtast í
`Ólesið`, og þaðan á að vera hægt að opna rétta hlutinn beint.

Þetta handoff er vísvitandi þröngt. Ekki taka allan #37 event-feed grunninn eða
fullt #27 soft-ack endurhönnunarverk í þessum áfanga.

## Rýni á raunverulega þörf

Atriðið á enn rétt á sér, en það er að hluta lokið:

- #55 lagaði að pending boð séu afgreiðanleg beint á listasíðu `Lánað og skilað`.
- #55 lagaði líka að returned pending boð haldi ekki heimabólunni fastri.
- `performInvitationSend()` skráir nú `loan_invitation_received` event ef
  viðtakandi er þegar skráður notandi þegar boðið er sent.
- `getUnreadRecentEventsForUser()` sækir öll unread events án þriggja atriða
  takmörkunar.

En kóðarýni sýnir þrjú bil sem skýra áfram #52:

1. `performInvitationSend()` skráir ekki `recent_events` row ef viðtakandi var
   ekki til sem auth-notandi þegar emailið var sent. Þá getur `get_my_loans`
   síðar sýnt pending boðið og badge á `/heim`, en `Ólesið` hefur ekkert event.
2. `app/auth-mvp/heim/page.tsx` reiknar `viewHref` fyrir
   `loan_invitation_received`, en `app/auth-mvp/heim/RecentSection.tsx` birtir
   ekki `Skoða` linkinn. Núverandi tests segja jafnvel að drawerinn feli
   `Skoða` tímabundið.
3. `app/auth-mvp/lanad-og-skilad/page.tsx` les ekki `searchParams` og
   `LoanList`/`LoanSummaryCard` highlighta ekki `?invitation=...`. Þannig að
   `viewHref=/auth-mvp/lanad-og-skilad?invitation=...` opnar bara almenna listann
   ef linkurinn væri sýndur.
4. Fyrir `loan_invitation_accepted`, `loan_invitation_declined`, `loan_updated`,
   `loan_returned` og sambærileg loan-events er `entity_type='loan'` og
   `entity_id` loan id. Núverandi `viewHref` fer samt bara á almenna
   `/auth-mvp/lanad-og-skilad`. Þetta er sérstaklega sýnilegt þegar hluturinn er
   skilaður: listinn opnast sjálfgefið á `Enn í láni`, svo notandi sér ekki
   hlutinn fyrr en hann skiptir handvirkt í `Skilað`. Eftir að sér detail-síða
   er komin per hlut á svona `Skoða` að fara beint á
   `/auth-mvp/lanad-og-skilad/<loan_id>`.

## Manual pre-check fyrir Stebba áður en kóðabreyting hefst

Stebbi keyrir localhost sjálfur.

1. Finna eða búa til pending lánaboð sem núverandi notandi á að svara.
2. Opna `/auth-mvp/heim`.
3. Athuga hvort `Lánað og skilað` kortið sýnir badge.
4. Athuga hvort sama boð sé undir `Ólesið`.
5. Ef það sést undir `Ólesið`, smella á eventið.
6. Staðfesta hvort drawer sýnir `Skoða` eða bara `Lesið`.
7. Ef hægt er að fara á `/auth-mvp/lanad-og-skilad?invitation=<id>`, prófa slóðina
   beint og athuga hvort rétt spjald er highlightað eða bara venjulegur listi.
8. Finna `loan_invitation_accepted` eða annað loan-event fyrir hlut sem er
   skilaður, t.d. `Lánaboð samþykkt: tengsl á raun`.
9. Smella `Skoða` á því eventi.
10. Staðfesta hvort það opnar detail-síðu hlutarins eða aðeins almenna
    `Lánað og skilað` forsíðu.

Niðurstaða pre-check ræður scope:

- Ef boðið birtist ekki í `Ólesið`: laga event trygginguna.
- Ef boðið birtist en `Skoða` vantar: laga drawer/link.
- Ef `Skoða` opnar bara almenna listann: laga query-param highlight/scroll.
- Ef `loan_invitation_accepted` eða önnur loan-events opna bara almenna listann:
  laga `viewHref` þannig að loan-id events fari beint á detail-síðu.

## Mælt afmarkað plan

1. Lesa `Design.md` áður en UI er breytt.
2. Staðfesta núverandi hegðun í kóða og tests:
   - `lib/loans/actions.ts`
   - `lib/recent-events/helpers.server.ts`
   - `lib/recent-events/types.ts`
   - `app/auth-mvp/heim/page.tsx`
   - `app/auth-mvp/heim/RecentSection.tsx`
   - `app/auth-mvp/lanad-og-skilad/page.tsx`
   - `components/loans/LoanList.tsx`
   - `components/loans/LoanSummaryCard.tsx`
   - `lib/__tests__/home-page.test.tsx`
   - `lib/__tests__/loan-list.test.tsx`
   - `lib/__tests__/loan-pages.test.tsx`
3. Tryggja að pending soft-ack boð sem `get_my_loans` skilar geti orðið unread
   event fyrir notandann þó event hafi ekki verið stofnað við email-send.
   Öruggasta leiðin er líklega best-effort helper sem notar núverandi
   `recent_events` grunn:
   - finna actionable pending loans úr `get_my_loans`:
     `requires_acknowledgement === true`,
     `invitation_status === 'pending'`,
     `returned_at === null`,
     `invitation_id` er til;
   - upserta/insert-a `recent_events` row með:
     `user_id = current user.id`,
     `event_type = loan_invitation_received`,
     `entity_type = invitation`,
     `entity_id = invitation_id`,
     `event_key = loans:invitation:${invitation_id}:received`,
     `payload = { itemName: item_name }`,
     `href = /auth-mvp/lanad-og-skilad`,
     `updateOnConflict = false`;
   - ekki láta helper throw-a eða brjóta heimaskjá ef event-skráning bilar.
4. Sækja unread events eftir að missing invitation events hafa verið tryggð, eða
   bæta missing event rows við `recentEvents` á öruggan og consistent hátt.
   Helst forðast UI-only synthetic rows sem `Allt lesið` getur ekki ackað.
5. Birta `Skoða` í `RecentSection` drawer þegar `drawerEvent.viewHref` er ekki
   `null`.
   - Ekki sýna `Skoða` fyrir deleted/null events.
   - Ekki fela `Lesið`; notandi þarf áfram að geta dismissað event.
   - Product-safe default: `Skoða` þarf ekki að acka eventið. Fyrir pending
     lánaboð er gott að eventið haldist ólesið þar til notandi velur
     `Þekki málið`, `Kannast ekki við þetta` eða `Lesið`.
6. Breyta `viewHref` útreikningi á `/heim`:
   - `loan_deleted`: áfram `null`.
   - `loan_invitation_received` með `entity_type='invitation'`: halda
     invitation-specific fallbacki, t.d.
     `/auth-mvp/lanad-og-skilad?invitation=<invitation_id>`, nema Claude velji
     örugga server-side leið til að finna loan id án þess að leka gögnum.
   - Öll event með `entity_type='loan'` og `entity_id`: nota detail route beint,
     `/auth-mvp/lanad-og-skilad/<loan_id>`.
   - Þetta á sérstaklega við `loan_invitation_accepted`; returned/skilaðir hlutir
     eiga ekki að týnast bak við default `Enn í láni` listafilter.
7. Láta `/auth-mvp/lanad-og-skilad?invitation=<invitation_id>` opna listann með
   réttu spjaldi sýnilegu og helst highlightuðu:
   - `LoanPage` les `searchParams.invitation`.
   - `LoanList` tekur t.d. `highlightInvitationId`.
   - `LoanSummaryCard` fær `isHighlighted` eða wrapper fær data attribute.
   - Nota `scrollIntoView()` varlega í client component þegar highlight-row er til.
   - Ekki brjóta default filtera. Pending acknowledgement rows eru þegar opin
     og fljóta efst; ef row finnst ekki skal bara sýna venjulegan lista án crash.

## Ekki gera í þessum áfanga

- Ekki keyra SQL án sérstakrar heimildar frá Stebba.
- Ekki veikja RLS eða breyta grants.
- Ekki opna almennan client access að `loan_invitations` eða `recent_events`.
- Ekki leka recipient email í `Ólesið`, payload, logs eða client state.
- Ekki endurhanna allan #37 event-diff grunninn.
- Ekki fela eða fjarlægja #55 listaaðgerðirnar `Þekki málið` og
  `Kannast ekki við þetta`.

## Tests sem þarf að bæta eða uppfæra

Mælt með:

- `lib/__tests__/home-page.test.tsx`
  - pending `get_my_loans` row án unread event tryggir/skráir
    `loan_invitation_received` event, eða birtist í `Ólesið` eftir nýja
    helper-mynstrinu;
  - existing `loan_invitation_received` event fær `Skoða` link í drawer;
  - `loan_invitation_accepted` með `entity_type='loan'` og loan id fær
    `Skoða` link sem vísar beint á `/auth-mvp/lanad-og-skilad/<loan_id>`;
  - `loan_returned`/`loan_updated` með `entity_type='loan'` nota sömu
    detail-slóð, ekki almenna listann;
  - deleted/null `viewHref` sýnir ekki `Skoða`;
  - núverandi tests sem segja “temporarily hides Skoða” þarf að uppfæra eða
    fjarlægja.
- `lib/__tests__/loan-list.test.tsx`
  - `highlightInvitationId` highlightar rétt spjald ef `invitation_id` passar;
  - listinn crashar ekki ef highlight id finnst ekki.
- `lib/__tests__/loan-pages.test.tsx`
  - page forwards `searchParams.invitation` í `LoanList`.
- `lib/__tests__/actions.test.ts`
  - halda núverandi testum sem staðfesta að `claimInvitation` og
    `declineInvitation` acki `loans:invitation:${invitationId}:received`.

Keyra að lágmarki:

```powershell
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-list.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts
npm run type-check
```

## Localhost checks for Stebbi

Stebbi keyrir localhost sjálfur. Prófa við 360-430 px mobile viewport.

### Tilvik A - pending boð sem á að svara

1. Vera innskráður sem viðtakandi pending lánaboðs.
2. Opna `/auth-mvp/heim`.
3. Vænt:
   - `Lánað og skilað` sýnir badge ef það er actionable pending boð.
   - Sama boð birtist undir `Ólesið` sem `Lánaboð: <heiti>`.
4. Smella á eventið í `Ólesið`.
5. Vænt:
   - Drawer opnast.
   - `Skoða` sést ef eventið hefur opnanlegt target.
   - `Lesið` er enn til staðar.
6. Smella `Skoða`.
7. Vænt:
   - Notandi fer á `Lánað og skilað`.
   - Rétt pending spjald er sýnilegt, helst highlightað.
   - `Þekki málið` og `Kannast ekki við þetta` sjást beint á spjaldinu.

### Tilvik B - action hreinsar event

1. Í `Lánað og skilað`, velja `Þekki málið` eða `Kannast ekki við þetta`.
2. Fara aftur á `/auth-mvp/heim`.
3. Vænt:
   - Sama `Lánaboð` event er ekki lengur undir `Ólesið`.
   - Badge lækkar eða hverfur eftir stöðu.

### Tilvik C - `Lesið` án þess að svara

1. Opna pending invitation event í `Ólesið`.
2. Smella `Lesið`.
3. Vænt:
   - Event hverfur úr `Ólesið`.
   - Lánaboðið sjálft er áfram í `Lánað og skilað` þar til notandi tekur afstöðu.
   - Ef badge-reglan segir að actionable pending boð eigi enn að teljast, þá má
     badge áfram sjást.

### Tilvik D - engin óviðkomandi gögn

1. Skrá inn sem annar notandi sem á ekki boðið.
2. Opna `/auth-mvp/heim` og beina slóð á
   `/auth-mvp/lanad-og-skilad?invitation=<boð-id>`.
3. Vænt:
   - Annar notandi sér hvorki eventið né lánaspjaldið.
   - Engin villa lekur netfangi eða invitation details.

### Tilvik E - samþykkt/skilað event opnar detail

1. Finna `Ólesið` event eins og `Lánaboð samþykkt: tengsl á raun`.
2. Ganga úr skugga um að hluturinn megi vera undir `Skilað`.
3. Smella eventið og svo `Skoða`.
4. Vænt:
   - Notandi fer beint á detail-síðu hlutarins:
     `/auth-mvp/lanad-og-skilad/<loan_id>`.
   - Ekki bara á almenna `/auth-mvp/lanad-og-skilad` forsíðu.
   - Það skiptir ekki máli hvort hluturinn er í `Enn í láni` eða `Skilað`, því
     detail-síðan á að geta opnað hlutinn beint ef notandi hefur aðgang.

## Supabase / gögn

Þessi áfangi ætti ekki að þurfa nýja SQL migration. Ef Claude Code telur SQL
nauðsynlegt, stoppa og skila nýju Supabase handoff til Codex áður en nokkuð er
keyrt.

Ef notuð er best-effort event trygging á heimaskjá:

- Hún má aðeins búa til `recent_events` fyrir current user og aðeins út frá
  `get_my_loans` rows sem current user má þegar sjá.
- Hún má ekki skila eða logga recipient email.
- Hún má nota `event_key` unique constraint til idempotency.
- Hún má ekki gera heimaskjáinn háðan því að event insert takist.

## Spurningar fyrir Codex eftir Claude closeout

- Var event tryggingin idempotent og bundin við current user?
- Er `Skoða` aðgengilegt, ekki nested button/link rugl, og virkar á mobile?
- Verður pending boð ekki markað lesið of snemma þannig að notandi missi
  reminder áður en hann tekur afstöðu?
- Eru tests ekki lengur að staðfesta gamla “Skoða er falið tímabundið” hegðun?
- Er ekkert recipient email eða invitation-only data að leka í `Ólesið`?
