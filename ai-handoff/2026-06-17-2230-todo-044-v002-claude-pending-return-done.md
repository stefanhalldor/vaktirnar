# TODO #44 — Merkja hlut skilaðan áður en mótaðili þekkir málið

**Agent:** Claude Code
**Fyrir:** Stebbi (localhost-prófun og samþykki fyrir commit)
**Dagsetning:** 2026-06-17
**Staða:** Framkvæmt, bíður localhost-prófunar og SQL-keyrslu
**Tengd TODO:** #44 Merkja hlut skilaðan áður en mótaðili þekkir málið
**Byggir á:** v001-codex-pending-return-handoff

## Hvað var gert

### 1. SQL migration: `sql/51_allow_pending_creator_return.sql`

Ný migration-skrá. Endurskilgreinir `mark_returned` og `undo_return` þannig að
þær krefjast ekki lengur þess að bæði `lender_user_id` og `borrower_user_id` séu
sett. Actor-heimildaathugunin (verður að vera direct participant) helst óbreytt.

Eina breytingin á SQL-rökunni:

```sql
-- Fjarlægt úr báðum föllum:
IF v_loan.lender_user_id IS NULL OR v_loan.borrower_user_id IS NULL THEN
  RETURN 'invitation_not_accepted';
END IF;
```

Migration er í transaction (BEGIN/COMMIT). Engin tafla-, dálka-, RLS- eða
policy-breyting. Grants eru áfram service_role-only.

**Migration er EKKI keyrð.** Stebbi keyrir hana þegar hann er tilbúinn.

### 2. `lib/loans/types.ts` -- `canToggleReturned` bætt við

Nýr boolean í `LoanCardControls`:

```ts
canToggleReturned:
  item.invitation_status === 'accepted' ||
  (item.is_creator && item.invitation_status === 'pending' && !isPendingRecipient)
```

`bothPartiesJoined` er enn til staðar í interface en er ekki lengur notað í
`LoanCard.tsx` (próf sem nota það beint í `loans.test.ts` virka áfram).

### 3. `components/loans/LoanCard.tsx` -- nota `canToggleReturned`

Skipt út `bothPartiesJoined` fyrir `canToggleReturned` í return/undo row:

```tsx
{(canToggleReturned || canDelete) && (
  <div ...>
    {canToggleReturned && (
      !isReturned ? <button>Merkja skilað</button>
                  : <button>Afturkalla</button>
    )}
```

Engar aðrar breytingar á LoanCard.

### 4. Prófanir bætt við

**`lib/__tests__/loans.test.ts`** -- 8 ný próf í `canToggleReturned` describe-blokk:
- Accepted → `true`
- Pending creator (is_creator, ekki requires_acknowledgement) → `true`
- Pending recipient (requires_acknowledgement) → `false`
- Non-creator pending → `false`
- declined/cancelled/expired/null → `false`

**`lib/__tests__/loan-card.test.tsx`** -- 3 ný próf:
- Pending creator sýnir `Merkja skilað`
- Pending recipient sýnir ekki `Merkja skilað`
- Pending creator með `returned_at` sýnir `Afturkalla`

**`lib/__tests__/sql-migration.test.ts`** -- 8 ný static próf fyrir sql/51:
- BEGIN/COMMIT
- CREATE OR REPLACE á báðum föllum
- Engin `invitation_not_accepted` í fallsmeginmáli
- Actor-athugun er enn til staðar
- Grants eru service_role-only

## Niðurstöður prófa og type-check

```
npm run type-check → exit 0
npm run test:run -- lib/__tests__/loans.test.ts
                    lib/__tests__/loan-card.test.tsx
                    lib/__tests__/actions.test.ts
                    lib/__tests__/sql-migration.test.ts
                    lib/__tests__/loan-list.test.tsx
→ 5 test files, 296 passed, 22 skipped, 0 failed
```

## Breyttar skrár

App/UI:
- `components/loans/LoanCard.tsx`

Types og logic:
- `lib/loans/types.ts`

SQL (EKKI keyrt):
- `sql/51_allow_pending_creator_return.sql` (ný skrá)

Prófanir:
- `lib/__tests__/loans.test.ts`
- `lib/__tests__/loan-card.test.tsx`
- `lib/__tests__/sql-migration.test.ts`

## Localhost checks fyrir Stebbi

Stebbi keyrir dev server sjálfur. **SQL migration er EKKI keyrð ennþá.**

---

### MIKILVÆGT: Röð aðgerða

UI-breytingarnar virka þegar ÁN migrations ef production-lánin eru þegar með
báða aðila (accepted). Fyrir pending creator er `canToggleReturned=true` í UI,
en ef migration er ekki keyrð mun server-RPC skila `invitation_not_accepted` og
villa birtist á korti.

**Til að prófa pending-creator return á localhost þarf migration að vera keyrð
á local Supabase.**

Ef Stebbi vill einungis staðfesta UI-útlit og regression á accepted lán, er
migration óþörf á localhost.

---

### Prófunarhluti A: UI á accepted lán (án migrations á localhost)

Slóð: `http://localhost:3000/auth-mvp/lanad-og-skilad`

Skref:

1. Finna lán þar sem báðir aðilar eru skráðir (invitation accepted).
2. Staðfesta að `Merkja skilað` / `Afturkalla` birtist eins og áður.

Vaent:

- Engin regression á accepted lán -- allt virkar eins og áður.

### Prófunarhluti B: UI-útlit pending creator kortsins (án migrations)

Skref:

1. Finna pending creator-kort (boð sent, mótaðili ekki búinn að þekkja málið).
2. Skoða kortið.

Vaent:

- `Merkja skilað` birtist nú á kortinu.
- `Bíður svars` er enn í subtitle.
- `Boð sent`, `Afturkalla boð`, `Eyða` eru enn til staðar.
- `Bíður samþykkis` birtist EKKI.

Ef Stebbi smellir á `Merkja skilað` án migrations mun villa birtast:
`Báðir aðilar þurfa að vera skráðir.` -- það er eðlilegt þar til migration er keyrð.

### Prófunarhluti C: Full virkni (krefst migrations á local Supabase)

**Þetta krefst þess að Stebbi keyri `sql/51_allow_pending_creator_return.sql`
á local Supabase áður en þetta er prófað.**

Þetta þarf sérstakt samþykki og keyrslu frá Stebba.

Eftir migration:

1. Merkja pending hlut skilaðan.
2. Staðfesta að hann birtist undir `Skilað` filter.
3. Smella á `Afturkalla` og staðfesta að pending-staðan haldist.

### Prófunarhluti D: Pending recipient sér ekki return controls

Skref:

1. Skrá inn sem mótaðili sem hefur fengið boð en ekki þekkt málið ennþá.
2. Finna kort með `Þekki málið` / `Kannast ekki við þetta`.

Vaent:

- `Merkja skilað` birtist EKKI á pending recipient korti.
- `Þekki málið` og `Kannast ekki við þetta` birtast eins og áður.

### Regressions sem þarf að passa

- Accepted lán: return/undo virkar áfram eðlilega.
- Pending recipient: ekkert nýtt birtist -- engin regression.
- Declined/cancelled/expired invitation: `Merkja skilað` birtist EKKI.
- `/auth-mvp/heim` með Ólesið-atriðum breytist ekki.

### Hvað á ekki að prófa kæruleysislega

- Ekki keyra migration á production án sérstakrar leyfisbeiðni.
- Ekki breyta production gögnum handvirkt.
- Ekki tengja þetta við #43 Gmail-canonicalization í þessum áfanga.

## Tillaga að næsta skrefi

1. Stebbi staðfestir UI-útlit (Prófunarhluti A + B) án migration.
2. Stebbi ákveður hvort keyra migration á local Supabase til að prófa full virkni.
3. Ef allt er gott: commit UI-breytingarnar (LoanCard, types, prófanir).
4. Stebbi ákveður hvort keyrðu migration á production í sömu útgáfu eða sér.
5. Pushar og fylgist með Vercel build log.
