# TODO 086 v196 - Codex merged morning handoff after Claude v195

Created: 2026-07-15 00:05
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og sameinað handoff only.
- Engar kóðabreytingar, engin SQL keyrð, ekkert commit/push/deploy.
- Sameinar rýni á `2026-07-15-0001-todo-086-v195-claude-v194-done-prerelease` og `2026-07-14-2357-todo-086-v195-codex-v194-followup-labels-history-live-refresh`.

## Findings

### Medium - v195 polish er klárað, en attribution þarf að sannreyna fyrir notendur án Veðurstofu-filtera

Claude v195 fjarlægði footer render sites og segir að met.no attribution sé enn sýnileg sem `met.no` + `Yr spágögnin` í provider filter tile.

Það er rétt fyrir flagged flæðið þar sem provider filter birtist, en `FerdalagidClient.tsx:1187` sýnir að provider filterinn er inni í `vedurstofanLayer`-gated blokk. Því þarf Claude Code að sannreyna hvort met.no-only/not-flagged notendur hafi enn sýnilega source attribution einhvers staðar annars staðar, t.d. í `Yr` linkum á cards.

Ráðlegging:
- Ekki setja gamla langa footerinn aftur inn ef Stebbi vill hann burt.
- En tryggja að met.no/Yr sé sýnilega merkt sem gagnaveita þar sem met.no gögn eru notuð, líka þegar Veðurstofu layer/filter er ekki tiltækur.
- Þetta má vera compact source label/link, ekki endilega footer.

### Medium - Veðurstofu status-labels eru enn ekki samræmd met.no/Yr labels

Repo-staðan staðfestir að shared metadata er til í `components/weather/windStatusUi.ts`, en pillurnar/labelarnir eru enn teiknaðir á nokkrum stöðum með sér markup:

- `components/weather/VedurstofanPointCard.tsx:142` notar line-label fyrir summary.
- `components/weather/VedurstofanPointCard.tsx:233` teiknar Veðurstofu chip með eigin `inline-flex`.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:1367` teiknar summary label með eigin line-style.
- `app/auth-mvp/vedrid/FerdalagidClient.tsx:2191` teiknar card header chip.
- `components/weather/TravelAuditMap.tsx:774` teiknar manual/worst panel chip.

Þetta skýrir af hverju Stebbi sér mun á Veðurstofu-spjöldum og met.no/Yr spjöldum.

Ráðlegging:
- Búa til shared `WindStatusBadge` eða `WeatherStatusBadge`.
- Nota sama component í:
  - met.no/Yr detail/cards
  - Veðurstofu detail/cards
  - worst point
  - selected point
  - all points
  - map/manual panel
  - summary section
- Ekki copy/paste-a markup milli provider-a. Þetta á að vera einn shared presentation path með `status`, `size`, `showIcon`/`showDot` og `className`.

### Medium - 21:00 history row vantar líklega vegna bootstrap/capture timing, ekki endilega SQL77 bug

Mikilvægt að skilja:

- `Spá gefin út kl. 21:00` er `atime`, þ.e. forecast cycle.
- Það þýðir ekki sjálfkrafa að API payload innihaldi forecast row með `forecast_time/ftime = 21:00`.
- Ef manual refresh var keyrt kl. 23:52 og Veðurstofan skilaði þá bara future rows `00:00`, `03:00`, o.s.frv., getur projector aðeins skrifað þær rows í history.
- SQL77 getur ekki endurheimt row sem var ekki captured áður en Veðurstofan hætti að skila henni.

Ráðlegging:
- Staðfesta eftir næsta cron/manual cycle að `vedurstofan_forecasts_history` safni rows.
- Prófa aftur eftir að history taflan hefur lifað yfir að minnsta kosti einn forecast boundary.
- Ekki blanda eldri `atime=18:00` row inn í card sem er byggt á current `atime=21:00`, nema Stebbi samþykki sérstaka vöruhegðun með skýrri merkingu, t.d. “eldra spágildi úr fyrri útgáfu”.

### Medium - Freshness banner þarf að greina á milli stale og “bíðum eftir næsta cycle”

Stebbi sá:

```text
Veðurstofugögnin eru frá kl. 21:00 · síðast reynt kl. 23:52
```

Ef klukkan er 23:55 og næsta eðlilega Veðurstofu cycle er væntanlegt kl. 00:00, þá á þetta ekki að líta út eins og alvarlegt “gömul gögn” ástand.

Ráðlegging:
- Current cycle OK: fela banner eða sýna quiet info, t.d. `Veðurstofugögn frá kl. 21:00 · næstu gögn væntanleg kl. 00:00`.
- Stale eftir grace: sýna amber `Veðurstofugögnin eru gömul` og manual refresh.
- Manual refresh reyndi en provider er enn behind: sýna það aðeins í stale/warning state.

### Medium - Live/open-flow update er góð hugmynd, en byrja með polling/prompt, ekki Realtime

Stebbi vill að ef einn notandi sækir ný Veðurstofugögn manually þá sjái aðrir opnir notendur að ný gögn séu komin.

Codex mat:
- Kostur: minnkar rugling og nýtir manual refresh fyrir alla.
- Gallar við WebSocket/Supabase Realtime núna: meiri security surface, service-role-only töflur, meiri flækja, silent mutation getur breytt mati meðan notandi les niðurstöðu.

Ráðlegging v1:
- Poll-a lightweight endpoint á 60-120 sek fresti þegar:
  - Veðurstofan er virk,
  - result screen er opinn,
  - `document.visibilityState === 'visible'`.
- Endpoint skilar aðeins run/freshness metadata, ekki öllu route-resultinu.
- Ef nýrra `finished_at` eða `result_atime` finnst:
  - sýna prompt: `Ný Veðurstofugögn eru komin`
  - button: `Uppfæra mat`
- Ekki silent auto-recompute nema síðar og þá með mjög skýrri product ákvörðun.

### Low - Provider filter text er nú komið í messages, en þarf localhost staðfestingu

`messages/is.json:875` er nú `Yr spágögnin` og `messages/en.json:871` er `Yr forecast data`.

Þetta passar við Stebba. Localhost þarf bara að staðfesta að UI sé að sækja rétta key og að browserinn sé ekki með gamalt bundle/cache.

## What Claude v195 completed

Samkvæmt `2026-07-15-0001-todo-086-v195-claude-v194-done-prerelease`:

1. Elta veðrið map zoom:
   - `VedurstofanStationExplorerClient.tsx`: `zoom: 6` -> `zoom: 5`.

2. Footer attribution render sites removed:
   - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
   - `app/auth-mvp/vedrid/VedridClient.tsx`
   - `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`

3. Provider filter compact three-tile layout:
   - `Sannreynt | Í prófunum | Væntanlegt`
   - `met.no | Veðurstofan | Vegagerðin`
   - Vegagerðin links to `https://umferdin.is/` and remains disabled.

4. Weather disclaimer copy shortened:
   - “Fyrir akstur skaltu líka athuga hviður og vegaaðstæður...”

5. `providerMetnoHelperText` updated:
   - IS: `Yr spágögnin`
   - EN: `Yr forecast data`

6. SQL77 comment typo fixed:
   - `sql/74_vedurstofan_stations.sql` -> `sql/74_vedurstofan_product_tables.sql`

## Review of Claude v195

No hard blocker found in the v195 polish itself from the reviewed snippets.

But two follow-ups should go into the next Claude scope:

1. Verify attribution/source labeling still exists for met.no-only users who do not see the Veðurstofan provider filter.
2. Continue with the v195 Codex follow-up items: shared status labels, history bootstrap verification, freshness banner semantics, and lightweight open-flow update strategy.

## Recommended next Claude Code scope

### Scope 1 - Shared status badge/component

Goal: same status looks the same everywhere, regardless of provider.

Implementation direction:
- Create `components/weather/WindStatusBadge.tsx` or equivalent.
- It should use `WIND_STATUS_UI_META`.
- Props should probably include:
  - `status: WindDisplayStatus`
  - `size?: 'xs' | 'sm' | 'summary'`
  - `variant?: 'chip' | 'line'`
  - `showIcon?: boolean`
  - `showDot?: boolean`
  - `className?: string`
- Replace hand-rolled status chips/lines in:
  - `components/weather/VedurstofanPointCard.tsx`
  - `components/weather/TravelAuditMap.tsx`
  - `app/auth-mvp/vedrid/FerdalagidClient.tsx`
  - any met.no/Yr point row/card that should use the same display language.

Keep this scoped: do not change assessment logic.

### Scope 2 - Freshness/history verification and copy

Goal: stop calling current cycle “gömul gögn” and make history behavior understandable.

Tasks:
- Confirm SQL77 exists in DB if Stebbi has run it.
- Confirm projector writes to `vedurstofan_forecasts_history` after next warm/manual run.
- Verify whether missing 21:00 row is expected because it was never captured.
- Adjust banner state:
  - current cycle OK: hide or quiet info.
  - next cycle expected soon: “næstu gögn væntanleg kl. 00:00”.
  - stale after grace: amber warning + refresh.
- Do not blend rows across `atime` cycles without Stebbi’s explicit approval.

### Scope 3 - Source labeling after footer removal

Goal: no long footer, but source remains clear.

Tasks:
- Check met.no-only unflagged localhost/production-like flow.
- If provider filter is absent, ensure there is still visible source labeling or link for Yr/met.no where forecast data is shown.
- Keep it compact and app-like.

### Scope 4 - Open-flow update plan or v1 implementation

Goal: users with open results can notice newer Veðurstofu data without full realtime complexity.

Recommended v1:
- Lightweight polling endpoint/state.
- Poll only when tab visible and Veðurstofan provider enabled.
- Show `Ný Veðurstofugögn eru komin` + `Uppfæra mat`.
- Avoid silent auto-changing the selected/worst result.

## Commands run by Codex for this review

All commands were read-only.

```text
Get-Content -Encoding UTF8 ai-handoff/2026-07-15-0001-todo-086-v195-claude-v194-done-prerelease.md | Select-Object -First 220
Get-Content -Encoding UTF8 ai-handoff/2026-07-14-2357-todo-086-v195-codex-v194-followup-labels-history-live-refresh.md | Select-Object -First 260
rg -n "Staðfest grunnlína|Yr spágögnin|providerMetnoHelperText|weatherDisclaimer|Byggt á gögnum|attribution|Veðurstofugögnin eru gömul|Ný Veðurstofugögn" messages app components lib
rg -n "WIND_STATUS_UI_META|statusWithinLimits|chipActiveClass|WeatherStatus|WindStatus|providerMetnoHelperText|grid-cols-3|umferdin" components app/auth-mvp/vedrid lib
git status --short
Select-String ... small targeted snippets for VedurstofanPointCard, FerdalagidClient, TravelAuditMap
Get-Date -Format 'yyyy-MM-dd HH:mm'
```

Notes:
- `git status --short` showed a large dirty worktree from ongoing TODO 086 work. Codex did not revert or modify existing work.
- This handoff file is the only file Codex created for this request.

## Localhost checks for Stebbi

After Claude Code works the next scope:

1. Open `/auth-mvp/vedrid` as a user without Veðurstofan provider access, if possible.
   - Confirm met.no/Yr source is still visible somewhere after footer removal.
   - There should be no long `Byggt á gögnum frá MET Norway (met.no)` footer.

2. Open `/auth-mvp/vedrid` as a user with Veðurstofan provider access.
   - Provider filter should be compact one-line/three-tile layout.
   - met.no helper should say `Yr spágögnin`.
   - Veðurstofan tile should not have extra helper copy.
   - Vegagerðin should be disabled and link to `umferdin.is`.

3. Run a route with met.no only.
   - Worst point, selected point and all-points cards should keep their status labels.

4. Run the same route with Veðurstofan only.
   - Veðurstofu status labels should visually match met.no/Yr labels for same severity.
   - No mismatched red/orange/green chip style between worst, selected and all-points.

5. Run with both met.no and Veðurstofan enabled.
   - Combined assessment should still use all selected providers.
   - Status labels should remain visually consistent.

6. Freshness/banner:
   - If Veðurstofan atime is current and next cycle is not due yet, no scary amber stale banner.
   - If next cycle is due and provider still returns old data after grace, amber stale banner is OK.
   - Manual refresh should respect cooldown if that logic is still intended.

7. History:
   - After SQL77 has been active through at least one future warm/manual cycle, choose an ETA around a forecast boundary.
   - Verify prev/used/next rows appear only when the rows were actually captured.
   - Do not expect SQL77 to recover rows from before it existed.

8. Open-flow update, if implemented:
   - Keep one result tab open.
   - Trigger manual refresh elsewhere.
   - Expected v1: a visible “new data available” prompt, not silent result mutation.

## Copy/paste block for Claude Code

```text
Claude Code, please use this as the next TODO 086 handoff. Start with a short plan before editing anything.

Context:
- Your v195 completed the v194 UI polish: Elta map zoom, footer render removal, compact provider filter, shorter disclaimer, `Yr spágögnin`, and SQL77 comment fix.
- Codex reviewed it and merged the next concerns into v196.

Findings to address:
1. Verify met.no/Yr attribution after footer removal for users who do not see the Veðurstofan provider filter. The filter is gated behind `vedurstofanLayer`, so unflagged met.no-only users may no longer see a source label unless another visible label/link covers it. Do not restore the old long footer unless Stebbi asks; prefer compact source labeling.
2. Status labels are still not fully shared. Build/extract a shared `WindStatusBadge`/`WeatherStatusBadge` based on `WIND_STATUS_UI_META` and use it across met.no/Yr and Veðurstofan cards: worst point, selected point, all points, map/manual panel, and summary. Do not copy/paste markup.
3. History row expectation: `Spá gefin út kl. 21:00` is `atime`, not necessarily a `forecast_time=21:00` row. SQL77 cannot recover rows that were not captured before the provider stopped returning them. Verify history capture after the next warm/manual cycle; do not mix older `atime` cycles into current cards unless Stebbi explicitly approves that behavior.
4. Freshness banner should distinguish current cycle from stale/error. If atime 21:00 is still valid and next cycle is expected 00:00, hide the warning or show quiet info. Only show amber stale warning after expected cycle + grace.
5. For live updates to open result tabs, do not jump to WebSocket/Supabase Realtime. Prefer lightweight polling while tab is visible and Veðurstofan is enabled, then show `Ný Veðurstofugögn eru komin` + `Uppfæra mat`.

Constraints:
- No SQL/migration unless Stebbi explicitly approves.
- No commit/push/deploy.
- Do not weaken RLS/grants.
- Keep changes scoped and future-proof for Vegagerðin as another provider.
- Include Localhost checks for Stebbi in your handoff.
```
