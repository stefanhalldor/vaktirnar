# TODO #67 (proposed) - Claude Code v002 - Phase 0 niðurstaður

Created: 2026-07-03 00:10
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Phase 0 read-only mapping - handoff til Stebba og Codex til skoðunar

Refs:
- ai-handoff/2026-07-03-0000-todo-067-v001-codex-vedrid-ai-first-handoff.md

Engar skrár breyttar. Þetta er einungis lestur og greining.

---

## Hvað var skoðað

- `app/auth-mvp/` - route mynstur
- `app/auth-mvp/heim/page.tsx` - home ready-card integration
- `app/auth-mvp/lanad-og-skilad/loading.tsx` - loader mynstur
- `components/teskeid/ReadyTeskeidCard.tsx` - icon og kort mynstur
- `components/teskeid/TeskeidLoader.tsx` - canonical loader component
- `lib/loans/guard.ts` - feature gate mynstur
- `messages/is.json` og `messages/en.json` - message namespaces
- `Design.md` - hönnunarreglur
- `package.json` - dependencies

---

## Niðurstaður

### Route mynstur

Allar innskráðar síður eru undir `app/auth-mvp/{slug}/`. Til staðar:
`heim`, `innskraning`, `lanad-og-skilad`, `minn-profill`, `nyr-adgangur`, `umonnun`.

Vedrid fer á `app/auth-mvp/vedrid/page.tsx` + `loading.tsx`.
API: `app/api/teskeid/weather/ask/route.ts` (eða server action - sjá spurning 4).
Lib: `lib/weather/` modules eins og Codex v001 lagði til.

### Feature gate

`checkFeatureAccess` í `lib/loans/guard.ts` er réttur staður. Sama tvíþrepa
mynstur og umonnun/tengsl/facebook-oauth er þegar útfært. Ekkert sem réttlætir
sérstakt gating-kerfi fyrir Vedrid.

Navnreglur sem fylgja mynstrinu:
- `WEATHER_ENABLED` - global kill-switch
- `WEATHER_FLAG` - optional per-user gate via `feature_access`
- `WEATHER_AI_ENABLED` - sérstakur subflag fyrir AI-lag, óháður access

### Home ready-card integration

`heim/page.tsx` (lína 61-76) kallar `checkFeatureAccess` á hverja feature og
byggir `READY_TESKEID_ROUTES` map handvirkt. `ReadyTeskeidCard` velur icon eftir
`SLUG_ICONS[idea.slug]` fyrst, síðan `CATEGORY_ICONS[idea.category]`.

Vedrid þarf:
1. Entry í `READY_TESKEID_ROUTES` í `heim/page.tsx`: `'vedrid': { href: '/auth-mvp/vedrid', enabled: weatherEnabled }`.
2. Icon í `ReadyTeskeidCard.tsx` SLUG_ICONS: t.d. `Cloud` eða `CloudSun` úr Lucide (þegar til í Lucide, engin ný dependency).
3. Hugmyndin þarf að vera í `ideas` töflunni með `status = 'launched'` og réttum slug til að birtast á heimaskjá.

### Canonical loader

`TeskeidLoader` í `components/teskeid/TeskeidLoader.tsx` er canonical og þegar
til. `app/auth-mvp/lanad-og-skilad/loading.tsx` sýnir rétta notkun:

```tsx
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'
export default async function Loading() {
  const t = await getTranslations('teskeid.loader')
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf9f4]">
      <TeskeidLoader
        ideaTitles={[]}
        loadingLabel={t('loadingLabel')}
        fallbackIdeaTitle={t('fallbackIdeaTitle')}
      />
    </div>
  )
}
```

`umonnun` hefur engan `loading.tsx`. Vedrid skal fylgja `lanad-og-skilad` mynstrinu.

### Messages

Eina veðurtengda strengurinn í repo er `teskeid.home.upcomingWeather: "Veðrið"` -
þetta er hugmyndalisti-texti fyrir heimaskjá, ekki feature namespace.

Vedrid þarf nýjan namespace. Tillaga: `teskeid.vedrid.*` með undirflokkum:
- `teskeid.vedrid.prompt` - textareitur og dæmi
- `teskeid.vedrid.answer` - svar, fallback, af hverju
- `teskeid.vedrid.status` - graent/gult/rautt labels
- `teskeid.vedrid.attribution` - met.no texti

### Anthropic SDK

Ekki til í `package.json`. Tvær leiðir:
- **Native `fetch`**: engin ný dependency, meiri boilerplate, hægt að bæta við SDK seinna.
- **`@anthropic-ai/sdk`**: minni boilerplate, betri types, ein ný dependency.

Þetta þarf samþykki Stebba (sjá spurningar hér að neðan).

### Server-side cache

Ekkert almennt cache-hjálpartól í `lib/`. Þarf að bygga í Phase 1A.

**Vercel/serverless takmörkun:** In-memory cache lifir ekki milli serverless
function invocations. Á Vercel getur hvert request farið í kalt function og
sótt met.no aftur. Þrjár leiðir:

1. **In-memory aðeins (Phase 1 / localhost):** Einfalt, virkar í dev,
   ótilhlíðanlegt í production ef mikill load. Skjala takmörkunina skýrt.
2. **Next.js `fetch` cache:** `fetch(url, { next: { revalidate: N } })` í
   `lib/weather/metno.server.ts`. Virkar á Vercel án utanaðkomandi gagnagrunns.
   Þetta er líklegasta Phase 1 production-lausnin.
3. **Supabase/Redis cache:** Meira scope, þarf samþykki.

Codex mælt með leiðarljósi: nota Next.js `fetch` cache frá upphafi í
`lib/weather/metno.server.ts`, þar sem það er einfalt, Vercel-native og
uppfyllir met.no `Expires`/`If-Modified-Since` kröfur með `next: { revalidate }`.

### Minnsta gagnlega fyrsta intent set

`place_weather_decision` (grill, grillveður í Mósó) sannar alla keðjuna:
- met.no sækja + parse + cache
- deterministic `activityWindow` + `grill` threshold
- AI-first svar þegar `WEATHER_AI_ENABLED=true`
- deterministic fallback þegar ekki

`golfPlayable` og `caravanSafety` koma í Phase 1C eftir að grillið virkar.
`route_safety` bíður geocoding/directions provider-ákvörðunar.

---

## Tillögur að Phase 1A scope (til samþykkis)

Þessar breytingar myndu fylgja í Phase 1A ef Stebbi gefur leyfi:

1. `lib/loans/guard.ts` - bæta við `weather`/`vedrid` case í `checkFeatureAccess`.
2. `.env.example` - bæta við `WEATHER_ENABLED`, `WEATHER_FLAG`, `WEATHER_AI_ENABLED`, `WEATHER_AGENT_MODEL`, `ANTHROPIC_API_KEY`, `METNO_USER_AGENT`.
3. `app/auth-mvp/heim/page.tsx` - bæta við `weatherEnabled` og entry í `READY_TESKEID_ROUTES`.
4. `components/teskeid/ReadyTeskeidCard.tsx` - bæta við `vedrid` slug í `SLUG_ICONS`.
5. `app/auth-mvp/vedrid/page.tsx` - UI shell með textarea, dæmachips, svarmótíf.
6. `app/auth-mvp/vedrid/loading.tsx` - canonical `TeskeidLoader`.
7. `lib/weather/types.ts` - `WeatherAnswerEnvelope` og `HourPoint`.
8. `lib/weather/thresholds.ts` - `WEATHER_THRESHOLDS` constants.
9. `lib/weather/metno.server.ts` - met.no fetch + parse + Next.js fetch cache.
10. `lib/weather/forecast.ts` - `HourPoint[]` normalizer.
11. `lib/weather/places.ts` - `resolvePlace` (staðbundin uppfletting í Phase 1, geocoding seinna).
12. `lib/weather/tools.ts` - `activityWindow`, `grill` tool wrapper.
13. `messages/is.json` og `messages/en.json` - `teskeid.vedrid.*` namespace.
14. Tests undir `lib/__tests__/` - guard, thresholds, metno parse, cache, tool results.

Phase 1B (AI call) og Phase 1C (fleiri intents) koma á eftir Phase 1A er rýnt.

**Ekkert SQL.** Vedrid Phase 1 þarf engar DB-breytingar. `ideas` töflufærsla
(slug `vedrid`, `status = 'launched'`) þarf Stebbi að gera í Supabase Dashboard
þegar hann vill að Vedrid birtist á heimaskjá.

---

## Spurningar til Stebba sem þarf svör áður en Phase 1A byrjar

**1. Geocoding provider**

`resolvePlace("Mósó")` þarf einhverja uppflettingu. Valkostir:

- **Nominatim / OpenStreetMap:** Ókeypis, enginn API-lykill, privacy-friendly,
  en gæði á íslensku staðanöfnum eru breytileg. Hægt að nota í Phase 1 með
  handvirku staðbundnu fallback-map (`"Mósó" -> "Mosfellsbær"`).
- **Google Places:** Gæðamikið, kostar peninga eftir magni.
- **Mapbox Geocoding:** Gott gæðaverð, eitt API-lykil.

Mælt er með: byrja með handvirkt staðbundið map (10-20 staðir) í Phase 1 svo
við þurfum ekki að velja provider strax. Geocoding kemur þegar náttúrulegar
spurningar þurfa breiðari staðaþekkingu.

**2. METNO_USER_AGENT strengur**

met.no krefst auðþekkjanlegs User-Agent. Dæmi:
`Teskeidin/1.0 (+https://teskeid.is; hallo@teskeid.is)`

Hvaða netfang á að vera? Er `hallo@teskeid.is` rétt?

**3. Next.js fetch cache vs in-memory**

Sjá lýsingu hér að ofan. Mælt er með Next.js `fetch` cache í Phase 1. Er það
í lagi eða vill Stebbi annaðhvort in-memory (einfaldara) eða Supabase (meiri scope)?

**4. Native `fetch` vs `@anthropic-ai/sdk`**

Hvorn kýst þú í Phase 1B? Báðar leiðir virka. SDK er hægt að bæta við seinna
ef við byrjum á native fetch.

**5. Per-user gating frá upphafi**

`WEATHER_FLAG` support er ókeypis að setja inn (mynsturið er þegar til og kostar
eina `if`-setningu). Villtu hafa þessa möguleika í Phase 1 eða byrja með
global-only (`WEATHER_ENABLED` ein og sér)?

**6. Slug í `ideas` töflunni**

Hvað heitir Vedrid-hugmyndin í `slug` dálknum í `ideas` töflunni (ef hún er
þar)? Eða er Vedrid ekki enn skráð sem idea í DB?

---

## Hvað er EKKI spurning - þetta er þegar ákveðið

- AI-first design: Phase 1 hefur AI-lag. Codex v001 staðfesti þetta.
- `WEATHER_AI_ENABLED` subflag: AI í bak við sérstakan flag.
- Deterministic tools eru source of truth. AI túlkar, velur, orðar. Aldrei uppfinst.
- `route_safety` kemur ekki fyrr en directions provider er samþykktur.
- Engar Phase 2 features í Phase 1 (campsites, Vedurstofa alerts, crosswind status).
- Engar DB-migrations í Phase 1.
- `ANTHROPIC_API_KEY` er server-only. Aldrei í `NEXT_PUBLIC_*`.
- met.no kallað aðeins server-side, aldrei úr browser.
- met.no attribution sýnileg í UI.
