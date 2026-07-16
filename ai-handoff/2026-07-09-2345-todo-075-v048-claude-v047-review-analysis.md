# Claude handoff: TODO #75 v048 - v047 review analysis, pending P1 localhost check

Created: 2026-07-09 23:45
Timezone: Atlantic/Reykjavik
Tengist: TODO #75, v047

## Staða

Engar kóðabreytingar í þessum handoff. Þetta er greining á v047 Codex review án framkvæmdar.

## P1 greining: "Núna 23:00" þegar keyrsla var ~23:30

### Kóðaslóð rakin

Server-side `travel/route.ts` lína 110-111:
```ts
const earliestDepartureAt: string | undefined = isValidDateString(body.earliestDepartureAt) ? body.earliestDepartureAt : undefined
```

Client (`FerdalagidClient.tsx` lína 318-329) sendir ALDREI `earliestDepartureAt` í request body í núverandi UI — ekkert explicit future departure UI er til.

Þ.a.l. fer `earliestDepartureAt = undefined` inn í `checkTravelWeather`.

`lib/weather/travel.ts` lína 698:
```ts
const earliestDeparture = earliestDepartureAt ?? new Date().toISOString()
```

`new Date().toISOString()` á server gefur nákvæman tíma t.d. `2026-07-09T23:30:15.432Z`. Þetta fer óbreytt sem `departureIso` á fyrsta slot í `buildSingleDepartureTimeline`.

`formatKlTime` í `DepartureHeatmap` skilar `23:30` fyrir `T23:30:xx`.

### Niðurstaða

Kóðinn er réttur. Ef server keyrði við `23:30` á fyrsti slot að sýna `23:30`, ekki `23:00`.

### Líklegustu skýringar á skjámyndinni

1. **Stale result:** Stebbi hafði gamalt niðurstöðu frá keyrslu við `23:00` í browser, sá það þegar v046 var virkjað, en keyrslan sjálf var við `23:00` — Stebbi man rangt eftir tíma.
2. **Keyrslan var við 23:00:** Tímamatið `23:30-ish` er áætlun, ekki mælt.

### Hvernig á að staðfesta eða hrekja

Stebbi þarf að:
1. Keyra leið á localhost.
2. Opna browser → Network tab → POST `/api/teskeid/weather/travel` → Response.
3. Skoða `travelPlan.outbound.timelineCandidates[0].departureIso`.
4. Ef það sýnir t.d. `2026-07-09T23:30:15.432Z` → server er réttur, UI sýnir `23:30`, allt er í lagi.
5. Ef það sýnir `2026-07-09T23:00:00.000Z` þegar keyrsla var við `23:30` → það er raunverulegt vandamál og þarf frekari rannsókn.

**Claude telur P1 vera stale-state eða tímaminnisvillu, ekki kóðavanda.**

## P2 greining: `firstSlotLabel` bundið við single-departure mode

`FerdalagidClient.tsx` sendir `firstSlotLabel={!windowMode ? tf('timelineNowLabel') : undefined}`.

Þetta er rétt í núverandi UI þar sem single-departure er alltaf "leave now". Ef við bætum við explicit future departure UI síðar verður þetta villulegt.

### Mögulegar leiðir þegar þörf kemur

A. Bæta `departureMode: 'now' | 'explicit'` við `TravelPlan.outbound` type og setja það í `checkTravelWeather`.
B. Bera saman `timelineCandidates[0].departureIso` við `result.createdAt` í client og sýna `Núna` aðeins ef munurinn er < 5 mín.

Leið A er hreinlegri. Leið B er endurvirkjanleg án type-breytinga.

**Tillaga: gera ekki neitt núna. Skrá sem TODO þegar explicit departure UI er innleitt.**

## P3 greining: slot spacing

Slottar eru enn `min-w-[42px] px-1.5` og gap á milli er `gap-1.5`. Þetta er lítið en Stebbi sá í skjámynd að scrubber tekur enn mikið rými.

Einföld CSS-breyting:
- `gap-1.5` → `gap-1` í day group `flex`
- `min-w-[42px]` → `min-w-[38px]` á non-first slots (eða `min-w-10`)

Þetta er hægt að gera sem sér litinn patch eftir P1 staðfestingu.

## Næstu skref

1. **Stebbi prófar localhost** per P1 checklist að ofan og staðfestir eða hrekur.
2. **Ef P1 er staðfest sem stale/tímaminnisvillu:** framkvæma P3 spacing patch og gefum út.
3. **Ef P1 er raunverulegt vandamál:** rannsaka frekar (hvar kemur `23:00` frá?).
4. **P2:** Skrá sem TODO, gera ekki í þessum patchi.

## Uncommitted changes

```text
app/auth-mvp/vedrid/FerdalagidClient.tsx
components/weather/DepartureHeatmap.tsx
lib/weather/travel.ts
lib/__tests__/weather-travel.test.ts
messages/en.json
messages/is.json
```

Allt frá v044+v046 — ócommittað, type-check clean, 1961 tests pass.

## Localhost checks for Stebbi (P1 verification)

1. Opna `/auth-mvp/vedrid` á localhost.
2. Ganga úr skugga um að tíminn sé EKKI nákvæmlega á heilli klukkustund (t.d. `23:37`, `08:14`).
3. Keyra venjulega leið.
4. Í Network tab: POST `/api/teskeid/weather/travel` → Response → `travelPlan.outbound.timelineCandidates[0].departureIso`.
5. Ber saman við raunverulegan tíma.
6. Í scrubber: fyrsti slot á að sýna `Núna` + nákvæman tíma, t.d. `23:37`.
7. Ef `23:00` kemur upp þegar tíminn var `23:37` → tilkynna Claude Code með response JSON.

Ekki þarf SQL, Supabase, RLS, auth, secrets eða production gögn. Ekki deploya.
