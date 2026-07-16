# 2026-07-15-0130 | todo-086 | v197 | claude | v196 done — prerelease

## Status
All v196 scopes implemented. TypeScript clean.

---

## What changed

### Scope 1 — WindStatusBadge (shared status component)

**New file: `components/weather/WindStatusBadge.tsx`**

Three variants:
- `'chip'` (default) — rounded-full pill with color dot, `chipActiveClass`, border
- `'line'` — `text-sm flex items-center`, icon left, `labelClass` color
- `'badge'` — small rounded badge, icon inline, `chipActiveClass`, no border/dot

All variants use `WIND_STATUS_UI_META` and `useTranslations('teskeid.vedrid.ferdalagid')`.
Accepts optional `className` prop for per-site overrides (e.g. `self-start`).

**Replaced hand-rolled chips:**
| File | Line | Before | After |
|---|---|---|---|
| `VedurstofanPointCard.tsx` | ~142 | `<p className="text-sm font-medium flex items-center gap-1.5 {labelClass}">` | `<WindStatusBadge status={status} variant="line" />` |
| `VedurstofanPointCard.tsx` | ~233 | `<span className="inline-flex ... rounded-full border self-start {chipActiveClass}">` | `<WindStatusBadge status={status} variant="chip" className="self-start" />` |
| `FerdalagidClient.tsx` | ~1367 | `<p className="text-sm font-medium flex items-center gap-1.5 {windMeta.labelClass}">` | `<WindStatusBadge status={windLabel} variant="line" />` |
| `FerdalagidClient.tsx` | ~2191 | `<span className="px-1.5 py-0.5 rounded {windMeta.chipActiveClass}">` | `<WindStatusBadge status={windStatus} variant="badge" />` |
| `TravelAuditMap.tsx` | ~774 | `<span className="inline-flex ... rounded-full border {meta.chipActiveClass}">` | `<WindStatusBadge status={point.status} variant="chip" />` |

---

### Scope 2 — Freshness banner semantics

`app/auth-mvp/vedrid/FerdalagidClient.tsx`

Changes:
- `nextExpected` now shows **always** (not just when stale). When fresh: "frá kl. 21:00 · ný gögn væntanleg kl. 00:00" — informative without alarming.
- `lastAttempted` now shows **only when stale**. When fresh: not shown. Removes the "síðast reynt" noise that made current-cycle data look like a problem.
- Data provenance text color: `text-muted-foreground` when fresh, `text-amber-900/80` when stale.

---

### Scope 3 — met.no attribution for unflagged users

`app/auth-mvp/vedrid/FerdalagidClient.tsx`

Added `<p className="text-[10px] text-muted-foreground/60">{tf('providerMetnoLabel')}</p>` in the `sectionOnWay` section (met.no path, above the disclaimer box). Same pattern as VedurstofanPointCard's provider label. Visible to all users regardless of Veðurstofan flag state.

---

### Scope 4 — Uppfæra mat (open-result polling)

**New file: `app/api/teskeid/weather/vedurstofan/freshness/route.ts`**
- GET endpoint, requires `weather-provider-vedurstofan` feature access + `WEATHER_ENABLED=true`
- Queries `MAX(atime)` from `vedurstofan_forecasts_latest` via service_role
- Returns `{ atimeIso: string | null }`
- Lightweight — single DB row read, no HTTP calls

**`app/auth-mvp/vedrid/FerdalagidClient.tsx`**

New state:
- `newerVedurstofanAvailable: boolean` — notification trigger
- `knownVedurstofanAtimeRef: MutableRefObject<string | null>` — tracks atime at load/update time

New effects:
- **Sync effect** — when `vedurstofanLayer.layerAtimeIso` changes, updates `knownVedurstofanAtimeRef` and clears `newerVedurstofanAvailable`
- **Polling effect** — runs when `step === 'result' && showVedurstofan && !newerVedurstofanAvailable`
  - Polls `/api/teskeid/weather/vedurstofan/freshness` every 90 seconds
  - Skips if `document.visibilityState !== 'visible'`
  - Sets `newerVedurstofanAvailable = true` when returned `atimeIso > knownAtime`
  - Stops polling once notification is set (interval clears on dep change)

New handler `handleUpdateVedurstofan`:
- Clears `newerVedurstofanAvailable`, sets state to `'refreshing'`
- Re-fetches travel API (no warm needed — data is already in DB)
- Updates `vedurstofanLayer` and resolves to `'fresh'` or `'stillStale'`

New UI (shown above the freshness banner):
```
[ Ný Veðurstofugögn eru komin ]  [ Uppfæra mat ]
```
- Only shown when `step === 'result' && showVedurstofan && newerVedurstofanAvailable`
- `border-primary/30 bg-primary/5` — calm blue notification, not alarming
- "Uppfæra mat" calls `handleUpdateVedurstofan`

**New message keys:**
| Key | IS | EN |
|---|---|---|
| `vedurstofanNewDataAvailable` | `Ný Veðurstofugögn eru komin` | `New Veðurstofan data is available` |
| `vedurstofanUpdateAssessment` | `Uppfæra mat` | `Update assessment` |

---

### Scope 5 — History 21:00 row

No code change. Confirmed: `Spá gefin út kl. 21:00` is `atime` (forecast cycle label), not `forecast_time=21:00`. If Veðurstofan API no longer returns that row when SQL77 was first active, it cannot be recovered retroactively. Testing should wait until history has accumulated through at least one forecast cycle boundary.

---

## Localhost checks for Stebbi

1. **Status labels** — run a route with met.no only, then Veðurstofan only, then both.
   - All status chips/badges should have the same color/style for the same severity.
   - Worst point chip, selected point chip, and all-points chips should match.

2. **met.no attribution** — run a route without Veðurstofan flag active.
   - `Á leiðinni` section should show `met.no` in `text-[10px] text-muted-foreground/60` above the disclaimer box.

3. **Freshness banner (fresh state)** — open result when Veðurstofan data is current.
   - Banner should show `Veðurstofugögnin eru frá kl. XX:00 · ný gögn væntanleg kl. YY:00` in muted color.
   - No "síðast reynt" text. No amber color. No stale headline.

4. **Freshness banner (stale state)** — open result when Veðurstofan atime is behind current cycle.
   - Banner should show amber: `Veðurstofugögnin eru gömul` + `frá kl. XX:00 · ný gögn væntanleg kl. YY:00 · síðast reynt kl. ZZ:ZZ`.
   - Refresh button visible.

5. **Uppfæra mat** — open result with Veðurstofan enabled.
   - After ~90 seconds (or after a cron/manual refresh fires elsewhere), if new data has arrived, a calm blue bar should appear: `Ný Veðurstofugögn eru komin` + `Uppfæra mat` link.
   - Tapping "Uppfæra mat" re-fetches the travel route and updates the Veðurstofan layer. Notification clears. Banner updates to fresh state.
   - If no new data arrives, nothing changes.
   - Switching tab away and back: polling resumes on visibility change (next 90 s tick).

6. **History rows** — after SQL77 has been running through at least one future 3-hour boundary, test a route where ETA is between forecast slots. Verify prev/used/next rows appear. Do not expect to recover rows from before SQL77 was activated.
