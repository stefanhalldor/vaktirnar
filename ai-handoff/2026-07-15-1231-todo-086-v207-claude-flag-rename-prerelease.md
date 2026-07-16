# Handoff: v207 prerelease — flag rename lokið

Created: 2026-07-15 12:45
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Hvað var lagað frá v206

- Kóðaathugasemd í `guard.ts` um `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`: leiðrétt úr "equivalent to default" í "no longer read — remove after deploy"
- Rétt `.env.local` leiðbeiningar (v206 handoff hafði ranglega `=false`)
- Localhost checks bætt við

Engar breytingar á kóðalogik.

---

## Typecheck & Próf

```
npx tsc --noEmit        → hreinn
npx vitest run [guard, weather-travel-api] → 105 passed
```

---

## Vercel Production target

```env
AUTH_MVP_ENABLED=true

WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true               # opið fyrir gestnotendur (MET/Yr)
WEATHER_AUTH_ACCESS_REQUIRED=true         # per-user gát á /auth-mvp/vedrid

WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true

WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false

METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
WEATHER_MAP_PROVIDER=google
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://teskeid.is
```

**Eyða úr Vercel eftir að deploy er staðfestur:**
```
WEATHER_FLAG                          (kóðinn les þetta ekki lengur þegar WEATHER_AUTH_ACCESS_REQUIRED er sett)
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED  (kóðinn les þetta hvergi lengur)
VEDURSTOFAN_TRAVEL_LAYER_ENABLED      (kóðinn las þetta aldrei)
```

---

## `.env.local` — handvirkt hjá Stebbi

```env
# Skipta út:
WEATHER_FLAG=false                        →  WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true →  WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
# Bæta við:
WEATHER_PUBLIC_ENABLED=true
# Eyða:
VEDURSTOFAN_TRAVEL_LAYER_ENABLED=true
```

Ef Stebbi vill prófa "opinn auth" mode staðbundið (enginn per-user gát): `WEATHER_AUTH_ACCESS_REQUIRED=false`. En í venjulegu þróunarumhverfi á það að vera `=true` til að spegla production.

---

## Localhost checks fyrir Stebbi

Eftir uppfærslu á `.env.local` og handvirka endurræsingu:

1. **Public MET/Yr** — opna veðurflæði sem óinnskráður gestur.
   - Á: MET/Yr spá sýnileg.
   - Á ekki: Veðurstofan stýringar eða layer.

2. **Auth weather lokað** — innskráður notandi án `vedrid` feature_access row.
   - Opna `/auth-mvp/vedrid`.
   - Á: blocked / redirect.

3. **Auth weather opið** — notandi með `feature_access = vedrid`.
   - Opna `/auth-mvp/vedrid`.
   - Á: síðan opnast.

4. **Veðurstofan án provider-aðgangs** — notandi með `vedrid` en ekki `weather-provider-vedurstofan`.
   - Á: MET/Yr virkar, Veðurstofan layer falið.

5. **Veðurstofan með provider-aðgangs** — notandi með báðar rows.
   - Á: Veðurstofan layer birtist.

6. **Legacy conflict sanity check** — tímabundið:
   ```env
   WEATHER_AUTH_ACCESS_REQUIRED=false
   WEATHER_FLAG=true
   ```
   Endurræsa handvirkt. Á: `/auth-mvp/vedrid` opið þar sem nýtt flagg vinnur yfir gamalt.
   Setja `WEATHER_AUTH_ACCESS_REQUIRED=true` aftur á eftir.

---

## Athugasemd: Provider graduation og refresh/freshness endpoints

Þegar Veðurstofan er "graduateð" síðar með `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false` munu freshness og refresh endpoints opnast fyrir alla innskráða notendur (ekki bara þá með provider row). Þetta er vegna þess að báðar þessar routes nota `checkFeatureAccess(..., 'weather-provider-vedurstofan')`. Stebbi þarf að ákveða hvort manual refresh á líka að graduatast eða vera áfram tester-only — áður en það er gert í production.

---

## Skrár breyttar í þessari lotu (v205-v207)

| Skrá | Breyting |
|------|----------|
| `lib/loans/guard.ts` | Precedence fix + nýtt flagg model + comment fix |
| `lib/__tests__/guard.test.ts` | Uppfærð og ný próf (105 total) |
| `lib/__tests__/weather-travel-api.test.ts` | beforeEach cleanup fyrir nýtt flagg |
| `app/(admin)/admin/page.tsx` | flagName props uppfærðar |
| `.env.example` | Ný flagg nöfn, legacy skráð sem "remove after deploy" |
