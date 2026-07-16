# TODO 086 v088 - Claude: UI switch til product table lokið

Created: 2026-07-13 16:25
Timezone: Atlantic/Reykjavik
Agent: Claude Code

---

## Commits í þessari lotu

| Commit | Hvað |
|---|---|
| `194b02a` | fix: log-safety, maxDuration, fresh/stale counts, warmer tests + admin UX (#86) |
| `dff8393` | feat: switch Elta veðrið to read from vedurstofan_forecasts_latest (#86) |

Báðir pushed.

---

## UI switch -- hvað breyttist

### Ný fall: `readVedurstofanProductForStations`

Bætt við `lib/weather/providers/vedurstofan.server.ts`.

Les úr `vedurstofan_forecasts_latest` (product table) í stað `weather_cache`.
- Groupar rows eftir `station_id`
- Ákvarðar `ok`/`stale`/`unavailable` eftir `expires_at`
- Skilar `Map<string, VedurstofanStationResult>` -- sama type og cache-útgáfan
- Fail-open: skilar tómum/partial map á villu

### API route uppfært

`app/api/teskeid/weather/vedurstofan/stations/route.ts` notar nú `readVedurstofanProductForStations` í stað `readVedurstofanCacheForStations`.

`buildStationExplorerResponse` og UI (`VedurstofanStationExplorerClient`) breyttust ekki.

### Tests

`lib/__tests__/weather-vedurstofan-station-explorer-api.test.ts` uppfærðar -- mock vísar nú á `readVedurstofanProductForStations`.

78/78 pass, type-check exit 0.

---

## Hvernig UI virkar nú

1. Notandi opnar `/auth-mvp/vedrid/elta-vedrid`
2. Síðan sækir `/api/teskeid/weather/vedurstofan/stations`
3. Route les úr `vedurstofan_forecasts_latest` (product table)
4. Status = `ok` ef `expires_at > now`, `stale` ef eldra, `unavailable` ef engar raðir
5. **Þarf bakgrunnshlaupi til að vera með gögn** -- ef warmer hefur ekki verið keyrt sést allt sem `unavailable`

---

## Til að sjá gögn á production

1. Deploy verður grænt (fylgst með Vercel)
2. Keyra **"Sækja allar 280 stöðvar"** á `/admin` -- setur gögn í bæði `weather_cache` og `vedurstofan_forecasts_latest`
3. Opna `/auth-mvp/vedrid/elta-vedrid` og sjá stöðvar með `ok`/`stale` status

---

## Hvað er eftir

1. Exact per-station replace semantics (P2 frá v079) -- RPC eða generation marker
2. `type=obs` observation parser
3. Cron job fyrir scheduled warmer + projector
4. Travel route: convert live Veðurstofan enrichment yfir í product-table reads
