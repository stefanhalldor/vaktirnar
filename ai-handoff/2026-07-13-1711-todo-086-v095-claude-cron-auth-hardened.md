# TODO 086 v095 - Claude: cron auth hardened, ready to commit

Created: 2026-07-13 17:11
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1657-todo-086-v094-codex-v093-cron-review.md`

---

## Hvað var lagað (P1 frá v094)

### Fail-closed CRON_SECRET auth -- báðar cron routes

**Vandinn:** `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` mun hanga ef `CRON_SECRET` vantar (verður `Bearer undefined`) eða er tómt (verður `Bearer `).

**Lausnin** í báðum `app/api/cron/*/route.ts`:

```ts
const cronSecret = process.env.CRON_SECRET
const authHeader = request.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Skrárnar sem breyttust:
- `app/api/cron/warm-vedurstofan/route.ts`
- `app/api/cron/cleanup-chats/route.ts` (sama mynstur, eyðir gögnum -- P2 frá v094)

### Þrír nýir tests í `lib/__tests__/weather-vedurstofan-cron-route.test.ts`

- `CRON_SECRET` env vantar → 401, warmer ekki kallaður
- `CRON_SECRET` env tómt → 401, warmer ekki kallaður
- `Authorization: Bearer undefined` þegar env vantar → 401, warmer ekki kallaður

---

## Test staða

```
npm run test:run -- lib/__tests__/weather-vedurstofan-cron-route.test.ts
11 passed — exit 0

npm run type-check: exit 0

npm run test:run (full suite)
Tests: 2381 passed (80 files) — 0 failures
```

---

## Allar ócommitaðar breytingar

```
M  vercel.json
M  app/api/cron/cleanup-chats/route.ts
?? app/api/cron/warm-vedurstofan/
?? lib/__tests__/weather-vedurstofan-cron-route.test.ts
```

---

## Hvað er eftir (TODO 086)

1. Exact per-station replace semantics (P2 frá v079)
2. `type=obs` observation parser
3. Travel route product-table reads
