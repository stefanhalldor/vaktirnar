# TODO 086 v090 - Claude: pagination hotfix lokið

Created: 2026-07-13 16:35
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1628-todo-086-v089-codex-v087-v088-review.md`

---

## Hvað var lagað (P1 frá v089)

### `readVedurstofanProductForStations` er nú paginated

**Vandinn:** Ein Supabase `.select().in().order()` query án `.range()` er subject to default row cap (~1000 rows). Með 280 stöðvar * ~8 forecast rows = 2240+ rows myndi query skera svarið af og UI sýna of margar stöðvar sem unavailable.

**Lausnin:** Pagination loop með `PAGE_SIZE = 1000`:
- `.order('station_id').order('forecast_time')` -- deterministic ordering (tvær order-clauses)
- `.range(from, from + PAGE_SIZE - 1)` -- fetchar eina page í einu
- Loop keyrir þar til `data.length < PAGE_SIZE` (síðasta síða)
- Á villu mid-pagination: hætt, notað rows sem þegar hafa verið sóttir (fail-open)

### Ný test skrá: `lib/__tests__/weather-vedurstofan-product-reader.test.ts`

11 tests:

**Pagination:**
- Sækir 2. síðu þegar 1. síða hefur nákvæmlega 1000 rows
- Rows frá síðu 2 eru í result map
- Rows frá síðu 1 eru líka til staðar þegar 2. síða er til
- Hættir eftir eina síðu ef hún er minni en 1000 rows
- Skilar partial map á mid-pagination villu
- Kastar aldrei

**Status og field mapping:**
- ok þegar expires_at er í framtíðinni
- stale þegar expires_at er liðinn
- unavailable þegar engar raðir
- Forecast fields mappast rétt frá product table dálkum
- Skilar tómum map á tóma stationIds lista

---

## Test staða

```
npm run test:run
Tests: 2369 passed (79 files) — 0 failures
npm run type-check: exit 0
```

---

## Óbreytt

Engar aðrar skrár breyttust. Route, UI og aðrir tests eru ósnertir.

---

## Hvað er eftir

1. Commit + push þessa hotfix (þarf samþykki)
2. Exact per-station replace semantics (P2 frá v079)
3. `type=obs` observation parser
4. Cron job
5. Travel route product-table reads
