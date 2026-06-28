# Handoff: Loan detail page — deep link og hreinni listi

**Handoff:** Claude Code → Codex
**Dagsetning:** 2026-06-22 07:34
**Tengist TODO:** #51 (nýtt)
**Samhengi:** Stebbi prófaði tengsl-detail og sá að "Opna lán" tengillinn opnar bara forsíðuna á "Lánað og skilað" í stað þess að fara beint í það lán. Það er vegna þess að tengilinn er `/auth-mvp/lanad-og-skilad?id=...` og forsíðan las aldrei þann query param. Lausnin er að búa til loan-detail síðu á `/auth-mvp/lanad-og-skilad/[id]`.

## Hvað er til

```
app/auth-mvp/lanad-og-skilad/
  page.tsx                   ← forsíða: LoanList + LoanCard
  layout.tsx
  loading.tsx
  ny/page.tsx                ← nýtt lán
  breyta/[id]/page.tsx       ← breyta láni (full edit + item details)
  baeta-vid-adila/[id]/page.tsx
  claim/[id]/page.tsx

components/loans/
  LoanCard.tsx               ← 'use client', 383 línur, öll action logic
  LoanList.tsx               ← 'use client', filter/sort UI + LoanCard lista
  LoanShell.tsx              ← layout wrapper
  LoanForm.tsx               ← form fyrir nýtt/breyta lán
  LoanItemDetailsForm.tsx    ← item_name + note edit
  AddPartyForm.tsx
  ClaimForm.tsx
```

**`LoanCard`** er client component með öll action handlers (markReturned, undoReturn, deleteLoan, sendInvitationEmail, cancelInvitation, claimInvitation, declineInvitation). Sýnir núna allar upplýsingar og aðgerðatakka beint á listasíðunni.

**`LoanItem` type** (úr `lib/loans/types.ts`):
```ts
id, item_name, note, loaned_at, due_at, returned_at,
my_role, other_display_name, invitation_id, invitation_status,
invitation_attempt_status, can_send_invitation, is_creator,
requires_acknowledgement
```

## Vandinn sem á að leysa

1. **Engin detail-síða**: Ekkert `/auth-mvp/lanad-og-skilad/[id]` til. Deep links virka ekki.
2. **Tengsl-tengillinn**: `app/stillingar/tengsl/[id]/page.tsx` notar `/auth-mvp/lanad-og-skilad?id=${src.id}` sem skilar aðeins forsíðunni.
3. **LoanCard er of þétt**: Allur kóðinn -- bæði information display og öll action buttons -- er í einum 383-línu client component á listasíðunni.

## Tillaga að útfærslu

### 1. Ny detail-síða: `/auth-mvp/lanad-og-skilad/[id]/page.tsx`

Server component. Sama mynstur og `baeta-vid-adila/[id]/page.tsx`:

```tsx
export default async function LoanDetailPage({ params }) {
  const { id } = await params
  const { user } = await guardLoanAccess()
  const t = await getTranslations('teskeid.loans')

  const { data, error } = await getAdmin().rpc('get_my_loans', { p_actor_id: user.id })
  if (error) { /* show error */ }

  const item = (data as LoanItem[]).find((i) => i.id === id)
  if (!item) notFound()

  // nav: back til lista
  const nav = (
    <Link href="/auth-mvp/lanad-og-skilad">{t('backToList')}</Link>
  )

  return (
    <LoanShell nav={nav} homeLabel={t('homeLink')}>
      <LoanCard item={item} />
    </LoanShell>
  )
}
```

**Athugasemdir:**
- Notast við `get_my_loans` + `.find()` til að sannreyna aðgang -- sama aðferð og önnur síður í þessum flodder. Aldrei sækja lán beint úr `loan_items` án þess.
- `notFound()` ef loan ID finnst ekki eða tilheyrir öðrum.
- Engar nýjar SQL queries þarf.

### 2. Uppfæra tengsl-tengil

Í `app/stillingar/tengsl/[id]/page.tsx`, lína 80 (um það bil):

```tsx
// Núverandi (virkar ekki):
href={`/auth-mvp/lanad-og-skilad?id=${src.id}`}

// Á að vera:
href={`/auth-mvp/lanad-og-skilad/${src.id}`}
```

Þetta er eina breyting sem þarf í tengsl til að deep links virki.

### 3. LoanCard á listasíðunni — gera heiti klikkanlegt

Í `LoanCard.tsx`, línur ~191--197, er `item_name` sýnd sem `<p>`. Gera þetta að `<Link>` í stað:

```tsx
// Núverandi:
<p className="font-medium text-[#1b1c19] text-sm leading-tight truncate">
  {item.item_name}
</p>

// Tillaga:
<Link
  href={`/auth-mvp/lanad-og-skilad/${item.id}`}
  className="font-medium text-[#1b1c19] text-sm leading-tight truncate hover:underline"
>
  {item.item_name}
</Link>
```

**Varaðu við** "Lánað og skilað" breadcrumb á detail-síðunni -- `backToList` lykillinn þarf að vera til í messages. Codex á að athuga hvort hann sé til. Ef ekki, bæta við.

### 4. Hreinni listasíða (valfrjálst í þessari lotu)

Þegar detail-síðan er komin er hægt að einfalda `LoanCard` á listasíðunni með því að:
- Fjarlægja action buttons af kortinu á listasíðunni (markReturned, delete, invite, o.s.frv.)
- Hafa aðeins: `item_name` (clickable), hlutverk + mótaðili, dagsetning, og mögulega litla status pill

**Codex ætti að ræða þessa þátt við Stebbi áður en þetta er innleitt** -- þetta er stærri UX breyting og Stebbi gæti viljað gera það í þrepum. Hér er hægt að:
a. Gera allt í einni lotu (ny detail + list simplification)
b. Nota detail síðuna sem "secondary view" en halda lista óbreyttum í bili

## Öryggisatriði

- **Aldrei sækja lán beint úr `loan_items`** án authorization boundary. Nota alltaf `get_my_loans` RPC sem ber inn `p_actor_id` og skilar aðeins lán þess notanda.
- **`notFound()`** (ekki 403) þegar lán finnst ekki eða tilheyrir öðrum -- gefur ekki upp hvort lánið sé til.
- **`guardLoanAccess()`** á detail-síðunni áður en nokkur gögn eru sótt.

## Prófanir

Bæta við (eða uppfæra) í viðeigandi test file:

```
describe('LoanDetailPage')
  - 404 þegar id er ekki í get_my_loans niðurstöðum
  - 404 þegar get_my_loans skilar tómu fylki
  - sýnir item_name þegar lán finnst
  - sýnir errors.loadFailed þegar get_my_loans skilar villu
```

Tengsl-deep-link breytingin þarf ekki sér próf -- hún er þegar þakin af middleware-prófum og url-myndun.

## Skrár sem þarf að breyta/bæta við

| Skrá | Hvað |
|------|------|
| `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` | **Ný skrá** — detail page |
| `app/stillingar/tengsl/[id]/page.tsx` | Lína ~80: `?id=` → `/[id]` |
| `components/loans/LoanCard.tsx` | `item_name` → `<Link>` til detail síðu |
| `messages/is.json` og `messages/en.json` | `backToList` ef hann er ekki til |
| `lib/__tests__/loan-pages.test.tsx` | Bæta við LoanDetailPage prófum |

## Localhost checks for Stebbi

Eftir útfærslu:

1. Opna `/auth-mvp/lanad-og-skilad` → smella á heiti láns → á að fara á `/auth-mvp/lanad-og-skilad/[id]`
2. Á detail-síðunni: öll upplýsingar og action takkar birtast
3. Opna tengsl-detail → smella á "Opna lán" → á að fara beint á `/auth-mvp/lanad-og-skilad/[id]`, ekki forsíðuna
4. Fara á `/auth-mvp/lanad-og-skilad/fake-id` → 404
5. Skráðu þig inn sem annar notandi, reyndu að fara beint á lán annars notanda → 404 (ekki 403)
