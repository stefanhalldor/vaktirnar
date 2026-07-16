# TODO 086 v080 - Claude: Phase 2B4+2B5 lokið, comprehensive handoff

Created: 2026-07-13 15:36
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Input:
- `2026-07-13-1524-todo-086-v079-codex-v078-projector-review.md` — Codex approved, P2 note on exact replace semantics (not blocking for manual use)
- Stebbi: projector skilaði 246/280 — vegna þess að aðeins 246 stöðvar voru í weather_cache

---

## Allt sem var gert í þessari lotu (frá v066)

### Commits

| Commit | Hvað |
|---|---|
| `b775316` | Fix: cache-only API, full registry metadata in Elta veðrið UI |
| `fece243` | sql/74: 4 Veðurstofan product tables + 13 static SQL tests |
| `1d16607` | Seed script fix (parser bug, --dry-run, quote strip) + type-check fix |
| `69e1b15` | Round elevation_m to integer in seed script |
| `dbbf432` | Phase 2B4: cache-to-product projector + admin route + 20 tests |
| `0f5cef6` | Fix projector: upsert-first semantics, scan-failure signal, stricter validation + route auth tests |
| `9980559` | Admin page: "Keyra breytara" takki |
| `5981d58` | Phase 2B5: background warmer for all 280 stations + admin route + 7 tests + admin page takki |

---

## Núverandi staða

### Supabase (keyrt af Stebbi)

- `sql/73`: feature_access constraint widened (elta-vedrid, ferdalagid) ✓
- `sql/74`: 4 product tables created ✓
- `vedurstofan_stations`: 280 rows (seed script keyrt) ✓

### Admin page (`/admin`) — neðst á síðunni

**"Veðurstofan — bakgrunnshlaupi"** (`POST /api/admin/weather/warm-vedurstofan`)
- Sækir spágögn fyrir allar 280 stöðvar frá Veðurstofunni (cache-first, 8s timeout per hóp)
- Keyrir projector eftir fetch
- Skilar: `ok`, `unavailable`, `projected`, `projectionRunId`

**"Veðurstofan — spágagnabreytari"** (`POST /api/admin/weather/project-vedurstofan`)
- Les weather_cache → skrifar í vedurstofan_forecasts_latest
- Skilar: `projected`, `skipped`, `errors`, `runId`

### Skýring á 246/280

Projector las 246 stöðvar úr `weather_cache` vegna þess að aðeins 246 stöðvar höfðu verið sóttar áður (í gegnum ferðaveðrið). Til að fá öll 280 þarf bakgrunnshlaupi (commit `5981d58`). Þegar Stebbi keyrir "Sækja allar 280 stöðvar" verða allar stöðvar fetchaðar og projected.

---

## Arkitektúr — núverandi staða

```
weather_cache (raw JSONB, service-role only)
    ↑ fetchVedurstofanForecastsForStations() — live fetch + cache write
    ↑ warmVedurstofanForecastCache() — warmer keyrir þetta fyrir allar 280
    ↓ projectVedurstofanCacheToProductTables() — les cache, skrifar í product tables

vedurstofan_stations (280 rows) — seeded
vedurstofan_forecasts_latest — fyllst af projector
vedurstofan_observations_latest — tómt (obs parser ekki til)
weather_fetch_runs — ein röð per projector-keyrslu

Elta veðrið UI (/auth-mvp/vedrid/elta-vedrid):
  Les enn úr weather_cache (readVedurstofanCacheForStations)
  Ekki ennþá tengt við vedurstofan_forecasts_latest
```

---

## P2 note frá Codex v079 (ekki blocker, þarf athugun síðar)

Replace semantics í projector eru ekki nákvæmar: `.lt('fetched_at', payload.fetchedAtIso)` eyðir stale rows en ef row hefur sama eða nýrra `fetched_at` og er ekki í nýja payload-inu lifir það eftir. Þetta er safe (stale extra row > tómt station) en þarf betri lausn (RPC eða generation marker) áður en UI les úr `vedurstofan_forecasts_latest`.

---

## Test staða

```
npm run test:run
Tests: 237 passed (237) — allar skrár
npm run type-check: exit 0
```

---

## Hvað er eftir (allt þarfnast sér samþykkis)

1. **Keyra "Sækja allar 280 stöðvar"** — Stebbi keyrir í admin og staðfestir 280 í `vedurstofan_forecasts_latest`
2. **Elta veðrið release** — push/deploy, UI er feature-gated og cache-only
3. **UI switch** — Elta veðrið les úr `vedurstofan_forecasts_latest` í stað `weather_cache`
4. **Exact replace semantics** — RPC eða generation marker fyrir per-station replacement
5. **`type=obs` observation parser** — `vedurstofan_observations_latest` population
6. **Cron job** — scheduled warmer + projector
7. **Travel route** — convert live Veðurstofan enrichment to product-table reads

---

## Localhost checks fyrir Stebbi

1. Opna `/admin`, fara neðst á síðuna
2. Klikka "Sækja allar 280 stöðvar" — bíða 1-3 mínútur
3. Staðfesta `ok: ~280`, `projected: ~280` í niðurstöðu
4. Skoða `vedurstofan_forecasts_latest` í Supabase — ætti að hafa margar raðir
5. Skoða `weather_fetch_runs` — ætti að hafa tvær raðir (projector + warmer)
6. Opna `/auth-mvp/vedrid/elta-vedrid` — staðfesta að hleðst enn rétt
7. Opna `/auth-mvp/vedrid` — staðfesta að ferðaveðrið virkar

Ekki gera UI switch, cron eða obs parser án sér samþykkis.
