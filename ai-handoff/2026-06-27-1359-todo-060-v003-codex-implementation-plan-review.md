# #60 v003 - Codex rýni á implementation plan fyrir spjall í sögu

**TODO:** #60 - Spjall sem hluti af sögu hlutar  
**Rýnt plan:** `ai-handoff/2026-06-27-1156-todo-060-v002-claude-implementation-plan.md`  
**Agent:** Codex  
**Staða:** Samþykkt með skilyrðum. Ekki byrja framkvæmd fyrr en atriðin hér að neðan eru felld inn í plan.

## Findings

### 1. Blocker: ekki láta `loan_chat_message` notification-event birtast sem history-event

Planið setur spjallið í `loan_chat_messages` en skráir líka `recent_events` row fyrir mótaðila með `eventType = loan_chat_message` og `entityType = loan`. Núverandi `get_loan_event_history` les öll `recent_events` þar sem `source='loans'`, `entity_type='loan'` og `entity_id=p_loan_id` (`sql/60_get_loan_event_history_pending_access.sql:85-88`).

Ef SQL61 sameinar síðan `event_rows` og `chat_rows` án síunar (`v002:79-109`) getur sama spjallið komið tvisvar í söguna:

- einu sinni sem `recent_events` notification án `chat_body`
- einu sinni sem raunverulegt chat row úr `loan_chat_messages`

Ef TypeScript de-duplicate heldur vitlausu row-i getur spjalltextinn jafnvel horfið úr `Saga hlutarins`.

**Leiðrétting:** Í `deduped_events` í `get_loan_event_history` skal sía út `loan_chat_message`, t.d.:

```sql
AND re.event_type <> 'loan_chat_message'
```

Chat table á að vera source of truth fyrir spjalltexta í history. `recent_events` fyrir `loan_chat_message` er eingöngu notification fyrir `Ólesið`.

### 2. Blocker: `counterpart_user_id` dugar ekki fyrir pending-recipient flæðið

Planið lætur `create_loan_chat_message` skila einu `counterpart_user_id` (`v002:53-64`). Það virkar fyrir accepted lán þar sem bæði `lender_user_id` og `borrower_user_id` eru til, en er ófullnægjandi þegar invitation er pending:

- Ef creator sendir skilaboð áður en viðtakandi velur `Þekki málið`, er `borrower_user_id` eða `lender_user_id` oft `NULL`, þannig að enginn mótaðili fær `Ólesið`.
- Ef pending recipient sendir skilaboð áður en hann claimar, er hann ekki enn `lender_user_id` eða `borrower_user_id`, þannig að mótaðilaútreikningur þarf að nota `loan_invitations.invited_by` eða þann aðila sem er þegar á `loan_items`.

**Leiðrétting:** Velja eina af þessum tveimur leiðum áður en framkvæmd hefst:

1. Betri leið: RPC skilar `counterpart_user_ids uuid[]` eða table af user ids. Hún finnur:
   - actual counterpart ef báðir aðilar eru komnir inn
   - pending recipient user ids með canonical email lookup ef creator skrifar áður en claim verður
   - `invited_by` eða existing party ef pending recipient skrifar áður en claim verður
2. Einfaldari leið: RPC skilar aðeins `message_id/status`, en `sendLoanChatMessage` finnur notification-audience eftir á með sömu canonical lookup aðferð og `updateLoan` notar (`lib/loans/actions.ts:430-440`).

Í báðum leiðum þarf að sleppa actor úr notification-listanum og ekki setja message body í `recent_events.payload`.

### 3. High: pending recipient má senda, en aðeins ef það er meðvitað product-val

Ég samþykki tillögu Claude Code í A: pending recipient má senda skilaboð áður en hann velur `Þekki málið`, því það passar við að hann má lesa sögu eftir SQL60 og getur þurft að spyrja „hvað er þetta?“ áður en hann tekur afstöðu.

Skilyrði:

- Access check þarf að vera sama eða þrengri en SQL60, með canonical email match á báðum hliðum.
- Ekki treysta á `guardLoanAccess()` sem loan-access check. RPC-ið verður áfram authoritative check.
- Test þarf sérstaklega fyrir pending recipient sem sendir áður en claim verður.
- Test þarf líka fyrir creator sem sendir til pending recipient og recipient fær `Ólesið`.

### 4. High: migration þarf index, rollback og skýra deploy-röð

SQL61 bætir nýrri töflu og breytir return type á `get_loan_event_history` (`v002:17-113`). Það þarf að vera skýrt í migration header:

- `CREATE INDEX IF NOT EXISTS loan_chat_messages_loan_created_idx ON public.loan_chat_messages (loan_id, created_at ASC, id ASC) WHERE deleted_at IS NULL;`
- rollback: drop function `create_loan_chat_message`, restore SQL60 útgáfu af `get_loan_event_history`, drop index, og aðeins drop table ef það er samþykkt að tapa chat-gögnum
- deploy order: keyra SQL61 fyrst, reload-a PostgREST schema cache, staðfesta RPC visibility með service-role, svo deploya app code

Ekki keyra SQL sjálfkrafa. Stebbi þarf að gefa skýrt leyfi.

### 5. Medium: `UNION ALL` er tæknilega í lagi, en ekki nota `SELECT *`

Svar við B: já, `UNION ALL` er type-compatible ef báðar hliðar skila nákvæmlega sömu dálkum í sömu röð og sömu castum. En `SELECT * FROM event_rows UNION ALL SELECT * FROM chat_rows` er brothætt.

**Leiðrétting:** Skrifa dálkana út í final select á báðum hliðum:

```sql
SELECT event_key, event_type, payload, occurred_at, actor_display_name,
       row_kind, chat_body, chat_message_id
FROM event_rows
UNION ALL
SELECT event_key, event_type, payload, occurred_at, actor_display_name,
       row_kind, chat_body, chat_message_id
FROM chat_rows
ORDER BY occurred_at ASC, event_key ASC;
```

Nota `LEFT JOIN public.profiles` fyrir sender display name svo skilaboð detti ekki út ef profile row vantar.

### 6. Medium: hönnun forms þarf að fylgja `Design.md`

Ég las `Design.md`. Planið er í rétta átt en þarf að bæta við:

- `textarea` þarf sýnilegt label. Placeholder má ekki koma í stað labels.
- Texti í `textarea` skal vera minnst 16px á mobile til að forðast iOS zoom.
- Submit button þarf stöðugt loading/pending state sem breytir ekki breidd.
- Ekki setja formið í nýtt kort inni í `Saga hlutarins`. Það á að vera hluti af sama section.
- Error texti á að vera stuttur, nálægt controlinu og má ekki ýta virka reitnum út af skjánum.
- Prófa þarf 360px, 390px og 460px með keyboard opnu og lokuðu.

Íslenski textinn mætti vera:

```json
"chatLabel": "{name} skrifaði",
"chatLabelUnknown": "Skilaboð",
"chatFieldLabel": "Skilaboð",
"chatPlaceholder": "Skrifaðu skilaboð",
"chatSend": "Senda",
"chatError": "Tókst ekki að senda. Reyndu aftur."
```

Ekki sýna `?` ef display name vantar. Nota frekar `chatLabelUnknown`.

### 7. Medium: testin þurfa að ná duplicate-risk og pending notification

Bæta við prófum umfram v002:

- `getLoanHistory` fær bæði `loan_chat_message` recent-event og chat row með sama message id og skilar aðeins chat row með `chatBody`.
- `sendLoanChatMessage` sendir ekki body í `recent_events.payload`.
- creator sendir chat til pending recipient og canonical-matched recipient fær unread.
- pending recipient sendir chat fyrir claim og creator fær unread.
- profile vantar fyrir sender og history row birtist samt með fallback label.
- unrelated actor fær `not_found` úr RPC og ekkert `recent_events` row.

## Svör við spurningum Claude Code

**A. Pending recipient: mega senda áður en claim?**  
Já, samþykkt sem MVP-val, með skilyrðunum hér að ofan. Þetta hjálpar viðtakanda að spyrja áður en hann velur `Þekki málið` eða `Kannast ekki við þetta`.

**B. Er CTE-lykillinn réttur?**  
Hugmyndin er rétt, en laga þarf tvö atriði: sía `loan_chat_message` út úr `event_rows`, og skrifa dálka út í `UNION ALL` í stað `SELECT *`.

**C. Schema cache reload eftir SQL61?**  
Já. Þar sem `get_loan_event_history` fær nýtt return type þarf PostgREST schema cache reload eftir SQL61 og áður en app code sem treystir á nýja RPC-ið fer í production.

**D. Á actor að fá initiallyRead recent event fyrir eigin skilaboð?**  
Nei. Actor á ekki að fá `recent_events` row fyrir eigin spjallskilaboð. Annars eykst duplicate-risk í history. Actor sér skilaboðið strax í `Saga hlutarins` úr `loan_chat_messages`.

## Localhost checks for Stebbi

Eftir útfærslu, áður en deploy fer í production:

1. Opna accepted lán þar sem báðir aðilar hafa aðgang.
2. Skrifa stutt skilaboð í `Saga hlutarins`.
3. Vænt niðurstaða: formið hreinsast, skilaboðin birtast strax í tímaröð með nafni, dagsetningu og texta.
4. Skrá inn sem hinn aðilinn.
5. Vænt niðurstaða: `Ólesið` sýnir `Ný skilaboð: {hlutur}` og detail-síðan sýnir skilaboðin einu sinni, ekki tvöfalt.
6. Senda svar frá hinum aðilanum.
7. Vænt niðurstaða: fyrri notandi fær unread, sendandinn fær ekki unread fyrir eigin skilaboð.
8. Prófa pending invitation:
   - creator sendir skilaboð áður en viðtakandi velur `Þekki málið`
   - viðtakandi opnar detail og svarar áður en hann claimar
   - báðir sjá skilaboðin í sögu og réttur aðili fær `Ólesið`
9. Prófa að óviðkomandi notandi geti ekki opnað detail-hlekk eða sent skilaboð.
10. Prófa mobile breiddir 360px, 390px og 460px með lyklaborð opið og lokað. Enginn iOS zoom, ekkert lárétt overflow, engin overlapping controls.

Ekki prófa production SQL eða service-role RPC handvirkt nema Stebbi gefi sérstakt leyfi. Ekki setja service-role key í handoff, screenshot, console log eða chat.

## Næsta skref

Claude Code má uppfæra implementation plan samkvæmt þessari rýni og framkvæma þegar Stebbi gefur grænt ljós. Ef Claude Code vill halda MVP enn minni má byrja á accepted-loans only, en þá þarf að taka skýrt fram að pending-recipient chat sé vísvitandi sleppt í fyrstu útgáfu.
