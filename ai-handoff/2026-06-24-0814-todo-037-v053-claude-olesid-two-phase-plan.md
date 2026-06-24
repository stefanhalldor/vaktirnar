# #37 v053 - Ólesið: tveggja fasa framkvæmdaplan

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Claude Code

**Samhengi:** Eftir v052 Codex-rýni er planið klofið í tvo fasa. Fasi 1 (no-SQL) má framkvæma strax. Fasi 2 (pending-recipient notification) þarf SQL migration og sérstakt samþykki.

---

## Fasi 1 -- No-SQL pakki (vandamál 2, 4, 5)

### Hvað er gert

**Vandamál 2 -- Nákvæmari event labels:**

Nýir i18n-lyklar í `messages/is.json` og `messages/en.json`:

| Lykill | Íslenska | Enska |
|---|---|---|
| `eventLoanUpdatedName` | `Breytt nafn: {itemName}` | `Name updated: {itemName}` |
| `eventLoanUpdatedNote` | `Breytt athugasemd: {itemName}` | `Note updated: {itemName}` |
| `eventLoanUpdatedDueAt` | `Breyttur skiladagur: {itemName}` | `Return date updated: {itemName}` |
| `eventLoanUpdatedLoanedAt` | `Breytt lánsdagsetning: {itemName}` | `Loan date updated: {itemName}` |

`eventLoanUpdated` heldur óbreyttur sem fallback fyrir blandaðar breytingar.

Ný `pickLoanUpdatedLabelKey(changes)` function í `app/auth-mvp/heim/page.tsx`:
- 0 eða fleiri breytingar: `eventLoanUpdated`
- Nákvæmlega 1 breyting, field = `item_name`: `eventLoanUpdatedName`
- Nákvæmlega 1 breyting, field = `note`: `eventLoanUpdatedNote`
- Nákvæmlega 1 breyting, field = `due_at`: `eventLoanUpdatedDueAt`
- Nákvæmlega 1 breyting, field = `loaned_at`: `eventLoanUpdatedLoanedAt`

**Vandamál 4 -- `from=heim` back-navigation:**

Í `app/auth-mvp/heim/page.tsx`: `viewHref` fær `?from=heim` suffix.

Í `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`:
- `searchParams` tekið inn
- `from === 'heim'` → back-href = `/auth-mvp/heim`
- Annað → back-href = `/auth-mvp/lanad-og-skilad`
- Back-label: sama `backToList` lykill í báðum tilfellum (scope-einfaldun)
- `from=heim` varðveitist EKKI í gegnum edit-flow (out-of-scope)
- Óþekktur `from` gildi → fallback á `/auth-mvp/lanad-og-skilad`

**Vandamál 5 -- Timestamp undir event label:**

`RecentEventDisplay` fær `occurredAtLabel: string` (ekki raw ISO string).

`formatEventTimestamp(isoStr, weekdays, months)` fall í `heim/page.tsx`:
- Notar `toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })` til að fá local date tölur (dag, mánuð, ár) í Reykjavik tíma
- Sækir íslenskt vikudagsheiti úr `messages/weekdays` og mánaðarheiti úr `messages/months`
- Hástafar fyrsta staf á vikudeginum: `charAt(0).toUpperCase() + rest`
- Tímasnið: `HH:MM` úr `toLocaleTimeString('sv-SE', { timeZone: 'Atlantic/Reykjavik', hour: '2-digit', minute: '2-digit', hour12: false })`
- Lokastrengur: `Miðvikudaginn 24. júní kl. 7:40`

`RecentSection.tsx`: bætir `occurredAtLabel` undir `event.label` sem `text-xs text-muted-foreground`.

### Skrár sem breytast í Fasa 1

| Skrá | Breyting |
|---|---|
| `lib/recent-events/types.ts` | Bæta `occurredAtLabel: string` við `RecentEventDisplay` |
| `app/auth-mvp/heim/page.tsx` | `occurredAtLabel`, `pickLoanUpdatedLabelKey`, `formatEventTimestamp`, `viewHref?from=heim` |
| `app/auth-mvp/heim/RecentSection.tsx` | Birta `occurredAtLabel` undir label |
| `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` | `searchParams`, back-href logic |
| `messages/is.json` | 4 nýir event label-lyklar |
| `messages/en.json` | 4 nýir event label-lyklar |
| `lib/__tests__/home-page.test.tsx` | Ný próf |
| `lib/__tests__/loan-pages.test.tsx` | Ný próf |

### Ekki breytt í Fasa 1

- `lib/loans/actions.ts`
- SQL, RPC, RLS, grants, auth
- `TODO.md`, `DONE.md`

### Prófanir Fasi 1

```
npm run type-check
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx
```

Ný próf staðfesta:
- `loan_updated` eitt `item_name` change → `Breytt nafn: ...`
- `loan_updated` eitt `note` change → `Breytt athugasemd: ...`
- `loan_updated` eitt `due_at` change → `Breyttur skiladagur: ...`
- `loan_updated` eitt `loaned_at` change → `Breytt lánsdagsetning: ...`
- Blandaðar breytingar → `Breytt: ...`
- `occurredAtLabel` með fast timestamp `2026-06-24T07:40:00Z` gefur `Miðvikudaginn 24. júní kl. 7:40`
- `?from=heim` → back-href = `/auth-mvp/heim`
- Engin `from` → back-href = `/auth-mvp/lanad-og-skilad`
- `?from=annad` → fallback `/auth-mvp/lanad-og-skilad`
- Recipient email birtist ekki í label eða drawer

---

## Fasi 2 -- Pending-recipient notification (vandamál 1)

### Vandinn

`loan_invitations` geymir `recipient_email_normalized` í canonical Gmail-formi eftir SQL56. `lookupUserIdByEmail` notar `getUserByEmail` (exact match á `auth.users.email`). Gmail-notendur sem skráðu sig með punkta (`a.b@gmail.com`) eru stored sem `a.b@gmail.com` í `auth.users.email`, en canonical form í invitation er `ab@gmail.com`. Exact lookup finnur þá ekki.

### Lausn

Ný SQL function `public.lookup_user_id_by_canonical_email(p_email text)` sem leitar með canonical samanburð á báðum hliðum.

**SQL migration: `sql/57_lookup_user_by_canonical_email.sql`**

```sql
-- sql/57_lookup_user_by_canonical_email.sql
-- Lookup auth.users.id by canonical email.
-- Uses normalize_email_canonical (from sql/56) on both sides so that
-- dotted Gmail and Googlemail registrations match canonical invitations.
-- Returns NULL if no match. Never returns email or personal data.
-- service_role only — not accessible to anon or authenticated.

BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_user_id_by_canonical_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE public.normalize_email_canonical(email)
      = public.normalize_email_canonical(p_email)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_user_id_by_canonical_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lookup_user_id_by_canonical_email(text)
  TO service_role;

COMMIT;
```

**TypeScript:**

Ný helper í `lib/loans/actions.ts`:

```typescript
async function lookupUserIdByCanonicalEmail(
  admin: ReturnType<typeof getAdmin>,
  email: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc(
      'lookup_user_id_by_canonical_email',
      { p_email: email },
    )
    if (error || !data) return null
    return data as string
  } catch {
    return null
  }
}
```

Í `updateLoan`: eftir RPC `update_loan_with_diff` skilar `ok`, sækja pending invitation og kalla `lookupUserIdByCanonicalEmail`.

**Grants og öryggi:**
- `service_role` only -- sama pattern og `normalize_email_canonical`
- SECURITY DEFINER með `SET search_path = ''` -- sama pattern og SQL56
- Skilar UUID eða NULL -- aldrei email eða persónugögn
- STRICT -- NULL input skilar NULL
- Enginn aðgangur fyrir `anon` eða `authenticated`

**Áhrif á production:**
- Ný function, engar töflubreytingar, ekkert rollback þarf
- Rollout: keyra SQL, PostgREST þarf ekki reload (RPC kallað úr service_role TypeScript, ekki PostgREST)
- Rollback: DROP FUNCTION (engin gögn í hættu)

**Prófanir Fasi 2 (við framkvæmd):**
- Venjulegt netfang: pending recipient fær event
- Dotted Gmail (`a.b@gmail.com`): pending recipient fær event þegar invitation er `ab@gmail.com`
- Googlemail (`a.b@googlemail.com`): pending recipient fær event
- Notandi finnst ekki: engin throw, actor fær sitt event
- Actor event: `initiallyRead: true`
- Recipient event: ekki `initiallyRead`
- Email lekur aldrei í logs

### Skrár sem breytast í Fasa 2

| Skrá | Breyting |
|---|---|
| `sql/57_lookup_user_by_canonical_email.sql` | Ný migration |
| `lib/loans/actions.ts` | `lookupUserIdByCanonicalEmail`, breyting á `updateLoan` |
| `lib/__tests__/actions.test.ts` | Ný próf |

---

## Samþykki sem þarf

**Fasi 1:** Má framkvæma eftir Codex/Stebbi samþykki -- engin SQL.

**Fasi 2:** Þarf sérstaklega:
1. Samþykki Stebba á SQL migration `sql/57`
2. Staðfesting á að Stebbi keyrja SQL á Supabase eftir deploy

---

## Localhost checks for Stebbi

**Fasi 1 (no-SQL):**

1. `/auth-mvp/heim` sem innskráður notandi -- staðfesta timestamp undir hverju event, t.d. `Miðvikudaginn 24. júní kl. 7:40`, án lárétts overflow á 360-460 px.
2. Breyta nafni á hlut. Mótaðili á að sjá `Breytt nafn: ...` í Ólesið.
3. Breyta athugasemd. Mótaðili á að sjá `Breytt athugasemd: ...`.
4. Smella á event í Ólesið → Skoða → Til baka. Notandi á að enda á `/auth-mvp/heim`.
5. Opna detail beint úr lánalista → Til baka. Notandi á að enda á `/auth-mvp/lanad-og-skilad`.
6. Regresja: `loan_returned`, `loan_invitation_received`, önnur labels breytast ekki.
7. Regresja: recipient email sést hvergi í Ólesið eða console.

**Fasi 2 (eftir SQL):**

8. Breyta skiladegi á máli þar sem viðtakandi hefur ekki smellt "Þekki málið". Skrá inn sem viðtakandi og staðfesta event í Ólesið.
9. Sama próf með Gmail-netfang með punktum ef mögulegt.

---

## Óvissa / þarf að staðfesta

- Confidence: Hár á Fasa 1. Miðlungs á Fasa 2 SQL -- Claude Code hefur ekki séð alla `auth.users` grant-uppbyggingu, en `SECURITY DEFINER` + `SET search_path = ''` + `service_role` only er staðlað mynstur í þessum kóðagrunni.
- `toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })` á Vercel Node.js: þarf að staðfesta að þetta virki í prófum. Ef það gefur óvænt gildi í test-umhverfi þarf fallback á UTC-útdrátt (Island = UTC).
