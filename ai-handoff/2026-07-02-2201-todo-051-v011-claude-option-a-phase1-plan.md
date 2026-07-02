# TODO #51 - Claude Code v011 - Option A Phase 1 implementation plan

Created: 2026-07-02 22:01
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Phase 1-only implementation plan til Stebba og Codex
Refs:
- ai-handoff/2026-07-02-2151-todo-051-v010-codex-option-a-mvp-handoff.md
- ai-handoff/2026-07-02-1655-todo-051-v009-claude-revised-facebook-oauth-plan.md

Þetta er plan, ekki framkvæmd. Engin kóðabreyting, SQL, commit, push, deploy
eða production breyting hefur átt sér stað.

---

## Scope - Phase 1 only

**Innifalið:**
- Feature flag (`facebook-oauth`) í `lib/loans/guard.ts`
- `/api/teskeid/profile` GET extension
- Ný `/api/teskeid/profile/facebook` route fyrir unlink
- Facebook section í `app/auth-mvp/minn-profill/page.tsx`
- Callback hardening í `app/auth/callback/route.ts`
- Strengir í `messages/is.json` og `messages/en.json`

**Ekki innifalið:**
- Ekkert SQL (engin sql/66)
- Engar breytingar á `lib/loans/types.ts`
- Engar breytingar á `get_my_loans` eða `get_invitation_for_claim`
- Engar badge breytingar á `claim/[id]/page.tsx` eða `[id]/page.tsx`
- Engar Supabase Dashboard breytingar (Stebbi-verk, sérstakt samþykki)
- Engar Facebook Developer App breytingar (Stebbi-verk, sérstakt samþykki)

---

## 1. Facebook scope (`email` vs `public_profile`)

Codex spurði hvort `email` scope sé nauðsynleg.

Niðurstaða: nota Supabase defaults (`public_profile` og `email`).

- Supabase Facebook provider sækir `public_profile,email` sjálfkrafa.
- Báðar eru basic permissions sem þurfa ekki Meta App Review.
- Við notum **engin** Facebook gögn í Phase 1 - við köllum bara `linkIdentity`
  og könnumst við hvort `provider === 'facebook'` sé til í `user.identities`.
- Að ganga þvert á Supabase defaults krefst handvirkra stillinga í Dashboard
  og bætir engum gildum við Phase 1.

---

## 2. Feature flag - `lib/loans/guard.ts`

Bæta `'facebook-oauth'` case við `checkFeatureAccess`:

```ts
if (featureKey === 'facebook-oauth') {
  if (process.env.FACEBOOK_OAUTH_ENABLED !== 'true') return false
  if (process.env.FACEBOOK_OAUTH_FLAG !== 'true') return true
  return checkPerUserAccess(email, 'facebook-oauth')
}
```

Sama tvíþrepa mynstur og `umonnun` og `tengsl`. Return false ef featureKey
er óþekktur er þegar til staðar í fallið - þessa case þarf bara að setja
ÁÐUR EN `return false` í lok fallsins.

Bæta við `.env.example`:
```
FACEBOOK_OAUTH_ENABLED=
# FACEBOOK_OAUTH_FLAG=true  # uncomment for per-user access via feature_access table
                             # if unset or false: all logged-in users see Facebook section
```

**Þekkt takmarkun (skjalfest, ekki villa):**
Þegar Supabase Facebook provider er globally virkt og `manual_linking_enabled`
er kveikt, getur innskráður notandi kallað `supabase.auth.linkIdentity` beint
úr browser console óháð feature flag. Feature flag stýrir:
- UI visibility (Facebook section sést ekki)
- Server-side API response (`facebook_oauth_allowed: false`)
- Unlink server action (blocked)

---

## 3. Profile API GET - `/api/teskeid/profile/route.ts`

Núverandi GET skilar: `display_name`, `email`.

Nýtt GET skilar einnig: `facebook_oauth_allowed`, `facebook_connected`.

```ts
import { checkFeatureAccess } from '@/lib/loans/guard'

// Eftir user check:
const facebookAllowed = await checkFeatureAccess('', user.email, 'facebook-oauth')
const facebookConnected = facebookAllowed
  ? (user.identities?.some((i) => i.provider === 'facebook') ?? false)
  : false

return NextResponse.json({
  display_name: profile?.display_name ?? '',
  email: user.email,
  facebook_oauth_allowed: facebookAllowed,
  facebook_connected: facebookConnected,
})
```

`user.identities` kemur beint frá `supabase.auth.getUser()` - engin DB query
þarf. Þegar `facebookAllowed` er false er `facebookConnected` alltaf false
óháð raunverulegu identity state.

**Engin breyting á PATCH handler** - hann snertir aðeins `display_name`.

---

## 4. Unlink server action - `/api/teskeid/profile/facebook/route.ts`

Ný skrá. POST handler sem aftengir Facebook identity.

```ts
import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Feature flag guard - server-side, ekki hægt að fara framhjá
  const allowed = await checkFeatureAccess('', user.email, 'facebook-oauth')
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const facebookIdentity = user.identities?.find((i) => i.provider === 'facebook')
  if (!facebookIdentity) {
    return NextResponse.json({ error: 'Not connected' }, { status: 404 })
  }

  const { error } = await supabase.auth.unlinkIdentity(facebookIdentity)
  if (error) {
    return NextResponse.json({ error: 'Unlink failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

**Athugasemd um `unlinkIdentity`:** Supabase krefst að notandi hafi ≥2
identities. Teskeið notendur eru alltaf með `email` identity (OTP login).
Þegar Facebook er tengt eru tvær identities - aftenging er örugg. Ef
`unlinkIdentity` skilar villu (t.d. Supabase breytir hegðun) fær notandinn
villuskilaboð í UI - ekkert custom bypass.

---

## 5. Callback hardening - `app/auth/callback/route.ts`

### Tveir vandamálar sem laga þarf

**1. Open redirect (núverandi villa, ótengt Facebook)**

Núverandi kóði: `const next = searchParams.get('next') ?? '/'`
Þetta leyfir `?next=https://evil.com` án validation. Þarf að laga.

**2. Facebook cancel/error endar á `/login` (ruglandi)**

Þegar notandi hættir við Facebook OAuth eða villa kemur, endar hann á
`/login` sem er OTP login form - ruglandi þar sem hann var þegar innskráður.

### Leiðréttur kóði

```ts
function safeNext(raw: string | null): string {
  if (!raw) return '/'
  // Relative paths only — must start with /, not // (protocol-relative)
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw
  }
  return '/'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  // Facebook linking callback detection: next starts with /auth-mvp/minn-profill
  const isFacebookCallback = next.startsWith('/auth-mvp/minn-profill')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Failure or missing code
  if (isFacebookCallback) {
    return NextResponse.redirect(`${origin}/auth-mvp/minn-profill?facebook=error`)
  }
  return NextResponse.redirect(`${origin}/login`)
}
```

**OTP callback óbreytt:** OTP email confirmation links nota þessa sömu route
en `next` er aldrei `/auth-mvp/minn-profill` í þeim tilfellum - fallback
á `/login` heldur óbreyttur.

---

## 6. Profile UI - `app/auth-mvp/minn-profill/page.tsx`

### State

```ts
const [facebookAllowed, setFacebookAllowed] = useState(false)
const [facebookConnected, setFacebookConnected] = useState(false)
const [facebookStatus, setFacebookStatus] = useState<
  'idle' | 'linking' | 'unlinking'
>('idle')
const [facebookError, setFacebookError] = useState('')
```

### Load - sameina við núverandi `load()` effect

```ts
setFacebookAllowed(data.facebook_oauth_allowed ?? false)
setFacebookConnected(data.facebook_connected ?? false)
```

### OAuth return detection - sérstakt effect

```ts
useEffect(() => {
  const sp = new URLSearchParams(window.location.search)
  const fb = sp.get('facebook')
  if (!fb) return

  // Hreinsa URL param strax
  const url = new URL(window.location.href)
  url.searchParams.delete('facebook')
  window.history.replaceState({}, '', url.toString())

  if (fb === 'linked') {
    // Re-fetch profile til að fá uppfærðan facebook_connected
    load()
  } else if (fb === 'error' || fb === 'cancelled') {
    setFacebookError(t('facebook.error'))
  }
}, []) // keyrir einu sinni við mount
```

### Link handler

```ts
async function handleFacebookLink() {
  setFacebookStatus('linking')
  setFacebookError('')
  const supabase = createClient()
  const { error } = await supabase.auth.linkIdentity({
    provider: 'facebook',
    options: {
      redirectTo:
        `${window.location.origin}/auth/callback` +
        `?next=${encodeURIComponent('/auth-mvp/minn-profill?facebook=linked')}`,
    },
  })
  // Ef error kemur hér þýðir það að redirect byrjaði ekki (t.d. provider disabled)
  if (error) {
    setFacebookError(t('facebook.error'))
    setFacebookStatus('idle')
  }
  // Ef engin error: síðan framselur notanda til Facebook - ekkert meira hér
}
```

### Unlink handler

```ts
async function handleFacebookUnlink() {
  setFacebookStatus('unlinking')
  setFacebookError('')
  const res = await fetch('/api/teskeid/profile/facebook', { method: 'POST' })
  if (res.ok) {
    setFacebookConnected(false)
  } else {
    setFacebookError(t('facebook.unlinkError'))
  }
  setFacebookStatus('idle')
}
```

### JSX - Facebook section

Bætt við fyrir neðan núverandi form, en inni í sama card, aðeins þegar
`!loading && facebookAllowed`:

```tsx
{!loading && facebookAllowed && (
  <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-[#42493e]">
        {t('facebook.title')}
      </span>
      <span className="text-sm text-[#72796e]">
        {facebookConnected
          ? t('facebook.connected')
          : t('facebook.notConnected')}
      </span>
    </div>
    {facebookError && (
      <p className="text-sm text-red-600">{facebookError}</p>
    )}
    {facebookConnected ? (
      <button
        type="button"
        onClick={handleFacebookUnlink}
        disabled={facebookStatus !== 'idle'}
        className="w-full h-10 rounded-xl border border-gray-200 text-[#42493e]
                   text-sm font-medium hover:bg-gray-50 transition-colors
                   disabled:opacity-50"
      >
        {facebookStatus === 'unlinking'
          ? t('facebook.unlinking')
          : t('facebook.unlink')}
      </button>
    ) : (
      <button
        type="button"
        onClick={handleFacebookLink}
        disabled={facebookStatus !== 'idle'}
        className="w-full h-10 rounded-xl border border-gray-200 text-[#42493e]
                   text-sm font-medium hover:bg-gray-50 transition-colors
                   disabled:opacity-50"
      >
        {facebookStatus === 'linking'
          ? t('facebook.linking')
          : t('facebook.link')}
      </button>
    )}
  </div>
)}
```

**Design athugasemdir:**
- Section er viðbót við núverandi card, aðskilin með `border-t`.
- Facebook section á ekki að líta út eins og marketing-promo.
- Takki breytist ekki í breidd þegar `linking`/`unlinking` state (disabled:opacity-50 dugar).
- `text-base` er ekki þörf hér - þetta eru buttons, ekki text inputs (16px rule gildir um inputs).

---

## 7. Messages strings

### `messages/is.json` - bæta við undir `teskeid.profile`

Núverandi lok `teskeid.profile` object:
```json
"errors": {
  "saveFailed": "Vistun tókst ekki. Reyndu aftur."
}
```

Bæta við `facebook` object á sama level:
```json
"facebook": {
  "title": "Facebook",
  "connected": "Tengt við Facebook",
  "notConnected": "Ekki tengt við Facebook",
  "link": "Tengja Facebook",
  "unlink": "Aftengja Facebook",
  "linking": "Tengist...",
  "unlinking": "Aftengist...",
  "error": "Villa við Facebook tengingu. Reyndu aftur.",
  "unlinkError": "Villa við aftengingu. Reyndu aftur."
}
```

### `messages/en.json` - bæta við undir `teskeid.profile`

```json
"facebook": {
  "title": "Facebook",
  "connected": "Connected to Facebook",
  "notConnected": "Not connected to Facebook",
  "link": "Connect Facebook",
  "unlink": "Disconnect Facebook",
  "linking": "Connecting...",
  "unlinking": "Disconnecting...",
  "error": "Error connecting Facebook. Please try again.",
  "unlinkError": "Error disconnecting. Please try again."
}
```

---

## 8. Ytri stillingar - Stebbi-verk (sérstakt samþykki þarf)

Kóðinn hér að ofan keyrir með `FACEBOOK_OAUTH_ENABLED=` (disabled) og þarf
engar ytri stillingar til að vera deployed. Þessar stillingar þarf Stebbi
til að gera þegar prófun á localhost á sér stað:

1. **Supabase Dashboard:** Authentication > Sign In / Up > Linked Identities >
   "Allow users to link multiple OAuth credentials to the same account" - kveikja.
2. **Supabase Dashboard:** Authentication > Providers > Facebook - kveikja,
   setja App ID og App Secret.
3. **Facebook Developer App:** Stofna app á developers.facebook.com, bæta við
   Facebook Login product, setja callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`
4. **Localhost:** Setja `FACEBOOK_OAUTH_ENABLED=true` í `.env.local`.
5. **Localhost:** Setja eigið netfang í `feature_access` töflu með
   `feature_key = 'facebook-oauth'` (þegar `FACEBOOK_OAUTH_FLAG=true` er notað).

**Meta App Review:** Þarf fyrir production (live mode). Verður sérstakt verkefni.
Stebbi á að kanna nákvæmar kröfur beint í Meta for Developers áður en umsókn
er send. Engin Claude-gerð umsókn.

---

## 9. Skrár sem verða snerttar - samantekt

| Skrá | Tegund | Breytingarlýsing |
|---|---|---|
| `.env.example` | Config | Bæta við `FACEBOOK_OAUTH_ENABLED` og `FACEBOOK_OAUTH_FLAG` |
| `lib/loans/guard.ts` | TypeScript | Bæta `'facebook-oauth'` case við `checkFeatureAccess` |
| `app/api/teskeid/profile/route.ts` | TypeScript | GET skilar `facebook_oauth_allowed` + `facebook_connected` |
| `app/api/teskeid/profile/facebook/route.ts` | TypeScript | Ný skrá - POST unlink handler |
| `app/auth-mvp/minn-profill/page.tsx` | TypeScript/JSX | Facebook section, state, handlers |
| `app/auth/callback/route.ts` | TypeScript | `next` validation + Facebook error fallback |
| `messages/is.json` | JSON | `teskeid.profile.facebook.*` strings |
| `messages/en.json` | JSON | `teskeid.profile.facebook.*` strings |

**Engar aðrar skrár.**

---

## 10. Tests

### Automated

- `checkFeatureAccess('', email, 'facebook-oauth')`:
  - `FACEBOOK_OAUTH_ENABLED` unset → false
  - `FACEBOOK_OAUTH_ENABLED=true`, flag unset → true
  - `FACEBOOK_OAUTH_ENABLED=true`, `FACEBOOK_OAUTH_FLAG=true`, user in table → true
  - `FACEBOOK_OAUTH_ENABLED=true`, `FACEBOOK_OAUTH_FLAG=true`, user not in table → false

- Profile GET API:
  - Skilar `facebook_oauth_allowed: false`, `facebook_connected: false` þegar flag er af.
  - Skilar `facebook_oauth_allowed: true`, `facebook_connected: false` þegar
    flag er á og engin Facebook identity.
  - Skilar `facebook_oauth_allowed: true`, `facebook_connected: true` þegar
    flag er á og Facebook identity finnst.

- Callback `safeNext`:
  - `/auth-mvp/minn-profill?facebook=linked` → gengur í gegn.
  - `https://evil.com` → `/`
  - `//evil.com` → `/`
  - `` (tómt) → `/`

- Facebook UI rendering:
  - `facebook_oauth_allowed: false` → Facebook section sést ekki.
  - `facebook_oauth_allowed: true, connected: false` → "Ekki tengt", "Tengja" takki.
  - `facebook_oauth_allowed: true, connected: true` → "Tengt", "Aftengja" takki.
  - `linking` state → takki sýnir "Tengist..." og er disabled.
  - `unlinking` state → takki sýnir "Aftengist..." og er disabled.

### Manual (krefst Supabase og Facebook stillinga)

- Tengja Facebook sem innskráður notandi á feature flag.
- Hætta við Facebook OAuth consent - staðfesta villa á minn-profill, ekki
  `/login`.
- Refresh eftir tengingu - staðfesta að staðan haldist.
- Aftengja Facebook - staðfesta að staða fari í "Ekki tengt".
- Opna `/innskraning` - staðfesta engan Facebook valkost.
- OTP login regression: email kóðar virka áfram.
- Innskrá sem notandi utan feature flag - Facebook section sést ekki.
- Notandi utan flag: POST á `/api/teskeid/profile/facebook` skilar 404.

---

## 11. Localhost checks for Stebbi

Þegar Phase 1 kóði er deployed og ytri stillingar eru tilbúnar:

1. Setja `FACEBOOK_OAUTH_ENABLED=true` í `.env.local`.
2. Ef `FACEBOOK_OAUTH_FLAG=true`: setja eigið netfang í `feature_access` töflu.
3. Opna `/auth-mvp/minn-profill` - staðfesta Facebook section birtist.
4. Staðfesta "Ekki tengt við Facebook" staða og "Tengja Facebook" takki.
5. Smella "Tengja Facebook" - staðfesta pending state og breidd takka breytist ekki.
6. Klára OAuth sem Facebook test user - staðfesta return á minn-profill.
7. Staðfesta "Tengt við Facebook" staða.
8. Refresh - staðfesta að staðan haldist.
9. Smella "Aftengja Facebook" - staðfesta "Ekki tengt" staða.
10. Prófa OAuth cancel - staðfesta villuskilaboð á minn-profill (ekki `/login`).
11. Opna `/innskraning` - staðfesta engan Facebook valkost.
12. Prófa OTP login - staðfesta að það virki enn eftir callback breytingar.
13. Innskrá sem notandi utan flag - staðfesta engin Facebook section.
14. Prófa mobile 360, 390 og 460 px:
    - Facebook section í card: enginn zoom, overlap eða horizontal overflow.
    - Takki með "Tengist..." state: breytist ekki í breidd.

Ekki nota production secrets, production Facebook app, raunverulegar
Facebook-aðgangslyklar eða production redirect URLs í localhost prófun.

---

## Óvissa / þarf að staðfesta

- `manual_linking_enabled` staða í Supabase Dashboard: óþekkt - Stebbi þarf
  að kanna áður en prófun hefst.
- Nákvæm Supabase hegðun við OAuth cancel: hvort `?code=` kemur í callback
  eða `?error=` - hefur áhrif á nákvæma callback implementation. Verður
  uppgötvað í Phase 1 manual prófun. Plan gerir ráð fyrir `code` sem vantar
  eða exchange-villa sem equivalent.
- `unlinkIdentity` hegðun þegar email OTP + Facebook identities: óprófað -
  manual prófun í Phase 1.
- Meta App Review: sérstakt verkefni, ótengt Phase 1 kóða.

---

## Phase 2 - parking lot

Phase 2 (badge í lánaboðssamhengi) bíður þar til:
1. Phase 1 linking er prófað og virkt.
2. Stebbi staðfestir Meta App Review/disclosure skilyrði.
3. Codex rýnir sérstakt Phase 2 SQL/RLS plan.
4. Stebbi gefur sérstakt framkvæmdarleyfi.

Phase 2 mun nota `profiles.facebook_verified_at` (v009 tillaga) til að birta
boolean badge í `get_invitation_for_claim` og `get_my_loans` RPC output.
