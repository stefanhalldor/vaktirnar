# TODO #51 - Claude Code v013 - Phase 1 pre-release handoff

Created: 2026-07-02 22:21
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Pre-release handoff til Stebba og Codex

Refs:
- ai-handoff/2026-07-02-2211-todo-051-v012-codex-v011-review-handoff.md
- ai-handoff/2026-07-02-2201-todo-051-v011-claude-option-a-phase1-plan.md

---

## Hvað var samþykkt

Stebbi samþykkti framkvæmd Phase 1 Option A - Facebook OAuth linking í Minn
prófíll, án SQL migration, án loan badge.

## Hvað var gert

Tíu skrár breyttar eða bættar við.

## Skrár breyttar

### `middleware.ts`
Fjarlægt `/auth/callback` úr `LEGACY_UI_PREFIXES`. Þetta er infrastructure
route, ekki legacy UI. Þegar `LEGACY_ENABLED !== 'true'` var middleware að
vísa `/auth/callback` á `/` og hindra OAuth callback frá því að keyra.

### `app/auth/callback/route.ts`
- Bætt við `safeNext()` - open redirect fix. `?next=https://evil.com` og
  `?next=//evil.com` falla aftur á `/`.
- Bætt við Facebook-specific fallback: ef `next` vísar á `/auth-mvp/minn-profill`
  og code exchange mistekst, fer notandinn aftur á minn-profill með
  `?facebook=error` í stað `/login`.
- OTP og password reset callback hegðun óbreytt.

### `.env.example`
Bætt við `FACEBOOK_OAUTH_ENABLED` og `FACEBOOK_OAUTH_FLAG` með skýringu.

### `lib/loans/guard.ts`
Bætt við `'facebook-oauth'` case í `checkFeatureAccess`. Sama tvíþrepa mynstur
og `umonnun` og `tengsl`.

### `app/api/teskeid/profile/route.ts`
- Bætt við import á `checkFeatureAccess`.
- GET skilar nú `facebook_oauth_allowed` og `facebook_connected` til viðbótar
  við `display_name` og `email`.
- `facebook_connected` er aðeins reiknað þegar `facebook_oauth_allowed` er true.
  Notendum utan flag fær alltaf `false`.

### `app/api/teskeid/profile/facebook/route.ts` (ný skrá)
POST handler fyrir Facebook unlink. Þrjár verðir:
1. `AUTH_MVP_ENABLED` guard (404).
2. Session/email guard (401).
3. `facebook-oauth` feature flag guard (404).
4. Finnur Facebook identity í `user.identities`, kallar `unlinkIdentity`.

### `app/auth-mvp/minn-profill/page.tsx`
- `load()` endurskilgreint sem `loadProfile` með `useCallback` til að geta
  verið kallað úr tveimur effects.
- Bætt við Facebook state: `facebookAllowed`, `facebookConnected`,
  `facebookStatus`, `facebookError`.
- Bætt við OAuth return effect: greinir `?facebook=linked` eða `?facebook=error`
  í URL við mount, hreinsir URL param og re-fetchar profile eða sýnir villu.
- Bætt við `handleFacebookLink()` og `handleFacebookUnlink()`.
- Bætt við Facebook section í card, aðeins sýnilegt þegar `facebookAllowed`.
  Section er aðskilinn frá form með `border-t`.

### `messages/is.json`
Bætt við `teskeid.profile.facebook.*` strings.

### `messages/en.json`
Bætt við `teskeid.profile.facebook.*` strings.

---

## Hvað var ekki gert

- Ekkert SQL.
- Engar breytingar á `lib/loans/types.ts`.
- Engar breytingar á loan RPCum.
- Enginn badge í `claim/[id]/page.tsx` eða `[id]/page.tsx`.
- Engar Supabase Dashboard breytingar.
- Engar Facebook Developer App breytingar.
- Ekkert commit, push eða deploy.

---

## Ytri stillingar sem Stebbi þarf (sérstakt samþykki þarf fyrir hverja)

Þessar stillingar þarf til að geta prófað á localhost. Claude Code gerir þær
ekki.

1. Supabase Dashboard: Authentication > Sign In / Up > Linked Identities >
   virkja "Allow users to link multiple OAuth credentials".
2. Supabase Dashboard: Authentication > Providers > Facebook > kveikja,
   setja App ID og App Secret.
3. Facebook Developer App: stofna app, bæta við Facebook Login product,
   setja callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
4. `.env.local`: `FACEBOOK_OAUTH_ENABLED=true`
5. `feature_access` tafla: bæta við Stebbi netfangi með
   `feature_key = 'facebook-oauth'` (aðeins ef `FACEBOOK_OAUTH_FLAG=true`)

---

## Áhættur og óvissa

### Þekkt takmarkun: feature flag er ekki hard Supabase block

Þegar Facebook provider er globally virkt í Supabase, getur tæknilega færinn
notandi kallað `linkIdentity` beint úr browser console óháð feature flag.
Feature flag tryggir UI visibility, API response og server action guard - en
ekki Supabase auth lag.

### Óstaðfest: `manual_linking_enabled` í þessum project

Stebbi þarf að kanna hvort þetta er þegar virkt í Supabase Dashboard.
Án þess skilar `linkIdentity` villu og OAuth flow byrjar ekki.

### Óstaðfest: nákvæm Supabase hegðun við OAuth cancel

Við vitum ekki nákvæmlega hvort Supabase sendir `?code=` með exchange villu
eða `?error=` þegar Facebook OAuth er hætt við. Callback route meðhöndlar
báðar leiðir: missing code og exchange failure fara báðar í Facebook fallback.
Verður prófað í manual testing.

### Meta App Review

Þarf fyrir production (live mode). Sérstakt verkefni. Stebbi á að kanna
nákvæmar kröfur beint í Meta for Developers áður en umsókn er send. Ráðlagt
orðalag í privacy policy má ekki loka á Phase 2 badge í framtíðinni.

---

## Localhost checks for Stebbi

Þegar ytri stillingar (hér að ofan) eru tilbúnar:

1. `FACEBOOK_OAUTH_ENABLED=true` í `.env.local`, server endurræsa.
2. Opna `/auth-mvp/minn-profill` - Facebook section á að birtast.
3. Staðfesta "Ekki tengt við Facebook" og "Tengja Facebook" takki.
4. Smella "Tengja Facebook" - takki á að fara í "Tengist..." og breidd
   breytist ekki.
5. Klára OAuth sem Facebook test user - staðfesta return á minn-profill.
6. Staðfesta "Tengt við Facebook" staða.
7. Refresh - staðfesta staðan heldst.
8. Smella "Aftengja Facebook" - staðfesta "Ekki tengt".
9. Prófa OAuth cancel - staðfesta villuskilaboð á minn-profill, ekki `/login`.
10. Opna `/innskraning` - staðfesta engan Facebook valkost.
11. Prófa OTP login frá grunni - staðfesta að það virki enn.
12. Innskrá sem notandi utan flag - Facebook section á ekki að birtast.
13. `POST /api/teskeid/profile/facebook` sem notandi utan flag - á að skila 404.
14. Prófa mobile 360, 390 og 460 px - enginn zoom, overlap eða overflow.
    Facebook section og takki mega ekki valda horizontal scroll.

---

## Phase 2 - parking lot

Phase 2 (badge í lánaboðssamhengi) bíður þar til:
1. Phase 1 er prófað og virkt á localhost/staging.
2. Stebbi staðfestir Meta App Review og privacy disclosure kröfur.
3. Codex rýnir sérstakt Phase 2 SQL plan.
4. Stebbi gefur sérstakt framkvæmdarleyfi.

Phase 2 mun þurfa:
- `profiles.facebook_verified_at` dálk (SQL migration 66).
- Uppfærðar `get_invitation_for_claim` og `get_my_loans` RPCar.
- TypeScript type breytingar í `lib/loans/types.ts`.
- Badge UI í claim og loan detail.
