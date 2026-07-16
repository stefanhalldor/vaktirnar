# TODO 086 v184 - Localhost prófanalisti fyrir Veðurstofan provider

Created: 2026-07-14 22:15
Timezone: Atlantic/Reykjavik

Mode:
- Handoff only. Engar kóðabreytingar.
- Þessi handoff er localhost prófanalisti fyrir Stebbi.

Byggist á:
- `ai-handoff/2026-07-14-2200-todo-086-v182-claude-security-review-full.md`
- `ai-handoff/2026-07-14-2117-todo-086-v183-codex-v182-security-review.md`

---

## Localhost todo listi -- Veðurstofan provider

### 1. Athuga Supabase stöðu (lestur only)

Keyrðu þessar SQL fyrirspurnir í Supabase SQL editor (les-aðeins, engin breyting):

```sql
-- Athuga profiles RLS (a vera id = auth.uid(), ekki true)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- Athuga weather_saved_places RLS
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'weather_saved_places';

-- Athuga ad vidkvamar toeflur se ekki opnar authenticated/anon
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'loan_items','loan_invitations','recent_events',
    'relationships','feature_access','weather_saved_places'
  )
ORDER BY table_name, grantee, privilege_type;
```

Ef `profiles_select` syenir `USING (true)` tharf migration 41 ad fara i fyrst adur en vid vikkum adgang.

---

### 2. Keyra migration 75 (ef ekki buoid)

Keyrdu `sql/75_weather_fetch_runs_metadata.sql` i Supabase SQL editor.

Thetta baetir vid tofluna sem weather refresh notar til ad rekja keyrsluastand. Tharf ad vera til adur en migration 76 gengur.

---

### 3. Keyra migration 76

Keyrdu `sql/76_feature_access_weather_provider_vedurstofan.sql` i Supabase SQL editor.

Thetta baetir `weather-provider-vedurstofan` vid leyfdar gildi i `feature_access_feature_key_check` constraint. An thess mun `/admin` gefa villu thegar thu reynir ad veita adgang.

---

### 4. Setja env vars i `.env.local`

Hér eru allar env breytur sem tengjast veðrinu og Veðurstofan provider. Athugaðu stöðu hverrar:

#### Undirstöður (verða að vera til staðar)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # verður að vera sett
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # verður að vera sett
SUPABASE_SERVICE_ROLE_KEY=          # verður að vera sett

# Kveikir á /auth-mvp/* og /api/auth-mvp/* — án þess virkar ekkert
AUTH_MVP_ENABLED=true
```

#### Veðrið (kveikir á vedrid feature)

```
# Kveikir á Veðrið almennt fyrir alla innskráða notendur (ef WEATHER_FLAG er ekki sett)
WEATHER_ENABLED=true

# Ef sett á true: aðeins notendur með weather row í feature_access fá aðgang
# Ef ekki sett: allir innskráðir notendur fá aðgang (þegar WEATHER_ENABLED=true)
# WEATHER_FLAG=true
```

#### Veðurstofan provider (nýtt í TODO 086)

```
# Kveikir á Veðurstofan travel-layer provider fyrir notendur með weather-provider-vedurstofan access.
# Ef ekki sett eða false: MET/Yr-only, jafnvel þótt notandi hafi feature row.
# Þarf migration 76 í Supabase til að vera gagnlegt.
WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=true
```

#### Ferðalag og Elta veðrið (per-user, aðskildir flags)

```
# Per-user aðgangsstýring fyrir Ferðalag affordance (falið án þessa)
# WEATHER_TRIP_FLAG=true

# Per-user aðgangsstýring fyrir Elta veðrið validator (falið án þessa)
# WEATHER_ELTA_VEDRID_FLAG=true
```

#### Kortaveitur (Google Maps)

```
# Server key — aðeins Geocoding API + Routes API. Fer aldrei í vafra.
GOOGLE_MAPS_SERVER_KEY=

# Browser key — Maps JS API + Places API + Maps Static API.
# HTTP referrer takmarkanir: https://teskeid.is/*, http://localhost:*/*
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=

# Stillir kortaveitu. Settu "google" til að virkja kort og route weather.
# Án þessa er kortahluti óvirkur.
WEATHER_MAP_PROVIDER=google
```

#### Reverse geocode (opt-in, sjálfgefið óvirkt)

```
# Verður að vera "true" til að virkjast. Sjálfgefið óvirkt vegna framleiðslufríðni.
# Krefst AUTH_MVP_ENABLED=true + vedrid feature access.
ENABLE_REVERSE_GEOCODE=
```

#### AI veðurspá (valkvætt)

```
WEATHER_AI_ENABLED=
WEATHER_AGENT_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=
```

#### MET.no User-Agent (verður að vera sett í framleiðslu)

```
METNO_USER_AGENT=Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)
```

---

Endurraedstu `npm run dev` eftir breytinguna a `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED`.

---

### 5. Veita profunarnotanda adgang

Fardu a `/admin` og finndu `Vedurstofan-vedurlagalayer` hlutann.
Slaadu inn netfang profunarnotanda og smelltu a "Veita adgang".

---

### 6. Prova sem notandi med adgang

- Skradu thig inn sem sa notandi.
- Fardu a `/auth-mvp/vedrid`.
- Settu inn upphafsstad og afangastad og reiknaadu leid.
- Vaentanlegt: Vedurstofan layer controls birtast (provider toggle, manual refresh, stodvar a korti).

---

### 7. Prova sem notandi an adgangs

- Skradu thig inn sem annar notandi sem hefur ekki `weather-provider-vedurstofan` row.
- Fardu a `/auth-mvp/vedrid` og reiknaadu somu leid.
- Vaentanlegt: Aedeins MET/Yr hegdun, engar Vedurstofan controls.

---

### 8. Prova env kill switch

- Breyttu i `.env.local`: `WEATHER_PROVIDER_VEDURSTOFAN_ENABLED=` (tomt eda commenta ut).
- Endurraedstu `npm run dev`.
- Skradu thig inn sem notandinn sem HAS feature row.
- Vaentanlegt: MET/Yr-only hegdun, jafnvel thott feature row se til.
- Settu env var aftur a `true` og endurraedstu.

---

### 9. Provanir a lanad og skilad einangrun (valkvaedt)

Ef thu vilt stadfesta oryggishlutana:

- Notandi A skapar lan, afritar detail URL.
- Notandi B (ekki lanveitandi/lantaka) opnar URL.
- Vaentanlegt: 404 eda engar upplysingar.

---

## Naesta skref eftir provanir

Tilkynntu Claude Code hvad kom ut. Thad sem eftir er i TODO 086:

- Commit og push a loknum provaningum (med Stebbi-samthykki).
- Naesta TODO-067/086 feature vinna ef eitthvad er eftir.
