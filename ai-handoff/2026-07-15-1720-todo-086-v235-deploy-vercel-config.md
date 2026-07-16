# v233 deploy handoff: Vercel env config + release

Created: 2026-07-15 17:20
Timezone: Atlantic/Reykjavik
Relevant TODO: todo-086
Localhost: passed successfully

## Env var review

### Ein leiðrétting þarf — NEXT_PUBLIC_SITE_URL

```
NEXT_PUBLIC_SITE_URL=http://localhost:3005   ← RANGT í production
NEXT_PUBLIC_SITE_URL=https://teskeid.is     ← RÉTT
```

Þetta er notað í email links (password reset, verification). Ef það er rangt fara email með localhost links.

### Allt annað lítur rétt út

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://bpjwgutpzsifjaucvkbk.supabase.co   ✓
NEXT_PUBLIC_SUPABASE_ANON_KEY=...                                     ✓
SUPABASE_SERVICE_ROLE_KEY=...                                          ✓

# Auth
VOTE_SECRET=...                                                        ✓
AUTH_CODE_SECRET=...                                                   ✓
UNSUBSCRIBE_SECRET=...                                                 ✓

# Email
RESEND_API_KEY=...                                                     ✓
EMAIL_FROM=Teskeið <teskeid@mail.gottvibe.is>                         ✓
REPLY_TO=teskeid@gottvibe.is                                           ✓

# Site
NEXT_PUBLIC_SITE_URL=https://teskeid.is                               ← leiðrétta
ADMIN_EMAILS=stefanhalldor@gmail.com,teskeid@gottvibe.is              ✓

# Feature flags
AUTH_MVP_ENABLED=true                                                  ✓
LOANS_ENABLED=true                                                     ✓
UMONNUN_ENABLED=true                                                   ✓
UMONNUN_FLAG=false                                                     ✓  (feature falið)
TENGSL_ENABLED=true                                                    ✓
TENGSL_FLAG=true                                                       ✓

# Weather — kjarnauppsetning
WEATHER_ENABLED=All                                                    ✓  (public + authenticated)
WEATHER_AUTH_ACCESS_REQUIRED=true                                      ✓  (private vedrid gate)
WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true                     ✓  (Veðurstofan gate)
WEATHER_TRIP_FLAG=true                                                 ✓
WEATHER_ELTA_VEDRID_FLAG=true                                          ✓
WEATHER_AI_ENABLED=false                                               ✓  (engin AI kostnaður)

# Maps
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)  ✓
WEATHER_MAP_PROVIDER=google                                            ✓
GOOGLE_MAPS_SERVER_KEY=...                                             ✓
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=...                                ✓

# Cron
CRON_SECRET=...                                                        ✓
```

### Ekki þarf (slepptu)

```
WEATHER_PUBLIC_ENABLED   — legacy flag, ekki þarf með WEATHER_ENABLED=All
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED   — ef þetta er ekki í .env núna er það OK
```

### Valfrjálst (default er OK)

```
WEATHER_PUBLIC_IP_DAILY_LIMIT   — default er 5 trips/dag fyrir gest. Hægt að bæta við seinna.
```

---

## Skipanir til að gefa út

### 1. Stage nákvæmlega þessar skrár

```bash
git add lib/weather/weatherBaseAccess.server.ts
git add lib/weather/weatherEnabledMode.server.ts
git add app/api/teskeid/weather/saved-places/route.ts
git add "app/api/teskeid/weather/saved-places/[id]/route.ts"
git add app/hugmyndir/[slug]/page.tsx
git add app/page.tsx
git add app/vedrid/page.tsx
git add lib/__tests__/home-page.test.tsx
git add lib/__tests__/place-search-api.test.ts
git add lib/__tests__/public-landing.test.ts
git add lib/__tests__/weather-public.test.ts
git add lib/__tests__/weather-routes-api.test.ts
git add lib/__tests__/weather-saved-places-api.test.ts
git add lib/__tests__/weather-travel-api.test.ts
git add lib/__tests__/weather-vedurstofan-projector.test.ts
git add lib/__tests__/weather-vedurstofan-warmer.test.ts
```

Ekki `git add .` — worktreen er óhrein með ótengt efni.

### 2. Staðfesta staged skrár

```bash
git status --short
```

Ætti að sýna bara ofangreindar 16 skrár sem `M` eða `A`.

### 3. Commit

```bash
git commit -m "fix: WEATHER_ENABLED=Authenticated allows all signed-in users, fix guest redirect to /innskraning (#86)"
```

### 4. Push

```bash
git push
```

### 5. Breyta NEXT_PUBLIC_SITE_URL í Vercel

Vercel → Project Settings → Environment Variables → finna `NEXT_PUBLIC_SITE_URL` → breyta í `https://teskeid.is`.

### 6. Bíða eftir Vercel build

Fylgjast með build logs. Ef build tekst → fara í post-deploy checks.

---

## Post-deploy checks á teskeid.is

**WEATHER_ENABLED=All** er í production:

1. Óinnskráður: fara á `teskeid.is` → sjá Veðrið kort → smella → `/vedrid` opnast með MET/Yr tíðarfar.
2. Óinnskráður: fara á `teskeid.is/hugmyndir/vedrid` → CTA hnappur → `/vedrid` opnast.
3. Innskráður sem `stebbishj@gmail.com` (engin vedrid): `/auth-mvp/heim` → Veðrið sýnist → `/auth-mvp/vedrid` opnast → MET/Yr virkar → Veðurstofan kemur EKKI.
4. Innskráður sem `teskeid@gottvibe.is` (hefur `weather-provider-vedurstofan`): Veðurstofan kemur.
5. Vistaðar staðsetningar virka fyrir innskráðan notanda (án vedrid).

---

## Hvað er í þessum commit

- **Kjarnalagfæring**: `WEATHER_ENABLED=Authenticated` leyfir nú öllum innskráðum notendum (ekki bara þeim með `vedrid` row)
- **Bugfix**: Óinnskráðir notendur sem smella á Veðrið í `Authenticated` mode fara á `/innskraning` í stað `/`
- **Tvær nýjar skrár**: `weatherEnabledMode.server.ts` og uppfærð `weatherBaseAccess.server.ts`
- **Prófanir**: 2561 próf, raunveruleg unit test fyrir `getWeatherEnabledMode()` og `resolveWeatherBaseAccess()`
