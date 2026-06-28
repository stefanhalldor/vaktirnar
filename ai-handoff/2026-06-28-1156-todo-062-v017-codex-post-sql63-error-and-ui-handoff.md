# TODO #62 - Codex v017 - SQL63 runtime villa og UI-lagfæring

**Created:** 2026-06-28 11:56  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Stebbi og Claude Code  
**Tegund:** Incident handoff / patch request - engin framkvæmd af Codex

---

## Niðurstaða

SQL63 var keyrt og schema cache var endurhlaðið, en `switch_loan_role` fellur í
runtime með `42702: column reference "status" is ambiguous`.

Þetta er SQL63 function-villa, ekki schema reload-villa og ekki UI-villa.

Claude Code á að útbúa patch áður en Stebbi heldur áfram:

1. **Mælt með:** búa til `sql/64_...sql` sem endurskapar bara
   `public.switch_loan_role(uuid, uuid)` með aliasuðum dálkum.
2. Einnig má uppfæra `sql/63_switch_loan_role.sql` í repo til að hún sé rétt
   fyrir ný environments, en þar sem Stebbi er þegar búinn að keyra SQL63 í
   Supabase þarf rekjanlega SQL64 patch-skrá fyrir núverandi gagnagrunn.

Codex keyrði ekki SQL, keyrði ekki schema reload, breytti ekki app-kóða og
snerti ekki Supabase.

---

## Blocker 1 - SQL63 fellur vegna ómerkts `status`

Stebbi prófaði beint í Supabase SQL editor:

```sql
BEGIN;

SELECT *
FROM public.switch_loan_role(
  '9321ee0e-910d-4ac8-ba95-dab905bda264'::uuid,
  'b48f0e6c-131a-449d-ac95-d731c9b97738'::uuid
);

ROLLBACK;
```

Niðurstaða:

```txt
ERROR: 42702: column reference "status" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
QUERY: SELECT COUNT(*)
       FROM public.loan_invitations
       WHERE loan_id = p_loan_id
         AND status = 'pending'
CONTEXT: PL/pgSQL function public.switch_loan_role(uuid,uuid) line 44 at SQL statement
```

Rótin er að `switch_loan_role` er `RETURNS TABLE` með output dálk sem heitir
`status`, en inni í function eru tvö `COUNT(*)` query sem nota ómerkt
`status = 'pending'`.

Staðsetningar í `sql/63_switch_loan_role.sql`:

- `lines 200-203`: `FROM public.loan_invitations` með ómerktu `loan_id` og
  `status`
- `lines 262-265`: sama mynstur aftur

Þetta þarf að verða t.d.:

```sql
SELECT COUNT(*) INTO v_pending_count
FROM public.loan_invitations inv
WHERE inv.loan_id = p_loan_id
  AND inv.status  = 'pending';
```

Claude Code á að yfirfara alla `switch_loan_role` function fyrir sambærileg
ómerkt dálkanöfn sem gætu rekist á output params eða PL/pgSQL breytur.
Sérstaklega: `status`, `item_name`, `counterpart_user_id`,
`pending_user_ids`, `id`, `loan_id`.

Ekki breyta return contract nema ný rýni fari fram. App-kóðinn býst við:

```ts
{
  status: string
  item_name: string | null
  counterpart_user_id: string | null
  pending_user_ids: string[] | null
}
```

---

## SQL64 scope

SQL64 á að vera lítil og afmörkuð:

- `DROP FUNCTION IF EXISTS public.switch_loan_role(uuid, uuid);`
- `CREATE OR REPLACE FUNCTION public.switch_loan_role(...)`
- Halda sama return type og grants og SQL63.
- Halda sama access model og SQL63:
  - actual party: `lender_user_id` eða `borrower_user_id`
  - pending recipient með canonical email match
  - enginn nýr tölvupóstur
  - pending boð má snúa óháð `expires_at`
  - ambiguous multiple pending invitations skila `invalid_state`
- Ekki snerta `get_loan_for_pending_recipient` nema rýni sýni raunverulega
  villu þar.
- Engin gagnabreyting á að gerast þegar SQL64 er keyrt; SQL64 endurskapar
  function. Gögn breytast fyrst þegar notandi kallar function eftir patch.

Eftir SQL64 þarf Stebbi, ekki Claude Code, að keyra:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

Síðan þarf að endurtaka örugga rollback-prófið að ofan. Vænt niðurstaða fyrir
núverandi solo loan:

- `status = ok`
- `item_name = Alquila hallarmál`
- `counterpart_user_id = null`
- `pending_user_ids = null` eða tómt array

Þar sem prófið er inni í `BEGIN` / `ROLLBACK` á það ekki að skilja eftir
gagnabreytingu.

---

## Blocker 2 - UI er tvítekið og ljótt

Stebbi benti á að detail-síðan sýnir nú:

- undir nafni hlutar í `LoanCard`: `Ég lánaði`
- strax fyrir neðan í sér `SwitchRoleButton`: aftur `Ég lánaði`
- síðan takka: `Breyta í: Ég fékk lánað`

Þetta er of þungt og endurtekið fyrir svona litla leiðréttingaraðgerð.

Núverandi staðsetningar:

- `components/loans/LoanCard.tsx`: role texti er þegar sýndur í header línu
  undir item name.
- `components/loans/SwitchRoleButton.tsx`: sýnir sama current-role texta aftur.
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`: renderar `SwitchRoleButton`
  sem sér blokk beint undir `LoanCard`.

Claude Code á að laga þetta UI samhliða patchinum, en halda breytingunni lítilli.

Tillaga:

- Ekki sýna current-role texta í `SwitchRoleButton`; `LoanCard` gerir það nú þegar.
- Gera aðgerðina að lítilli secondary action, t.d. `Leiðrétta hlutverk` eða
  `Leiðrétta í: Ég fékk lánað`, án þess að endurtaka fyrirsögn/role línu.
- Best er að aðgerðin falli inn í núverandi LoanCard-flötinn, ekki sem nýtt
  spjald og ekki sem kort inni í korti.
- Ef einfaldast er að halda sér component, þá má `LoanCard` fá optional slot
  eða detail-síðan setja componentið í mjög létta, óinnrammaða röð sem lítur út
  eins og hluti af LoanCard-samhenginu.
- Villuskilaboð mega birtast við takkann, en ekki valda láréttu overflowi eða
  stórum layout shift á mobile.
- Loading state þarf að halda stöðugri stærð og ekki breyta textabreidd.
- Allur nýr eða breyttur notendatexti fer í `messages/is.json` og
  `messages/en.json`.

Möguleg íslensk orð:

- Aðaltakki: `Leiðrétta hlutverk`
- Ef target-role á að koma fram: `Leiðrétta í: Ég fékk lánað` /
  `Leiðrétta í: Ég lánaði`
- Error má áfram vera stutt: `Tókst ekki að breyta hlutverki. Reyndu aftur.`

Ekki nota feature flag fyrir þetta. Stebbi hefur sérstaklega sagt að hann vilji
ekki feature flag í þessu flæði.

---

## Design.md viðmið

Viðeigandi kaflar sem Claude Code á að fylgja:

- `Design.md` mobile app-upplifun: 360/390/460px, ekkert horizontal overflow,
  enginn óvæntur zoom, touch targets almennt minnst 40x40 px.
- `Design.md` Cards: LoanCard er samþykkt feature-mynstur; ekki setja kort inni
  í kort.
- `Design.md` loading/navigation: takkar mega ekki virðast dauðir; pending state
  þarf að vera sýnilegt og ekki valda layout shift.

Þessi breyting er á detail-síðu hlutar og þarf að líta út eins og app í farsíma,
ekki eins og ný stillingablokk sem hangir utan á spjaldinu.

---

## Error logging

`lib/loans/actions.ts` loggar nú bara:

```ts
console.error('[loans/switchLoanRole] RPC failed')
```

Það gerði þessa villu óþarflega erfiða að greina úr browser/UI.

Claude Code má bæta server-side logging þannig að villukóði og message sjáist í
dev/server logs, án þess að senda þau til client og án þess að logga netföng eða
notendagögn. Dæmi:

```ts
console.error('[loans/switchLoanRole] RPC failed', {
  code: error.code,
  message: error.message,
  details: error.details,
})
```

Client-skilaboðin mega áfram vera almenn.

---

## Prófanir sem Claude Code á að uppfæra eða bæta við

Lágmark:

- Uppfæra static SQL test í `lib/__tests__/sql-migration.test.ts` svo það grípi
  þetta mynstur: `FROM public.loan_invitations` + ómerkt `status = 'pending'`
  inni í `switch_loan_role`.
- Prófa að SQL64 heldur return contract óbreyttu.
- Prófa að app action heldur áfram að lesa `pending_user_ids` sem array.
- Uppfæra UI tests ef þau ná yfir `SwitchRoleButton` eða Loan detail rendering.
- Keyra:
  - `npm run type-check`
  - viðeigandi Vitest tests, helst loan/action/sql tests
  - `npm run build` ef breytingin snertir server actions eða route component mikið

Claude Code á ekki að keyra SQL64 á Supabase nema Stebbi biðji sérstaklega um
það.

---

## Localhost checks for Stebbi

Eftir að Claude Code hefur skilað patchi og Codex/Stebbi hafa rýnt:

1. Keyra SQL64 í Supabase SQL editor.
2. Keyra schema reload:

```sql
SELECT pg_notify('pgrst', 'reload schema');
```

3. Keyra rollback-prófið:

```sql
BEGIN;

SELECT *
FROM public.switch_loan_role(
  '9321ee0e-910d-4ac8-ba95-dab905bda264'::uuid,
  'b48f0e6c-131a-449d-ac95-d731c9b97738'::uuid
);

ROLLBACK;
```

4. Vænt niðurstaða: `status = ok`, engin SQL-villa.
5. Opna localhost detail-síðu fyrir sama hlut:
   `/auth-mvp/lanad-og-skilad/b48f0e6c-131a-449d-ac95-d731c9b97738`
6. Staðfesta UI:
   - `Ég lánaði` eða `Ég fékk lánað` birtist ekki tvítekið.
   - role switch aðgerðin er nett, skýr og í samhengi við lánaspjaldið.
   - enginn láréttur overflow á 360/390/460px.
7. Smella á role switch.
8. Vænt niðurstaða:
   - aðgerðin tekst
   - síðan refreshast
   - hlutverkið snýst
   - `Saga hlutarins` fær `Hlutverki breytt: Alquila hallarmál`
   - enginn nýr tölvupóstur fer út
9. Smella aftur til baka ef þarf og staðfesta að hægt sé að snúa í báðar áttir.
10. Prófa með pending invitation síðar, ef Stebbi er með öruggt test-gagnasett.

Varúð:

- Ekki prófa á production hlutum með raunverulegum mótaðilum nema Stebbi vilji
  það sérstaklega.
- Rollback-prófið má nota til að sannreyna SQL án þess að breyta gögnum.
- Raunverulegt UI-click utan rollback mun breyta `loan_items` og skrifa event í
  `recent_events`.

---

## Tillaga að næsta skrefi

Claude Code geri fyrst SQL64 patch og litla UI-polish breytingu, skili síðan
handoffi til Codex með:

- hvaða SQL var skrifað
- hvort SQL var keyrt eða ekki
- hvaða UI-skrár breyttust
- hvaða tests voru keyrð
- hvernig Stebbi á að prófa SQL64 og localhost áður en útgáfa fer áfram
