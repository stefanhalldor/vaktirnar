# Claude handoff: TODO #46 v005 - v003/v004 audit done, bíður eftir framkvæmdarleyfi

Created: 2026-07-10 14:00
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, v003/v004

## Staða

### P0 lagfærður: regex `/s` flag

`lib/__tests__/user-codes.test.ts` notaði `/s` flag (dotAll) sem er aðeins studd í ES2018+.
`tsconfig.json` er með `target: "ES2017"` — type-check féll með TS1501.

Lagfæring: þrjú `toMatch(/…/s)` skipt út fyrir `toContain(...)` pair eða ES2017-vænt check.

```
npm run type-check  ->  clean
npm run test:run    ->  2020 passed, 0 failed
```

**Kóðinn er EKKI committaður eða pushaður.**

SQL migration 72 er enn ókeyrð. Deployment order helst:
1. Keyra SQL 72 í production.
2. Deploya app-kóða.

---

## Audit: public Veðrið og Umönnun

Claude las v003 og v004 handoff og staðfesti tæknilega stöðu. Hér eru niðurstöður.

### API-köll sem FerdalagidClient gerir

| # | Method | Slóð | Tilgangur |
|---|--------|------|-----------|
| 1 | GET | `/api/teskeid/weather/saved-places` | Sækir vistaða staði við upphaf |
| 2 | POST | `/api/teskeid/weather/travel/routes` | Sækir leiðamöguleika frá Google |
| 3 | POST | `/api/teskeid/weather/saved-places` | Vistar valinn stað |
| 4 | GET | `/api/teskeid/weather/saved-places` | Uppfærir lista eftir vistun |
| 5 | DELETE | `/api/teskeid/weather/saved-places/{id}` | Eyðir gömlum stað |
| 6 | POST | `/api/teskeid/weather/travel` | Sækir ferðaveðurspá |

Í guest mode: köll 3, 4, 5 eru sleppt af client. Köll 2 og 6 þurfa að virka án innskráningar.
Kall 1 á að skila `{ places: [] }` í stað 401.

---

### Tæknileg staðfesting á hverjum lið

#### Middleware-blokk

`middleware.ts` lína 168-176 skilar 401 fyrir öll `/api/` köll þegar notandi vantar og slóðin er ekki í `PUBLIC_PATHS`. Weather-slóðirnar eru **ekki** í `PUBLIC_PATHS` núna.

Þarf að bæta við:
- `/api/teskeid/weather/travel/routes`
- `/api/teskeid/weather/travel`
- `/api/teskeid/weather/saved-places`

Route handlers sjá svo sjálfir um auth/flag check. Middleware hættir bara að blokka.

#### `recordTeskeidUsageEvent` og `userId: null`

**Staðfest: TypeScript type leyfir ekki null.**

```ts
// lib/teskeid/usage.server.ts
type UsageEventInput = {
  userId: string  // ekki string | null
  ...
}
```

Mæling: **sleppa usage events fyrir guest í Phase 1.** Engar type-breytingar, engar DB-forsendur. Guest-notkun er ómeðhöndluð í fyrstu útgáfu.

#### Rate limit helper

`check_and_increment_ip_rate_limit` RPC (SQL 42) er generic og **má endurnýta beint** fyrir public weather. Tekur `(p_ip_hash, p_window_date, p_max_requests)`.

Mæling: búa til `lib/weather/ip-rate-limit.server.ts` sem inniheldur sama hash/call pattern en með sér `WEATHER_PUBLIC_IP_DAILY_LIMIT` env var (sjálfgefið 100).

100 leiðabeiðnir/IP/dag = ~50 fulla ferðaveðurskönnun á dag per IP, sem er raunhæft.

#### Saved places fyrir guest

Client: sleppa köllum 3, 4, 5 þegar `isGuest === true`. `savedPlaces` state byrjar sem `[]`.
Server: GET skilar `{ places: [] }` ef notandi vantar (í stað 401). POST og DELETE halda 401.
Enginn UI villa sést.

#### Feature flags

Mæling: **nýtt flag `WEATHER_PUBLIC_ENABLED`** aðskilið frá `WEATHER_ENABLED + WEATHER_FLAG`.

Rök: `WEATHER_FLAG` stjórnar per-user allowlist fyrir innskráða. Að tengja public access við þetta flag gæti opnað public aðgang óvænt ef flag-stillingar breytast.

Lógík í weather API handlers fyrir guest:
```
ef enginn user:
  ef WEATHER_PUBLIC_ENABLED !== 'true' -> 401
  ef WEATHER_ENABLED !== 'true' -> 404
  -> halda áfram sem guest
ef user:
  checkFeatureAccess eins og nú
```

#### Umönnun public page

`app/auth-mvp/umonnun/page.tsx` er eingöngu upplýsinga- og linkasíða — engar Supabase queries, engin Umönnunargögn. Má opna beint.

Mæling: **ekki nýtt `UMONNUN_PUBLIC_ENABLED` flag.** Nota `UMONNUN_ENABLED=true`. Ef flaggið er sett er síðan public; ef ekki er hún 404. Engin per-user gate þarf á hreinni upplýsingasíðu.

#### Route uppbygging

```
app/vedrid/page.tsx          -- ný, public, WEATHER_PUBLIC_ENABLED check, isGuest={true}
app/auth-mvp/vedrid/page.tsx -- óbreytt, innskráning krafist
app/umonnun/page.tsx         -- ný, public, UMONNUN_ENABLED check, engin auth
app/auth-mvp/umonnun/page.tsx -- má halda eða redirecta á /umonnun
```

#### v004 added-value strip

Litil strip á fyrsta skrefi Veðursins, aðeins fyrir guest:

- Tillaga B copy: `"Notaðu Veðrið strax. Með innskráningu vistast nýlegir staðir fyrir næstu ferð."`
- Takki: `"Innskrá"` -> `/innskraning` (engin return-to í Phase 1)
- Staðsetning: milli Frá/Til svæða og route controls
- Aðeins sýnt þegar `isGuest === true`
- Message keys: `teskeid.vedrid.guestHint`, `teskeid.vedrid.guestSignIn` (eða í `teskeid.auth`)

#### Google/Met.no kostnaðaráhætta

| API | Áhætta | Mótvægi |
|-----|--------|---------|
| Google Routes API | Bein reikningur per request | Per-IP daily rate limit (100/dag mælt) |
| Met.no | Fair use, engin gjöld | Sama rate limit verndar |

**Rate limit er forsenda fyrir public release.** Án þess getur eitt script tæmt Google API budget á einni nóttu.

---

## Spurningar sem þarf svar á áður en framkvæmd hefst

Stebbi þarf að svara þessum áður en Claude getur byrjað Task B:

1. **Flag-heiti**: Er `WEATHER_PUBLIC_ENABLED` rétt nafn, eða á `WEATHER_ENABLED` eitt að duga?
2. **Rate limit**: 100 route requests/IP/dag — hæfilegt, of lágt eða of hátt?
3. **Usage events**: Má sleppa þeim fyrir guest í Phase 1?
4. **Copy v004**: Er Tillaga B samþykkt (`"Notaðu Veðrið strax. Með innskráningu vistast nýlegir staðir fyrir næstu ferð."`) eða vilt þú breyta?
5. **Framkvæmdarleyfi** (Task B): Má Claude byrja að kóða?

---

## Hvað þarf til í Task B (ef leyfi fæst)

Skrár sem þarf að breyta/búa til:

1. `middleware.ts` — bæta weather API slóðum við `PUBLIC_PATHS`
2. `app/vedrid/page.tsx` — ný public Veðrið page
3. `app/umonnun/page.tsx` — ný public Umönnun page
4. `app/auth-mvp/vedrid/FerdalagidClient.tsx` — `isGuest` prop, sleppa saved-places köllum, guest strip
5. `app/api/teskeid/weather/travel/routes/route.ts` — optional auth, public flag, IP rate limit
6. `app/api/teskeid/weather/travel/route.ts` — optional auth, public flag, IP rate limit
7. `app/api/teskeid/weather/saved-places/route.ts` — GET skilar `{ places: [] }` fyrir guest
8. `lib/weather/ip-rate-limit.server.ts` — ný, thin wrapper yfir existing RPC
9. `messages/is.json` + `messages/en.json` — guest strip copy
10. Tests fyrir guest/auth branching

**Auth v002 (SQL 72 + timing logs) og public Veðrið eru óháð. Taka þau í aðskildum commits.**
