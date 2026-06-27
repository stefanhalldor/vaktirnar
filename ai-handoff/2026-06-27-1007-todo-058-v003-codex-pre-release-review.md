# #58 v003 - Codex pre-release review

**TODO:** #58 - Ferill hlutar á detail-síðu  
**Agent:** Codex  
**Rýnt handoff:** `ai-handoff/2026-06-27-1000-todo-058-v002-claude-pre-release-handoff.md`  
**Rýndur commit:** `4bbee0d feat: loan history section on detail page (#58)`  
**Staða:** Samþykkt til áframhaldandi rollout með einni scope-athugasemd.

---

## Niðurstaða

Codex fann engan release-blocking galla í #58.

SQL59, server-side history fetch, detail UI og shared event-formatting líta út
fyrir að fylgja núverandi öryggismynstri Teskeiðar:

- service-role kallar RPC með explicit `p_actor_id`
- `recent_events.user_id` er ekki skilað og ekki notað sem actor
- aðgangur að history er gated á raunverulega aðila láns
- RPC skilar tómri niðurstöðu ef aðgang vantar
- history-villa brýtur ekki detail-síðuna
- `DISTINCT ON` er notað rétt til að hreinsa duplicate event-raðir

Codex keyrði ekki SQL59 og deployaði ekki.

---

## Findings

### Engin blocker findings

Enginn release-blocking galli fannst.

### Scope-athugasemd: pending viðtakandi sér tóman feril

Pending viðtakandi getur opnað detail-síðu úr listanum, en SQL59 skilar tómum
ferli þar til boðið hefur verið samþykkt, því RPC leyfir aðeins:

- `created_by`
- `lender_user_id`
- `borrower_user_id`

Þetta er öruggt og lekur ekki gögnum. Það er líka í takt við þrengt MVP-scope.

Ef Stebbi vill að pending viðtakandi sjái feril áður en hann smellir á
`Þekki málið`, þarf SQL59 að bæta við pending invitation-recipient grein með
canonical email checki, svipað og `get_my_loans` gerir. Codex telur þetta ekki
blocker fyrir núverandi #58 nema Stebbi krefjist þess sérstaklega.

Viðeigandi staðir:

- `sql/59_get_loan_event_history.sql`
- `components/loans/LoanSummaryCard.tsx`
- `sql/56_normalize_email_canonical.sql`

---

## Svör við spurningum Claude Code

### A. Er SQL DISTINCT ON rétt notað?

Já.

Innri query notar:

```sql
SELECT DISTINCT ON (re.event_key)
...
ORDER BY re.event_key, re.occurred_at ASC, re.id ASC
```

Þetta uppfyllir PostgreSQL-regluna um að `ORDER BY` byrji á sama dálki og
`DISTINCT ON`. Það velur elstu færslu per `event_key`, sem er rétt þar sem actor
og counterpart geta fengið tvær `recent_events` raðir fyrir sama event.

Ytri query raðar svo aftur eftir:

```sql
ORDER BY deduped.occurred_at ASC, deduped.event_key ASC
```

Það gefur rétta tímaröð í history.

### B. Á `entity_type = 'invitation'` events að vera í history?

Codex samþykkir núverandi MVP-scope:

- `loan_invitation_received` er `entity_type='invitation'` og er ekki með.
- `loan_invitation_accepted` og `loan_invitation_declined` eru
  `entity_type='loan'` og koma með.

Þetta er gott afmörkunarskref. Ef við viljum síðar sýna sjálft
`loan_invitation_received` í history þarf að join-a í `loan_invitations` án þess
að skila eða leka netföngum.

### C. Á history að birtast á öllum lánum eða bara samþykktum?

History á detail-síðu fyrir öll lán sem notandi hefur detail-aðgang að er í
lagi.

Athugið þó scope-athugasemdina að ofan: pending viðtakandi fær detail-aðgang úr
`get_my_loans`, en SQL59 skilar tómum history þar til hann er orðinn
`borrower_user_id` eða `lender_user_id`.

### D. Er index nógu þróaður?

Já, fyrir núverandi umfang.

Indexinn:

```sql
CREATE INDEX IF NOT EXISTS recent_events_loans_entity_idx
  ON public.recent_events (source, entity_type, entity_id, occurred_at ASC, id ASC);
```

styður núverandi query vel þar sem síað er á `source`, `entity_type` og
`entity_id`, og svo raðað eftir `occurred_at`.

Ef `recent_events` verður mjög stór síðar mætti skoða index sem tekur meira mið
af `event_key`, en það er ekki blocker núna.

---

## Design.md

Codex las viðeigandi kafla í `Design.md` um mobile app-upplifun, layout,
sections og cards.

Útfærslan er í lagi út frá Design.md:

- history er section neðst á detail-síðu, ekki kort inni í korti
- textastig eru lágstemmd og passa við metadata/detail efni
- engin ný form eða inputs eru kynnt
- mobile overflow áhætta virðist lítil, en þarf samt að prófa við 360/390 px

---

## SQL og öryggi

SQL59:

- býr til `public.get_loan_event_history(p_actor_id uuid, p_loan_id uuid)`
- notar `p_actor_id`, ekki `auth.uid()`
- staðfestir actor í `auth.users`
- staðfestir að actor sé aðili að láninu
- skilar ekki `recent_events.user_id`
- skilar ekki recipient email eða öðrum raw invitation-gögnum
- grants eru aðeins til `service_role`
- `PUBLIC`, `anon` og `authenticated` fá ekki execute
- bætir við index á `recent_events`

Codex sá ekki RLS-veikingu eða gagnaleka í SQL59.

SQL59 þarf að keyra á Supabase áður en app-kóðinn sem kallar RPC fer í live
rollout. Eftir SQL þarf að reloada PostgREST schema cache.

---

## Skrár skoðaðar

- `ai-handoff/2026-06-27-1000-todo-058-v002-claude-pre-release-handoff.md`
- `sql/59_get_loan_event_history.sql`
- `sql/46_recent_events.sql`
- `sql/56_normalize_email_canonical.sql`
- `sql/58_update_loan_item_details_and_dates_with_diff.sql`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
- `app/auth-mvp/heim/page.tsx`
- `components/loans/LoanHistory.tsx`
- `components/loans/LoanSummaryCard.tsx`
- `components/loans/LoanCard.tsx`
- `lib/loans/history.server.ts`
- `lib/recent-events/display.ts`
- `lib/recent-events/helpers.server.ts`
- `lib/recent-events/types.ts`
- `lib/loans/actions.ts`
- `lib/loans/types.ts`
- `lib/__tests__/loan-pages.test.tsx`
- `messages/is.json`
- `messages/en.json`
- `Design.md`

---

## Skrár breyttar af Codex

Engar implementation skrár voru breyttar í þessari rýni.

Codex bjó aðeins til þessa review/handoff skrá:

- `ai-handoff/2026-06-27-1007-todo-058-v003-codex-pre-release-review.md`

---

## Skipanir keyrðar

```bash
npm run type-check
```

Niðurstaða: exit code 0.

```bash
npm run test:run
```

Niðurstaða: exit code 0.

Vitest niðurstaða:

- 42 test files passed
- 1309 tests passed
- 22 skipped
- 8 todo

Athugið: jsdom prentaði venjuleg `Not implemented: navigation to another
Document` warnings, en engin test failure.

---

## Hvað Codex keyrði ekki

Codex keyrði ekki:

- SQL59 á Supabase
- schema cache reload
- dev server
- browserpróf
- deploy
- commit
- push

---

## Tillaga að næsta skrefi

Claude Code má halda áfram með rollout undir þessum skilyrðum:

1. Stebbi keyrir `sql/59_get_loan_event_history.sql` á Supabase.
2. Stebbi eða Claude Code reloadar PostgREST schema cache samkvæmt venjulegu
   verklagi.
3. Staðfesta að RPC sé sýnilegt service-role megin áður en app deploy fer live.
4. Deploya app-kóða.
5. Stebbi gerir localhost/production sanity checks hér að neðan.

Ef Stebbi vill að pending viðtakandi sjái history fyrir samþykki þarf að gera
smá SQL59 breytingu áður en rollout fer áfram. Annars er núverandi scope í lagi.

---

## Localhost checks for Stebbi

Eftir að SQL59 hefur verið keyrt og schema cache reload er búið:

1. Opna detail-síðu á samþykktu láni sem lánveitandi.
   - Vænt: `Ferill hlutarins` birtist neðst á síðunni.
   - Vænt: eldri events birtast í tímaröð.

2. Breyta `Skila fyrir` á samþykktu láni og fara aftur á detail-síðuna.
   - Vænt: history sýnir `Breyttur skiladagur`.
   - Vænt: sama breyting birtist ekki tvisvar.

3. Opna sama lán sem mótaðili.
   - Vænt: mótaðili sér sama feril.
   - Vænt: engin netföng eða internal IDs birtast í history.

4. Opna detail-síðu sem óviðkomandi notandi með beinum hlekk.
   - Vænt: notandi fær `notFound()`/404 eða samsvarandi lokaða hegðun.
   - Vænt: enginn ferill eða lánsgögn leka.

5. Prófa pending lánaboð sem viðtakandi hefur ekki samþykkt.
   - Vænt með núverandi scope: detail-síðan opnast ef hún er í listanum, en
     history getur verið tóm.
   - Ef Stebbi vill annað þarf að breyta SQL59 áður en þetta er samþykkt.

6. Prófa mobile breiddir 360 px og 390 px.
   - Vænt: ekkert horizontal overflow.
   - Vænt: history ýtir ekki `LoanCard` úr stað og texti skarast ekki.

Ekki prófa með production-notendagögnum eða Supabase-breytingum kæruleysislega.
SQL59 er schema/function breyting og þarf sömu varúð og fyrri service-role RPC
migrations.
