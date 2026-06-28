# Handoff fyrir Claude Code - Loan summary dagsetningar og fastur badge-teljari

Relevant TODO: #043/#049 - `Lánað og skilað`, Gmail/canonical invitations, Tengsl og loan UI polish.

## Stutt samhengi

Stebbi sér tvennt:

1. Á `/auth-mvp/lanad-og-skilad` birtast summary-spjöld með ensku/styttu dagsetningunni, t.d. `Jun 18, 2026`.
2. Á heimaskjá birtist grænn `1` badge við `Lánað og skilað` sem Stebbi nær ekki að losna við.

Stebbi vill að loan summary spjöldin noti sama dagsetningarstíl og detail-spjaldið:

- `Lánað fimmtudaginn 18. júní 2026`
- ef við á: `Skila fyrir 15. júlí 2026`

## Mjög mikilvægt áður en þú byrjar

Codex hafði byrjað að laga annað mál í sömu lotu áður en Stebbi bað sérstaklega um þetta handoff. Það eru því þegar ókláraðar, óprófaðar breytingar í worktree:

- `components/loans/LoanForm.tsx`
- `lib/relationships/actions.ts`

Þær breytingar tengjast Tengsl recipient picker og Gmail canonical lookup, ekki dagsetningunum/badge-inu. Vinsamlegast skoðaðu `git diff` áður en þú snertir skrár og forðastu að blanda þessari nýju dagsetningar/badge vinnu saman við ókláraða picker/action vinnu nema Stebbi samþykki það skýrt.

## Skrár sem Codex skoðaði

- `components/loans/LoanSummaryCard.tsx`
- `components/loans/LoanCard.tsx`
- `components/loans/LoanList.tsx`
- `app/auth-mvp/heim/page.tsx`
- `lib/__tests__/home-page.test.tsx`
- `lib/__tests__/loan-list.test.tsx`
- `messages/is.json`
- `messages/en.json`

## Greining - dagsetning

`components/loans/LoanSummaryCard.tsx` notar nú:

- `useLocale()`
- `Intl.DateTimeFormat` / `toLocaleDateString`
- `month: 'short'`

Þess vegna fær Stebbi enskt/stytt output eins og `Jun 18, 2026`.

`components/loans/LoanCard.tsx` notar hins vegar rétta app-stílinn:

- `loanedAtWeekday(dateStr)` úr `lib/loans/types`
- `t('loanedAtFull', { weekday, date })`
- `t('dueAtFull', { date })`
- `messages/is.json` inniheldur `months`, `weekdays`, `loanedAtFull`, `dueAtFull`

## Plan - dagsetning

1. Laga `components/loans/LoanSummaryCard.tsx`.
2. Samræma formatting við `LoanCard.tsx`.
3. Ekki nota `new Date(dateStr)` beint fyrir `YYYY-MM-DD`, því timezone getur hliðrað degi. Split-a frekar `YYYY-MM-DD` í `year/month/day`, eins og `LoanCard` gerir.
4. Sýna loaned line sem:
   - `Lánað fimmtudaginn 18. júní 2026` á íslensku
   - samsvarandi enskan texta samkvæmt núverandi `messages/en.json`
5. Ef `item.due_at` er til og `item.returned_at` er ekki til, sýna due line:
   - `Skila fyrir 15. júlí 2026`
   - halda overdue warning icon/lit ef `isOverdue`
6. Ef `item.returned_at` er til, varðveita núverandi returned status, helst samræma við detail ef það er lítil breyting. Ekki sýna due line fyrir skiluð lán.

Mælt með lágmarksútfærslu:

- Flytja `loanedAtWeekday` import í `LoanSummaryCard`.
- Bæta við litlum local helpers í `LoanSummaryCard`, eða draga sameiginlega helpers úr `LoanCard` ef það helst mjög lítið.
- Forðast stærri refactor nema TypeScript/tests þrýsti á það.

## Greining - fasti `1` badge á heimaskjá

Í `app/auth-mvp/heim/page.tsx` kemur badge-ið frá:

- `admin.rpc('get_my_pending_invitations', { p_actor_id: user.id })`
- `const pendingCount = pendingInvitations.length`

Þetta getur orðið ósamstíga við það sem Stebbi sér á `/auth-mvp/lanad-og-skilad`, því loans-síðan notar nú `get_my_loans` og soft-ack branch með `requires_acknowledgement`.

Sérstaklega getur `get_my_pending_invitations` talið invitation sem:

- er email-link pending en á ekki lengur að birtast sem actionable badge,
- tengist láni þar sem actor er þegar participant,
- er ósamstíga við canonical Gmail/dotted logic,
- eða birtist ekki í LoanList vegna þess að `get_my_loans` er raunverulegi source of truth fyrir UI.

## Plan - badge

Codex mælir með að heimaskjárinn hætti að nota `get_my_pending_invitations` fyrir badge-ið og noti `get_my_loans` í staðinn, svo teljarinn passi við það sem notandi getur séð/opnað í `Lánað og skilað`.

Lágmarksbreyting:

1. Í `app/auth-mvp/heim/page.tsx`, skipta pending badge RPC úr `get_my_pending_invitations` yfir í `get_my_loans`.
2. Telja bara actionable soft-ack rows:

```ts
const pendingCount = loans.filter((loan) =>
  loan.requires_acknowledgement &&
  loan.invitation_status === 'pending'
).length
```

3. Halda sömu villuhegðun og nú:
   - Ef RPC bilar, fela badge.
   - Ekki fela `Ólesið` recent events nema recent-events query bilar.
4. Í log message má uppfæra úr `get_my_pending_invitations failed` í `get_my_loans failed` eða almennara `pending loan badge query failed`.
5. Ekki keyra SQL fyrir þetta. Þetta er app-code source-of-truth breyting.

Önnur leið er að fela badge-ið alveg. Codex myndi aðeins velja það ef Stebbi segir að badge sé óþarfur. Betri default er að telja `get_my_loans` soft-ack rows.

## Tests sem þarf að uppfæra

### Date tests

Leitaðu fyrst í `lib/__tests__/loan-list.test.tsx` og `lib/__tests__/loan-card.test.tsx`.

Bæta við eða uppfæra test sem renderar `LoanSummaryCard` eða `LoanList` með:

- `loaned_at: '2026-06-18'`
- `due_at: '2026-07-15'`
- locale/mock translations á íslensku

Vænt:

- `Lánað fimmtudaginn 18. júní 2026`
- `Skila fyrir 15. júlí 2026`
- ekki `Jun 18, 2026`

### Badge tests

Uppfæra `lib/__tests__/home-page.test.tsx`.

Núverandi tests mocka `get_my_pending_invitations`. Breyta helpers þannig að þau mocki `get_my_loans` fyrir badge count.

Mikilvæg tilfelli:

1. Sýnir badge `1` þegar `get_my_loans` skilar einni row með:
   - `requires_acknowledgement: true`
   - `invitation_status: 'pending'`
2. Sýnir ekki badge þegar `get_my_loans` skilar pending invitation sem er ekki soft-ack/actionable, t.d.:
   - `requires_acknowledgement: false`
3. Sýnir ekki badge ef `get_my_loans` bilar.
4. Recent-events `Ólesið` hegðun helst óbreytt.

## Áhætta og edge cases

- Ekki nota `get_my_pending_invitations` sem badge source eftir breytingu nema þú getir sýnt af hverju það er enn betra en `get_my_loans`.
- Passa að `get_my_loans` return shape sé stærri en pending-invitations. Type-a bara það sem þarf eða nota `LoanItem[]` ef það er þegar nálægt.
- Ekki breyta SQL56 eða keyra SQL fyrir þetta.
- Ekki snerta RLS/grants.
- Date formatting þarf að vera stöðugt á mobile og desktop og ekki hliðra degi vegna timezone.
- Summary card texti þarf að vera mobile-safe. Ef due line bætist við, passa að card hækki eðlilega en ekki overflow-i.

## Skipanir sem Codex keyrði við undirbúning

- `rg` leit í `app`, `components`, `lib`, `messages`
- `Get-Content` á köflum úr `LoanSummaryCard`, `LoanCard`, `LoanList`, `heim/page.tsx`, tests
- `git status --short`

Engin tests voru keyrð fyrir þetta handoff.
Engin SQL var keyrð.

## Localhost checks for Stebbi

Prófa á localhost eftir að Claude klárar breytinguna:

1. Opna `/auth-mvp/lanad-og-skilad`.
2. Vera með að minnsta kosti eitt opið lán með `loaned_at` og `due_at`.
3. Staðfesta að summary-spjaldið sýni:
   - `Lánað [vikudag] [dagur]. [mánuður] [ár]`
   - `Skila fyrir [dagur]. [mánuður] [ár]` ef skiladagur er til
   - ekki enskt/stytt `Jun 18, 2026` output.
4. Prófa opið lán án due date:
   - aðeins loaned line birtist.
5. Prófa skilað lán:
   - engin due line fyrir skilað lán.
   - returned staða helst skiljanleg.
6. Opna `/auth-mvp/heim`.
7. Ef engin actionable pending soft-ack lán eru til, þá má ekki birtast grænn `1` badge við `Lánað og skilað`.
8. Ef til er pending boð sem birtist raunverulega inni á `/auth-mvp/lanad-og-skilad` sem acknowledgable row, þá á badge að sýna réttan fjölda.
9. Ekki prófa production-gagnabreytingar kæruleysislega. Þessi breyting á ekki að þurfa SQL eða gagnagrunnsbreytingar; ef Claude telur sig þurfa SQL skal stoppa og biðja Stebba sérstaklega.

