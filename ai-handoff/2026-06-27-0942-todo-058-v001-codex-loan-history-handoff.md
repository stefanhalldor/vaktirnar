# TODO #58 - Handoff fyrir Claude Code: ferill hlutar á detail-síðu

Dagsetning: 2026-06-27 09:42  
Frá: Codex  
Til: Stebbi og Claude Code  
Staða: Plan/handoff fyrir næsta atriði. Codex breytti ekki app-kóða og keyrði ekki SQL.

## Samantekt

#56 er komið út og Stebbi hefur staðfest að dagsetningabreytingar virka. Næsta
atriði í Pakka A er #58: sýna feril hlutarins neðst á detail-síðu láns.

Markmiðið er einfalt: báðir aðilar að láni geti séð hvað hefur gerst á hlutnum,
án þess að þurfa að treysta á minni, Messenger eða `Ólesið` eitt og sér.

## Núverandi grunnur

Staðfest í kóða:

- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` notar `get_my_loans` með
  `p_actor_id` og `notFound()` ef lánið er ekki í aðgangsmengi notandans.
- `recent_events` er service-role-only tafla frá `sql/46_recent_events.sql`.
  Það eru engin grants til `anon` eða venjulegra `authenticated` notenda.
- `recent_events.user_id` merkir móttakanda event-færslu, ekki endilega þann sem
  framkvæmdi aðgerðina.
- Actor og counterpart geta fengið tvær `recent_events` raðir með sama
  `event_key`, svo history þarf að de-duplicate-a.
- `app/auth-mvp/heim/page.tsx` er með formatting-grunn fyrir event labels,
  detail lines og timestamp sem má endurnýta eða færa í sameiginlegan helper.
- #56 bætir við dagsetningabreytingum í `loan_updated` events.

## Scope

Innifalið:

- Sýna `Ferill hlutarins` neðst á `/auth-mvp/lanad-og-skilad/[id]`.
- Sýna sömu history fyrir báða aðila að samþykktu láni.
- Nota `recent_events` sem MVP-gagnagrunn, með dedupe eftir `event_key`.
- Sýna action label, timestamp og detail lines fyrir breytingar.
- Sýna actor aðeins þegar actor er örugglega þekktur.
- Halda öllu server-side aðgangsprófuðu og ekki skila raw event payload í client.

Ekki innifalið:

- #39 soft delete / disabled loan state.
- #59 share/copy detail link.
- #38 decline-event ef það reynist vanta.
- Fullkomin backfill á actor fyrir gömul events sem voru skráð án actor metadata.

## Mikilvæg product-regla

History á að hjálpa til við einfalt samvinnuviðmót. Hún má ekki verða stórt
audit-dashboard. Hún á að vera róleg section neðst á detail-síðu, með stuttum
línum sem notandi skilur fljótt.

## Data og SQL plan

Codex mælir með nýju service-role RPC fyrir history, frekar en að lesa
`recent_events` beint úr component. Það heldur aðgangsreglunni nálægt gögnunum.

Næsta SQL migration væri:

`sql/59_get_loan_event_history.sql`

Athugið: Þetta er SQL59 þótt TODO atriðið sé #58, því `sql/58...` er þegar notað
fyrir dagsetningabreytingarnar.

### Ráðlagt RPC

Nafn:

`public.get_loan_event_history(p_actor_id uuid, p_loan_id uuid)`

Það ætti að:

- nota `p_actor_id`, ekki `auth.uid()`
- staðfesta að `p_actor_id` sé til í `auth.users`
- staðfesta að actor sé raunverulegur aðili að láninu:
  `created_by`, `lender_user_id` eða `borrower_user_id`
- skila engu ef actor hefur ekki aðgang
- lesa aðeins events sem tengjast þessu láni
- de-duplicate-a eftir `event_key`
- raða elst fyrst fyrir feril
- skila aðeins þeim dálkum sem server-side formatter þarf
- veita execute aðeins til `service_role`
- revoke-a `PUBLIC`, `anon` og `authenticated`

MVP event scope:

- `recent_events.source = 'loans'`
- `entity_type = 'loan' AND entity_id = p_loan_id`
- Einnig má taka með `entity_type = 'invitation'` ef invitation tilheyrir
  `p_loan_id`, en aðeins ef það er gert með öruggu joini á `loan_invitations`.
  Þetta getur sýnt boð/claim/decline samhengi betur, en ekki má leka netfangi.

Mælt er með indexi ef query er eftir `entity_type/entity_id`:

`recent_events_loans_entity_idx` á `source`, `entity_type`, `entity_id`,
`occurred_at`, `id`.

### Actor metadata

Ekki nota `recent_events.user_id` sem actor.

Fyrir ný events má bæta við optional actor metadata í payload, t.d.
`actorUserId`, þar sem actionið hefur raunverulegan actor í server action.
Dæmi:

- `loan_created`: actor er creator.
- `loan_updated`: actor er sá sem vistaði breytinguna.
- `loan_returned`: actor er sá sem merkir skilað.
- `loan_return_undone`: actor er sá sem afturkallar skil.
- `loan_invitation_accepted`: actor er sá sem samþykkir.
- `loan_invitation_declined`: actor er sá sem hafnar.

Fyrir gömul events þar sem actor vantar:

- ekki giska
- ekki sýna rangan actor
- sýna bara action + timestamp + details

Ef actor er sýndur í UI:

- ef `actorUserId === currentUser.id`, sýna `Þú`
- annars sýna display name ef það er örugglega sótt server-side og actor er
  tengdur þessu láni
- fallback má vera `Mótaðili`
- ekki sýna netfang
- ekki senda raw `actorUserId` til client ef hægt er að senda tilbúinn
  `actorLabel`

## App plan

### 1. Shared event formatting

Forðast að tvítaka logic úr `/heim`.

Færa eða endurnýta:

- event label mapping
- `loan_updated` single-field label val
- detail lines fyrir `item_name`, `note`, `loaned_at`, `due_at`
- timestamp formatting

Mögulegur staður:

`lib/recent-events/display.ts`

Passa að formatterinn fái translations inn, því `next-intl` má ekki vera
harðkóðað inn í almennan helper ef það passar ekki við núverandi mynstur.

### 2. Server-side history loader

Búa til helper, t.d.:

`lib/loans/history.server.ts`

Hann ætti að:

- kalla `get_loan_event_history`
- taka current user / locale / translations
- breyta raw rows í öruggar display rows
- de-duplicate-a líka í TypeScript til varnar ef SQL missir eitthvað
- skila aðeins display data til component:
  - label
  - timestamp label
  - optional actor label
  - optional detail lines

### 3. UI component

Búa til component, t.d.:

`components/loans/LoanHistory.tsx`

Hún á að vera unframed section, ekki kort inni í korti:

- fyrirsögn: `Ferill hlutarins`
- listi með rólegum rows
- timestamp í `text-xs` muted
- detail lines undir action ef þær eru til
- empty state ef engin history finnst: stutt og vinalegt

Setja neðst í:

`app/auth-mvp/lanad-og-skilad/[id]/page.tsx`

undir `LoanCard`.

### 4. Textar

Allur texti í:

- `messages/is.json`
- `messages/en.json`

Forðast hardcode-aðan UI texta.

Mælt er með keys undir `teskeid.loans.history`, t.d.:

- `title`
- `empty`
- `actorYou`
- `actorCounterpart`

Event labels má annaðhvort endurnýta úr núverandi `teskeid.home` tímabundið eða
færa í sameiginlegra namespace. Ef þeim er afritað þarf að passa að íslenska og
enska haldist samræmd.

## Design.md

Þetta snertir detail-síðu, layout og mobile.

Fylgja þarf sérstaklega:

- mobile-first 360, 390 og 460 px
- enginn horizontal overflow
- engin kort inni í kortum
- section neðst, róleg og skannanleg
- metadata í `text-xs` muted
- enginn hero-stíll eða dashboard-stemning
- loading/error/empty state án layout shift

## Öryggi

Passa sérstaklega:

- Óviðkomandi notandi má ekki sjá history með beinum URL eða RPC-kalli.
- `recent_events` má áfram vera service-role-only.
- Ekki veita `anon` eða `authenticated` execute/select á history gögn.
- Ekki skila raw payload, raw event IDs, netföngum eða tæknilegum database-gildum
  í client.
- Ekki nota `recent_events.user_id` sem actor.
- Ekki sýna actor nema það sé öruggt.
- Ekki láta history failure brjóta alla detail-síðuna; sýna rólegt fallback eða
  empty state og logga fasta villu án raw details.

## Prófanir

Lágmarkspróf:

- `loan-pages.test.tsx`
  - detail-síða renderar history section þegar history rows koma til baka
  - history birtist neðst eftir `LoanCard`
  - ef lánið finnst ekki í `get_my_loans`, er history RPC ekki kallað
  - ef history RPC bilar, detail-síðan lekur ekki raw error details

- `actions`/history helper tests
  - de-duplicate eftir `event_key`
  - `loan_updated` með einni `due_at` breytingu fær `Breyttur skiladagur`
  - `loan_updated` með einni `loaned_at` breytingu fær `Breytt lánsdagsetning`
  - missing actor metadata veldur ekki villu
  - actor label verður `Þú` fyrir current user og ekki netfang

- Static SQL tests
  - SQL59 notar `p_actor_id`, ekki `auth.uid()`
  - grants eru aðeins til `service_role`
  - `PUBLIC`, `anon`, `authenticated` fá ekki execute/select
  - access check notar `created_by`, `lender_user_id` eða `borrower_user_id`
  - query de-duplicate-ar eftir `event_key`
  - engin recipient email eru valin eða skilað

Keyra:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/loan-pages.test.tsx`
- `npm run test:run -- lib/__tests__/home-page.test.tsx`
- `npm run test:run -- lib/__tests__/sql-migration.test.ts`
- `npm run test:run`

## Rollout

Ef SQL59 er notað:

1. Claude Code skrifar SQL59 og app-kóða.
2. Codex rýnir diffið áður en SQL er keyrt.
3. Stebbi keyrir SQL59 á Supabase.
4. Reload PostgREST schema cache.
5. Deploya app-kóða sem kallar history RPC.

Ef Claude Code velur að sleppa SQL59 og lesa `recent_events` beint server-side
eftir `get_my_loans` access check, þarf það að koma skýrt fram í handoffi með
rökum. Þá þarf sérstaka rýni á að engin server-side leið geti lesið history án
þess að access check hafi fyrst tekist.

## Localhost checks for Stebbi

Eftir útfærslu:

1. Opna samþykkt lán sem lánveitandi.
   - Vænt: detail-síðan sýnir `Ferill hlutarins` neðst.

2. Breyta `Skila fyrir` á láninu og fara aftur á detail-síðuna.
   - Vænt: history sýnir `Breyttur skiladagur` með dagsetningu/tíma.
   - Vænt: sama breyting birtist ekki tvívegis.

3. Breyta `Lánað`, nafni og athugasemd í sér eða saman.
   - Vænt: history sýnir skiljanlegar línur fyrir breytingarnar.

4. Merkja hlut sem skilaðan og afturkalla skil ef það flæði er til staðar á
   prófunargögnum.
   - Vænt: history sýnir skilað/afturkallað án duplicate row.

5. Opna sama lán sem lántakandi/mótaðili.
   - Vænt: báðir aðilar sjá sama feril.

6. Opna detail URL sem innskráður notandi sem er ekki aðili að láninu.
   - Vænt: engin gögn og enginn ferill leka. Síðan fer í `notFound` eða öruggt
     almennt aðgangssvar.

7. Prófa eldra lán sem hefur events án actor metadata.
   - Vænt: history birtist samt; actor er annaðhvort falinn eða neutral, ekki
     ranglega giskaður.

8. Prófa mobile 360, 390 og 460 px.
   - Vænt: enginn horizontal overflow, engin skörun, timestamp/detail lines lesa
     vel og sectionin ýtir ekki aðalaðgerðum í rugl.

Varúð:

- Ekki prófa með production-lánum nema það sé meðvitað val.
- History getur birt raunverulegar aðgerðir milli tveggja notenda, svo UI má ekki
  sýna netföng eða raw payload.
