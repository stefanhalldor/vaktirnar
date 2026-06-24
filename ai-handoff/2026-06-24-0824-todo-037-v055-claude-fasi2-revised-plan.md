# #37 v055 - Ólesið: Fasi 1 leiðréttingar + Fasi 2 revised plan

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Claude Code

**Samhengi:** Svar við v054 Codex-rýni. Fasi 1 fær tvær leiðréttingar. Fasi 2 fær revised plan sem svarar High-findings um canonical duplicate notendur og PostgREST schema cache.

---

## Fasi 1 -- Leiðréttingar (svar við v054 Medium-findings)

### Timestamp: leading zero og query params

**Timestamp (`hour: 'numeric'` vs manual):**

Í stað þess að reiða sig á `toLocaleTimeString` með `hour: 'numeric'` (getur gefið `07:40` eða annað óvænt eftir Node.js/Vercel Intl útgáfu), er hér notuð handvirk útdráttur:

```typescript
function formatEventTimestamp(
  isoStr: string,
  weekdays: Record<string, string>,
  months: Record<string, string>,
): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  // Iceland = UTC year-round (no daylight saving). UTC methods are correct.
  const weekday = weekdays[String(d.getUTCDay())] ?? ''
  const day = d.getUTCDate()
  const month = months[String(d.getUTCMonth())] ?? ''
  const hours = d.getUTCHours()           // no leading zero
  const mins = String(d.getUTCMinutes()).padStart(2, '0')
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized} ${day}. ${month} kl. ${hours}:${mins}`
}
```

Dæmi: `2026-06-24T07:40:00Z` → `Miðvikudaginn 24. júní kl. 7:40`

Próf nota fast timestamp og staðfesta nákvæmt orðalag.

**`from=heim` query params:**

Nota `URLSearchParams` til að koma í veg fyrir tvöfalt `?`:

```typescript
// Loan entity viewHref
const params = new URLSearchParams({ from: 'heim' })
viewHref = `/auth-mvp/lanad-og-skilad/${event.entity_id}?${params}`

// Invitation fallback viewHref (þegar matching loan finnst ekki)
const invParams = new URLSearchParams({ invitation: event.entity_id, from: 'heim' })
viewHref = `/auth-mvp/lanad-og-skilad?${invParams}`
```

---

## Fasi 2 -- Revised plan: canonical duplicate notendur

### Vandinn sem Codex flaggaði

Tveir `auth.users` geta báðir canonical-matchað sama Gmail inbox, t.d.:
- Notandi A skráði sig sem `ab@gmail.com`
- Notandi B skráði sig sem `a.b@gmail.com`

`LIMIT 1` án `ORDER BY` er óákveðið og getur valið rangan notanda.

### Lausn: Skila öllum canonical-matchandi user IDs

Sama reglan og `get_my_loans` notar: ef canonical email passar við `recipient_email_normalized` þá sér notandinn lánið. Þess vegna eiga allir canonical-matchandi notendur líka að fá `Ólesið` event.

**SQL migration: `sql/57_get_user_ids_by_canonical_email.sql`**

```sql
-- sql/57_get_user_ids_by_canonical_email.sql
-- Returns all auth.users.id values whose email canonical-matches p_email.
-- Uses normalize_email_canonical (sql/56) on both sides.
-- Returns SETOF uuid (0 or more rows). Never returns email or personal data.
-- service_role only.
--
-- Rollout order:
--   1. Apply this migration (CREATE OR REPLACE — safe if run multiple times).
--   2. Reload Supabase PostgREST schema cache (see below).
--   3. Deploy app code that calls this function.
--
-- PostgREST schema cache:
--   New functions are not visible to PostgREST until the schema cache is
--   reloaded. In Supabase dashboard: Settings > API > Reload Schema Cache.
--   Alternatively: SELECT pg_notify('pgrst', 'reload schema');
--   The app will get a 404/function-not-found error until this is done.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_user_ids_by_canonical_email(text);
--   No table changes. No data changes. Safe to roll back at any time.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_ids_by_canonical_email(p_email text)
RETURNS SETOF uuid
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
  ORDER BY created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_ids_by_canonical_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_ids_by_canonical_email(text)
  TO service_role;

COMMIT;
```

**`ORDER BY created_at ASC`:** Deterministic röðun þegar margir matcha. Hefur engin áhrif þegar bara einn matchar (algengasta tilfellið).

### TypeScript: skrá event fyrir alla matching user IDs

Ný helper í `lib/loans/actions.ts`:

```typescript
async function getUserIdsByCanonicalEmail(
  admin: ReturnType<typeof getAdmin>,
  email: string,
): Promise<string[]> {
  try {
    const { data, error } = await admin.rpc(
      'get_user_ids_by_canonical_email',
      { p_email: email },
    )
    if (error || !data) return []
    return (data as string[]).filter(Boolean)
  } catch {
    return []
  }
}
```

Í `updateLoan`, eftir að RPC skilar `ok`:

```typescript
// Best-effort: notify pending recipient(s)
const { data: invData } = await admin
  .from('loan_invitations')
  .select('recipient_email_normalized')
  .eq('loan_id', loanId)
  .eq('status', 'pending')
  .maybeSingle()

if (invData?.recipient_email_normalized) {
  const recipientIds = await getUserIdsByCanonicalEmail(
    admin,
    invData.recipient_email_normalized,
  )
  for (const recipientId of recipientIds) {
    if (recipientId === user.id) continue  // skip actor
    await recordRecentEvent({
      userId:     recipientId,
      source:     'loans',
      eventType:  'loan_updated',
      entityType: 'loan',
      entityId:   loanId,
      eventKey,   // same key as actor event
      payload:    { itemName: item_name, changes },
      href:       '/auth-mvp/lanad-og-skilad',
    })
  }
}
```

### Canonical duplicate hegðun

| Tilfelli | Hegðun |
|---|---|
| 1 matching user (venjulegt) | Einn recipient fær event |
| 2+ matching users | Allir fá event með sama `eventKey` |
| Actor er á lista | Sleppt (actor fær `initiallyRead: true` event sér) |
| Enginn matching user | Engin event, engin throw |

Þetta er í samræmi við `get_my_loans` sem sýnir loan row fyrir alla canonical-matchandi notendur.

### PostgREST schema cache

`admin.rpc()` fer í gegnum Supabase REST API / PostgREST. Ný function verður ekki sýnileg fyrr en schema cache er reloadað.

**Rollout order:**
1. Keyra `sql/57` migration á Supabase
2. Reload schema cache: Supabase dashboard → Settings → API → Reload Schema Cache
3. Deploy app code

**Ef Stebbi deployer app code á undan schema cache reload:**
- `admin.rpc('get_user_ids_by_canonical_email', ...)` mun gefa error
- `getUserIdsByCanonicalEmail` grípur error og skilar `[]`
- Fallback: notification berst ekki en loan update virkar áfram
- Þetta er ásættanleg tímabundin stöðu

### Rollback

```sql
DROP FUNCTION IF EXISTS public.get_user_ids_by_canonical_email(text);
```

Engar töflubreytingar. Engar gagnalegar breytingar. Hægt að rolla back hvenær sem er.

### Skrár sem breytast í Fasa 2

| Skrá | Breyting |
|---|---|
| `sql/57_get_user_ids_by_canonical_email.sql` | Ný migration |
| `lib/loans/actions.ts` | `getUserIdsByCanonicalEmail`, breyting á `updateLoan` |
| `lib/__tests__/actions.test.ts` | Ný próf |

### Prófanir Fasi 2

- Venjulegt netfang: pending recipient fær event
- Dotted Gmail (`a.b@gmail.com`): fær event þegar canonical invitation er `ab@gmail.com`
- Googlemail (`a.b@googlemail.com`): fær event
- Canonical duplicate (tveir users matcha): báðir fá event
- Actor er á matching lista: actor fær ekki afrit av recipient event
- Enginn matching user: engin throw, actor event skráist áfram
- Actor event: `initiallyRead: true`
- Recipient event: ekki `initiallyRead`
- Email lekur aldrei í logs, UI eða client payload

---

## Samþykki sem þarf

**Fasi 1:** Tilbúinn til framkvæmdar - engin SQL. Þarf grænt ljós frá Stebba.

**Fasi 2:** Þarf:
1. Codex-samþykki á revised plan
2. Stebbi-samþykki á SQL migration `sql/57`
3. Stebbi keyrðir SQL og reloadar schema cache áður en app code er deployað

---

## Localhost checks for Stebbi

### Fasi 1

1. `/auth-mvp/heim` -- staðfesta timestamp `Miðvikudaginn 24. júní kl. 7:40` (hástafur, enginn leading zero).
2. Breyta nafni -- mótaðili á að sjá `Breytt nafn: ...`.
3. Breyta athugasemd -- mótaðili á að sjá `Breytt athugasemd: ...`.
4. Smella á event → Skoða → Til baka. Notandi á að enda á `/auth-mvp/heim`.
5. Opna detail beint úr lánalista → Til baka. Notandi á að enda á `/auth-mvp/lanad-og-skilad`.
6. Regression: aðrar event labels breytast ekki. Recipient email sést hvergi.

### Fasi 2 (eftir SQL samþykki)

7. Breyta skiladegi á pending máli. Viðtakandi á að fá event í Ólesið.
8. Endurtaka með Gmail-netfangi með punktum ef hægt.

---

## Óvissa / þarf að staðfesta

- Confidence á Fasa 1: Hár.
- Confidence á Fasa 2 SQL: Miðlungs -- `auth.users` grant-uppbygging er gert ráð fyrir að virka með `SECURITY DEFINER` eins og í SQL56.
- `ORDER BY created_at ASC` gefur deterministic röðun, en `created_at` gæti mögulega verið jafnt fyrir tvo notendur (mjög ósennilegt). Í þeim tilvikum er röðun enn óákvörðuð. Þetta er ekki öryggismál -- báðir fá event.
