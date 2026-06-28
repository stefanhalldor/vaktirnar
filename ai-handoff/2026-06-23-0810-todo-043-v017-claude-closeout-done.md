# TODO #43 v017 - Closeout: Gmail canonical + soft-ack verification

**Fra:** Claude Code
**Til:** Stebbi / Codex
**Dagsetning:** 2026-06-23 08:10
**Commit:** 1b04e54
**Stada:** Verifikation lokid. Engar koda-breytingar nema 3 ny tests.

---

## Niðurstaða: #43 er tilbúið til að loka

Allar lykileiginleikar staðfestar in-code. Localhost/prod confirmation
eftir Stebbi (sjá neðar).

---

## 1. SQL og TS helper samhæfi

### normalize_email_canonical (SQL) vs normalizeEmailForAccess (TS)

Báðar útfærslur gera:
- `gmail.com` og `googlemail.com`: fjarlægja punkta úr local-part,
  normalize domain to `gmail.com`
- Aðrar lénur: trim + lowercase aðeins (punktar eru marktækir)
- NULL/tómt: SQL STRICT (NULL in → NULL out), TS skilar null

Smávægilegar munir sem skipta ekki máli í reynd:
- SQL notar `split_part(... '@', 2)` (split á fyrsta @), TS notar
  `lastIndexOf('@')`. Gildir aðeins fyrir ógildar netfangs-strengi með
  fleiri en eitt @, sem eru aldrei til í auth.users.
- TS hafnar `user@localhost` (lén án punkts), SQL skilar því óbreytt.
  Notendur hafa alltaf rétt netfang í auth.users.
- TS hafnar all-dots local-part (`...@gmail.com`), SQL myndi skila
  `@gmail.com`. Slík netföng geta ekki verið í auth.users.

**Niðurstaða: helperarnir eru virkt samhæfðir fyrir öll raunveruleg gildi.**

### Staðfestar reglur

| Scenario | SQL canonical | TS canonical | Match |
|---|---|---|---|
| `fyrri.seinni@gmail.com` | `fyrriseinni@gmail.com` | `fyrriseinni@gmail.com` | ✓ |
| `fyrriseinni@gmail.com` | `fyrriseinni@gmail.com` | `fyrriseinni@gmail.com` | ✓ |
| `fyrri.seinni@googlemail.com` | `fyrriseinni@gmail.com` | `fyrriseinni@gmail.com` | ✓ |
| `annad@example.com` | `annad@example.com` | `annad@example.com` | ✓ |
| `fyrri.seinni@example.com` | `fyrri.seinni@example.com` | `fyrri.seinni@example.com` | ✓ (dots significant) |

---

## 2. get_my_loans Branch 2

Branch 2 WHERE:
```sql
WHERE public.normalize_email_canonical(inv.recipient_email_normalized) = v_actor_norm
  AND inv.status = 'pending'
  AND (li.lender_user_id   IS DISTINCT FROM p_actor_id)
  AND (li.borrower_user_id IS DISTINCT FROM p_actor_id)
```

- Normalized á báðar hliðar: dotted invitation finnst af undotted actor. ✓
- Engin `expires_at` sía: expired-link pending rows eru enn sýnileg. ✓
- `NULL::text` á `recipient_email` dálk: recipient ser ekki sitt eigið
  netfang í þessari branch. ✓

---

## 3. claim_loan_invitation

```sql
IF v_inv.status = 'accepted' THEN RETURN 'already_claimed'; END IF;
IF v_inv.status != 'pending' THEN RETURN 'not_claimable';   END IF;

v_actor_norm     := public.normalize_email_canonical(v_actor_email);
v_recipient_norm := public.normalize_email_canonical(v_inv.recipient_email_normalized);

IF v_actor_norm IS NULL OR v_actor_norm IS DISTINCT FROM v_recipient_norm THEN
  RETURN 'wrong_email';
END IF;
```

- Engin `expires_at` sía: `pending` invitation sem hefur runnið út á
  email-link er enn claimable. ✓
- NULL-safe `IS DISTINCT FROM` check. ✓
- Wrong-email verndar: canonical mismatch skilar `wrong_email`. ✓

---

## 4. get_my_pending_invitations

Heldur `expires_at > now()` síunni meðvitað - þetta er email-link-only
fallið. Soft-ack flæðið er í `get_my_loans` Branch 2. ✓

Heimasíðan notar **ekki** `get_my_pending_invitations` lengur fyrir
badge (breytt í v015/v016, commit 896fe4f). Badge notar `get_my_loans`
og telur `requires_acknowledgement && invitation_status === 'pending'`.

---

## 5. claimInvitation TypeScript action

```typescript
export async function claimInvitation(invitationId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()
  const admin = getAdmin()
  const { data, error } = await admin.rpc('claim_loan_invitation', { ... })
  ...
}
```

Engin `expires_at` check á TypeScript-lagi. Allt er delegated á SQL. ✓

---

## Skrár skoðaðar

- `sql/56_normalize_email_canonical.sql`
- `lib/auth/email-normalization.ts`
- `lib/loans/actions.ts` (claimInvitation)
- `lib/__tests__/sql-migration.test.ts`
- `lib/__tests__/email-normalization.test.ts`
- `lib/__tests__/loans.test.ts`
- `lib/__tests__/actions.test.ts`

---

## Skrár breyttar

Aðeins `lib/__tests__/sql-migration.test.ts` -- bætt við 3 tests:

1. `claim_loan_invitation` í sql/56 hefur **ekki** `expires_at` check
2. `get_my_loans` Branch 2 í sql/56 hefur **ekki** `expires_at` filter
3. `get_my_pending_invitations` í sql/56 **heldur** `expires_at > now()` filter

---

## Tests keyrðir

```
npx vitest run lib/__tests__/sql-migration.test.ts   → 109/109 pass
npx vitest run                                        → 1266/1266 pass
git push                                              → 1b04e54
```

---

## SQL var ekki keyrt

Engar SQL functions breyttar. Engar DB töflur breyttar. Stebbi þarf
ekki að keyra neitt í Supabase fyrir þessa handoff.

---

## Localhost checks sem Stebbi þarf að gera

Þetta eru handvirkir kannanir sem tölvupróf geta ekki prófað (krefst
raunverulegs auth/Supabase state):

**A. Dotted Gmail invitation → undotted Gmail login:**
1. Sender creates loan with recipient `fyrri.seinni@gmail.com`.
2. Recipient logs in as `fyrriseinni@gmail.com`.
3. Open `/auth-mvp/lanad-og-skilad`.
4. Vænt: pending row birtist, `Þekki málið` hnappur til.

**B. Undotted Gmail invitation → dotted Gmail login:**
- Sama og A en í öfugri átt.

**C. Googlemail invitation → Gmail login:**
- Invitation: `fyrri.seinni@googlemail.com` / Login: `fyrriseinni@gmail.com`
- Vænt: pending row birtist, claimable.

**D. Non-Gmail dot verndar:**
- Invitation: `fyrri.seinni@example.com` / Login: `fyrriseinni@example.com`
- Vænt: row birtist **ekki**, cannot claim.

**E. Pending soft-ack claim eftir email-link expiry:**
- Invitation með `expires_at` í fortíðinni, `status = 'pending'`.
- Recipient opnar `/auth-mvp/lanad-og-skilad`, smellir á `Þekki málið`.
- Vænt: claim tekst, lán verður sameiginlegt.
- Athugið: Þú þarft gamalt lán með expired email-link til að prófa þetta.
  Ekki breyta production gögnum án samþykkis. Ef engin slík row er til,
  er þetta item tillaga til framtíðar.

**F. Wrong-email verndar:**
- Invitation tilheyrir einum notanda, annar notandi reynir að claim-a.
- Vænt: kemur `wrong_email` villa, ekkert leakast.

---

## Tillaga: #43 er tilbúið til DONE

Öll lykileiginleikar eru:
- Prófuð í static SQL tests (sql/56)
- Prófuð í TS unit tests (email-normalization)
- Staðfest í kóðagreiningu (claimInvitation, get_my_loans, getRelationshipLoanActivity)

Ef Stebbi staðfestir localhost checks A-D og #43 blocker-mál eru ekki
aðrar bilanir sem hann sér, mæli ég með að flytja #43 í DONE.
