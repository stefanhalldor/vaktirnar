# TODO #67 Vedrid — Place extraction fix (v013 blocker leystur)
**Dagsetning:** 2026-07-03 08:10
**Frá:** Claude (Sonnet 4.6)
**Til:** Stebbi og Codex

---

## Verdict

`mosó` bug lagaður. Type-check og tests ganga í gegn.

---

## Vandinn

`extractPlace()` í `route.ts` gerði `question.toLowerCase()` en normalize-aði ekki Íslenska stafi áður en hún gerði `includes(pattern)`.

Dæmi:
- Notandi skrifar `mosó` (accent aðeins á `o`, ekki `m`)
- `q.includes('mósó')` → false (patterns eru `mósó` og `moso`, en ekki `mosó`)
- `q.includes('moso')` → false (`moso` er með engan accent)
- Niðurstaða: `unknown_place` villa

---

## Lagfæring

### `lib/weather/question.ts` (ný skrá)

Þrjár aðgerðir sem voru privatar í `route.ts` eru nú exportaðar module:
- `detectIntent(question)` — 'grill' | 'unknown'
- `extractPlace(question)` — staðanafnmynstur eða null
- `parseTimeWindow(question, nowIso)` — { fromIso, toIso }

Lykilbreyting í `extractPlace`:

```ts
function stripAccents(s: string): string {
  return s
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ý/g, 'y')
    .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
}

export function extractPlace(question: string): string | null {
  const q = stripAccents(question.toLowerCase())
  for (const p of PLACE_PATTERNS) {
    if (q.includes(stripAccents(p))) return p
  }
  return null
}
```

Bæði spurningin og pattern eru nú accent-normaliserað áður en samanburður fer fram. `mosó` → `moso`, `mósó` → `moso`, `moso` → `moso` — allt passar.

`stripAccents` fjarlægir aðeins Íslenska sérhljóðaaccents og gerir **ekki** eyða bilum eða öðrum stöfum, þannig `includes()` virkar enn fyrir samsettar streng.

### `app/api/teskeid/weather/ask/route.ts`

Fjarlægði allar þrjár private functions og bætti við import:
```ts
import { detectIntent, extractPlace, parseTimeWindow } from '@/lib/weather/question'
```

### `lib/__tests__/weather-question.test.ts` (ný skrá)

23 tests sem ná yfir:

**extractPlace — accent normalisation (mosó regression):**
- `mosó` (partial accent) → finnst, resolves to Mosfellsbær
- `Mósó` (full accent) → finnst
- `moso` (no accent) → finnst
- Pattern úr `mosó` → `resolvePlace()` skilar `Mosfellsbær`

**extractPlace — standard places:**
- Reykjavík, reykjavik, selfoss, akureyri, hafnarfjörður, kópavogur, mosfellsbær
- Unknown place → null
- Empty string → null

**detectIntent:**
- grillveður, grill, grilla → 'grill'
- Óskyld spurning → 'unknown'

**parseTimeWindow:**
- í kvöld → 18:00–23:00 sama dag (eða næsta dag ef komið er eftir 18)
- á morgun → 08:00–22:00 næsta dag
- seinnipartinn → 14:00–18:00
- Default → 6 klst. frá now

---

## Prófanir

```
npm run type-check  → clean (0 villur)
npm run test:run    → 48 test files, 1509 passed, 22 skipped, 8 todo
```

---

## Regression checklist fyrir Stebba

1. `Er grillveður í mosó í kvöld?` → svar fyrir Mosfellsbær (áður: unknown_place villa)
2. `Er grillveður í Mósó í kvöld?` → áfram Mosfellsbær (regression)
3. `Er grillveður í moso í kvöld?` → áfram Mosfellsbær (regression)
4. `Er grillveður í Reykjavík á morgun?` → áfram Reykjavík (regression)
5. `Er grillveður á Tunglinu í kvöld?` → falleg unknown_place villa (regression)
