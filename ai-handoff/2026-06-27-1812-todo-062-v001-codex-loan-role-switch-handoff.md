# TODO #62 - Codex v001 - handoff fyrir leiðréttingu á lánshlutverki

**Created:** 2026-06-27 18:12  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Implementation handoff / plan - bíður framkvæmdarleyfis

---

## Samhengi

TODO #62: **Breyta hvort ég lánaði eða fékk lánað**.

Stebbi stofnaði óvart lán með röngu hlutverki. Hlutur var skráður eins og
Stebbi hefði fengið hann lánaðan, en í raun átti skráningin að vera hin áttin.
Þetta þarf að vera hægt að leiðrétta í báðar áttir:

- úr `Ég lánaði` yfir í `Ég fékk lánað`
- úr `Ég fékk lánað` yfir í `Ég lánaði`

Markmiðið er að notandi geti leiðrétt mistök án þess að stofna hlutinn upp á
nýtt, missa sögu eða rugla aðgangi.

---

## Ráðlögð V1 afmörkun

Codex mælir með afmarkaðri V1 sem leysir raunverulega vandamálið án þess að
gera pending-boðaflæðið of áhættusamt.

Leyfa hlutverksleiðréttingu þegar:

1. **Solo-lán:** aðeins einn aðili er skráður á hlutinn.
   - Ef notandi er `lender_user_id`, færa hann yfir í `borrower_user_id`.
   - Ef notandi er `borrower_user_id`, færa hann yfir í `lender_user_id`.

2. **Accepted lán:** báðir aðilar eru skráðir og boð hefur verið samþykkt.
   - Skipta á `lender_user_id` og `borrower_user_id`.
   - Báðir halda aðgangi.
   - Mótaðili fær `Ólesið` event.
   - `Saga hlutarins` fær event um hlutverksbreytinguna.

Ekki leyfa í V1 þegar:

1. **Opið pending boð er til.**
   - Ástæða: boðið og mögulegur tölvupóstur voru send með ákveðnu
     `recipient_role`. Ef hlutverki er breytt á meðan boðið er opið getur
     boðatexti, recipient-role og væntingar mótaðila orðið ruglingslegar.
   - Notandi á frekar að afturkalla boðið fyrst og breyta svo hlutverki.

2. **Óviðkomandi eða pending recipient reynir að breyta.**
   - Pending recipient er ekki fullur aðili fyrr en hann velur `Þekki málið`.

Returned/skilað lán:

- Codex mælir með að leyfa leiðréttingu þótt hlutur sé merktur skilaður, svo
  söguleg skráning verði rétt. Þetta er leiðrétting á skráningu, ekki ný
  lánsaðgerð.

---

## Gögn og SQL

### Ný SQL migration

Næsta migration ætti líklega að vera:

- `sql/63_switch_loan_role.sql`

Ekki keyra SQL fyrr en Stebbi samþykkir það sérstaklega.

### Ný RPC

Tillaga að falli:

```sql
public.switch_loan_role(
  p_actor_id uuid,
  p_loan_id uuid
)
RETURNS TABLE (
  status text,
  item_name text,
  before_actor_role text,
  after_actor_role text,
  counterpart_user_id uuid
)
```

Möguleg `status` gildi:

- `ok`
- `not_found`
- `has_pending_invitation`
- `invalid_state`
- `unauthenticated`

### SQL-reglur

Fallið þarf að:

1. Nota `p_actor_id`, ekki `auth.uid()`, því appið notar service-role server
   actions eins og önnur loan RPC.
2. Staðfesta að `p_actor_id` sé til í `auth.users`.
3. Ná `loan_items` með `FOR UPDATE`.
4. Leyfa aðeins actual party:
   - `lender_user_id = p_actor_id`
   - eða `borrower_user_id = p_actor_id`
   - ekki pending recipient by email.
5. Blokka ef til er opið pending boð:
   - `loan_invitations.status = 'pending'`
   - sérstaklega ef `expires_at > now()`.
   - Claude Code þarf að ákveða hvort útrunnið pending boð á að teljast opið eða
     hvort það megi fara framhjá. Conservative leið: blokka öll `status='pending'`
     þar til þau eru cancelled/expired með núverandi flæði.
6. Ef aðeins actor er skráður:
   - færa actor milli `lender_user_id` og `borrower_user_id`.
7. Ef báðir aðilar eru skráðir:
   - swap-a `lender_user_id` og `borrower_user_id`.
8. Uppfæra `updated_at = now()`.
9. Ef accepted invitation row er til, uppfæra `recipient_role` svo það passi
   áfram við hvor hlið invited recipient er á eftir swap.
   - Þetta skiptir máli fyrir tengsla-/history-/framtíðarflæði sem nota
     `loan_invitations.recipient_role`.
10. Skila `counterpart_user_id` ef hann er til og er ekki actor.

### Mikilvæg SQL-varúð

Ekki breyta `created_by`.

`created_by` segir hver stofnaði skráninguna og ætti að haldast sem audit/context.
Það er ekki það sama og núverandi `lender_user_id` / `borrower_user_id`.

Ekki drop-a eða rename-a dálka.

Ekki veikja RLS eða grants. Nýja RPC á að vera service_role-only eins og
núverandi loan RPC.

---

## Server action

Bæta við nýrri action í `lib/loans/actions.ts`, t.d.:

```ts
export async function switchLoanRole(loanId: string): Promise<ActionResult>
```

Action á að:

1. Nota `guardLoanAccess()`.
2. Kalla `admin.rpc('switch_loan_role', { p_actor_id: user.id, p_loan_id: loanId })`.
3. Kortleggja status:
   - `ok` -> `{ ok: true }`
   - `has_pending_invitation` -> `{ ok: false, error: 'has_pending_invitation' }`
   - `not_found` -> `{ ok: false, error: 'not_found' }`
   - annað -> save failed
4. Skrá recent event fyrir actor sem read:
   - `eventType: 'loan_role_switched'`
   - `entityType: 'loan'`
   - `entityId: loanId`
   - `actorUserId: user.id`
   - payload má vera öruggt og stutt, t.d. `{ itemName }`
5. Ef `counterpart_user_id` er til, skrá sama event fyrir mótaðila sem unread.
6. Ekki setja netföng, raw user IDs eða raw invitation payload í client-visible
   payload.
7. Kalla `revalidateLoanViews()` og `revalidatePath` fyrir detail/edit slóð ef
   við á.

### Event type

Bæta við nýju event type:

- `loan_role_switched`

Uppfæra:

- `lib/recent-events/types.ts`
- `lib/recent-events/display.ts`
- `messages/is.json`
- `messages/en.json`

Tillaga að íslenskum texta:

- `eventLoanRoleSwitched`: `Hlutverki breytt: {itemName}`

Saga hlutarins mun þá geta birt actor-línu:

- `Framkvæmt af {name}`

---

## UI

Codex mælir með að hafa þetta sem sérstaka leiðréttingaraðgerð í edit/detail
flæðinu, ekki blanda henni óvart saman við nafn/dagsetningar/nótu save.

Ráðlögð leið:

1. Bæta við litlum `Hlutverk` kafla í `LoanItemDetailsForm`.
2. Sýna núverandi hlutverk:
   - `Ég lánaði`
   - eða `Ég fékk lánað`
3. Sýna secondary button:
   - `Breyta í: Ég lánaði`
   - eða `Breyta í: Ég fékk lánað`
4. Þegar notandi smellir:
   - sýna stutta staðfestingu eða inline confirmation.
   - kalla `switchLoanRole`.
5. Ef pending boð er til:
   - sýna villu: `Afturkallaðu opið boð áður en þú breytir hlutverki.`

Ekki nota checkbox fyrir þetta. Þetta er ekki binary preference heldur skýr
leiðréttingaraðgerð. Segmented control eða secondary action með staðfestingu er
betra.

### Design.md atriði

Viðeigandi Design.md punktar:

- Mobile-first.
- Input/select/textarea texti minnst 16px á mobile ef ný innsláttarsvæði bætast
  við.
- Controls mega ekki valda horizontal overflow.
- Buttons/loading state mega ekki virðast dauð.
- Error þarf að birtast nálægt controlinu.
- Prófa 360, 390 og 460px breiddir ef form/detail flæði breytist.

---

## Núverandi skrár sem líklega þarf að breyta

SQL:

- nýtt `sql/63_switch_loan_role.sql`

Server/action/types:

- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `lib/recent-events/types.ts`
- `lib/recent-events/display.ts`

UI:

- `components/loans/LoanItemDetailsForm.tsx`
- mögulega `components/loans/LoanCard.tsx` ef edit-link eða visible state þarf að
  breytast
- mögulega edit route sem sendir props í `LoanItemDetailsForm`

Textar:

- `messages/is.json`
- `messages/en.json`

Próf:

- `lib/__tests__/actions.test.ts`
- `lib/__tests__/loan-pages.test.tsx`
- mögulega SQL/static migration tests ef mynstrið er þar

---

## Edge cases sem Claude Code þarf að passa

1. **Solo lender -> borrower**
   - `lender_user_id` verður `NULL`.
   - `borrower_user_id` verður actor.
   - `my_role` verður `borrower`.

2. **Solo borrower -> lender**
   - `borrower_user_id` verður `NULL`.
   - `lender_user_id` verður actor.
   - `my_role` verður `lender`.

3. **Accepted loan**
   - `lender_user_id` og `borrower_user_id` swap-ast.
   - Báðir aðilar halda aðgangi.
   - Mótaðili fær `Ólesið`.
   - Detail, listi og tengsl sýna rétt eftir refresh.

4. **Pending invitation**
   - V1 á að blokka með skýrri villu.
   - Engar DB-breytingar eiga að verða.
   - Notandi á að afturkalla boðið fyrst.

5. **Returned loan**
   - Leyfa leiðréttingu nema Claude Code finnur sterka ástæðu til að blokka.
   - Saga á áfram að sýna `Skilað` og nýtt `Hlutverki breytt` event.

6. **Pending recipient**
   - Má ekki geta leiðrétt hlutverk áður en hann velur `Þekki málið`.

7. **Óviðkomandi direct RPC**
   - Fær `not_found`.

8. **Idempotency**
   - Hlutverksskipting er viljandi toggle. Tvö hröð köll gætu skipti fram og til
     baka.
   - UI þarf pending/disabled state.
   - SQL þarf `FOR UPDATE` svo state verði ekki hálfuppfært.

---

## Prófanir sem þurfa að fylgja

### Unit/action tests

- `switchLoanRole` kallar rétt RPC.
- `has_pending_invitation` skilar réttri villu.
- `ok` skráir event fyrir actor.
- `ok` skráir unread event fyrir counterpart ef hann er til.
- Solo loan skráir ekki counterpart event.
- Payload lekur ekki netfangi eða user-id.

### UI tests

- Edit/detail form sýnir núverandi hlutverk.
- Button til að skipta hlutverki er sýnilegur þegar notandi má skipta.
- Pending state disable-ar button.
- Pending invitation villa birtist ef RPC skilar `has_pending_invitation`.

### Manual / localhost

Sjá kaflann `Localhost checks for Stebbi`.

---

## Rollout

Ráðlögð röð:

1. Claude Code útfærir SQL63 og app-kóða.
2. Claude Code keyrir type-check og viðeigandi tests.
3. Claude Code skilar post-implementation handoff til Codex.
4. Codex rýnir SQL63, RLS/grants/auth, app action, UI og tests.
5. Stebbi ákveður hvort SQL63 sé keyrt.
6. Ef SQL63 er keyrt:
   - keyra migration á Supabase
   - reload PostgREST schema cache ef nýtt RPC bætist við
   - staðfesta að RPC sé sýnilegt service_role
7. Deploy/release aðeins eftir sérstakt leyfi frá Stebba.

Ekki keyra SQL, commit-a, push-a eða deploya nema Stebbi biðji sérstaklega um
það.

---

## Localhost checks for Stebbi

Þetta á við, því breytingin verður notendasýnileg á detail/edit flæði lánaðs
hlutar.

Eftir að Claude Code hefur útfært og SQL63 hefur verið keyrt í því umhverfi sem
á að prófa:

1. Stofnaðu eða finndu solo-lán þar sem þú ert skráður sem `Ég lánaði`.
2. Opnaðu edit/detail flæði og breyttu hlutverki í `Ég fékk lánað`.
3. Vænt niðurstaða:
   - hlutur færist í réttan flokk/lista
   - detail-síða sýnir rétt hlutverk
   - history sýnir `Hlutverki breytt`
4. Endurtaktu í hina áttina: `Ég fékk lánað` -> `Ég lánaði`.
5. Prófaðu accepted lán með tveimur prófnotendum.
6. Vænt niðurstaða:
   - báðir notendur halda aðgangi
   - hlutverkin swap-ast rétt hjá báðum
   - mótaðili fær `Ólesið`
   - engin netföng eða user-id leka í event texta
7. Prófaðu lán með pending boði.
8. Vænt niðurstaða:
   - breyting er blokkuð
   - skýr villa segir að afturkalla þurfi opið boð fyrst
   - engin DB-breyting verður
9. Prófaðu mobile breiddir 360, 390 og 460px.
10. Vænt niðurstaða:
    - role control/button veldur ekki overflowi
    - ekkert mobile zoom
    - pending/error state er sýnilegt og skiljanlegt

Varúð:

- Ekki prófa þetta kæruleysislega á production lánum með raunverulegum
  mótaðilum fyrr en Stebbi vill það sérstaklega.
- Accepted loan próf geta sent `Ólesið` til mótaðila, þannig að nota frekar
  prófnotendur.
- SQL63 þarf sérstakt samþykki frá Stebba áður en það er keyrt.

---

## Óvissa / þarf að staðfesta

- Codex mælir með að pending invitation sé blokkað í V1. Stebbi þarf að staðfesta
  ef hann vill heldur að kerfið uppfæri opið boð sjálfkrafa.
- Codex mælir með að accepted lán megi swap-a án samþykkis frá báðum aðilum,
  í sama anda og #58 þar sem báðir aðilar mega leiðrétta skráningu. Stebbi þarf
  að staðfesta ef hann vill strangari reglu.
- Claude Code þarf að staðfesta hvaða tengslahelperar nota
  `loan_invitations.recipient_role` eftir accepted swap og uppfæra accepted
  invitation row ef það er nauðsynlegt.
