# #60 v001 - Spjall sem hluti af sögu hlutar

**TODO:** #60 - Spjall sem hluti af sögu hlutar  
**Agent:** Codex  
**Staða:** Handoff til Claude Code fyrir næsta afmarkaða áfanga.

---

## Samhengi

#58 er komið í DONE. Detail-síða láns sýnir nú `Saga hlutarins` og SQL60 er
keyrt á Supabase samkvæmt Claude Code post-release handoff.

Stebbi vill fara beint í næsta áhugaverða skref: að spjall um hlutinn falli inn
í söguna sem spjallfærslur innan um önnur history events.

Þetta á ekki að verða stórt realtime-spjallkerfi í fyrsta skrefi. Codex mælir
með litlu MVP:

- textaskilaboð eingöngu
- engin attachments
- engin realtime krafa í fyrsta áfanga
- submit -> save -> revalidate detail page
- skilaboð birtast í `Saga hlutarins` í tímaröð með öðrum events
- mótaðili fær ólesið event eða sambærilega notification um ný skilaboð

---

## Markmið

Á detail-síðu láns geti aðili skrifað stutt skilaboð um hlutinn. Skilaboðið
vistast sem loan-scoped chat message og birtist strax inni í `Saga hlutarins`,
í réttri tímaröð með öðrum history-færslum.

Dæmi um sögu:

- `Breyttur skiladagur: Borvél`
- `Stefán skrifaði: Ég get skilað henni á morgun.`
- `Palli skrifaði: Frábært, ég sæki hana eftir vinnu.`
- `Skilað: Borvél`

Textinn þarf ekki að vera nákvæmlega svona, en upplifunin á að vera ein
samfelld saga, ekki sér chat-tab sem stendur utan við history.

---

## Núverandi grunnur

Skoðað af Codex:

- `components/loans/LoanHistory.tsx`
- `lib/loans/history.server.ts`
- `lib/recent-events/helpers.server.ts`
- `lib/recent-events/types.ts`
- `sql/60_get_loan_event_history_pending_access.sql`
- `messages/is.json`
- `messages/en.json`
- `Design.md`

Mikilvæg staða:

- `Saga hlutarins` sækir loan events með `get_loan_event_history`.
- SQL60 leyfir actual parties og pending recipient með canonical email matchi.
- History row getur haft `actor_display_name`.
- `recent_events.user_id` er enn móttakandi event-færslu, ekki actor.
- `recordRecentEvent` getur nú tekið `actorUserId` og merge-að því í payload.

---

## Tillaga að afmörkuðum MVP

### 1. Ný tafla fyrir spjallskilaboð

Ekki geyma spjallskilaboð eingöngu í `recent_events`.

`recent_events` er notification/read-state tafla með einni row per móttakanda.
Spjall þarf eina canonical message-row sem báðir aðilar sjá. Best er að búa til
sér töflu, til dæmis:

```sql
public.loan_chat_messages
```

Tillaga að dálkum:

- `id uuid primary key default gen_random_uuid()`
- `loan_id uuid not null references public.loan_items(id) on delete cascade`
- `sender_user_id uuid not null`
- `body text not null`
- `created_at timestamptz not null default now()`
- `deleted_at timestamptz null`

Constraints:

- `char_length(trim(body)) between 1 and 1000`
- body má ekki vera tómt eftir trim

RLS/grants:

- Enable RLS.
- Engar policies í fyrsta MVP.
- `REVOKE ALL` frá `PUBLIC`, `anon`, `authenticated`.
- `GRANT SELECT, INSERT, UPDATE, DELETE` aðeins til `service_role`.

Næsta SQL migration ætti líklega að vera:

```text
sql/61_loan_chat_messages_in_history.sql
```

### 2. Server-side RPC fyrir að senda skilaboð

Búa til service-role-only RPC, til dæmis:

```sql
public.create_loan_chat_message(
  p_actor_id uuid,
  p_loan_id uuid,
  p_body text
)
RETURNS TABLE (
  status text,
  message_id uuid,
  counterpart_user_id uuid
)
```

RPC þarf að:

- staðfesta að actor sé til í `auth.users`
- trimma og validate-a body
- staðfesta að actor hafi aðgang að láninu með sömu reglum og SQL60:
  - `created_by`
  - `lender_user_id`
  - `borrower_user_id`
  - pending recipient með canonical email matchi
- insert-a í `loan_chat_messages`
- skila `counterpart_user_id` ef mótaðili er þekktur
- skila `ok`, `not_found`, `invalid_body` eða sambærilegu statusi

Ekki nota `auth.uid()` í RPC. Nota explicit `p_actor_id`.

### 3. Sameina chat messages inn í history query

Uppfæra `get_loan_event_history` eða búa til nýtt history RPC sem skilar bæði:

- núverandi loan events úr `recent_events`
- chat messages úr `loan_chat_messages`

Codex mælir með að halda public RPC-nafninu ef appið kallar það nú þegar:

```sql
public.get_loan_event_history(p_actor_id uuid, p_loan_id uuid)
```

Bæta við return fields ef þarf:

- `row_kind text` eða `history_type text`, t.d. `event` / `chat_message`
- `chat_body text null`
- `chat_message_id uuid null`
- halda `event_key`, `event_type`, `payload`, `occurred_at`, `actor_display_name`

Ef return type breytist þarf:

- `DROP FUNCTION IF EXISTS public.get_loan_event_history(uuid, uuid);`
- `CREATE OR REPLACE` með nýju return table
- schema cache reload eftir SQL

Mikilvægt:

- Ekki blanda chat message body inn í `recent_events.payload` sem eina source of
  truth.
- Ekki skila sender user-id í client.
- Skila aðeins `actor_display_name`.
- Fyrir chat rows má nota synthetic `event_key`, t.d.
  `loans:loan:{loan_id}:chat:{message_id}`.

### 4. Recent/Ólesið fyrir ný skilaboð

Þegar skilaboð eru send þarf mótaðili að fá ólesið event eða samsvarandi
notification.

Fyrir MVP má nota `recordRecentEvent`:

- `eventType`: bæta við nýju type, t.d. `loan_chat_message`
- `entityType`: `loan`
- `entityId`: loan id
- `eventKey`: `loans:loan:{loanId}:chat:{messageId}`
- `payload`: `{ itemName, actorUserId }`
- `href`: `/auth-mvp/lanad-og-skilad/{loanId}`
- actor fær annaðhvort initiallyRead row eða enga recent row; veljið einfaldasta
  samræmda leið með núverandi recent-events mynstri.

Þarf að bæta við:

- `loan_chat_message` í `RecentEventType`
- label í `messages/is.json` og `messages/en.json`, t.d.
  - is: `Ný skilaboð: {itemName}`
  - en: `New message: {itemName}`
- mapping í `EVENT_TYPE_TO_KEY`

Ekki setja sjálfan message body í `recent_events.payload` í fyrsta MVP. Það
minnkar lekaáhættu og heldur `Ólesið` stuttu.

### 5. Server action

Bæta við server action í `lib/loans/actions.ts`, til dæmis:

```ts
export async function sendLoanChatMessage(
  loanId: string,
  input: unknown,
): Promise<ActionResult>
```

Schema:

- `body` string
- trim
- min 1
- max 1000

Action:

- `guardLoanAccess()`
- kalla `create_loan_chat_message`
- ef ok, record-a unread event fyrir mótaðila ef til staðar
- `revalidatePath('/auth-mvp/lanad-og-skilad')`
- `revalidatePath(`/auth-mvp/lanad-og-skilad/${loanId}`)`
- skila `ok`, `invalid_input`, `not_found`, `save_failed`

Ekki logga message body.

### 6. UI í `Saga hlutarins`

Uppfæra `LoanHistory` þannig að hún geti sýnt bæði event rows og chat rows.

MVP UI:

- Chat message birtist sem sérstök saga-færsla inni í sama `<ol>`.
- Sýna:
  - sender display name eða actor label
  - timestamp
  - body text
- Body þarf að wrap-a vel á mobile.
- Ekki truncate-a skilaboð nema fullur texti sé aðgengilegur.

Bæta við litlu message formi neðst í `Saga hlutarins`:

- label: `Skrifa skilaboð`
- textarea eða input með minnst `16px` font á mobile
- submit button, t.d. `Senda`
- pending state meðan sent er
- error state ef sending mistókst
- hreinsa field eftir success

Ef þetta gerir `LoanHistory` að client component, passið að halda formatting og
data-fetching server-side. Betra getur verið:

- `LoanHistory` server/render component fyrir rows
- `LoanChatForm` client component neðst sem kallar server action

### 7. Pending recipient hegðun

SQL60 leyfir pending recipient að sjá history. Fyrir #60 þarf product-ákvörðun:

Codex mælir með að pending recipient megi senda skilaboð áður en hann smellir á
`Þekki málið`, því það passar við mýkra samvinnuviðmót Stebba. En UI þarf að
passa að aðalaðgerðirnar `Þekki málið` og `Kannast ekki við þetta` týnist ekki.

Ef Claude Code vill þrengja MVP má leyfa pending recipient að lesa chat en ekki
senda fyrr en claim. Þá þarf að kalla það skýrt út í handoff til Codex áður en
framkvæmt er.

---

## Öryggi

Mikilvægt:

- Aldrei veikja RLS.
- Ekki veita `authenticated` beinan aðgang að chat töflu.
- Allt fer í gegnum service-role RPC/server actions.
- RPC notar `p_actor_id`, ekki `auth.uid()`.
- Access þarf að vera eins eða strangara en SQL60.
- Ekki skila netföngum eða user-id í client.
- Ekki logga body texta.
- Ekki nota `recent_events.user_id` sem sender.
- Ekki setja message body í `recent_events.payload` nema Stebbi samþykki það
  sérstaklega.

---

## Design.md

Codex las viðeigandi kafla í `Design.md` fyrir þessa breytingu.

Sérstaklega þarf að fylgja:

- mobile-first hegðun
- input/textarea texti minnst 16 px á mobile
- enginn horizontal overflow
- keyboard má ekki skilja síðuna eftir skakka eða zoom-aða
- touch targets minnst um 40x40 px
- loading/pending state má ekki valda layout shift
- texti má ekki skarast eða detta út úr ramma
- ekki nota hero eða dashboard-stíl

Þetta er form og history UI, svo prófa þarf 360 px, 390 px og 460 px með
keyboard opið/lokað.

---

## Prófanir sem þarf að bæta við

### SQL/static tests

- `loan_chat_messages` table hefur RLS enabled.
- Engin grants til `PUBLIC`, `anon`, `authenticated`.
- Grants aðeins til `service_role`.
- `create_loan_chat_message` notar `p_actor_id`.
- Pending recipient branch notar canonical email normalization.
- History RPC skilar chat rows án þess að skila sender user-id eða email.

### Action tests

- `sendLoanChatMessage` hafnar tómum texta.
- `sendLoanChatMessage` hafnar of löngum texta.
- óviðkomandi user fær `not_found`.
- successful send insert-ar message gegnum RPC.
- successful send record-ar recent event fyrir mótaðila án message body í payload.
- message body fer ekki í logs.

### History tests

- Event rows og chat rows koma í réttri tímaröð.
- Chat row birtir sender display name, timestamp og body.
- Chat rows trufla ekki de-duplication á `recent_events`.
- Gömul events án actor metadata birtast áfram.

### UI tests

- `Saga hlutarins` sýnir chat message row.
- Formið hefur label og submit.
- Pending/failed state sést.
- Empty state virkar áfram.

---

## Localhost checks for Stebbi

Eftir útfærslu, SQL og schema cache reload:

1. Opna detail-síðu á samþykktu láni.
   - Vænt: `Saga hlutarins` birtist eins og áður og neðst er einföld leið til
     að skrifa skilaboð.

2. Skrifa skilaboð sem lánveitandi.
   - Vænt: skilaboðið birtist inni í `Saga hlutarins` í réttri tímaröð.
   - Vænt: nafnið þitt eða actor-lína birtist rétt.

3. Opna sama lán sem mótaðili.
   - Vænt: mótaðili sér skilaboðið inni í sömu sögu.
   - Vænt: mótaðili fær `Ólesið`/recent event um ný skilaboð ef það er hluti af
     MVP-inu.

4. Svara sem mótaðili.
   - Vænt: svarið birtist sem næsta spjallfærsla í sögunni.
   - Vænt: tímaröð milli breytinga, skila-eventa og spjalls er rétt.

5. Prófa pending invitation viðtakanda.
   - Vænt: hann sér history samkvæmt SQL60.
   - Vænt: sending skilaboða fylgir þeirri ákvörðun sem Claude Code útfærir
     sérstaklega: annaðhvort má senda fyrir claim eða formið er ekki sýnt fyrr
     en eftir claim.

6. Prófa óviðkomandi notanda með beinum detail-hlekk.
   - Vænt: engin saga og ekkert spjall lekur.

7. Prófa tóm skilaboð og mjög löng skilaboð.
   - Vænt: skýr villa, ekkert vistað.

8. Prófa 360 px, 390 px og 460 px með mobile keyboard opið og lokað.
   - Vænt: ekkert iOS zoom, ekkert horizontal overflow, submit/pending state
     ýtir ekki mikilvægum controls út af skjánum.

Ekki deploya eða keyra SQL án sérstaks samþykkis Stebba.

---

## Tillaga að næsta skrefi Claude Code

Byrja á Phase 1:

1. SQL61 table + RPC + history union.
2. Server action fyrir send.
3. Read-only rendering af chat rows inni í `Saga hlutarins`.
4. Simple send form neðst í history.
5. Tests.

Stoppa svo og skila Codex pre-release handoff áður en SQL61 eða deploy fer í
production.
