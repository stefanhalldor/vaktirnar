# Handoff: TODO-086 v161 — Claude review handoff after v158/v159/v160

**From:** Claude
**Date:** 2026-07-14
**Branch:** main

---

## Staða

v157 er óútgefið. Þrjár Codex-rýnir (v158, v159, v160) fundu þrjár tegundir vandamála. Claude greindi þær og lagði fram tillögur. Stebbi bað um handoff til að nota sem grunnlag næstu lotu.

---

## Vandamál sem hægt er að lagfæra strax — engin migration

### 1. Grace-window bugg í `isVedurstofanCycleFresh`

**Skrá:** `lib/weather/vedurstofanFreshness.ts:57`

```ts
if (now.getTime() - expectedCycleMs < VEDURSTOFAN_GRACE_MS) return true
```

Þetta markar *hvaða sem er* gilt `atimeIso` sem ferskt á fyrstu 10 mínútunum eftir 3h boundary — þar á meðal gögn frá í gær. Stebbi sér 09:00 gögn kl. 17:34 þar sem expected cycle er 15:00 — þetta er augljóslega gamalt og ætti **aldrei** að líta út sem ferskt.

**Rétt hegðun:**
- Í grace: leyfa *fyrra cycle* (t.d. kl. 12:05 → 09:00 er leyfilegt, 06:00 er ekki)
- Eftir grace: krefjast current expected cycle

**Lagfæring:**

```ts
export function isVedurstofanCycleFresh(atimeIso: string | null, now: Date): boolean {
  if (!atimeIso) return false
  const atimeMs = Date.parse(atimeIso)
  if (isNaN(atimeMs)) return false
  const expectedCycleMs = Date.parse(getExpectedVedurstofanCycleIso(now))
  const prevCycleMs = expectedCycleMs - VEDURSTOFAN_CADENCE_MS
  // Within grace: accept current OR immediately previous cycle
  if (now.getTime() - expectedCycleMs < VEDURSTOFAN_GRACE_MS) {
    return atimeMs >= prevCycleMs - 60_000
  }
  // After grace: must be from current expected cycle (±1 min tolerance)
  return atimeMs >= expectedCycleMs - 60_000
}
```

**Próf sem vantar (bæta við `weather-vedurstofan-freshness.test.ts`):**
- `now=12:05, atime=09:00` → fresh (prev cycle, in grace)
- `now=12:05, atime=06:00` → stale (too old for grace)
- `now=12:05, atime=yesterday 21:00` → stale
- `now=12:11, atime=09:00` → stale (after grace, not current cycle)

---

### 2. UI segir "Gögn voru sótt nýlega" við bilun

**Skrá:** `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `handleRefreshVedurstofan`

Núverandi kóði notar `finally` svo `'done'` kemur alltaf, jafnvel við 401/500/netbilun:

```ts
try {
  await fetch('/api/teskeid/weather/vedurstofan/refresh', { method: 'POST' })
} finally {
  setVedurstofanRefreshState('done')  // rangt — kemur alltaf
}
```

**Lagfæring:** Þátta JSON-svar og setja raunverulegt ástand:

State: `'idle' | 'refreshing' | 'fresh' | 'stillStale' | 'recentlyAttempted' | 'failed'`

```ts
async function handleRefreshVedurstofan() {
  if (vedurstofanRefreshState === 'refreshing') return
  setVedurstofanRefreshState('refreshing')
  try {
    const res = await fetch('/api/teskeid/weather/vedurstofan/refresh', { method: 'POST' })
    if (!res.ok) { setVedurstofanRefreshState('failed'); return }
    const json = await res.json() as { status: string }
    setVedurstofanRefreshState(
      json.status === 'fresh' ? 'fresh'
      : json.status === 'stillStale' ? 'stillStale'
      : json.status === 'recentlyAttempted' ? 'recentlyAttempted'
      : json.status === 'alreadyFresh' ? 'fresh'
      : 'failed'
    )
  } catch {
    setVedurstofanRefreshState('failed')
  }
}
```

Bannerinn þarf svo texta fyrir hvert ástand:
- `fresh`: "Gögn uppfærð" (eða endurkeyrðu leitina)
- `stillStale`: "Við reyndum að sækja ný gögn en Veðurstofan skilaði enn eldri spá"
- `recentlyAttempted`: "Gögn voru sótt nýlega"
- `failed`: "Ekki tókst að sækja ný gögn"

---

### 3. Refresh-takki felur sig þegar `lastWarmAttemptIso` er null

**Skrá:** `FerdalagidClient.tsx`

Núverandi skilyrði:
```ts
const showVedurstofanRefreshButton = lastWarmAttemptIso !== null && !isVedurstofanDataFresh
```

Ef CRON hefur aldrei keyrt (`lastWarmAttemptIso === null`) og gögn eru gömul, sér notandinn engan takka og engar skýringar. Rétt: sýna takkann alltaf þegar gögn eru gömul, burtséð frá `lastWarmAttemptIso`.

```ts
const showVedurstofanRefreshButton = !isVedurstofanDataFresh && vedurstofanRefreshState !== 'refreshing'
```

---

### 4. Refresh endpoint skilar aldrei `alreadyFresh`

**Skrá:** `app/api/teskeid/weather/vedurstofan/refresh/route.ts`

Endpoint kallar alltaf `warmVedurstofanForecastCache()` jafnvel þótt gögn séu þegar fersk. Bæta við early-check áður en warm er kallað:

```ts
// Skoða hvort gögn séu þegar fersk
const isCycleFresh = isVedurstofanCycleFresh(/* ... hvernig? */, now)
if (isCycleFresh) return NextResponse.json({ status: 'alreadyFresh', expectedCycleIso, nextCycleIso })
```

Þetta þarf að lesa `layerAtimeIso` eða kalla á eitthvað sem gefur okkur eldsta `atimeIso` á virkan route. Þar sem endpoint veit ekki hvaða route er á ferð, getur það kallað á `getLastVedurstofanWarmAttemptIso()` sem proxy: ef refresh var lokið innan current cycle, er líklegt að gögn séu fersk. Einfaldasta nálgun:

```ts
// Ef lastAttempt er eftir expected cycle start → likely already fresh
if (lastAttemptIso && Date.parse(lastAttemptIso) >= Date.parse(expectedCycleIso)) {
  return NextResponse.json({ status: 'alreadyFresh', expectedCycleIso, nextCycleIso })
}
```

---

### 5. Rangt orðalag `Spá frá kl.` fyrir `ftimeIso`

**Skrá:** `FerdalagidClient.tsx` og hugsanlega `TravelAuditMap.tsx`

Í dag segir UI "Spá frá kl. 18:00" þar sem 18:00 er *hvenær spáin gildir* (`ftimeIso`) — ekki *hvenær hún var gefin út* (`atimeIso`).

Rétt:
- `atimeIso` → "Spá gefin út kl. HH:mm"
- `ftimeIso` → "Notuð spá kl. HH:mm" eða "Gildir kl. HH:mm"

Þarf að finna allar staðar þar sem þessi `ftimeIso`/`forecastTimeIso` er sett fram sem "Spá frá" og laga.

Nýjar `messages` lyklar þarf:
```json
"vedurstofanForecastIssuedAt": "Spá gefin út kl. {time}",
"vedurstofanForecastUsedAt": "Notuð spá kl. {time}",
"vedurstofanForecastValidAt": "Gildir kl. {time}"
```

---

### 6. "gömul gögn" badge á individual kortum

**Skrá:** `FerdalagidClient.tsx` — all-points list

Stebbi vill ekki sjá `gömul gögn` sem lítinn badge á hverjum stöð. Stale-staðan á að koma fram í banner/provider-summary — ekki á hverju einstaka korti.

Finna og fjarlægja `gömul gögn` / `vedurStofanStale` af station-cards í all-points list.

---

## Vandamál sem þurfa ákvörðun Stebbi

### A. In-progress anti-stampede (þarf migration)

Notandi A og B geta bæði keyrt refresh samtímis. Endpoint skoðar bara `finished_at` (lokið run) — ekkert "er í gangi" ástand.

**Valkostur 1 (migration):** Bæta `started_at`-row við `weather_fetch_runs` þegar refresh byrjar (`finished_at = null`). Endpoint skoðar hvort til sé row með `started_at > now - 10min AND finished_at IS NULL`.

**Valkostur 2 (seinna):** Þekkja þetta sem takmark þessarar útgáfu. Anti-stampede via `finished_at` cooldown er "good enough" í practice — það eru fáir notendur.

### B. Manual vs. cron metadata (þarf migration)

Nú er ómögulegt að greina í `weather_fetch_runs` hvort run var af CRON eða notanda. Codex vill `triggered_by`/`trigger_reason` dálka.

**Valkostur 1 (migration):** Bæta við dálkum.
**Valkostur 2 (seinna):** Ganga frá þessu þegar þörf krefur.

### C. Veðurstofan card layout (v159) — stór UI breyting

Stofna `VedurstofanPointWeatherCard` shared component með prev/used/next forecast rows, notaður á öllum þremur stöðum (worst point, selected point, all-points list). Þetta er umtalsvert verk.

**Spurning:** Vilt þú að þetta fari í sömu lotu og liðir 1-6 að ofan, eða er þetta sér session?

---

## Ráðlögð framkvæmd næstu lotu

1. Laga `isVedurstofanCycleFresh` grace-window (lið 1)
2. Bæta við prófum fyrir grace-window edge cases
3. Lagfæra `handleRefreshVedurstofan` með raunverulegum HTTP-svaraparsing (lið 2)
4. Bæta við öllum refresh-stöðum í texta (fresh/stillStale/recentlyAttempted/failed)
5. Sýna refresh-takka alltaf við stale (lið 3)
6. Bæta `alreadyFresh` early-check í endpoint (lið 4)
7. Laga `ftimeIso` vs `atimeIso` orðalag (lið 5)
8. Fjarlægja `gömul gögn` badge (lið 6)
9. Typeck + próf + handoff

Migration og card layout eftir Stebbi-ákvörðun.

---

## Skrár sem snerta þessa vinnu

```
lib/weather/vedurstofanFreshness.ts                      — grace fix
lib/__tests__/weather-vedurstofan-freshness.test.ts      — new tests
app/auth-mvp/vedrid/FerdalagidClient.tsx                 — refresh state, takki, orðalag
app/api/teskeid/weather/vedurstofan/refresh/route.ts     — alreadyFresh early-check
messages/is.json                                         — nýir lyklar
messages/en.json                                         — nýir lyklar
```
