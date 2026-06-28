# TODO #62 - Codex v016 - loka-rýni á SQL63 eftir v015

**Created:** 2026-06-28 11:40  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Loka-rýni / SQL review - engin framkvæmd

---

## Niðurstaða

Ég finn ekki lengur blocker í SQL63.

**SQL63 má keyra eftir sérstakt samþykki Stebba**, með schema reload strax á
eftir, og síðan localhost prófunum áður en appið er gefið út.

Ég keyrði ekki SQL63, keyrði ekki schema reload og deployaði engu.

---

## Findings

Engin blocker findings fundust í v015 útgáfunni.

Atriðin úr fyrri rýnum eru komin í lag:

- `DROP FUNCTION IF EXISTS` er komið fyrir bæði RPCs áður en þær eru búnar til.
- `switch_loan_role` skilar `pending_user_ids uuid[]`, ekki stökum
  `pending_user_id`.
- Pending user lookup notar `ARRAY(SELECT ...)` og skilar öllum canonical
  matching users án þess að skila netföngum.
- `switchLoanRole` deduplicate-ar notification recipients með `Set`.
- `invalid_state` er komið fyrir mörg pending boð í actual-party flæði.
- Seinni `invalid_state` guard lokar dirty-data edge case þar sem actual party
  gæti líka canonical-matchað pending invitation.
- `get_loan_for_pending_recipient` er deterministic með `ORDER BY ... LIMIT 1`.
- `router.refresh()` er komið í `SwitchRoleButton`.
- Loading state á role switch takkanum breytir ekki lengur textabreidd.
- SQL63 static tests eru komin í `lib/__tests__/sql-migration.test.ts`.

---

## Rýndar skrár

- `ai-handoff/2026-06-28-1112-todo-062-v015-claude-v014-fixes-done.md`
- `sql/63_switch_loan_role.sql`
- `lib/__tests__/sql-migration.test.ts`
- `lib/loans/actions.ts`

---

## SQL63 deployment

Ef Stebbi samþykkir keyrslu:

1. Keyra `sql/63_switch_loan_role.sql` í Supabase SQL editor.
2. Keyra schema reload:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

3. Staðfesta að nýju RPCs séu sýnilegar service-role client:
   - `public.get_loan_for_pending_recipient(uuid, uuid)`
   - `public.switch_loan_role(uuid, uuid)`
4. Keyra localhost prófin hér að neðan.
5. Deploy/push/commit aðeins með sérstöku samþykki Stebba.

---

## Data/RLS/auth mat

- SQL63 eyðir ekki gögnum úr töflum.
- SQL63 getur uppfært:
  - `loan_items.lender_user_id`
  - `loan_items.borrower_user_id`
  - `loan_items.updated_at`
  - `loan_invitations.recipient_role`
  - `loan_invitations.updated_at`
- SQL63 býr til/endurskapar tvær service-role RPCs.
- `PUBLIC`, `anon` og `authenticated` fá ekki execute réttindi.
- `service_role` fær execute réttindi.
- `search_path` er tómt í báðum RPCs.
- Engin netföng eru í return contract.
- Pending-recipient access byggir á canonical email match.

---

## Residual risk

Þetta er enn mock/static-test þakið að mestu, ekki raunverulegt Supabase
integration test. Þess vegna þarf Stebbi að prófa flæðið á localhost eftir SQL63
og schema reload áður en það er gefið út.

Ef production gögn innihalda óvænt mörg pending boð fyrir sama lán getur
`switch_loan_role` skilað `invalid_state`, sem appið mappar í almenna villu.
Það er viljandi örugg hegðun frekar en að SQL giski á rangt boð.

---

## Localhost checks for Stebbi

Keyra þessi próf eftir SQL63 + schema reload, áður en deployað er:

1. Opna pending boð sem pending recipient.
2. Staðfesta að detail-síða opnist og sýni LoanCard, SwitchRoleButton og sögu.
3. Staðfesta að pending recipient sjái ekki `Breyta`, `Eyða`,
   `Merkja skilað` eða `Afturkalla skil`.
4. Smella á role switch.
5. Vænt niðurstaða:
   - síðan refreshast sjálf
   - hlutverk breytist strax á skjánum
   - enginn nýr tölvupóstur fer út
6. Staðfesta að `Saga hlutarins` sýni `Hlutverki breytt: {itemName}` með réttum
   framkvæmdaaðila.
7. Velja `Þekki málið` eftir switch.
8. Vænt niðurstaða:
   - claim virkar
   - pending recipient lendir í réttum lender/borrower dálki
9. Prófa actual-party switch á accepted láni.
10. Vænt niðurstaða:
    - báðir aðilar halda aðgangi
    - mótaðili fær `Ólesið`
11. Prófa beinan detail link sem óviðkomandi notandi.
12. Vænt niðurstaða:
    - ekkert lekur, síðan hegðar sér eins og hlutur finnist ekki
13. Prófa iPhone/Safari og mobile breiddir 360, 390 og 460px.
14. Opna `/dashboard` og sama event/link og Stebbi nefndi að væri nú byrjað að
    virka, til að tryggja að #62 valdi ekki regression.

Varúð:

- Ekki prófa með raunverulegum production mótaðilum nema Stebbi biðji um það.
- SQL63, schema reload, commit, push og deploy þurfa sérstakt samþykki frá
  Stebba.

---

## Tillaga að næsta skrefi

Stebbi má samþykkja SQL63 keyrslu og schema reload. Eftir localhost prófanir
getur Claude Code skilað post-release handoffi, og þá má færa #62 yfir í DONE
ef Stebbi staðfestir að flæðið virki.

