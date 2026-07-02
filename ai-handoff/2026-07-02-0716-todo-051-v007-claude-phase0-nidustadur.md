# TODO #51 - Claude Code v007 - Phase 0 niðurstaður

Created: 2026-07-02 07:16
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Phase 0 read-only kortlagning - niðurstaður til Codex og Stebba
Refs:
- ai-handoff/2026-07-02-0705-todo-051-v006-codex-phase0-facebook-oauth-handoff.md

Engin kóðabreyting hefur átt sér stað. Þetta er eingöngu lestur og greining.

---

## Hvað var skoðað

Skrár lesnar:

- `middleware.ts`
- `app/auth/callback/route.ts`
- `app/innskraning/page.tsx`
- `app/auth-mvp/minn-profill/page.tsx`
- `app/auth-mvp/minn-profill/layout.tsx`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
- `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`
- `app/api/teskeid/profile/route.ts`
- `app/api/admin/feature-access/route.ts` (staðfest að hún er til)
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/admin.ts`
- `lib/supabase.ts` (legacy singleton - ótengt þessu)
- `lib/auth/guard.ts`
- `lib/loans/guard.ts`
- `lib/loans/types.ts`
- `.env.example`

---

## 1. Auth og callback mynstur

### Núverandi flow

Teskeið notar OTP (email kóðar). Innskráningarleið:

1. `app/innskraning/page.tsx` sýnir `TeskeidLoginForm` (email + kóði).
2. Auth callback: `app/auth/callback/route.ts` - þetta er **staðlað Supabase OAuth callback** sem þegar er til.
   - Tekur `?code=` og keyrir `supabase.auth.exchangeCodeForSession(code)`.
   - Styður `?next=` parameter til að vísa notanda áfram eftir innskráningu.

### Mikilvæg niðurstaða: callback route er þegar tilbúin

`app/auth/callback/route.ts` myndar nákvæmt það sem `linkIdentity` þarf. Þegar
notandi kemur til baka frá Facebook OAuth, fer hann í gegnum þessa sömu route.
Það þarf **ekkert nýtt callback** - aðeins að setja rétt `redirectTo` þegar
`linkIdentity` er kallað.

### OAuth start action staðsetning

`app/auth-mvp/minn-profill/page.tsx` er `'use client'` component sem notar
þegar `createClient()` frá `lib/supabase/client.ts` (í `handleLogout`).

`linkIdentity({ provider: 'facebook' })` þarf browser client - þetta passar
nákvæmlega. Hægt er að bæta `FacebookLinkButton` client component við
minn-profill page sem kallar:

```ts
const supabase = createClient()
await supabase.auth.linkIdentity({
  provider: 'facebook',
  options: {
    redirectTo: `${window.location.origin}/auth/callback?next=/auth-mvp/minn-profill`,
  },
})
```

### Hvernig Facebook verður ekki login leið

`linkIdentity` og `signInWithOAuth` eru aðskildar Supabase aðferðir.
`linkIdentity` virkar aðeins þegar notandi er þegar innskráður - ef notandi
er ekki innskráður skilar `linkIdentity` villu. Við bætum Facebook **aðeins**
við minn-profill, ekki við `TeskeidLoginForm` eða `/innskraning`. Þetta tryggir
nákvæmlega að Facebook verði aldrei login leið.

---

## 2. `linkIdentity` raunhæfni

### Niðurstaða: mælt með

`linkIdentity` passar vel við núverandi kóðagrunninn:

- Browser client (`lib/supabase/client.ts`) er til og er `createBrowserClient`
  frá `@supabase/ssr` - þetta er rétt client fyrir OAuth/linkIdentity.
- Server client (`lib/supabase/server.ts`) er `createServerClient` með SSR
  cookie handling - þetta er rétt client til að lesa `user.identities` á server.
- Callback route (`app/auth/callback/route.ts`) er þegar til og myndar OAuth
  return route.

### Beta-staðan

`linkIdentity` er merkt beta í Supabase docs. Það er raunveruleg áhætta en
raunhæf fyrir v1 af þessum ástæðum:
- Supabase hefur haft manual identity linking í beta í langan tíma án þekktra
  breaking changes.
- Fallback ef það brotnar: frysta Facebook tengingu og sýna "Tennging ekki tiltæk"
  - engin custom OAuth layer þarf.
- Frekar en að smíða custom OAuth flow þar sem við þurfum að geyma og uppfæra
  tokens handvirkt, er `linkIdentity` einfaldari og öruggari.

### Confidence: medium-high

Hér er eitt sem við vitum EKKI: hvort `manual_linking_enabled` er þegar virkt
í Supabase Dashboard fyrir þetta project. Sjá kafla 3 hér að neðan.

### Edge cases sem þarf að meðhöndla í implementation

- **Cancel**: notandi hætti við á Facebook - Facebook sendir error parameter til
  callback, `exchangeCodeForSession` mistekst, redirect á `/innskraning` (núverandi
  fallback). Þarf nýjan fallback: redirect á `/auth-mvp/minn-profill?facebook=cancelled`.
- **Expired callback**: sama - þarf graceful villuskilaboð á minn-profill.
- **Already linked**: ef notandi reynir að tengja aftur - `linkIdentity` skilar
  villu sem þarf að meðhöndla í UI.
- **Provider error**: eitthvað brotnaði hjá Facebook - sama fallback mynstur.

---

## 3. Supabase og Facebook stillingar sem Stebbi þarf síðar

Þetta eru **ekki Phase 0 aðgerðir** - þetta er lista yfir hvað Stebbi þarf að
gera þegar implementation hefst.

### Supabase Dashboard (Stebbi gerir þetta)

1. **Virkja manual linking**: Authentication > Sign In / Up > Manual linking > kveikja á.
   - Þetta er forsenda `linkIdentity`. Án þess skilar hún villu.
   - Confidence: high - þetta er skilgreind Supabase krafa.

2. **Bæta við Facebook provider**: Authentication > Providers > Facebook > kveikja á.
   - Krefst Facebook App ID og Facebook App Secret.
   - Callback URL sem þarf að setja í Facebook app:
     `https://<project-ref>.supabase.co/auth/v1/callback`

### Facebook Developer App (Stebbi gerir þetta)

1. Stofna app á developers.facebook.com.
2. Bæta við "Facebook Login for Business" product (eða "Facebook Login").
3. Setja callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Setja Valid OAuth Redirect URIs sama.
5. Permissions sem v1 þarf: `public_profile` og `email` - þetta eru grunnpermissions
   sem Meta þarf **ekki** formlega app review fyrir í development mode.

### Meta App Review

- Permissions `public_profile` og `email` þurfa **ekki** app review ef appið
  er í development mode (aðeins test users).
- Þegar fara á í production (live mode), þarf Meta App Review.
- App review þarf: privacy policy URL, domain verification, og screencast.
- Tímalína: 1-5 business days að jafnaði, getur lengst.
- Mælt: hefja app review undirbúning samhliða implementation, ekki eftir á.

---

## 4. Provider metadata - hvað Facebook skilar

### Hvað `user.identities` inniheldur

Þegar notandi tengir Facebook og við köllum `supabase.auth.getUser()`, inniheldur
`user.identities` array einn `UserIdentity` hlut fyrir Facebook með:

- `provider: 'facebook'`
- `identity_data.sub`: Facebook user ID (tölustafastrengur)
- `identity_data.name`: nafn notanda á Facebook
- `identity_data.email`: netfang (ef gefið)
- `identity_data.avatar_url`: URL á prófílmynd (Facebook CDN URL)
- `identity_data.full_name`: nafn (stundum sama og name)

### Hvað fæst EKKI

- Opnanleg `facebook.com/profile` URL - **fæst ekki**. Meta gefur ekki út
  prófílslóðir í OAuth metadata.
- Heimild til að skoða aðra notendur á Facebook.

### Niðurstaða: `Skoða Facebook` er **out of scope**

Staðfest að engin örugg leið er til að smíða Facebook prófílslóð úr provider
gögnum. `Skoða Facebook` verður ekki í v1.

### Hvað v1 getur sýnt

- `Staðfest með Facebook` boolean - já.
- `Tengja Facebook` / `Aftengja Facebook` í minn-profill - já.
- Nafn notanda á Facebook í minn-profill (til upplýsinga aðeins) - mögulegt en
  óþarft. Haldum okkur við boolean.

---

## 5. Schema og RLS þörf

### Niðurstaða: enginn schema migration þarf í v1

**Fyrir eigin minn-profill:**
`supabase.auth.getUser()` skilar `user.identities` - þetta er auth-layer gögn
sem notandinn á alltaf aðgang að sjálfur. Engin public schema projection þarf
til að sýna notandanum sína eigin Facebook stöðu.

**Fyrir badge í lánaboði (creator_facebook_verified):**

Núverandi `claim/[id]/page.tsx` kallar `get_invitation_for_claim` RPC via
`getAdmin()` (service role). Þessi RPC er SECURITY DEFINER (staðfest út frá
nýlegum commits í repo, t.d. `switch_loan_role` og `get_loan_for_pending_recipient`).

Service role RPC hefur aðgang að `auth.identities` töflu í Supabase. Því má
bæta `creator_facebook_verified: boolean` boolean við RPC output með því að
kanna hvort creator notandinn er með `provider = 'facebook'` í `auth.identities`.

**Þetta þarf:**
- SQL breyting á `get_invitation_for_claim` RPC (og mögulega `get_my_loans`
  fyrir full loan detail view).
- TypeScript breyting á `ClaimInvitationDetails` type til að bæta við
  `creator_facebook_verified: boolean`.
- Engar nýjar public töflur, engar nýjar RLS policies.

**Confidence: high** - service role via `getAdmin()` hefur aðgang að auth schema.
Þetta er staðfest mynstur í kóðagrunni.

---

## 6. Feature flag integration

### Mælt mynstur - eins og `tengsl`

Bæta við í `lib/loans/guard.ts` `checkFeatureAccess`:

```ts
if (featureKey === 'facebook-oauth') {
  if (process.env.FACEBOOK_OAUTH_ENABLED !== 'true') return false
  if (process.env.FACEBOOK_OAUTH_FLAG !== 'true') return true
  return checkPerUserAccess(email, 'facebook-oauth')
}
```

Bæta við í `.env.example`:

```
FACEBOOK_OAUTH_ENABLED=
# FACEBOOK_OAUTH_FLAG=true  # per-user via feature_access table
```

### Hvar þarf guard

1. **Profile UI** - server-side: `checkFeatureAccess(user.id, user.email, 'facebook-oauth')`
   í `minn-profill/page.tsx` (eða í sérstakri server action sem sækir stöðuna).
   Facebook section sést aðeins þegar flag leyfir. Middleware þarf EKKI að
   geyma allt `/minn-profill` - bara Facebook hlutann.

2. **OAuth start** - `FacebookLinkButton` á að kalla á server action sem staðfestir
   flag áður en `linkIdentity` er kallað. Notandi utan flag getur ekki byrjað
   OAuth með direct POST.

3. **Callback/return** - `app/auth/callback/route.ts` þarf ekki sérstakan guard
   þar sem `linkIdentity` mun einfaldlega ekki virka ef Supabase provider er
   ekki virkur.

4. **Loan invitation projection** - `creator_facebook_verified` ætti að vera
   `false` þegar FACEBOOK_OAUTH_ENABLED er ekki sett, þannig að badge birtist
   aldrei þegar feature er óvirk.

5. **Tests** - flag-state þarf að vera parameter í tests.

### Feature key

`'facebook-oauth'` - samræmist kebab-case mynstri annarra feature_access lykla.

---

## 7. Badge í lánaboði

### Hvar badge birtist

Nákvæmt tækifæri: `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx`

Þetta er síðan sem pending viðtakandi lendir á þegar hann smellir á invitation
link. Hér er `invitation.creator_display_name` þegar birt. `creator_facebook_verified`
boolean mætti birtast við hliðina: `Staðfest með Facebook`.

### Aðrir möguleikar

`app/auth-mvp/lanad-og-skilad/[id]/page.tsx` sýnir loan detail. Þar er
`other_display_name` frá `get_my_loans` RPC. Hér mætti `other_facebook_verified`
birtast þegar báðir aðilar eru tengdir.

### Öryggisatriði

Badge birtist aðeins í samhengi þar sem notandinn hefur raunverulegan aðgang
(invitation eða loan party). Engir aðrir notendur fá badge information. RPC
tryggir þetta með núverandi auth guard.

### Áhrif á `Þekki málið` og `Kannast ekki við þetta`

Þessir takkar eru í `ClaimForm` component. Badge er aðeins til upplýsinga í
`LoanShell` wrapper - breyting á types í `ClaimInvitationDetails` hefur engin
áhrif á form state eða actions.

---

## 8. Aftenging

### Niðurstaða: aftenging er örugg

Teskeið notendur skrá sig inn með OTP (email kóðar). Þetta skapar Supabase
`email` identity. Þegar notandi tengir Facebook fær hann tvo identities:
`email` + `facebook`. Supabase `unlinkIdentity` krefst að notandi hafi ≥2
identities - þetta skilyrði er alltaf uppfyllt ef notandinn er innskráður
(þarf email identity til að vera innskráður).

**Confidence: medium** - þetta er greining á þekktri Supabase hegðun en við
höfum ekki prófað þetta í þessum project. Phase 1 þarf manual prófun á þessu.

### V1 tillaga

Sýna `Aftengja Facebook` þegar Facebook er tengt. Ef `unlinkIdentity` skilar
villu (sem ætti ekki að gerast með tvær identities), sýna skýr villaskilaboð
og ekki reyna bypass.

---

## 9. Áhættur sem eru enn opnar

1. **`manual_linking_enabled` staða** - Við vitum ekki hvort þetta er virkt í
   Supabase Dashboard. Confidence: óþekkt. Stebbi þarf að staðfesta áður en
   testing hefst.

2. **`linkIdentity` beta** - Raunveruleg en ásættanleg áhætta. Fallback er
   skýr: fryst Facebook-tengingu og sýnum villu.

3. **Meta App Review tímalína** - Fyrir production þarf live mode. App review
   tekur 1-5 business days en getur lengst við höfnun. Þarf að hefja undirbúning
   samhliða implementation.

4. **Prófun á development mode** - Facebook appið verður í development mode á
   meðan við þróum. Aðeins skráðir test users geta tengt Facebook. Þetta er
   takmarkun á hverjir geta prófað á localhost og staging.

5. **RPC SQL breyting á `get_invitation_for_claim` og `get_my_loans`** - Þessar
   RPCar þarf að breyta. SQL migration þarf fyrir þær breytingar. Confidence:
   medium - við þurfum að staðfesta nákvæmt RPC schema áður en migration er
   skrifað.

---

## 10. Nákvæmt implementation plan

Þetta er tillaga að röð eftir að Stebbi og Codex hafa samþykkt Phase 0 niðurstöður.
**Þetta er ekki framkvæmdarleyfi.**

### Skref 1: Stebbi gerir ytri stillingar

- Virkjar `manual_linking_enabled` í Supabase Dashboard.
- Stofnar Facebook Developer App.
- Setur Facebook provider í Supabase Dashboard með App ID og Secret.
- Bætir test users við Facebook app.

### Skref 2: Feature flag (kóðabreyting)

- Bæta `FACEBOOK_OAUTH_ENABLED` og `FACEBOOK_OAUTH_FLAG` við `.env.example`.
- Bæta `'facebook-oauth'` case við `checkFeatureAccess` í `lib/loans/guard.ts`.
- Bæta Stebbi við `feature_access` töflu sem test user.

### Skref 3: SQL migration

- Breyta `get_invitation_for_claim` RPC til að skila `creator_facebook_verified`.
- Breyta `get_my_loans` RPC til að skila `other_facebook_verified`.
- Uppfæra TypeScript types í `lib/loans/types.ts`.

### Skref 4: Profile UI

- Bæta Facebook section við `app/auth-mvp/minn-profill/page.tsx`:
  - Server-side flag check.
  - Status row: `Facebook ekki tengt` / `Staðfest með Facebook`.
  - `FacebookLinkButton` client component með server action guard.
  - `Aftengja Facebook` þegar tengt.
  - Pending/error states og return feedback.

### Skref 5: Badge í lánaboði

- Bæta `creator_facebook_verified` badge við `claim/[id]/page.tsx`.
- Bæta `other_facebook_verified` við loan detail ef við á.

### Skref 6: Callback edge cases

- Uppfæra `app/auth/callback/route.ts` til að meðhöndla OAuth cancel og
  provider errors (redirect á `/auth-mvp/minn-profill?facebook=error`).

---

## 11. Tests

### Automated

- Unit test fyrir `checkFeatureAccess` með `'facebook-oauth'` key.
- Rendering test fyrir Facebook section: connected / disconnected / loading /
  error states.
- Rendering test fyrir `creator_facebook_verified` badge í ClaimPage.
- Type check: `ClaimInvitationDetails` með `creator_facebook_verified: boolean`.

### Manual (eftir implementation)

- Tengja Facebook sem innskráður notandi.
- Hætta við OAuth consent.
- Prófa invalid/expired callback.
- Aftengja Facebook.
- Staðfesta að Facebook-login sé ekki komið á login síðu.
- Staðfesta að notandi utan feature flag sér ekkert Facebook UI.
- Staðfesta að `creator_facebook_verified` badge birtist aðeins viðtakanda sem
  hefur samhengi við boðið.
- Staðfesta að `Þekki málið` og `Kannast ekki við þetta` virka áfram.

---

## 12. Localhost checks for Stebbi

Þegar Skref 1-5 eru lokið:

1. Setja `FACEBOOK_OAUTH_ENABLED=true` og `FACEBOOK_OAUTH_FLAG=true` í `.env.local`.
2. Setja eigið netfang í `feature_access` töflu með `feature_key = 'facebook-oauth'`.
3. Opna `/auth-mvp/minn-profill` - staðfesta að Facebook row birtist.
4. Smella `Tengja Facebook` - staðfesta að redirect til Facebook byrjar.
5. Ef Facebook app er í development mode, aðeins skráðir test users geta klárað.
6. Klára OAuth sem Facebook test user - staðfesta að lenda aftur á minn-profill
   með `Staðfest með Facebook`.
7. Refresh og staðfesta að staðan haldist.
8. Prófa OAuth cancel - staðfesta graceful villuskilaboð.
9. Opna lánaboð frá þessum sendanda sem annar test notandi - staðfesta badge.
10. Prófa notanda án feature flag - staðfesta að Facebook section sést ekki.
11. Prufa `Aftengja Facebook` - staðfesta að tengsl hverfi og status uppfærist.
12. Prófa mobile 360, 390 og 460 px - passa sérstaklega að Facebook row, OAuth
    pending state og badge í lánaboði valdi ekki zoomi, overlap eða horizontal
    overflow.

**Ekki prófa:**
- Ekki nota production Supabase secrets í local debug.
- Ekki virkja production Facebook provider eða breyta production redirect URLs.
- Ekki nota raunverulega notendur í prófunum.

---

## Óvissa / þarf að staðfesta

- `manual_linking_enabled` staða í þessum Supabase project: **óþekkt - Stebbi
  þarf að kanna**.
- RPC nákvæm schema (hvort `auth.identities` er aðgengilegt með service role
  í þessum project): **óstaðfest - þarf staðfestingu í Phase 1**.
- Meta App Review þörf og tímalína: **þarf undirbúning samhliða implementation**.
- `unlinkIdentity` hegðun þegar notandi er með email OTP + Facebook identities:
  **þarf manual prófun í Phase 1**.
