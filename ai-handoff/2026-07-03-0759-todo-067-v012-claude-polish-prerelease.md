# TODO #67 Vedrid — Polish handoff (v011 findings leysdar)
**Dagsetning:** 2026-07-03 07:59
**Frá:** Claude (Sonnet 4.6)
**Til:** Stebbi og Codex

---

## Allar v011 findings leysdar

### Medium 1 — admin UI: vedrid section bætt við

**Vandinn:** `app/(admin)/admin/page.tsx` hafði aðeins umonnun og tengsl sections. `FeatureAccessSectionProps.featureKey` var typed sem `'umonnun' | 'tengsl'`.

**Lagfæring:**
- `app/(admin)/admin/page.tsx`:
  - `featureKey` type víkkað: `'umonnun' | 'tengsl' | 'facebook-oauth' | 'vedrid'`
  - Þriðja `FeatureAccessSection` bætt við: `featureKey="vedrid"`, `heading="Veðrið-aðgangur"`, `flagName="WEATHER_FLAG"`

Stebbi getur nú bætt notendum við `vedrid` access í gegnum admin UI án SQL.

### Medium 2 — EXAMPLE_QUESTIONS færð í messages

**Vandinn:** `EXAMPLE_QUESTIONS` var harðkóðaður Íslenskur texti í `VedridClient.tsx`.

**Lagfæring:**
- `messages/is.json` — bætti við `exampleQuestion1/2/3` í `teskeid.vedrid`
- `messages/en.json` — bætti við `exampleQuestion1/2/3` (enska hliðstæða)
- `VedridClient.tsx` — `EXAMPLE_QUESTIONS` byggir nú á `t('exampleQuestion1')` osfrv. og er reiknað innan components (eftir `useTranslations` kall)

### Medium 3 — precipitation missing-data filter

**Vandinn:** Timeseries entries án `next_1_hours` og `next_6_hours` (engin úrkomudata) töldust sem 0 mm/h — mögulega falskt bjartsýnt.

**Lagfæring:**
- `lib/weather/forecast.ts` — `.filter()` sleppir nú einnig entries þar sem bæði `next_1_hours` og `next_6_hours` vantar (við getum ekki greint "engin rigning" frá "engin gögn")
- `lib/__tests__/weather-forecast.test.ts` — 2 ný tests:
  - "skips entries where both next_1_hours and next_6_hours are absent"
  - "keeps entries where next_6_hours is present but next_1_hours is absent"

---

## Prófanir

```
npm run type-check  → clean (0 villur)
npm run test:run    → 47 test files, 1486 passed, 22 skipped, 8 todo
```

---

## Hvað er eftir áður en production rollout

Ekkert blocker. SQL migrations (67 + 68) hafa verið keyrðar á dev (samkvæmt v010 handoff checkmarks). Þú getur nú:

1. Sett `.env.local` og gert localhost smoke-test (sjá v011 checklist)
2. Notað admin UI til að bæta eigin email við `vedrid` access (í stað SQL insert)
3. Þegar localhost er staðfest: rýnt með Codex fyrir production rollout

**Production rollout checklist** (þegar localhost er á hreinu):
- [ ] Keyra `sql/67_weather_cache.sql` á production Supabase
- [ ] Keyra `sql/68_feature_access_vedrid.sql` á production Supabase
- [ ] Bæta völdum emailum við í `feature_access` (admin UI eða SQL)
- [ ] Setja Vercel env: `WEATHER_ENABLED`, `WEATHER_FLAG`, `WEATHER_AI_ENABLED`, `WEATHER_AGENT_MODEL`, `ANTHROPIC_API_KEY`, `METNO_USER_AGENT`
- [ ] Deploya
- [ ] Staðfesta sem allowlisted notandi
- [ ] Staðfesta sem non-allowlisted notandi (feature ósýnilegt)
