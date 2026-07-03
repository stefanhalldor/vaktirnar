# TODO #67 (proposed) - Claude Code v006 - Mini-revision á v004

Created: 2026-07-03 07:09
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Mini-revision - leiðréttingar á v004 cache plan + localhost checks

Refs:
- ai-handoff/2026-07-03-0700-todo-067-v005-codex-v004-review-handoff.md
- ai-handoff/2026-07-03-0024-todo-067-v004-claude-revised-plan.md

Engar skrár breyttar. Þetta er plán til samþykkis.

v004 er í gildi að öðru leyti. Þetta skjal leiðréttir einungis þá þætti sem
Codex v005 benti á.

---

## Leiðréttingar á v004

### 1. RLS á `weather_cache`

v004 sagði: `DISABLE ROW LEVEL SECURITY`
v006 leiðréttir: ENABLE RLS, engar client policies, explicit revokes.

Rétt SQL-stefna:

```sql
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;
-- Engar policies = öll client access blocked by default
REVOKE ALL ON public.weather_cache FROM PUBLIC;
REVOKE ALL ON public.weather_cache FROM anon;
REVOKE ALL ON public.weather_cache FROM authenticated;
-- Service role fær aðgang í gegnum getAdmin() server helper - þarfnast ekki
-- sérstaks GRANT þar sem service role er undanskilin RLS
```

Þetta þýðir:
- Enginn client (anon, authenticated) getur lesið eða skrifað í töfluna beint.
- Server code í gegnum `getAdmin()` (service role) virkar áfram.
- Ef einhver bætir við policy eða grant í framtíðinni er RLS þar sem hlífðin.

### 2. Cache key

v004 sagði: `metno:{lat3}:{lon3}`
v006 leiðréttir: `metno:locationforecast:2.0:compact:{lat3}:{lon3}`

Dæmi: `metno:locationforecast:2.0:compact:64.123:-21.987`

Skýring: Provider, API-fjölskylda, útgáfa og endpoint-tegund í lyklinum
forðast samanrekstur ef nowcast, alerts eða annar provider bætist við seinna.
Auðveldara að fletta upp og hreinsa.

### 3. Cleanup/expiry

v004 sagði: "Engin cleanup þarf í Phase 1 - ein cache_key = eitt row."

v006 leiðréttir: Þetta er rétt fyrir Phase 1 (grill í Mósó o.fl.) en of bjartsýnt
þegar route sampling kemur inn og getur skapað mörg hnit.

Stefna:

- **Phase 1:** Eitt row á `cache_key`. Rows yfirskrifaðir við næstu sóknir.
  Enginn pg_cron. Cleanup-þörf er lítil.
- **Server helper cleanup path (skjalað, útfært ef þörf krefur):**
  Hægt að bæta `DELETE FROM weather_cache WHERE fetched_at < now() - interval '14 days'`
  inn í `metno.server.ts` cleanup-fall sem Stebbi kveikir á handvirkt eða við
  route sampling deployment. Þetta er ekki Phase 1.
- **Phase 1C (route sampling):** Ef route sampling bætist við kemur sérstök
  cleanup-rýni. Þá er líklegt að `pg_cron` eða tímasett server helper verður
  þörf. Þarf samþykki þá.

`expires_at` og `fetched_at` dálkar eru í töflunni og gera þetta mögulegt
þegar við erum tilbúin.

### 4. User-Agent

v004 sagði: `Teskeidin/1.0 (+https://teskeid.is; stebbi@teskeid.is)`
v006 leiðréttir: `Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)`

### 5. Phase 1A og 1B sem eitt product lot

v004 útskýrðist ekki nógu skýrt um release boundary.

v006 staðfestir:

- Phase 1A (foundation) og Phase 1B (AI) eru **eitt product lot**.
- Phase 1A er **innri checkpoint** - ekki notendaprufun, ekki release.
- Fyrsta release candidate sem Stebbi prófar á localhost inniheldur bæði.
- Codex rýnir áður en commit/push/deploy.

---

## Endanlegt Supabase cache plan (uppfært)

### Tafla: `public.weather_cache`

```
cache_key    text PRIMARY KEY   metno:locationforecast:2.0:compact:64.123:-21.987
response_body  jsonb            Hrein met.no JSON
expires_at   timestamptz        Úr Expires header
last_modified  text             Úr Last-Modified header - sent í If-Modified-Since
fetched_at   timestamptz DEFAULT now()
updated_at   timestamptz DEFAULT now()
```

### RLS og grants

```sql
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.weather_cache FROM PUBLIC;
REVOKE ALL ON public.weather_cache FROM anon;
REVOKE ALL ON public.weather_cache FROM authenticated;
```

Engar policies. Service role les/skrifar í gegnum `getAdmin()`.

### Rollback

```sql
DROP TABLE IF EXISTS public.weather_cache;
```

---

## Localhost checks for Stebbi

Þessar prófanir koma þegar Phase 1A + 1B eru útfærð.

### Feature disabled

- `WEATHER_ENABLED` ósett eða false.
- Opna `/auth-mvp/heim` - Vedrid á ekki að birtast sem virkt kort.
- Opna `/auth-mvp/vedrid` beint - á að fá redirect/block eins og önnur girt feature.

### Per-user gate

- `WEATHER_ENABLED=true`, `WEATHER_FLAG=true`.
- Innskrá sem notandi UTAN `feature_access(feature_key='vedrid')` - á ekki að fá aðgang.
- Innskrá sem notandi Á lista - á að fá aðgang.
- Breyta ekki production allowlista í þessari prufun. Nota localhost-notanda.

### AI óvirkur

- `WEATHER_ENABLED=true`, `WEATHER_AI_ENABLED=false`.
- Spyrja: "Er grillveður í Mósó í kvöld?"
- Æskt: deterministic svar birtist. Enginn Anthropic-kall. Enginn API-lykill þarf.

### AI virkur

- `WEATHER_ENABLED=true`, `WEATHER_AI_ENABLED=true`, gildur `ANTHROPIC_API_KEY` á server.
- Spyrja sömu spurningu.
- Æskt: AI-orðað svar ef það staðfestist gegn deterministic `toolResultId`.
- Ef útfærsla hefur dev/test hook: þvinga AI-villu og staðfesta deterministic fallback.
- API-lykill má aldrei birtast í client output, logs eða network responses.

### Cache

- Spyrja sömu spurningu tvisvar.
- Æskt: önnur beiðni notar cache eða conditional revalidation. met.no er ekki
  kallað tvisvar á sömu hnit innan gildistíma.
- Staðfesta í server logs ef mögulegt.
- Cache rows innihalda engin notendagögn, engar email, engar prompts.

### Mobile UI

- Opna `/auth-mvp/vedrid` við 360px, 390px og 460px.
- Setja focus á textarea með mobile keyboard opið.
- Æskt: enginn zoom, ekkert láréttur overflow, controls skarast ekki, submit/loading
  breytir ekki breidd.

### Safety wording

- Spyrja hávinds- eða hjólhýsisspurningu ef sá intent er studdur.
- Æskt: engin tryggingarmál: "öruggt", "engin hætta", "tryggt", "safe".
- Svar notar varúðarmál: "ekki mælt með", "bíddu frekar", "farðu varlega" o.fl.

### Ekki prófa þetta óformlega

- Production Supabase migrations.
- Production `feature_access` lista.
- Production `ANTHROPIC_API_KEY` eða billingáhrif.
- Hraðar met.no fyrirspurnalúppur.
- Commit, push, deploy.

Þetta þarf allt sérstakt og skýrt samþykki Stebba.

---

## Staða ákvarðana - allar staðfestar

| Spurning | Ákvörðun |
|---|---|
| Supabase cache | Já |
| RLS á weather_cache | ENABLE + REVOKE, engar policies |
| Cache key | `metno:locationforecast:2.0:compact:{lat3}:{lon3}` |
| Anthropic SDK | Já (`@anthropic-ai/sdk`) |
| met.no User-Agent | `Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)` |
| Per-user gate | Alltaf inni (`WEATHER_FLAG`) |
| Geocoding Phase 1 | Local alias map |
| Phase 1A + 1B | Eitt lot, 1A er innri checkpoint |
| Idea slug | `vedrid` |
| Feature key | `vedrid` |

---

## Næsta skref

v006 er tilbúið til rýni. Ef Stebbi og Codex samþykkja þetta plán getur Stebbi
gefið skýrt og afmarkað framkvæmdarleyfi fyrir Phase 1A + 1B lot.
