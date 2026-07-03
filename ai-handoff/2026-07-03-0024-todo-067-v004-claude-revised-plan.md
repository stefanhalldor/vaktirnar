# TODO #67 (proposed) - Claude Code v004 - Endurskoðað útfærsluplán

Created: 2026-07-03 00:24
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Revised implementation plan - handoff til Stebba og Codex til samþykkis

Refs:
- ai-handoff/2026-07-03-0020-todo-067-v003-codex-v002-review-decisions.md
- ai-handoff/2026-07-03-0030-todo-067-v002-claude-phase0-nidustadur.md
- ai-handoff/2026-07-03-0000-todo-067-v001-codex-vedrid-ai-first-handoff.md

Engar skrár breyttar. Þetta er plán til samþykkis.

---

## Leiðréttingar á v002

Codex v003 benti á fimm atriði sem þurfa leiðréttingu frá v002. Hér eru þær:

| v002 assumption | v004 leiðrétting |
|---|---|
| "Ekkert SQL" | Supabase cache migration í Phase 1A ef Stebbi samþykkir (sjá neðar) |
| "`weather`/`vedrid` case" | Feature key er `vedrid` alls staðar |
| "Next.js fetch cache mælt með" | Supabase cache er æskilegri leið |
| "Native fetch vs SDK opið" | Codex mælir með SDK; Stebbi þarf að samþykkja dependency |
| "Phase 1A gefið út án AI" | Fyrsta release candidate hefur AI á bak við `WEATHER_AI_ENABLED` |

---

## Ákvarðanir Stebba (staðfestar)

- **Geocoding:** Byrja ókeypis. Phase 1 notar local alias map. Nominatim/Google/Mapbox bíður.
- **met.no User-Agent:** `Teskeidin/1.0 (+https://teskeid.is; stebbi@teskeid.is)`
- **Cache:** Supabase shared cache æskilegri en in-memory eða Next.js fetch cache.
- **AI implementation:** Anthropic SDK æskilegur. Þarf samþykki Stebba fyrir dependency install.
- **Per-user gate:** `WEATHER_FLAG` support alltaf inni, sama mynstur og önnur feature flögg.
- **Idea slug:** `vedrid` (staðfest: `teskeid.is/hugmyndir/vedrid`).

---

## Feature key og env - endanlegt

| Heiti | Gildi |
|---|---|
| Feature key (checkFeatureAccess, feature_access tafla) | `vedrid` |
| Global kill-switch | `WEATHER_ENABLED` |
| Per-user gate | `WEATHER_FLAG` |
| AI subflag | `WEATHER_AI_ENABLED` |
| AI model | `WEATHER_AGENT_MODEL` (default: `claude-haiku-4-5-20251001`) |
| Anthropic API key | `ANTHROPIC_API_KEY` |
| met.no User-Agent | `METNO_USER_AGENT` |

---

## Supabase cache - tillaga (ekki SQL enn)

Codex v003 bað Claude Code um að leggja fram tillögu áður en SQL er skrifað.

### Heiti töflu

`public.weather_cache`

Skýring: `weather_api_cache` er of langt. `external_api_cache` er of almennt og
hentar ekki ef við viljum sérhæfð indexes eða TTL-rökfræði fyrir veðurgögn.
`weather_cache` er nákvæmt og nógu sérstaklega veðurskylt.

### Dálkar

| Dálkur | Tegund | Lýsing |
|---|---|---|
| `cache_key` | `text PRIMARY KEY` | `metno:{lat3}:{lon3}` - 3 aukastafir |
| `response_body` | `jsonb` | Hrein met.no JSON (TimeseriesArray) |
| `expires_at` | `timestamptz` | Úr `Expires` header - cache gildir til þessa tíma |
| `last_modified` | `text` | Úr `Last-Modified` header - sent í `If-Modified-Since` |
| `fetched_at` | `timestamptz DEFAULT now()` | Hvenær við sóttum |
| `updated_at` | `timestamptz DEFAULT now()` | Hvenær við uppfærðum (304 = no update) |

Engin user data. Engin email. Engin prompt text. Engin auth gögn.
Cache_key er eingöngu hnit (hliðruð á 3 aukastafi) - engin persónugreinanleg merking.

### Primary key og indexes

- `cache_key` er PRIMARY KEY - bæði unique key og aðaluppflettilykill.
- Engin önnur index þarf í Phase 1 (einungis point-lookup eftir hniti).

### RLS

`ALTER TABLE public.weather_cache DISABLE ROW LEVEL SECURITY;`

Skýring: Þessi tafla á að vera aðeins aðgengileg server-side í gegnum service
role helper (`getAdmin()`). Engin authenticated/anon client á að hafa aðgang.
RLS verndar gegn client-aðgangi, en við slepptum henni og hentum þess í stað á:

**Engar grants til `authenticated` eða `anon` hlutverka.** Service role les og
skrifar í gegnum `getAdmin()` á server. Þetta er sterkara en RLS með
`USING (false)` vegna þess að það krefst ekki stöðugrar viðhalds á policy-um.

### Meðhöndlun met.no svara

| Tilvik | Meðhöndlun |
|---|---|
| 200 OK + ný gögn | Vista í `weather_cache`, uppfæra `expires_at`, `last_modified`, `fetched_at`, `updated_at` |
| 304 Not Modified | Nota `response_body` úr cache, uppfæra `updated_at` eingöngu |
| 203 Non-Authoritative | Nota gögn en logga viðvörun |
| 403 Forbidden | Logga villa (líkleg User-Agent/terms villa), skila villustöðu |
| 429 Too Many Requests | Logga, bíða, reyna aftur (einu sinni), skila villustöðu ef enn bilar |
| Önnur 4xx/5xx | Logga, skila villustöðu - nota cache ef til staðar og ekki útrunnið |

Cache logic í `lib/weather/metno.server.ts`:
1. Fletta upp `cache_key` í `weather_cache`.
2. Ef til og `expires_at > now()`: skila `response_body` (enginn met.no kall).
3. Ef til og `last_modified` til: sækja met.no með `If-Modified-Since` header.
   - 304: uppfæra `updated_at`, skila cached body.
   - 200: uppfæra alla dálka, skila nýjum body.
4. Ef ekki til: sækja án `If-Modified-Since`. Vista í cache.

### Cleanup/expiry

Engin `pg_cron` eða sjálfvirk cleanup í Phase 1. Veðurcache geymir einungis
eitt row á hnit og entries eru yfirskrifaðir við næstu sóknir. Gömul gögn fara
ekki að safnast í ótakmarkað magn - ein cache_key = eitt row.

Ef við endum með mörg hnit í framtíðinni er hægt að bæta við `DELETE WHERE
fetched_at < now() - interval '7 days'` í server helper. Þetta er ekki Phase 1.

### Rollback

```sql
DROP TABLE IF EXISTS public.weather_cache;
```

Engar aðrar breytingar á schema.

### Proof: engin notendagögn í cache

- `cache_key`: `metno:64.123:-21.987` - aðeins hnit.
- `response_body`: hrá JSON frá met.no - engin persónuleg gögn.
- `last_modified`, `expires_at`, `fetched_at`, `updated_at`: server timestamps.
- Engin `user_id`, `email`, `prompt`, `session_id`, eða auth data.

Taflan er eins og `robots.txt` eða icon cache - hrá public API gögn á server.

---

## Phase 1A - skrár sem breytast

Þetta er til samþykkis. Engar breytingar gerðar.

### Nýjar/breyttar app og lib skrár

| Skrá | Aðgerð | Innihald |
|---|---|---|
| `lib/loans/guard.ts` | Breyta | Bæta við `vedrid` case í `checkFeatureAccess` |
| `.env.example` | Breyta | `WEATHER_ENABLED`, `WEATHER_FLAG`, `WEATHER_AI_ENABLED`, `WEATHER_AGENT_MODEL`, `ANTHROPIC_API_KEY`, `METNO_USER_AGENT` |
| `app/auth-mvp/heim/page.tsx` | Breyta | `weatherEnabled` + `vedrid` entry í `READY_TESKEID_ROUTES` |
| `components/teskeid/ReadyTeskeidCard.tsx` | Breyta | `vedrid` slug í `SLUG_ICONS` með `Cloud` icon |
| `app/auth-mvp/vedrid/page.tsx` | Ný | UI shell: textarea, dæmachips, svarmótíf, attribution |
| `app/auth-mvp/vedrid/loading.tsx` | Ný | Canonical `TeskeidLoader` |
| `lib/weather/types.ts` | Ný | `WeatherAnswerEnvelope`, `HourPoint`, `DeterministicResult`, `ToolResultId` |
| `lib/weather/thresholds.ts` | Ný | `WEATHER_THRESHOLDS` constants |
| `lib/weather/places.ts` | Ný | Local alias map (Mósó, Grafarholt, Selfoss, Reykjavík o.fl.) |
| `lib/weather/metno.server.ts` | Ný | met.no fetch + Supabase cache + 304/403/429 meðhöndlun |
| `lib/weather/forecast.ts` | Ný | `HourPoint[]` normalizer úr met.no JSON |
| `lib/weather/tools.ts` | Ný | `activityWindow`, `grill` deterministic tool |
| `messages/is.json` | Breyta | `teskeid.vedrid.*` namespace |
| `messages/en.json` | Breyta | `teskeid.vedrid.*` namespace |

### SQL migration (ef Supabase cache er samþykkt)

| Skrá | Innihald |
|---|---|
| `sql/67_weather_cache.sql` | CREATE TABLE `weather_cache`, engar grants til client roles |

**SQL migration þarf sérstakt samþykki Stebba áður en hún er keyrð.**

### Tests

| Skrá | Innihald |
|---|---|
| `lib/__tests__/weather-guard.test.ts` | `checkFeatureAccess` fyrir `vedrid` - sama mynstur og guard.test.ts |
| `lib/__tests__/weather-thresholds.test.ts` | `WEATHER_THRESHOLDS` gildi staðfest |
| `lib/__tests__/weather-tools.test.ts` | `activityWindow`, `grill` - deterministic output, threshold boundaries |
| `lib/__tests__/weather-metno.test.ts` | fetch, cache hit/miss, 304, 403, 429, 203, coordinate rounding |

---

## Phase 1B - skrár sem breytast

Kemur á eftir Phase 1A er rýnt og samþykkt. Þarf sérstakt framkvæmdarleyfi.

| Skrá | Aðgerð | Innihald |
|---|---|---|
| `package.json` | Breyta | Bæta við `@anthropic-ai/sdk` (þarf samþykki) |
| `lib/weather/ai.server.ts` | Ný | Anthropic kall server-side, `toolResultId` validation, contradiction guard |
| `app/api/teskeid/weather/ask/route.ts` | Ný | POST handler: session guard, feature guard, deterministic + AI answer |
| `app/auth-mvp/vedrid/page.tsx` | Breyta | Tengja við ask endpoint, sýna AI vs deterministic svar |
| `lib/__tests__/weather-ai.test.ts` | Ný | AI disabled, invalid toolResultId, contradiction fallback, unsafe wording |

---

## Phase 1C - á eftir Phase 1B

Í Phase 1C: `golfPlayable` og `caravanSafety` deterministic tools.
`route_safety` kemur EKKI fyrr en directions provider er valinn og samþykktur.

---

## Release boundary

Fyrsta release candidate sem Stebbi prófar á localhost þarf **bæði** Phase 1A og
Phase 1B. Vedrid á ekki að gefa út til notenda sem deterministic-only UI. Hins
vegar er lögleg röð:

1. Claude útfærir Phase 1A + Phase 1B saman í einni umferð.
2. Pre-release rýni (Codex).
3. Stebbi prófar locally með `WEATHER_AI_ENABLED=true` og raunverulegan API key.
4. Stebbi gefur út (commit + push + Vercel).

Eða:

1. Claude útfærir Phase 1A.
2. Stebbi prófar internally á localhost með `WEATHER_AI_ENABLED=false` (developer
   sanity check eingöngu, ekki notendaprufun).
3. Claude útfærir Phase 1B.
4. Rýni + prufur + útgáfa.

Báðar leiðir eru í lagi. Stebbi ákveður.

---

## Spurningar sem þarf svör á ÁÐur en Claude fær framkvæmdarleyfi

**1. Supabase cache samþykkt?**

Ef já: SQL migration er hluti Phase 1A og þarf sérstaka rýni.
Ef nei: nota Next.js `fetch` cache (`next: { revalidate: N }`) í `metno.server.ts`.

**2. `@anthropic-ai/sdk` samþykkt?**

Þarf samþykki til að keyra `npm install @anthropic-ai/sdk --save`.
Ef já: Phase 1B notar SDK.
Ef nei: Phase 1B notar native `fetch` á Anthropic API.

**3. `stebbi@teskeid.is` í User-Agent er monitored?**

Ef já: nota `Teskeidin/1.0 (+https://teskeid.is; stebbi@teskeid.is)`.
Ef annað netfang: gefa upp annað.

**4. Phase 1A + 1B í einni umferð eða tveimur?**

Sjá release boundary hér að ofan.

---

## Hvað er EKKI hluti Phase 1

Allt hér að neðan þarf sérstakt samþykki og er utan scope:

- `route_safety` - bíður directions provider.
- `golfPlayable`, `caravanSafety` - Phase 1C, kemur á eftir grill virkar.
- Campsites, Vedurstofa alerts, user profiles, saved home area.
- Crosswind sem status determinant.
- Multiple weather agents.
- Geocoding/directions API keys (Google, Mapbox, OSRM).
- DB columns utan `weather_cache`.
- Public/anon access á weather cache.
- Hvers kyns Phase 2 features.
- Supabase Dashboard breytingar (utan cache migration).
- Commit, push, deploy.
