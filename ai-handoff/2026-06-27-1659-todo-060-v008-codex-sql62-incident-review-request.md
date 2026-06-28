# TODO #60 - Codex v008 - beiðni um rýni á SQL62 áður en það er keyrt

## Staða

Stebbi keyrði SQL61 og sér nú ekki lengur sögu á hlut sem áður sýndi sögu.
Hann getur sent spjallskilaboð án sýnilegrar villu, en sér hvorki gömlu
aðgerðarsöguna né nýju skilaboðin í `Saga hlutarins`.

Codex telur mjög ólíklegt að SQL61 hafi eytt aðgerðarsögu. SQL61 inniheldur ekki
`DELETE`, `TRUNCATE` eða `UPDATE` á `recent_events`. Líklegra er að nýja
`get_loan_event_history` fallið úr SQL61 falli í runtime og appið sýni þá tóma
sögu, því `lib/loans/history.server.ts` skilar `[]` þegar RPC-kallið skilar
villu.

Codex skrifaði bráðaviðgerð sem **bíður rýni frá Claude Code áður en Stebbi
keyrir hana**:

- `sql/62_fix_loan_event_history_chat_union_ambiguity.sql`

Codex hefur ekki keyrt SQL62, ekki snert Supabase, ekki reloadað schema cache og
ekki deployað.

## Beiðni til Claude Code

Vinsamlega rýndu SQL62 áður en Stebbi keyrir það.

Claude Code á sérstaklega að svara:

1. Er greining Codex rétt: getur SQL61 `get_loan_event_history` fallið vegna
   óqualified dálka sem heita sama og `RETURNS TABLE` output-parameterar?
2. Er SQL62 örugg og nægileg viðgerð?
3. Snertir SQL62 örugglega engin gögn?
4. Viðheldur SQL62 sama aðgangslíkani og SQL60/SQL61?
5. Viðheldur SQL62 sama return contracti og app-kóðinn býst við?
6. Þarf að laga eitthvað áður en Stebbi keyrir SQL62?
7. Eftir SQL62: þarf schema reload? Codex telur já.

## Greining Codex

SQL61 endurskapar `public.get_loan_event_history(uuid, uuid)` með `RETURNS TABLE`
sem skilgreinir meðal annars output-nöfnin:

- `event_key`
- `event_type`
- `payload`
- `occurred_at`
- `actor_display_name`
- `row_kind`
- `chat_body`
- `chat_message_id`

Í lok SQL61-fallsins eru dálkar valdir óqualified:

```sql
SELECT
  event_key, event_type, payload, occurred_at, actor_display_name,
  row_kind, chat_body, chat_message_id
FROM event_rows
UNION ALL
SELECT
  event_key, event_type, payload, occurred_at, actor_display_name,
  row_kind, chat_body, chat_message_id
FROM chat_rows
ORDER BY occurred_at ASC, event_key ASC;
```

Í PL/pgSQL eru `RETURNS TABLE` dálkar líka breytur í fallinu. Þess vegna getur
óqualified `event_key`, `payload`, `occurred_at` og sambærilegt orðið ambiguous
milli output-breytu og dálks úr CTE. Það myndi útskýra núverandi einkenni:

- aðgerðarsaga er ekki horfin úr `recent_events`
- spjallskilaboð vistast líklega í `loan_chat_messages`
- history RPC fellur
- appið grípur villuna og sýnir tóma sögu

## Hvað SQL62 gerir

SQL62 endurskapar aðeins `public.get_loan_event_history(uuid, uuid)`.

Það heldur sama:

- fallheiti
- input parameters
- return contracti
- access check
- `loan_chat_message` síun úr `recent_events`
- `loan_chat_messages` sameiningu inn í history
- grants fyrir `service_role`

Það breytir aðallega lokahluta query-ins þannig að allar lokatilvísanir séu
qualified:

```sql
FROM combined_rows combined
ORDER BY combined.occurred_at ASC, combined.event_key ASC;
```

## Gagnaáhrif

SQL62 á ekki að breyta neinum gögnum.

Það gerir ekki:

- `DELETE`
- `TRUNCATE`
- `UPDATE`
- `INSERT`
- breytingar á `recent_events`
- breytingar á `loan_chat_messages`
- breytingar á `loan_items`
- breytingar á `loan_invitations`
- breytingar á `auth.users`
- breytingar á RLS policies

Það gerir:

- `DROP FUNCTION IF EXISTS public.get_loan_event_history(uuid, uuid)`
- `CREATE OR REPLACE FUNCTION public.get_loan_event_history(...)`
- `GRANT EXECUTE ... TO service_role`
- `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`

## Skrár sem Codex skoðaði

- `sql/61_loan_chat_messages_in_history.sql`
- `sql/60_get_loan_event_history_pending_access.sql`
- `lib/loans/history.server.ts`
- `lib/loans/actions.ts`
- `components/loans/LoanHistory.tsx`
- `components/loans/LoanChatForm.tsx`

## Skrár sem Codex breytti

- `sql/62_fix_loan_event_history_chat_union_ambiguity.sql`
- `ai-handoff/2026-06-27-1659-todo-060-v008-codex-sql62-incident-review-request.md`
- `TODO.md` ef Stebbi sér þessa handoff-vísun sem nýjustu stöðu í TODO

## Skipanir sem Codex keyrði

- `Get-ChildItem -File sql | Sort-Object Name | Select-Object Name,Length`
  - Exit code: 0
  - Skoðaði SQL-skráaröðina og staðfesti að næsta skrá er SQL62.
- `Get-Content -Encoding UTF8 sql/61_loan_chat_messages_in_history.sql`
  - Exit code: 0
  - Skoðaði SQL61 línu fyrir línu.
- `rg -n "get_loan_event_history|loan_chat_messages|create_loan_chat_message|RETURN QUERY|UNION ALL|row_kind|chat_body" sql lib components app messages`
  - Exit code: 0
  - Kortlagði hvar SQL61 contractið er notað.
- `Get-Content -Encoding UTF8 sql/62_fix_loan_event_history_chat_union_ambiguity.sql`
  - Exit code: 0
  - Sannreyndi nýju SQL62-skrána eftir að hún var skrifuð.
- `git status --short sql/62_fix_loan_event_history_chat_union_ambiguity.sql sql/61_loan_chat_messages_in_history.sql`
  - Exit code: 0
  - Staðfesti að SQL62 er ný ókeyrð skrá og SQL61 var ekki breytt í þessum áfanga.

Codex keyrði ekki:

- SQL
- Supabase skipanir
- schema reload
- tests eftir að SQL62 var skrifað
- dev server
- deployment

## Áhætta sem Claude Code þarf að rýna

- Ef greiningin er röng gæti SQL62 samt verið skaðlaust, en það leysir þá ekki
  tóma history.
- Ef `get_loan_event_history` fellur af annarri ástæðu, þarf Claude Code að benda
  á líklegri orsök.
- Ef PostgREST schema cache er ekki reloadað eftir SQL62 gæti appið áfram séð
  gamla fall-state tímabundið.
- Ef spjallskilaboðin sem Stebbi sendi vistuðust ekki, mun SQL62 laga history en
  ekki endurskapa óvistuð skilaboð. Þar sem sending gaf ekki villu telur Codex þó
  líklegt að þau séu vistuð.

## Tillaga Codex að næsta skrefi ef Claude samþykkir

Ef Claude Code finnur ekki stöðvandi galla:

1. Stebbi keyrir `sql/62_fix_loan_event_history_chat_union_ambiguity.sql`.
2. Stebbi reloadar PostgREST schema cache.
3. Stebbi opnar sama skilaða hlut og athugar hvort:
   - eldri aðgerðarsaga birtist aftur
   - spjallskilaboðin sem hann sendi birtist
   - ný skilaboð birtast í réttri tímaröð
4. Ef history birtist enn ekki, þarf næsta skref að vera að skoða raunverulega
   RPC-villu úr logs eða með stýrðu service-role prófi.

## Localhost checks for Stebbi

Þessi kafli á við vegna þess að vandamálið er notendasýnilegt á detail-síðu
hlutar.

Ekki keyra SQL62 fyrr en Claude Code hefur rýnt þessa skrá og SQL62.

Eftir samþykkta SQL62 keyrslu og schema reload:

1. Opnaðu sama skilaða hlut og missti söguna.
2. Vænt niðurstaða: `Saga hlutarins` birtir aftur eldri events, til dæmis
   `Skilað`, `Breytt nafn`, `Breytt lánsdagsetning` eða önnur fyrri history.
3. Athugaðu hvort spjallskilaboðin sem þú sendir áðan birtist í sömu sögu.
4. Sendu eitt nýtt stutt prófskilaboð.
5. Vænt niðurstaða: nýja skilaboðið birtist neðst eða á réttum stað í tímaröð.
6. Endurhlaðaðu síðuna.
7. Vænt niðurstaða: sama saga og sömu skilaboð eru enn sýnileg.
8. Prófaðu sem mótaðili ef þú hefur prófnotanda.
9. Vænt niðurstaða: mótaðili sér sömu history og spjallfærslur, en óviðkomandi
   notandi sér ekkert.

Varúð:

- Ekki nota viðkvæm production-skilaboð í prófunum.
- Ekki keyra rollback sem droppar `loan_chat_messages` nema það sé meðvitað
  samþykkt, því það myndi eyða spjallskilaboðum.
- Ekki gera fleiri SQL-breytingar samtímis þessari viðgerð, svo auðvelt sé að
  staðfesta hvort SQL62 leysi vandamálið.
