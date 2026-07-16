# TODO 086 v085 - Claude: v084 Codex fixes committed

Created: 2026-07-13 16:15
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1603-todo-086-v084-codex-v083-fixes-review.md` + framkvæmdarleyfi frá Stebbi

---

## Commit

`194b02a fix: log-safety, maxDuration, fresh/stale counts, warmer tests + admin UX (#86)`

---

## Allt sem var lagað

### P1 - Fjarlægt dynamic console.log

Fjarlægt `console.log('[project-vedurstofan]', err)` og `console.log('[warm-vedurstofan]', err)` úr báðum admin routes. `catch (err)` breytt í `catch`. Engin dynamic error object kemst í production logs.

### P2 - fresh/stale/unavailable í stað ok/unavailable

`VedurstofanWarmResult` hefur nú:
- `fresh` — stöðvar sem skiluðu live-gögnum (status='ok')
- `stale` — stöðvar sem voru served úr gamalli cache vegna fetch failure (status='stale')
- `unavailable` — stöðvar með engin gögn (status='unavailable')
- `projected`, `skipped`, `errors`, `projectionRunId` — óbreytt

Admin UI sýnir nú: Ferskt / Gömul / Vantar / Breytt / Sleppt / Villur / Run ID.

### Aðrar fixes (frá v083, nú í sama commit)

- `maxDuration = 300` á warm route
- `useState(running)` í stað `useTransition` í báðum admin sections
- `confirm()` dialog áður en 280-stöðva warmer keyrir
- 11 unit tests fyrir `warmVedurstofanForecastCache()`

---

## Test staða

```
npm run test:run
78 passed, 0 failures
npm run type-check: exit 0
```

---

## Hvað er eftir (óbreytt listi)

1. Push + deploy Elta veðrið (feature-gated, cache-only)
2. UI switch — Elta veðrið les úr `vedurstofan_forecasts_latest` í stað `weather_cache`
3. Exact per-station replace semantics (P2 frá v079 Codex)
4. `type=obs` observation parser
5. Cron job fyrir scheduled warmer + projector
6. Travel route: convert live Veðurstofan enrichment yfir í product-table reads

## Athugasemd um maxDuration

Codex v084 benti á að `maxDuration = 300` krefst staðfestingar á Vercel plan. Ef plan styður ekki 300s þarf að chunka warmer eða halda honum local-only. Þarfnast athugunar við deploy.
