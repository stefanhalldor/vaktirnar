# Claude handoff: TODO #75 v046 - departure scrubber whole-hour alignment done

Created: 2026-07-09 23:30
Timezone: Atlantic/Reykjavik
Tengist: TODO #75, v045

## Samantekt

Per Codex v045 og framkvæmdarleyfi Stebba:

- Fyrsti slot í single-departure scrubber er "leave now" (óbreyttur exact tími).
- Allir síðari slottar eru á heil klukkan á UTC.
- Fyrsti slot sýnir "Núna" + exact tíma; aðrir slottar sýna compact klukkutímanúmer (t.d. `1`, `17`, `00`).
- Fallback utan `Á leiðinni` fjarlægt áður (v044).

## Breyttar skrár

### `lib/weather/travel.ts`

Bætti við `nextWholeUtcHourAfter(ms)` helper. Breytti while-loop í `buildSingleDepartureTimeline`:
- Push exact `startMs` fyrst.
- Set `t = nextWholeUtcHourAfter(startMs)` → næsti heili klukkutími.
- Continue with `t += NEXT_CAUTION_STEP_S * 1000` (1 klst.) þar til `endMs`.

Dæmi: brottför `23:37` → slots: `23:37`, `00:00`, `01:00`, `02:00`...
Dæmi: brottför `23:00` → slots: `23:00`, `00:00`, `01:00`... (engin tvítekning).

### `components/weather/DepartureHeatmap.tsx`

- Bætti við `firstSlotLabel?: string` prop.
- Bætti við `formatCompactHour(iso)` helper: skilar `"00"` fyrir miðnætti, `"1"`–`"23"` annars.
- Slot 0 með `firstSlotLabel`: sýnir `firstSlotLabel` (bold) + exact tíma (litlar stafir) í stað `formatKlTime`.
- Aðrir slottar: sýna `formatCompactHour` í stað `formatKlTime`.
- Aria label fyrir slot 0 með `firstSlotLabel`: `"Núna · Brottför Sun (10. júl) kl. 23:37"` (full tími varðveittur).

### `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Bætti við `firstSlotLabel={!result.travelPlan!.outbound.windowMode ? tf('timelineNowLabel') : undefined}` við outbound `DepartureHeatmap`. Þ.e. aðeins í single-departure mode; window mode fær ekki `Núna`.

### `messages/is.json`

Bætti við `"timelineNowLabel": "Núna"`.

### `messages/en.json`

Bætti við `"timelineNowLabel": "Now"`.

### `lib/__tests__/weather-travel.test.ts`

Þrjár nýjar prófanir í `timelineCandidates` describe:
1. `23:37` start: slot[0]=`23:37`, slot[1]=`00:00`, slot[2]=`01:00`, enginn `00:37`.
2. `23:00` start: slot[0]=`23:00`, slot[1]=`00:00`, engin tvítekning á `23:00`.
3. `23:56` start: slot[0] minutes=56, slot[1]=`00:00`.

## Build status

```
npm run type-check  →  clean
npm run test:run    →  1961 passed, 0 failed
```

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi.
2. Reikna venjulega leið (án sérstaklega valinnar brottfararstundar).
3. Í departure scrubber:
   - Fyrsti slot: `Núna` (feitletrað) og exact tími fyrir neðan (t.d. `23:37`).
   - Aðrir slottar: compact klukkutímanúmer, t.d. `0`, `1`, `2`, `17` — EKKI `00:00`, `01:00`.
   - Engir offset-slottar eins og `00:37`, `01:37`.
4. Velja síðari slotti (t.d. `1`):
   - `Brottför` kaflinn sýnir fullan tíma `kl. 01:00`.
   - `Á leiðinni`, kort og áfangaveður uppfærast.
5. Yfir miðnætti: day labels í scrubber eru enn sýnileg og skiptast snyrtilegur.
6. Mobile 360-390 px:
   - enginn horizontal overflow.
   - `Núna` og tímalabel passa í slot án þess að hlaupa út.
   - Allir slottar tappanlegir.
7. Window mode (ef prófanlegt): `Núna` label kemur EKKI fram.
8. Regression:
   - route calculation virkar.
   - scrubber scroll virkar.
   - Forecast drawer opnast.
   - comparison strip/drawer brotnar ekki.

Ekki þarf SQL, Supabase, RLS, auth, secrets eða production gögn. Ekki keyra migration. Ekki deploya fyrr en Stebbi hefur prófað localhost.
