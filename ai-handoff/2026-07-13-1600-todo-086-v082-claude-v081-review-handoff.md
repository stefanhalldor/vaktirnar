# TODO 086 v082 - Claude: v081 Codex review lesnir, handoff til Stebbi

Created: 2026-07-13 16:00
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1541-todo-086-v081-codex-v080-comprehensive-review.md`

---

## Staða

Codex v081 fann 2 P1 og 3 P2. Engar breytingar gerðar -- þarf samþykki á P1.2 (warmer timeout) áður en framkvæmd.

Tests: exit 1 (2 failures í log-safety.test.ts)
Type-check: exit 0

---

## P1 -- Blockers (þarf laga áður en push)

### P1.1 -- Log-safety failures

Bæði admin routes nota `console.error(..., err)` með dynamic value:

- `app/api/admin/weather/project-vedurstofan/route.ts:15`
- `app/api/admin/weather/warm-vedurstofan/route.ts:15`

Repo log-safety AST test mun alltaf brjóta þetta. Þarf að laga í static message.

Lausn: einlæg, Claude getur lagað strax með framkvæmdarleyfi.

### P1.2 -- 280-stöðva warmer án production timeout

`warmVedurstofanForecastCache()` sendir allar 280 stöðvar í `fetchVedurstofanForecastsForStations()`. Fetcher notar `BATCH_MAX = 10`, sequential batches. Worst case: ~28 * 8s = 224s. Enginn `maxDuration` í route eða `vercel.json`.

Codex leggur til þrjár leiðir:

- **(A) Chunka** -- 20-40 stöðvar per click, margar calls
- **(B) Local-only** -- halda þessum route manual-only, ekki production feature enn
- **(C) maxDuration** -- bæta við route-level runtime config ef Vercel plan styður

**Þarf samþykki á A, B eða C áður en Claude getur haldið áfram.**

---

## P2 -- Mikilvægt en ekki blocker

### P2.1 -- useTransition heldur ekki button disabled yfir heilt fetch

`app/(admin)/admin/page.tsx` notar `useTransition()` -- `isPending` getur fallið á meðan 1-3 mínútna request er enn í gangi. Button re-enablear, hætta á duplicate 280-station fetches.

Lausn: skipta yfir í `useState(false)` + `setRunning(true/false)` umhverfis fetch.

### P2.2 -- Warmer result sýnir ekki projection errors/skips

`VedurstofanWarmResult` hefur bara `{ ok, unavailable, projected, projectionRunId }`. Ef projector kastar villu sér Stebbi bara `projected: 0` -- ekki hvort skipped eða errors kom upp.

Lausn: bæta `errors` og `skipped` við warmer result shape.

### P2.3 -- Engin direct unit tests fyrir warmVedurstofanForecastCache()

Route tests mocka heila fallið. Engar tests fyrir:
- Kallar fetchVedurstofanForecastsForStations() með öllum registry IDs og 8s timeout
- Kallar projector eftir fetch
- Skilar fresh/stale/unavailable/projection failure counts rétt
- Kastar aldrei á fetch eða projection failure

Lausn: bæta við unit tests í `lib/__tests__/weather-vedurstofan-warmer.test.ts`.

---

## Hvað Claude þarf samþykki á

1. **P1.2 val** -- A (chunk), B (local-only) eða C (maxDuration)?
2. **Framkvæmdarleyfi** -- laga P1.1 + P2.1 + P2.2 + P2.3 og svo commit

P1.1, P2.1, P2.2, P2.3 eru tæknilegar lagfæringar sem Claude getur framkvæmt í einni lotu þegar samþykki er fengið. P1.2 krefst stefnuvals.

---

## Næstu skref eftir lagfæringar

1. Push + deploy Elta veðrið (feature-gated, cache-only)
2. UI switch -- Elta veðrið les úr vedurstofan_forecasts_latest í stað weather_cache
3. Exact per-station replace semantics (P2 frá v079)
4. type=obs observation parser
5. Cron job fyrir scheduled warmer + projector
6. Travel route: convert live Veðurstofan enrichment yfir í product-table reads
