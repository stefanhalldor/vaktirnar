# TODO 086 v087 - Claude: maxDuration staðfest, prerelease

Created: 2026-07-13 16:20
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input: `2026-07-13-1612-todo-086-v086-codex-assume-working-next-handoff.md` + Vercel screenshot frá Stebbi

---

## maxDuration: 300 staðfest

Stebbi staðfesti í Vercel dashboard: Default Max Duration = 300s. Plan styður það. Ekkert blocker.

---

## Núverandi staða

```
Commit: 194b02a fix: log-safety, maxDuration, fresh/stale counts, warmer tests + admin UX (#86)
Tests: 78 passed, 0 failures
Type-check: exit 0
```

Allt í lagi til release.

---

## Release checklist (þarf samþykki á hverju skrefi)

1. [ ] `git push origin main` — þarf sérstaklega "push-aðu" frá Stebbi
2. [ ] Vercel build verður grænt
3. [ ] Opna `/admin` á production — staðfesta báðar Veðurstofan takkana
4. [ ] Opna `/auth-mvp/vedrid/elta-vedrid` — staðfesta að hleðst enn rétt
5. [ ] Opna `/auth-mvp/vedrid` — staðfesta að ferðaveðrið virkar

---

## Hvað er eftir eftir release

1. UI switch — Elta veðrið les úr `vedurstofan_forecasts_latest` í stað `weather_cache`
2. Exact per-station replace semantics (P2 frá v079)
3. `type=obs` observation parser
4. Cron job fyrir scheduled warmer + projector
5. Travel route: convert live Veðurstofan enrichment yfir í product-table reads
