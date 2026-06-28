# Rýni: recipient_email í get_my_loans og lánakortum

**Handoff:** Codex → Stebbi og Claude Code  
**Dagsetning:** 2026-06-22 17:07  
**Rýnir skrá:** `2026-06-22-0820-todo-053-v001-claude-recipient-email-post-release.md`  
**Rétt TODO-tenging:** #43 Gmail-punktar og útrunnin soft-ack lánaboð, #47 Lán: bæta við netfangi í edit og laga vistunarvillu  
**Stutt niðurstaða:** Ekki keyra `sql/55_get_my_loans_add_recipient_email.sql` óbreytta í Supabase.

## Findings

### Critical: `sql/55` má ekki keyra óbreytt

`sql/55_get_my_loans_add_recipient_email.sql` notar `CREATE OR REPLACE FUNCTION public.get_my_loans(...)` og breytir `RETURNS TABLE` með því að bæta við `recipient_email`. PostgreSQL leyfir almennt ekki að breyta OUT/return-shape með `CREATE OR REPLACE FUNCTION`. Þetta var þegar skráð sem migration-regla í `sql/50_loan_soft_acknowledgement.sql`.

Áhætta ef Stebbi keyrir þetta óbreytt:

- Líklegast fellur migrationin strax með return-type villu.
- Appið fær áfram ekki `recipient_email`, þannig að nýja UI-virknin virkar ekki.
- Handoff Claude Code segir ranglega að `CREATE OR REPLACE` sé hægt að keyra endurtekið án vandræða.

Viðmið úr fyrri öruggri migration:

- `sql/50_loan_soft_acknowledgement.sql` notar `DROP FUNCTION IF EXISTS public.get_my_loans(uuid);`
- býr fallið svo til aftur,
- keyrir í transaction,
- endursetur `REVOKE`/`GRANT`.

### Critical: `sql/55` tapar soft-ack virkni úr migration 50

Núverandi `get_my_loans` eftir `sql/50` á að skila:

- `requires_acknowledgement boolean`
- `UNION ALL` branch sem sýnir pending invitation rows þegar `auth.users.email` passar við `loan_invitations.recipient_email_normalized`
- `requires_acknowledgement = true` fyrir þannig pending rows

`sql/55` eins og hún er núna:

- skilar ekki `requires_acknowledgement`
- inniheldur enga pending-recipient branch
- skoðar ekki `auth.users.email` eða `v_actor_norm`
- skilar aðeins lánum þar sem notandi er nú þegar `lender_user_id` eða `borrower_user_id`

Þetta myndi brjóta mýkra lánaboðsflæðið. Viðtakandi sem á pending boð en hefur ekki enn valið `Þekki málið` myndi missa boðið úr listanum. Þetta snertir #43, #27 og #52 beint.

### High: Ef fallið er droppað þarf að endursetja grants

`sql/55` inniheldur ekki:

```sql
REVOKE EXECUTE ON FUNCTION public.get_my_loans(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_loans(uuid) TO service_role;
```

Ef Claude Code lagar return-shape vandann með `DROP FUNCTION` án þess að bæta grants aftur við, getur annaðhvort:

- appið misst service-role execution,
- eða fallið fengið of breið default function execute réttindi.

Rétta leiðin er að gera þetta eins og `sql/50`: transaction, drop/create og grants í sama skjali.

### High: PostgREST/Supabase schema cache þarf að vera hluti af rollout

Þegar `get_my_loans` fær nýjan return dálk þarf að endurhlaða Supabase/PostgREST schema cache eftir migration. Annars getur appið áfram fengið gamla RPC-samninginn eða schema mismatch.

Claude-skráin nefnir ekki schema cache reload. Það þarf að vera skýrt í rollout-instructions áður en Stebbi keyrir þetta í Supabase.

### Medium: `todo-053` er ekki til í `TODO.md`

Claude-skráin er vistuð sem `todo-053`, en Codex fann ekki #53 í `TODO.md`. Ef þetta á að vera sérstakt opið atriði þarf Stebbi/Claude Code að skrá #53. Annars ætti þetta að vera tengt #43/#47.

Þetta er ekki tæknileg runtime villa, en það getur ruglað handoff-sögu og lokun atriða.

### Medium: Vantar SQL-regression próf fyrir migration 55

Núverandi próf virðast prófa `sql/50` fyrir soft-ack eiginleika, en ekki tryggja að `sql/55` varðveiti þá. Það þarf test sem grípur að migration 55:

- droppar og endurskapar `get_my_loans` þegar return shape breytist
- inniheldur `requires_acknowledgement boolean`
- inniheldur pending invitation `UNION ALL` branch
- skilar `recipient_email` aðeins fyrir creator/direct branch
- skilar `NULL::text` sem `recipient_email` í pending recipient branch
- endursetur `REVOKE`/`GRANT`

### Low: UI breytingarnar virðast almennt fara í rétta átt

Codex sá að `LoanSummaryCard` er sérstakt smellanlegt listaspjald og að `LoanList` notar það. Það er í takt við fyrri ákvörðun Stebba um að henda edit-tákninu úr listanum og gera allt spjaldið smellanlegt.

`LoanCard` fékk líka `afterDeleteHref`, sem svarar fyrri edge case um að notandi gæti eytt láni á detail-síðu og setið eftir á dauðri detail-síðu.

Þetta er jákvætt, en það má ekki skyggja á SQL-vandann.

## Hvað Claude Code þarf að gera áður en Stebbi keyrir SQL

1. Endurskrifa `sql/55_get_my_loans_add_recipient_email.sql` út frá **núverandi** `sql/50` `get_my_loans` líkamanum.

2. Nota transaction og drop/create:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.get_my_loans(uuid);
CREATE FUNCTION public.get_my_loans(...)
...
REVOKE EXECUTE ...
GRANT EXECUTE ...
COMMIT;
```

3. Halda báðum branches:

- Branch 1: direct participant rows.
- Branch 2: pending invitation rows þar sem actor email passar við `recipient_email_normalized`.

4. Ný return shape þarf að vera:

```sql
...
is_creator boolean,
requires_acknowledgement boolean,
recipient_email text
```

5. Í Branch 1:

```sql
false,
CASE WHEN li.created_by = p_actor_id THEN inv.recipient_email_normalized ELSE NULL::text END
```

6. Í Branch 2:

```sql
true,
NULL::text
```

7. Bæta SQL-regression prófum við.

8. Uppfæra handoff með skýru rollout:

- keyra migration
- reload Supabase schema cache
- prófa localhost
- deploya appkóða þegar schema er tilbúið

## Supabase, auth, RLS og gögn

Þessi breyting skrifar ekki gögn og breytir ekki töflum, RLS policies eða auth stillingum. Hún breytir samt RPC contract sem appið notar víða, þannig að áhættan er raunveruleg.

Mest hætta er ekki gagnatap heldur:

- app breakage á `Lánað og skilað`
- pending lánaboð hverfa hjá viðtakanda
- `Þekki málið` flæði tapast úr listanum
- rangar grants ef fall er droppað/endurstofnað án `REVOKE`/`GRANT`
- schema cache ósamræmi milli Supabase og appkóða

## Localhost checks for Stebbi

Ekki keyra `sql/55` óbreytta í Supabase.

Þegar Claude Code hefur lagað migrationina og Stebbi hefur keyrt hana á réttu Supabase umhverfi með schema cache reload:

1. Creator með pending boð.
   - Stofna eða nota lán þar sem Stebbi hefur sent boð en viðtakandi hefur ekki samþykkt.
   - Opna `/auth-mvp/lanad-og-skilad`.
   - Vænt: listaspjaldið sýnir netfang viðtakanda, ekki `Bíður svars` í haus.
   - Opna detail-síðu.
   - Vænt: netfang sést í haus og `Bíður svars` sést sem stöðulína neðar.

2. Recipient með pending soft-ack boð.
   - Skrá inn sem viðtakandi sem á pending boð.
   - Opna `/auth-mvp/lanad-og-skilad`.
   - Vænt: pending boðið birtist áfram.
   - Vænt: `Þekki málið` og `Kannast ekki við þetta` birtast/virka eins og áður.
   - Vænt: recipient sér ekki sitt eigið `recipient_email` úr invitation sem sér dálk frá creator.

3. Accepted lán.
   - Opna lán þar sem mótaðili hefur samþykkt.
   - Vænt: nafn mótaðila birtist, ekki netfang.

4. Lán án boðs.
   - Opna lán sem hefur engan mótaðila og ekkert pending boð.
   - Vænt: engar rangar mótaðilaupplýsingar birtast.

5. Regression á detail/lista.
   - Smella á listaspjald.
   - Vænt: allt spjaldið opnar `/auth-mvp/lanad-og-skilad/[id]`.
   - Vænt: edit-tákn er ekki á listaspjaldi.
   - Vænt: aðgerðir eru enn á detail-síðu.
   - Prófa delete á detail-síðu ef sýnilegt.
   - Vænt: notandi lendir aftur á lista eða fær skýra stöðu, ekki dauða detail-síðu.

6. Óaðgengilegt lán.
   - Opna lán sem annar notandi á ekki að sjá.
   - Vænt: 404 eða örugg fallback hegðun, ekki gagnaleki.

## Ráðlegging Codex til Stebba

Stebbi á ekki að samþykkja að keyra migration 55 í Supabase eins og hún er núna. Claude Code þarf fyrst að skila v002 SQL sem varðveitir `sql/50` soft-ack samninginn og bætir `recipient_email` ofan á hann.
