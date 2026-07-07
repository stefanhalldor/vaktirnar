# TODO #65 - Codex v002 - Prerelease correction fyrir Claude Code

**Created:** 2026-07-01 06:54  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Claude Code  
**Tegund:** Correction á `2026-07-01-2230-todo-065-v001-codex-prerelease-review.md`

---

## Staða

Stebbi rýndi v001 og spurði réttilega:

> Til hvers erum við að setja max 100? Hvað ef notandi er með fleiri en 100?

Niðurstaða Codex: Stebbi hefur rétt fyrir sér. `MAX_IDS = 100` er ekki nógu góð
lausn fyrir `Allt lesið`. Hún færir bara buggið frá 11 unread events yfir í 101
unread events.

---

## Finding

### Blocker - `Allt lesið` má ekki hafa handahófskennt ID-hámark

**Skrár:**

- `app/auth-mvp/heim/actions.ts`
- `app/auth-mvp/heim/RecentSection.tsx`
- `lib/recent-events/helpers.server.ts`
- `lib/__tests__/mark-recent-read-action.test.ts`
- `lib/__tests__/home-page.test.tsx`

Núverandi v001 lagfæring:

```ts
const MAX_IDS = 100
...
if (raw.length > MAX_IDS) return { ok: false, error: 'invalid_input' }
```

Þetta er enn sama product-vandamál: notandi smellir á `Allt lesið`, en kerfið
segir í raun “allt lesið nema ef allt er meira en 100”.

**Rétt hegðun:** `Allt lesið` á að merkja allt ólesið hjá innskráðum notanda sem
lesið, óháð fjölda.

Öryggilega leiðin er ekki að hækka cap heldur að hætta að senda ID-lista fyrir
`Allt lesið`.

---

## Required fix

### 1. Bæta við server-side ack-all helper

Í `lib/recent-events/helpers.server.ts`, bæta við helper sem tekur aðeins
`userId` og uppfærir bara rows í eigu þess notanda:

```ts
export async function ackAllUnreadRecentEventsForUser(userId: string): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({ ack_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('ack_at', null)

  if (error) throw error
}
```

Þetta notar ekki client-sent IDs og getur því ekki merkt rows annarra notenda
sem lesnar.

### 2. Bæta við sér server action fyrir `Allt lesið`

Í `app/auth-mvp/heim/actions.ts`, halda núverandi `ackRecentEvents` fyrir single
/ drawer ack, en bæta við t.d.:

```ts
export async function ackAllRecentEvents(): Promise<ActionResult> {
  const { user } = await guardTeskeidSession()

  try {
    await ackAllUnreadRecentEventsForUser(user.id)
  } catch {
    console.error('[ackAllRecentEvents] ackAllUnreadRecentEventsForUser failed')
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/auth-mvp/heim')
  return { ok: true }
}
```

`ackRecentEvents` má áfram hafa sanngjarnt ID cap fyrir handvalin/single events,
en það cap á ekki að stjórna `Allt lesið`.

### 3. Uppfæra `RecentSection.handleMarkAll`

Í `app/auth-mvp/heim/RecentSection.tsx`:

- Importa `ackAllRecentEvents`.
- `handleMarkAll` á að optimistic fela allar birtar rows, en kalla
  `ackAllRecentEvents()` í stað `ackRecentEvents({ event_ids: allIds })`.

Dæmi:

```ts
function handleMarkAll() {
  const allIds = rows.map((r) => r.id)
  setAckedIds(new Set(allIds))
  startTransition(async () => {
    const result = await ackAllRecentEvents()
    if (result.ok) {
      router.refresh()
    } else {
      setAckedIds(new Set())
    }
  })
}
```

Athugið: Þetta getur líka ack-að unread event sem kom inn milli page render og
click. Það er ásættanlegt fyrir `Allt lesið`; ef við viljum síðar nákvæmlega
“bara það sem var á skjánum” þurfum við cursor/snapshot-lausn, en það er óþarfa
flækjustig núna.

---

## Role-aware boðatexti

Stebbi staðfesti líka:

> "Þú varst að fá lánað" á bara að koma hjá þeim sem er að fá lánað. Annars
> ætti að koma "Þú varst að lána"

V001 virðist vera í rétta átt:

```ts
labelKey = event.payload.recipientRole === 'borrower'
  ? 'eventLoanInvitationReceivedBorrower'
  : 'eventLoanInvitationReceivedLender'
```

Það er rétt ef `recipientRole` er alltaf hlutverk þess notanda sem fær eventið:

- `recipientRole: 'borrower'` → `Þú varst að fá lánað`
- `recipientRole: 'lender'` → `Þú varst að lána`

Claude þarf samt að sannreyna:

1. `performInvitationSend` notar `preflight.recipient_role`, sem er role
   viðtakandans. Það er rétt.
2. `/heim` event guarantor notar `loan.my_role` fyrir pending row. Það er rétt ef
   `get_my_loans` skilar `my_role` sem role innskráða notandans. Það þarf að
   vera staðfest í tests.

Ekki breyta þessu í generic texta. Stebbi vill einmitt að þetta sé role-aware.

---

## Tests sem þarf að uppfæra

### `mark-recent-read-action.test.ts`

- Fjarlægja expectation um að `101 IDs` skili `invalid_input` sem lausn á
  `Allt lesið`.
- Halda testum fyrir `ackRecentEvents` ID validation ef functionin er áfram til.
- Bæta við tests fyrir `ackAllRecentEvents`:
  - kallar `ackAllUnreadRecentEventsForUser('actor-uuid')`;
  - revalidatar `/auth-mvp/heim`;
  - skilar `save_failed` ef helper throwar;
  - krefst auth via `guardTeskeidSession`.

### `home-page.test.tsx`

- Uppfæra `Allt lesið` test:
  - `handleMarkAll` á að kalla `ackAllRecentEvents`, ekki `ackRecentEvents` með
    öllum ID-um.
  - Test með 101+ rows má vera gott regression próf: smella `Allt lesið` og
    staðfesta að done banner birtist og `ackAllRecentEvents` var kallað.

### Role-aware label tests

Halda v001 tests:

- borrower → `Þú varst að fá lánað: ...`
- lender → `Þú varst að lána: ...`
- fallback án `recipientRole` → generic `Lánaboð: ...`

Bæta við eða staðfesta test fyrir `/heim` guarantor payload ef það er ekki til:

```ts
payload: { itemName: loan.item_name, recipientRole: loan.my_role }
```

---

## Commands

Keyra eftir lagfæringu:

```bash
npm run test:run -- lib/__tests__/mark-recent-read-action.test.ts lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts
npm run type-check
```

---

## Localhost checks for Stebbi

### A. `Allt lesið` án hámarks

Pre-state:

- Notandi er með fleiri en 10 unread events.
- Ef hægt er, prófa líka með fleiri en 100 unread events eða með test/mock gögn.

Skref:

1. Opna `/auth-mvp/heim`.
2. Smella á `Allt lesið`.
3. Bíða í 2-3 sekúndur.
4. Refresh-a síðuna.

Vænt:

- Öll unread events hverfa.
- Þau birtast ekki aftur eftir refresh.
- Engin console villa.
- Buttoninn veldur ekki silent rollback.

### B. Role-aware boðatexti

Pre-state:

- Pending boð þar sem innskráður notandi er borrower.
- Pending boð þar sem innskráður notandi er lender.

Vænt:

- Borrower sér: `Þú varst að fá lánað: {itemName}`.
- Lender sér: `Þú varst að lána: {itemName}`.
- Gömul events án `recipientRole` mega áfram sýna fallback `Lánaboð: {itemName}`.

### C. Pending role-switch 404 regression

Pre-state:

- Pending recipient hefur ekki smellt á `Þekki málið`.

Skref:

1. Opna detail/lista.
2. Smella `Leiðrétta hlutverk`.

Vænt:

- Engin 404.
- Síðan sýnir aðeins role-switch, ekki edit form.

---

## Recommendation

Ekki release-a v001 með `MAX_IDS = 100` sem lokaútgáfu. Taka v002 correction:

- `Allt lesið` → nýtt server-side ack-all action.
- Halda role-aware textanum eins og Stebbi skilgreindi.
- Skila stuttu v003 handoff til Codex eftir breytingu.
