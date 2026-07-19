# 2026-07-17 14:50 - TODO-086 v428 - Claude: hamburger + middleware diagnosis

Created: 2026-07-17 14:50
Timezone: Atlantic/Reykjavik

## Hvað var gert

### 1. Hamburger menu bætt við WeatherOverviewClient

`components/weather/WeatherOverviewClient.tsx` fékk nýjan `menuVariant` prop og `TeskeidMenu` í haus -- sama mynstur og `FerdalagidClient.tsx:1219`.

Breytingar:
- Bætti við `import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'`
- Nýr prop: `menuVariant?: 'public' | 'authenticated'`
- Haus endurskipulagður: titill/undirtitill til vinstri, `<TeskeidMenu variant={menuVariant} />` til hægri (sýnt aðeins þegar `menuVariant` er sett)

Pages uppfærðar:

| Skrá | menuVariant |
|------|-------------|
| `app/vedrid/page.tsx` | `"public"` |
| `app/auth-mvp/vedrid/page.tsx` | `"authenticated"` |
| `app/auth-mvp/vedrid/elta-vedrid/page.tsx` | `"authenticated"` |

Public variant sýnir: Hugmyndir, Ný hugmynd, Innskráning.
Auth variant sýnir: Teskeið (dashboard), Minn prófíll, Ný hugmynd, útskráning.

## Fundið en ÓLAGAÐ: Middleware læsir station API fyrir public

Station endpointið `/api/teskeid/weather/vedurstofan/stations` er **ekki** í `PUBLIC_PATHS` í `middleware.ts`. Þegar óinnskráður notandi er á `/vedrid` og `WeatherOverviewClient` kallar í þetta API fær hann 401 frá middleware -- route handler keyrir aldrei. Client sér 401 → `providerRestricted=true` → þögult tómt state (engar stöðvar, engin villa).

Þetta er líklega ástæðan fyrir "opnast ekkert fyrir public" sem Stebbi tilkynnti. Stebbi staðfesti að þetta virkar mun betur (líklega vegna v426 lagfæringa á loading.tsx og 404-handling), en station API aðgangur fyrir public er enn ólagaður.

**Lagfæring sem þarf:**

Í `middleware.ts`, bæta við í `PUBLIC_PATHS` array:
```ts
// Public Veðurstofan station overview — read-only cache; handler enforces own flag and access checks
'/api/teskeid/weather/vedurstofan/stations',
```

Sama mynstur og `/api/teskeid/weather/vedurpuls/stations/` sem er þegar þar.

Þetta þarf samþykki frá Stebba áður en það er framkvæmt.

## Skrár sem breyttust í þessari lotu

```
components/weather/WeatherOverviewClient.tsx   (menuVariant prop + TeskeidMenu í haus)
app/vedrid/page.tsx                            (menuVariant="public")
app/auth-mvp/vedrid/page.tsx                   (menuVariant="authenticated")
app/auth-mvp/vedrid/elta-vedrid/page.tsx       (menuVariant="authenticated")
```

## Localhost checks fyrir Stebbi

1. Opna `/vedrid` -- hamburger birtist efst til hægri, sýnir public menu (Hugmyndir, Innskráning o.s.frv.)
2. Opna `/auth-mvp/vedrid` -- hamburger birtist, sýnir auth menu (Teskeið, Minn prófíll, útskráning)
3. Opna `/auth-mvp/vedrid/elta-vedrid` -- hamburger birtist með auth menu
4. Opna `/vedrid` sem **óinnskráður** -- staðfesta hvort stöðvar sjást. Ef engar stöðvar sjást (þögult tómt) þarf middleware fix hér að ofan.

## Næstu skref

1. **Middleware fix** (ef Stebbi staðfestir að public stöðvar sjást ekki): bæta `/api/teskeid/weather/vedurstofan/stations` við `PUBLIC_PATHS` í `middleware.ts`.
2. **B3C provider-neutral shell**: extract-a `WeatherOverviewShell` þegar þessi vandamál eru komin í lag.
