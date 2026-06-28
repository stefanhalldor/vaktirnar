# 2026-06-28 22:42 — TODO #62 — pending role switch RPC failure

## Til Claude Code

Stebbi er að prófa #62 eftir post-release. Role switch virkar í sumum tilvikum,
en failar í UI á hlut með pending invitation. Þetta þarf þrönga greiningu áður
en við skrifum SQL65.

Mikilvægt: ekki logga eða commit-a raw netföng, live actor IDs eða live loan IDs.
Stebbi hefur exact live gildi í samtalinu ef þau þarf tímabundið í Supabase SQL
editor, en þau eiga ekki heima í kóða, tests eða handoff-skjölum.

## Staðfest hegðun frá Stebba

- Hlutverkabreyting virkaði á hlut sem var með samþykktan mótaðila og var búið
  að skila.
- Hlutverkabreyting failar í UI á hlut sem er með eitt pending lánaboð.
- UI sýnir:
  - `Tókst ekki að breyta hlutverki. Reyndu aftur.`
- Localhost terminal sýnir:
  - `[loans/switchLoanRole] RPC failed`
- Browser console sýnir ekkert gagnlegt um server action villuna.

## Staðfest með SQL editor

Stebbi keyrði read/rollback probe í Supabase SQL editor:

```sql
BEGIN;

SELECT *
FROM public.switch_loan_role(
  '<actor_id>'::uuid,
  '<loan_id>'::uuid
);

ROLLBACK;
```

Niðurstaða var:

```txt
status = ok
item_name = Pallaskrúfugræjan
counterpart_user_id = null
pending_user_ids = []
```

Stebbi skoðaði líka invitation rows fyrir sama loan:

```txt
one row only
status = pending
recipient_role = borrower
invited_by = actor
expires_at in future
```

Þetta bendir sterklega til að `public.switch_loan_role(...)` virki í Postgres
fyrir umrætt live case. Vandinn er því líklega í PostgREST/RPC-kalli frá
Supabase JS eða schema/cache/environment mismatch, ekki í business logic SQL
sem fyrsta grun.

## Núverandi kóði sem þarf að skoða

`lib/loans/actions.ts`, `switchLoanRole`:

```ts
const { data, error } = await admin.rpc('switch_loan_role', {
  p_actor_id: user.id,
  p_loan_id:  loanId,
})

if (error) {
  console.error('[loans/switchLoanRole] RPC failed')
  return { ok: false, error: 'save_failed' }
}
```

Vandinn: loggið felur `error.code`, `error.message`, `error.details` og
`error.hint`, þannig við vitum ekki hvort þetta er schema-cache, return type,
permission, overload, parameter eða annað PostgREST vandamál.

## Verkefni

Byrja á diagnostic patch, ekki SQL65:

1. Uppfæra logging í `switchLoanRole` þannig að það loggi örugga Supabase RPC
   villu:
   - `error.code`
   - `error.message`
   - `error.details`
   - `error.hint`
2. Ekki logga:
   - actor id
   - loan id
   - netfang
   - raw payload
   - cookies eða tokens
3. Halda user-facing villu óbreyttri fyrst.
4. Keyra unit/type/static tests sem eru viðeigandi.
5. Láta Stebba prófa aftur á localhost og paste-a terminal error objectið.
6. Þegar raunverulega villan sést, ákveða hvort þarf:
   - schema reload / project mismatch leiðbeiningu
   - server-action patch
   - SQL65 patch
   - test update

## Líklegar orsakir til að sannreyna

- PostgREST schema cache sér ekki núverandi return shape:
  `pending_user_ids uuid[]`.
- Localhost `.env.local` bendir á annað Supabase project en SQL editorinn sem
  Stebbi prófaði í.
- SQL64 í live DB er ekki sama útgáfa og SQL64 í repo, þrátt fyrir að direct SQL
  probe virki.
- Supabase JS/PostgREST er að kalla function með cached signature eða rangri
  overload.
- Grant/schema cache vandamál: SQL direct call sem `postgres` virkar, en
  service-role RPC gegnum PostgREST failar.

## Ekki gera strax

- Ekki skrifa SQL65 fyrr en PostgREST error liggur fyrir.
- Ekki breyta `switch_loan_role` business logic fyrst; direct SQL probe skilar
  `ok`.
- Ekki veikja grants, RLS eða service-role mörk.
- Ekki bæta live IDs eða netföngum í tests, fixtures eða skjöl.

## Mögulegur kóðapatch

Tillaga, en Claude Code má laga eftir repo-style:

```ts
if (error) {
  console.error('[loans/switchLoanRole] RPC failed', {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
  return { ok: false, error: 'save_failed' }
}
```

Ef lint/test stefna verkefnisins vill ekki object logging í production, notið
öruggan helper sem heldur sömu upplýsingum en ekki sensitive context.

## Localhost checks for Stebbi

Eftir diagnostic patch:

1. Opna localhost edit-síðu fyrir hlut með pending invitation.
2. Smella á `Leiðrétta í: Ég fékk lánað` eða samsvarandi hlutverkabreytingu.
3. Horfa á terminalinn þar sem `npm run dev` keyrir.
4. Vænt niðurstaða í þessum diagnostic áfanga:
   - UI má enn sýna sömu villu.
   - Terminal á nú að sýna `[loans/switchLoanRole] RPC failed` með `code`,
     `message`, `details` og `hint`.
5. Ekki prófa með production SQL update utan `BEGIN`/`ROLLBACK` fyrr en næsta
   plan liggur fyrir.
6. Ekki paste-a netföng, tokens eða cookies í samtalið. Error code/message/hint
   er nóg.

## Spurningar fyrir Codex eftir Claude patch

1. Bendir error objectið á schema cache, grant, wrong project eða function
   signature?
2. Þarf SQL65, eða dugir schema reload / env leiðrétting?
3. Á `switchLoanRole` að halda áfram að mappa allar RPC villur í `save_failed`,
   eða þarf sér user-facing villu fyrir schema/invalid_state?
4. Er rétt að bæta regression test sem tryggir að RPC errors séu logguð með
   non-sensitive diagnostic fields?
