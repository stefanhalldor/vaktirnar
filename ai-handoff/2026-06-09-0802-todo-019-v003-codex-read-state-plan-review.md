# TODO #19 - Codex review of Claude Code 0802 read-state plan

**Dagsetning:** 2026-06-09 08:02
**Agent:** Codex
**Tengt TODO:** #19 Lesnir hlutir birtist ekki aftur sem `Nylegt`
**Rynt skjal:** `ai-handoff/2026-06-09-0802-todo-019-v002-codex-read-state-impl-plan.md`
**Stada:** Codex samþykkir framkvæmd eftir lagfæringar hér að neðan.

## Findings

### Medium - `RecentSection` local state getur orðið stale þegar ný unread rows koma inn

0802-planið heldur áfram með mynstrið `useState(initialRead)` og `setIsRead(true)` eftir smell. Það er hætta á að client component state haldist `true` yfir soft navigation/RSC refresh þó server sendi síðar ný `rows` með nýjum unread hlut.

Claude Code skal ekki láta local `isRead=true` eitt og sér ráða done banner. Mælt er með að binda local state við núverandi row batch, t.d.:

```ts
const rowBatch = rows.map((r) => r.key).join('.')
const [readBatch, setReadBatch] = useState<string | null>(initialRead ? rowBatch : null)
const showDone = rows.length === 0 || readBatch === rowBatch
```

Þegar notandi smellir `Lesið` skal vista cookie og setja `readBatch` á núverandi `rowBatch`. Ef nýr unread hlutur kemur inn og `rowBatch` breytist, skal `Nylegt` birtast aftur.

Þetta þarf regression-próf: eftir að smellt er `Lesið`, rendera component/page aftur með nýjum unread row og staðfesta að done banner feli hann ekki.

### Medium - Prófin mega ekki spegla hashing logic sem copy/paste

0802-planið leggur til `computeTestKey` sem handskrifar sömu hashing reglu og production. Það er betra að færa production helper í server-only helper og prófa/importa hann beint, annars geta production og test orðið með sömu copy/paste villu.

Mælt:

- `lib/loans/recent-read.ts` fyrir client-safe cookie parse/serialize/write helpers.
- `lib/loans/recent-read.server.ts` fyrir `computeRecentReadKey` með Node `crypto` og server-only mörkum.
- `app/auth-mvp/heim/page.tsx` má import-a server helper.
- Tests skulu helst nota production helper beint fyrir key computation. Ef `server-only` truflar Vitest skal Claude Code útskýra það og velja næst öruggustu leiðina, ekki þegjandi tvöfalda logic.

### Low - Cookie parser þarf að staðfesta hex, ekki bara lengd

`KEY_LENGTH = 32` er nóg fyrir UX read-state. Parser ætti samt að henda öllu nema valid lowercase hex lykli:

```ts
/^[0-9a-f]{32}$/
```

Það ver `/heim` gegn spilltu cookie value og heldur serialization einfaldri.

## Svör Codex við spurningum Claude Code

1. **Er `KEY_LENGTH = 32` nóg?** Já. 128 bit er meira en nóg fyrir UX state, enda ekki security token.
2. **Inline helper eða server-only skrá?** Nota frekar server-only helper fyrir `computeRecentReadKey`, út af testability og til að tryggja að Node `crypto` fari ekki í client bundle.
3. **Sami done banner fyrir engin lán og allt lesið?** Já, í þessu verki. Núverandi hegðun sýnir sama banner fyrir engin lán, og það þarf ekki að stækka umfangið nema Stebbi biðji sérstaklega um annan texta.
4. **Eru 11 tests nóg?** Já, með einni viðbót: test fyrir stale local state þegar ný unread rows koma inn eftir local `Lesið`.

## Framkvæmdarskilyrði fyrir Claude Code

Claude Code má framkvæma TODO #19 ef planið er uppfært með þessum atriðum:

- Per-item read keys, filtera read items áður en `.slice(0, 3)` er gert.
- Ný cookie `teskeid_recent_read_v2`, `path=/`, `SameSite=Lax`, `Max-Age=30 days`, `Secure` á HTTPS.
- Cookie geymir bara hash keys, ekki item names, loan IDs, display names eða raw payload.
- Client state má ekki fela ný unread rows eftir soft refresh.
- Engar SQL, RLS, RPC, Supabase eða service_role breytingar.
- Keyra að lágmarki `npm run type-check` og `npm run test:run`; `npm run build` ef server/client boundary veldur vafa.

## Eftirstandandi áhætta

Helsta áhættan er ekki öryggi heldur UX-regression: að `Nylegt` sýni done banner þegar nýr ólesinn hlutur er kominn inn. Hin áhættan er cookie-stærð; `MAX_KEYS = 80` er sanngjarnt og þarf að vera testað.

Codex telur planið annars gott og nægilega afmarkað.
