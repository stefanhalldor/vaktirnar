# Handoff: v208 prerelease — flag rename lokið, release approved

Created: 2026-07-15 12:50
Timezone: Atlantic/Reykjavik
TODO: todo-086

---

## Codex v208 samþykkir release

Engar blockandi villur. Tvö lítil atriði lagfærð:

1. Eitt próf-nafn í `guard.test.ts` leiðrétt — gefur ekki lengur til kynna legacy compat sem er ekki til
2. `.env.local` leiðbeiningar skýrðar: eyða gamla `WEATHER_FLAG`, bæta við nýju var

---

## Typecheck & Próf

```
npx vitest run lib/__tests__/guard.test.ts → 91 passed
```

---

## `.env.local` — handvirkt hjá Stebbi

```env
# EYÐA (óháð hvort true eða false):
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED

# BÆTA VIÐ / UPPFÆRA:
WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true
WEATHER_ELTA_VEDRID_FLAG=true
WEATHER_TRIP_FLAG=true
WEATHER_AI_ENABLED=false
```

---

## Vercel Production target

```env
AUTH_MVP_ENABLED=true

WEATHER_ENABLED=true
WEATHER_PUBLIC_ENABLED=true
WEATHER_AUTH_ACCESS_REQUIRED=true

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

**Eyða úr Vercel eftir deploy verification:**
```
WEATHER_FLAG
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
VEDURSTOFAN_TRAVEL_LAYER_ENABLED
```

---

## Localhost checks fyrir Stebbi

Eftir `.env.local` uppfærslu og handvirka endurræsingu:

1. Opna veðurflæði sem óinnskráður gestur → MET/Yr sýnileg, engar Veðurstofan stýringar
2. Innskrá sem notandi án `vedrid` row → `/auth-mvp/vedrid` blocked
3. Innskrá sem notandi með `vedrid` row → `/auth-mvp/vedrid` opnast með MET/Yr
4. Sama notandi án `weather-provider-vedurstofan` row → Veðurstofan layer falið
5. Bæta við `weather-provider-vedurstofan` row → Veðurstofan layer birtist
6. (Optional) Setja `WEATHER_AUTH_ACCESS_REQUIRED=false` og `WEATHER_FLAG=true`, endurræsa → `/auth-mvp/vedrid` opið því nýtt flagg vinnur yfir gamalt. Setja `=true` aftur.

---

## Skrár breyttar í þessari lotu (v205-v208)

| Skrá | Breyting |
|------|----------|
| `lib/loans/guard.ts` | Nýtt flagg model, precedence fix, comment fix |
| `lib/__tests__/guard.test.ts` | Uppfærð og ný próf, próf-nafn leiðrétt |
| `lib/__tests__/weather-travel-api.test.ts` | beforeEach cleanup |
| `app/(admin)/admin/page.tsx` | flagName props uppfærðar |
| `.env.example` | Ný flagg nöfn og skýringar |
