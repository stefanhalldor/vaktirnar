# Codex handoff: TODO #46 v006 - Stebbi decisions for public Veðrið/Umönnun Task B

Created: 2026-07-10 14:03
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, v003/v004/v005

## Staða

Stebbi svaraði opnu spurningunum úr
`2026-07-10-1358-todo-046-v005-claude-v003-v004-audit-handoff.md`.

Þetta skjal er ákvörðunar- og framkvæmdarhandoff til Claude Code.

## Skilningur á samþykki

Stebbi hefur samþykkt að Claude Code megi hefja **Task B implementation** fyrir
public Veðrið/Umönnun guest mode samkvæmt v003/v004/v005 og ákvörðunum hér að
neðan.

Þetta felur í sér kóðabreytingar í afmörkuðum skrám sem tengjast:

- public `/vedrid`
- public `/umonnun`
- optional-auth weather APIs
- guest-mode saved places hegðun
- public weather rate limit
- guest login added-value strip
- i18n texta
- tests

Þetta felur **ekki** í sér nema Stebbi gefi sérstakt leyfi:

- commit
- push
- deploy
- production env breytingar í Vercel
- SQL migration keyrslu
- SQL 72 auth-fix útgáfu
- breytingar á RLS eða grants
- breytingar á private Lánað og skilað / Minnið aðgangi

Auth v002 / SQL 72 breytingin á að vera aðskilin frá public Veðrið/Umönnun.

## Stebbi decisions

### 1. Public weather flag

Ákvörðun:

```text
WEATHER_PUBLIC_ENABLED
```

er rétt flag-heiti.

Ekki láta `WEATHER_ENABLED` eitt og sér opna public guest aðgang. Mælt logic:

```text
authenticated user:
  WEATHER_ENABLED + existing checkFeatureAccess('vedrid')

guest user:
  WEATHER_ENABLED === 'true'
  AND WEATHER_PUBLIC_ENABLED === 'true'
```

### 2. Public guest rate limit

Ákvörðun Stebba:

```text
5 ferðir per IP á dag fyrir óinnskráða.
Eftir það þarf að skrá sig inn.
```

Ekki nota 100 route requests/IP/dag.

Mælt env:

```text
WEATHER_PUBLIC_IP_DAILY_LIMIT=5
```

Mikilvægt implementation detail:

- Markmiðið er 5 **ferðir/reikningar**, ekki óvart 2.5 ferðir af því bæði
  route-options endpoint og final forecast endpoint incrementa sama counter.
- Ef sama rate-limit helper er notaður á fleiri en einum endpoint þarf annaðhvort:
  - bara að incrementa á Google-costing route-options kallinu
    `/api/teskeid/weather/travel/routes`, eða
  - nota aðskilda buckets/keys svo eitt fullkomið flæði telji ekki tvisvar sem
    ein ferð.
- Guest limit á ekki að gilda fyrir innskráða notendur.

User-facing behaviour þegar limit klárast:

- Ekki láta UI líta út eins og kerfið sé bilað.
- Sýna skýra CTA í added-value stíl:
  - notandi hefur reiknað hámarksfjölda ferða í dag sem gestur,
  - innskráðir geta reiknað ótakmarkað.
- Takkinn fer á `/innskraning`.

### 3. Usage events fyrir guest

Ákvörðun:

```text
Sleppa guest usage events í Phase 1.
```

Ekki breyta `recordTeskeidUsageEvent` types eða SQL 71 fyrir þetta. Halda
usage events áfram fyrir innskráða notendur eins og áður.

### 4. Guest login strip copy

Stebbi samþykkti ekki v004 Tillögu B óbreytta. Nota þessa copy í staðinn:

```text
Þekktir staðir vistast fyrir innskráða notendur og þeir geta reiknað ótakmarkaðan fjölda af ferðum
```

Button:

```text
Innskrá
```

Codex microcopy note:

- Ef UI þarf aðeins styttri útgáfu á mobile má leggja til örlítið fínpússaða
  útgáfu fyrir Stebba, en ekki breyta merkingunni án staðfestingar.
- Textinn þarf í `messages/is.json` og `messages/en.json`.
- English má vera functional, t.d.:

```text
Signed-in users can save known places and calculate unlimited trips.
```

### 5. Claude may start coding

Ákvörðun Stebba:

```text
Já lets go
```

Claude Code má hefja Task B implementation innan rammans hér að ofan.

## Additional Codex guardrails for implementation

### Do not open private data

Má opna public:

- `/vedrid`
- `/umonnun` informational page
- weather route options + final forecast APIs with guest guard/rate limit

Má ekki opna public:

- Lánað og skilað / Minnið
- saved weather places table data
- Umönnun app data
- profile/session/admin/tölfræði

### Saved places guest behaviour

Guest:

- `GET /api/teskeid/weather/saved-places` may return `{ places: [] }`.
- `POST /api/teskeid/weather/saved-places` remains unauthorized.
- `DELETE /api/teskeid/weather/saved-places/{id}` remains unauthorized.
- Client should skip POST/DELETE saved-place calls in guest mode.
- No guest UI error for missing saved places.

Authenticated:

- Saved places must continue to work unchanged.
- RLS remains the hard boundary.

### Middleware

If weather API paths are added to public middleware allow-list, route handlers
must still enforce:

- `AUTH_MVP_ENABLED`
- `WEATHER_ENABLED`
- guest `WEATHER_PUBLIC_ENABLED`
- authenticated `checkFeatureAccess`
- IP rate limit for guest
- validation of Icelandic coordinates / request shape

Middleware should only stop blocking the request too early; it must not become
the only access control.

### Rate limit copy and status

When a guest hits 5 trips/day:

- Prefer a user-friendly UI state over raw 429 text.
- Suggested Icelandic copy:

```text
Þú hefur reiknað 5 ferðir í dag sem gestur. Skráðu þig inn til að reikna fleiri ferðir.
```

Button:

```text
Innskrá
```

If endpoint returns 429, client should translate it to this UI.

### Keep auth v002 separate

Do not bundle public weather/umonnun with:

- `sql/72_auth_email_code_request_idempotency.sql`
- auth code request idempotency
- timing logs
- SQL 72 production rollout

That fix needs its own release sequencing: SQL 72 first, app deploy second.

## Expected files from v005, with decisions applied

Likely files to change/create:

1. `middleware.ts`
2. `app/vedrid/page.tsx`
3. `app/umonnun/page.tsx`
4. `app/auth-mvp/vedrid/FerdalagidClient.tsx`
5. `app/api/teskeid/weather/travel/routes/route.ts`
6. `app/api/teskeid/weather/travel/route.ts`
7. `app/api/teskeid/weather/saved-places/route.ts`
8. `lib/weather/ip-rate-limit.server.ts`
9. `messages/is.json`
10. `messages/en.json`
11. relevant tests

Add tests for at least:

- guest can hit weather routes API when `WEATHER_PUBLIC_ENABLED=true`
- guest is blocked when `WEATHER_PUBLIC_ENABLED` is not true
- guest route requests are rate-limited at 5/day
- authenticated users still use existing feature access
- guest saved places GET returns empty places or client skips gracefully
- guest saved places POST/DELETE remain unauthorized
- public `/umonnun` renders without auth and does not query private data

## Localhost checks for Stebbi

### Guest public Veðrið

1. Open `/vedrid` in incognito/logged out.
2. Expected:
   - page opens without redirect to `/innskraning`,
   - first step shows the added-value label:
     `Þekktir staðir vistast fyrir innskráða notendur og þeir geta reiknað ótakmarkaðan fjölda af ferðum`,
   - `Innskrá` button is visible,
   - main weather flow still works without login.

### Guest route limit

1. In logged-out state, calculate up to 5 trips from same IP.
2. Expected: first 5 calculations work.
3. Try a 6th trip.
4. Expected:
   - user sees a friendly message saying guest daily limit is reached,
   - UI offers `Innskrá`,
   - no raw API error appears.

Do not hammer production API casually. Use localhost/dev and small number of
manual checks.

### Authenticated unlimited behaviour

1. Log in.
2. Open Veðrið.
3. Expected:
   - guest added-value label is hidden,
   - saved/known places work as before,
   - guest 5/day limit does not apply.

### Saved places privacy

1. Logged out: open `/vedrid`.
2. Expected: no saved places are shown and no visible error.
3. Logged in: open Veðrið.
4. Expected: own saved places show.
5. Confirm no cross-user data appears.

### Public Umönnun

1. Logged out, open `/umonnun`.
2. Expected:
   - page opens,
   - it is informational only,
   - links to `umonnun.is`, App Store and Play Store work,
   - no private Umönnun data appears.

### Private features still private

1. Logged out, open `/auth-mvp/lanad-og-skilad`.
2. Expected: still redirected/blocked by auth.
3. Any loans/private API remains unauthorized for guest.

### Mobile

Check `/vedrid`, `/umonnun`, `/innskraning` at 360px, 390px and 460px:

- no horizontal overflow,
- no overlap,
- no iOS input zoom,
- login strip does not push route controls too far down,
- `Innskrá` touch target is comfortable.

## Questions for Claude Code to answer in handoff after implementation

1. Exactly which endpoint increments the 5/day guest limit?
2. Does one normal guest trip consume exactly one of the five daily slots?
3. What happens if a guest opens route options but never finishes final forecast?
4. Are authenticated users fully outside this guest rate limit?
5. Which tests prove guest saved places cannot write/read private data?
6. Was SQL changed or run? Expected answer should be no for this task unless
   Stebbi separately approved it.

## Óvissa / þarf að staðfesta

- Whether "5 ferðir" should count route-option searches or only final
  forecast calculations. Codex recommends counting the Google route-options
  request because that is direct-cost and maps best to "reikna ferð" in the UI.
- Whether the copy is too long on 360px mobile. If it wraps poorly, Claude may
  propose a shorter variant but should preserve Stebbi's meaning.
