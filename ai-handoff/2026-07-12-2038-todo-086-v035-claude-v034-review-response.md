# TODO 086 - v035 Claude Code svar við v034 Codex rýni

Created: 2026-07-12 20:38
Timezone: Atlantic/Reykjavik
Author: Claude Code
Type: Stöðuskil / review response
Input reviewed: `ai-handoff/2026-07-12-2011-todo-086-v034-codex-v033-phase2a-patch-review.md`

---

## SQL / production

**Þessi patch krefst ENGRAR SQL.** Engin migration. Engin Supabase schema breyting.
`weather_cache` taflan (sql/67) er nú þegar til og virkar. Localhost-prófanir geta farið á móti production gögnum án vandræða.

---

## Niðurstaða v034

Codex samþykkti v033 í grundvallaratriðum. Þrjár leiðréttingar mælt með:

### 1. Medium-high - Global enrichment budget vantar

**Vandinn:** `timeoutMs: 1500` er per HTTP batch. Stöðvalisti hefur 29 stöðvar → allt að 3 batches → worst-case 4.5 sek overhead þótt MET/Yr sé búinn.

**Lausn:** Setja global `Promise.race` utan um allan `vedurstofanFetchPromise` í `route.ts` með ~2 sek heildarbudget. Ef tíminn rennur út: enrichment er sleppt (null), MET/Yr niðurstaðan kemur óbreytt.

Þetta er einfaldara en að breyta provider - route-level `Promise.race` tryggir að HEILDARTAFINN er takmarkaður, óháð batch-fjölda. Provider-level timeout per batch er góður viðbótagrip en nægir ekki einn sér.

```ts
const VEDURSTOFAN_BUDGET_MS = 2000
const vedurstofanResults = vedurstofanFetchPromise
  ? await Promise.race([
      vedurstofanFetchPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), VEDURSTOFAN_BUDGET_MS)),
    ])
  : null
```

### 2. Medium - Engin prófun á Leið A row selection

**Vandinn:** Lykilfixinn (Veðurstofan sýnir ranga röð þegar departure slot breytist) hefur engan regression test.

**Lausn:** Bæta við einni prófun í `travelAuditMap.helpers.test.ts` eða nýja test-skrá sem:
- Stofnar `vedurstofanStation` með 2+ `forecastRows`
- Kallar `buildPointSummary` með tveimur mismunandi `activeCandidate.departureIso`
- Staðfestir að `summary.etaIso` breytist
- Staðfestir í UI-kóðanum að næsta röð af `forecastRows` velst korrekt

Þar sem row-selection er inline í JSX, er einfaldast að nota helper-extract og test á því.

### 3. Low - Empty `forecastRows` gæti renderat `0`

**Vandinn:** `vedurstofanStation?.forecastRows?.length && (...)` skilar `0` ef array er tómur (React renderar `0`).

**Lausn:** Nota `!!` eða `> 0` guard:
```tsx
{vedurstofanStation?.forecastRows && vedurstofanStation.forecastRows.length > 0 && (...)}
```

Einnig: sleppa `vedurstofanStation` alveg ef `payload.forecasts.length === 0` í route.ts enrichment loop (í stað þess að setja `forecastRows: undefined` á stöðvarobjektið).

---

## Tillaga að patchscope v035 (bíður eftir leyfi)

Ef Stebbi gefur framkvæmdarleyfi:

1. Bæta `Promise.race` global budget (~2 sek) við `route.ts` utan um `vedurstofanFetchPromise`
2. Sleppa `vedurstofanStation` í enrichment loop þegar `payload.forecasts.length === 0` (í stað þess að setja `forecastRows: undefined`)
3. Laga `forecastRows?.length &&` → `forecastRows && forecastRows.length > 0 &&` í `RouteWeatherPointDetailCard.tsx`
4. Bæta við focused test á Leið A row selection (helper-extract eða direct test)
5. Bæta við test sem sannar að global budget bindur heildartafann þó batches séu margir
6. Keyra test, type-check, lint, build
7. Gera prerelease handoff

Commit, push, deploy eru ekki hluti - þurfa sérstakt leyfi.

---

## Breytingatillögur mínar á v034-scope

**Einlæg:** Implementa `Promise.race` budget í route.ts frekar en að breyta provider í einu lagi. Þetta er einfaldara, minni kóði, og tryggir global budget án þess að breyta provider-signatures enn einu sinni. Provider-level timeout er viðbótagrip.

**Spurning til Stebba:** Hve langt er ásættanlegt total overhead á Veðurstofan enrichment? Codex mælti með ~2 sek. Ef þetta er of langt (t.d. notendur finna 3-4 sek slow), getum við minnkað í 1.5 sek.

---

## Localhost checks (eftir patch)

Engin SQL þarf. Engar Supabase-breytingar.

1. `npm run test:run` - búist við öllum prófunum (nú 247+, verður fleiri)
2. Opna `/vedrid` á localhost (þ.e. production gögn)
3. Reikna langa leið (Reykjavík - Akureyri) - þetta setur 3 batches í gang
4. Staðfesta að route niðurstaðan komi hratt (innan 10 sek heildar)
5. Smella á route point, breyta departure slot - Veðurstofan tími á að breytast

Engin SQL, engar Supabase-breytingar, engin production touch þarf.

---

## Supabase / RLS / Production

Engar breytingar gerðar. Sama staða og v033.
