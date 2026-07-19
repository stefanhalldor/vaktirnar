# 2026-07-19 06:50 - TODO 086 v544 - Claude: v543 findings lokið, prerelease handoff

Created: 2026-07-19 06:50
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

SQL86 var keyrð af Stebba. Route-memory er nú virkt í production. v543 findings #1, #4, #5 leiðrétt. Tests grænir, type-check hreinn.

---

## Hvað var gert í v543 pass

### Finding #1: Veðurstofan provider gating í lookup endpoint

Bætt við `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED` check í
`app/api/teskeid/weather/route-memory/lookup/route.ts`. Endpoint kannar
nú bæði providers í einum auth-call ef annar hvort er restricted:

- Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` og notandi hefur ekki
  `weather-provider-vedurstofan` access: `vedurstofanStationIds: []` í öllum variants
- Ef `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true` og notandi hefur ekki
  `weather-provider-vegagerdin` access: `vegagerdinStationIds: []` í öllum variants
- Supabase session er aðeins sótt ef a.m.k. annar provider er restricted (eitt call þó bæðir séu)

### Finding #4: IcelandRoadmap.md sameinað

- Bætt route-memory implementation section við rót `IcelandRoadmap.md` undir R5
- Skráir corridor lens sem transitional og route-memory sem nýjan grunn
- Skráir privacy contract (engin user_id, engin raw addresses)
- `lib/iceland-routes/IcelandRoadmap.md` eytt (rót er eina canonical source)

### Finding #5: Whitespace

- `lib/weather/routeCautionConstants.ts` blank line at EOF fjarlægt
- `git diff --check` skilar nú bara warnings um LF→CRLF á TODO.md og WORKFLOW.md
  (þetta er `core.autocrlf=true` Git config á Windows, ekki content vandamál)

---

## SQL staða

| Migration | Staða |
|---|---|
| `sql/86_weather_route_memory.sql` | **KEYRÐ** (Stebbi, 2026-07-19) |
| `sql/85_route_observation_aggregate.sql` | DRAFT, DO NOT RUN |
| `sql/82_weather_user_preferences.sql` | Separate concern, ekki keyrð |

Route-memory write/lookup er virkt í production. Næst: reikna leiðir í
`/ferdalagid` til að fylla töflurnar.

---

## Tests

```
npm run test:run -- (6 files)
Tests  145 passed (145)

npx tsc --noEmit
exit 0

git diff --check
warnings only (core.autocrlf, not content errors)
```

---

## Skrár sem breyttust í v543 pass

- `app/api/teskeid/weather/route-memory/lookup/route.ts` — Veðurstofan access gating
- `IcelandRoadmap.md` — route-memory section bætt við R5
- `lib/iceland-routes/IcelandRoadmap.md` — eytt (sameinað í rót)
- `lib/weather/routeCautionConstants.ts` — blank line at EOF fjarlægt

---

## Eftirstandandi findings úr v543

### Finding #2: Writer/lookup mock tests (A6)

Prófin eru enn ekki skrifuð vegna Supabase mock flækju. Stærsta eftirstandandi tæknilega skuldin. Þarf:

- `vi.mock('@/lib/supabase/admin', ...)` pattern í vitest
- `lib/__tests__/route-memory-writer.test.ts` - upsert paths, 0-station provider, variant key
- Handler test fyrir `/api/teskeid/weather/route-memory/lookup` - bad body, miss, provider gating

### Finding #3: usage_count (meðvituð ákvörðun)

Increment-ar ekki. Acceptable v1 per handoff. Laga seinna með SQL RPC ef popularity-röðun er nauðsynleg.

---

## Localhost checks - SQL86 er nú keyrð

1. Reikna leið í `/ferdalagid`, t.d. Reykjavík → Akureyri.
2. Klára niðurstöðu (travel API þarf að keyra).
3. Fara á `/vedrid`, velja sama `Frá`/`Til`.
4. Expected: kortið sýnir aðeins stöðvar sem `/ferdalagid` vistaði, ekki allt landið.
5. Expected: status pillur telja bara route-filteraðar stöðvar.

Access gating (ef applicable):
- Ef `WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true`: public notandi á ekki að sjá Vegagerðin station IDs í lookup response.
- Ef `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true`: public notandi á ekki að sjá Veðurstofan station IDs í lookup response.

---

## Næstu skref (map-picker handoff)

`2026-07-19-0638-todo-086-v542-codex-route-memory-map-picker-handoff` er næsta stóra verkefnið. Þarf `Workflow` frá Stebba til framkvæmdar.

Kröfur:
1. `GET /api/teskeid/weather/route-memory/places` — `from` staðir sem eiga route-memory records
2. `GET /api/teskeid/weather/route-memory/destinations?from=...` — `to` staðir per `from`
3. Canonical place coords registry (`lib/iceland-routes/routePlaces.ts`)
4. `RouteMemoryMapPicker` component
5. Current location via browser geolocation → nearest canonical place
