# TODO #19 - Claude Code implementation plan for Codex review

**Dagsetning:** 2026-06-09 08:02
**Agent:** Claude Code (plan til Codex-rýni)
**Tengt TODO:** #19 Lesnir hlutir birtist ekki aftur sem `Nýlegt`
**Hlutverk:** Codex rýnir þennan plan áður en Claude Code framkvæmir.

## Núverandi staða (lestur)

### `app/auth-mvp/heim/page.tsx`
- `RECENT_COOKIE = 'teskeid_recent_read'`
- `computeRecentSignature(loans)` — SHA-256 af sorted top-3 sem heild
- `recentLoans = sortLoansForHome(loans).slice(0, 3)` — slice ÁÐUR en filter
- `initialRead = recentLoans.length > 0 && readSig === recentSig`
- Sendir `loans=recentLoans`, `signature=recentSig`, `initialRead` til `RecentSection`

### `app/auth-mvp/heim/RecentSection.tsx`
- Cookie skrifuð á `path=/auth-mvp/heim` (þarfnast uppfærslu per Codex-plan)
- `handleMarkRead`: skrifar `signature` í cookie

### `lib/__tests__/home-page.test.tsx`
- `computeTestSignature(loans, overdueOverrides)` mirrors server-side logic
- Fleiri tests sannreyna cookie-nafn `teskeid_recent_read`, format, path

---

## Mælt implementation

### Skrá 1: `lib/loans/recent-read.ts` (ný)

Shared cookie utilities. **Engin Node.js `crypto` import** — getur verið
importuð af bæði server components og client components.

```ts
export const RECENT_READ_COOKIE = 'teskeid_recent_read_v2'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const MAX_KEYS = 80
const KEY_LENGTH = 32

export function parseRecentReadCookie(value: string | null | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(value.split('.').filter((k) => k.length === KEY_LENGTH))
}

export function serializeRecentReadKeys(
  existing: Set<string>,
  newKeys: string[]
): string {
  const merged = [...new Set([...existing, ...newKeys])]
  return merged.slice(-MAX_KEYS).join('.')
}

export function writeRecentReadCookie(serialized: string): void {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : ''
  document.cookie = `${RECENT_READ_COOKIE}=${serialized}; path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
}
```

**Spurning 1 til Codex:** Er `KEY_LENGTH = 32` (32 hex chars = 128 bit)
nógu einstakur til að forðast collision með 80-key lista, miðað við að
þetta er UX state en ekki security token?

---

### Skrá 2: `app/auth-mvp/heim/page.tsx` (breytt)

Bæta við `computeRecentReadKey` inline (notar `createHash` frá `crypto` —
ekki exportað, ekki importað af client):

```ts
// Á eftir imports:
import {
  RECENT_READ_COOKIE,
  parseRecentReadCookie,
} from '@/lib/loans/recent-read'

// Loka computeRecentSignature — eyða henni.

// Ný helper (server-only, inline í page.tsx):
function computeRecentReadKey(userId: string, loan: LoanItem): string {
  const today = getTodayReykjavik()
  const overdue = !!loan.due_at && !loan.returned_at && loan.due_at < today
  const payload = [
    userId,
    loan.id,
    loan.item_name,
    loan.loaned_at,
    loan.due_at ?? '',
    loan.returned_at ?? '',
    loan.my_role,
    overdue ? '1' : '0',
  ].join('|')
  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}
```

Breyta read-state útreikning (við ~línu 126):

```ts
// OLD:
const recentLoans = sortLoansForHome(loans).slice(0, 3)
const recentSig = computeRecentSignature(recentLoans)
let readSig: string | null = null
try {
  const jar = await cookies()
  readSig = jar.get(RECENT_COOKIE)?.value ?? null
} catch {}
const initialRead = recentLoans.length > 0 && readSig === recentSig

// NEW:
let readCookieValue: string | null = null
try {
  const jar = await cookies()
  readCookieValue = jar.get(RECENT_READ_COOKIE)?.value ?? null
} catch {}
const readKeys = parseRecentReadCookie(readCookieValue)
const sortedLoans = sortLoansForHome(loans)
const recentRows = sortedLoans
  .map((loan) => ({ loan, key: computeRecentReadKey(user.id, loan) }))
  .filter(({ key }) => !readKeys.has(key))
  .slice(0, 3)
const initialRead = loans.length > 0 && recentRows.length === 0
```

Breyta `RecentSection` call:

```tsx
// OLD:
<RecentSection
  loans={recentLoans}
  signature={recentSig}
  initialRead={initialRead}
  displayLocale={displayLocale}
  labels={recentLabels}
/>

// NEW:
<RecentSection
  rows={recentRows}
  initialRead={initialRead}
  displayLocale={displayLocale}
  labels={recentLabels}
/>
```

**Spurning 2 til Codex:** Á `computeRecentReadKey` að vera í `page.tsx`
(server-only, engin extract) eða ætti hann í sér skrá
`lib/loans/recent-read.server.ts` með `import 'server-only'` fyrir betri
testability? Codex plan v001 minnti á tests fyrir helper.

---

### Skrá 3: `app/auth-mvp/heim/RecentSection.tsx` (breytt)

Breyta interface og handler:

```ts
// Bæta við import:
import {
  RECENT_READ_COOKIE,
  parseRecentReadCookie,
  serializeRecentReadKeys,
  writeRecentReadCookie,
} from '@/lib/loans/recent-read'

// Eyða COOKIE_NAME og setCookieRead úr þessum skrá.

// Nýtt interface:
interface RecentRow {
  loan: LoanItem
  key: string
}

interface Props {
  rows: RecentRow[]           // unread loans (already filtered, up to 3)
  initialRead: boolean        // true = all loans read = show done banner
  displayLocale: string
  labels: RecentLabels
}

// handleMarkRead:
function handleMarkRead() {
  setIsRead(true)
  const currentValue =
    document.cookie
      .split(';')
      .find((c) => c.trim().startsWith(RECENT_READ_COOKIE + '='))
      ?.split('=')
      .slice(1)
      .join('=')
      .trim() ?? null
  const existing = parseRecentReadCookie(currentValue)
  const newKeys = rows.map((r) => r.key)
  writeRecentReadCookie(serializeRecentReadKeys(existing, newKeys))
}
```

Render: `rows.map(({ loan }) => ...)` í stað `loans.map(...)`.

`loans.length === 0` check í render verður `rows.length === 0` — þar sem
`rows` eru þegar filteruð unread lán, er `rows.length === 0` rétt empty state
hvort sem notandinn á engin lán eða hefur lesið þau öll.

**Spurning 3 til Codex:** Er rétt að sameina `loans.length === 0` og
`initialRead` cases (báðar sýna done banner) undir `rows.length === 0`?
Eða á done banner að vera öðruvísi þegar notandinn á engin lán vs. hefur lesið?

---

### Skrá 4: `lib/__tests__/home-page.test.tsx` (breytt)

Fjarlægja `computeTestSignature` og öll tests sem nota `teskeid_recent_read`.
Skrifa ný tests:

```ts
// Ný helper: reiknar per-item key í test með sömu reglu
function computeTestKey(userId: string, loan: LoanItem): string {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })
  const overdue = !!loan.due_at && !loan.returned_at && loan.due_at < today
  const payload = [
    userId, loan.id, loan.item_name, loan.loaned_at,
    loan.due_at ?? '', loan.returned_at ?? '', loan.my_role,
    overdue ? '1' : '0',
  ].join('|')
  return createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

// Ný setupCookie:
function setupCookieV2(keys: string[]) {
  mockCookiesGet.mockReturnValue(
    keys.length > 0 ? { value: keys.join('.') } : undefined
  )
}
```

Ný tests (í stað gamalla read-state tests):

1. `shows "Lesið" button when loan exists and cookie is empty`
2. `clicking "Lesið" shows done banner`
3. `shows done banner immediately when cookie contains key for visible loan`
4. `shows loan when cookie does NOT contain its key (new loan)`
5. `does not show read loan but shows new unread loan (core regression)`
6. `shows 4th loan as Nýlegt when first 3 are read`
7. `cookie write uses teskeid_recent_read_v2, path=/, dot-separated keys`
8. `key changes when returned_at is set`
9. `key changes when overdue transitions for same loan`
10. `parseRecentReadCookie handles empty, null, corrupted values`
11. `serializeRecentReadKeys deduplicates and caps at 80`

**Spurning 4 til Codex:** Eru þessir 11 tests nóg til að dekka Codex plan v001
lágmarkskröfur (tests 1-6)?

---

### Skrár sem EKKI breytast

- `lib/loans/sort.ts` — óbreytt
- `lib/loans/types.ts` — óbreytt
- Öll SQL, RLS, RPC, Supabase — óbreytt

---

## Áhrif á eldri tests

Eftirfarandi tests í `home-page.test.tsx` munu brotna og þurfa uppfærslu:

```
HeimPage — Lesið / read state:
  shows done banner immediately when cookie matches current signature → ný cookie regla
  shows loan list when cookie has stale signature → ný cookie regla
  cookie signature is an opaque SHA-256 hex string → breytt format (32 hex vs 64)
  regression: cookie becomes stale when loan transitions to overdue → ný cookie regla
  signature differs between current and overdue state → ný helper

HeimPage — Lesið cookie write:
  clicking "Lesið" writes teskeid_recent_read → nýtt nafn teskeid_recent_read_v2
  → path=/auth-mvp/heim → path=/
  → 64-char hex → dot-separated 32-char keys
```

Allt annað (greeting, Teskeiðar, sort order, DOM order, resilience tests)
er **óbreytt**.

---

## Stoppskilyrði sem ég mun fylgja

1. Ef `computeRecentReadKey` í tests gefur mismunandi niðurstöður en
   server-side → stoppa, rýna discrepancy.
2. Ef `rows.length === 0` vs `loans.length === 0` split þarf
   product-ákvörðun → spyrja Stebba.
3. Ef `parseRecentReadCookie` þarf að þola format annað en `.` separator
   (t.d. JSON) → stoppa.

---

## Spurningar samantektar

1. Er `KEY_LENGTH = 32` nóg (128 bit) fyrir UX collision resistance?
2. Á `computeRecentReadKey` að vera inline í `page.tsx` eða í
   `lib/loans/recent-read.server.ts`?
3. Á done banner að vera sami þegar `rows.length === 0` (engin lán) vs.
   allt lesið, eða þarf tvær mismunandi states?
4. Eru 11 tests nóg eða vantar fleiri?

---

**Engar kóðabreytingar hafa verið gerðar. Þetta er plan til Codex-rýni.**
