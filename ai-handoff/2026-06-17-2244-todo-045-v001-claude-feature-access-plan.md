# TODO #45 — Per-user feature access (feature_access tafla + admin UI)

**Agent:** Claude Code
**Fyrir:** Codex (yfirferð) og Stebbi (samþykki)
**Dagsetning:** 2026-06-17
**Staða:** Plan -- bíður Codex-yfirferðar og Stebbi-samþykkis
**Tengd TODO:** #45 (nýtt) Per-user feature flags með admin UI; tengist #41 Umönnun

## Markmið

Í stað þess að `UMONNUN_ENABLED=true` opni Umönnun fyrir alla þarfnast hvert
netfang sérstakrar heimildar. Stebbi getur stjórnað hverjir sjá Umönnun beint á
`/admin` -- bætt við og tekið úr lista -- án þess að þurfa að breyta env-var eða
deployta.

## Uppbygging lausnar (Leið A)

### Heildarsýn

```
UMONNUN_ENABLED=true   (global kveikja á Vercel -- ef false sér enginn)
      +
UMONNUN_FLAG=true      (kveikir á per-user farvegi -- ef false/ósett sér allir)
      +
feature_access tafla   (per-user: hverjir sjá það þegar FLAG=true)
      =
checkFeatureAccess()   (rökfræði sjá hér að neðan)
```

**Þrjú ástand:**

| `UMONNUN_ENABLED` | `UMONNUN_FLAG` | Niðurstaða |
|---|---|---|
| `false` / ósett | hvað sem er | Enginn sér Umönnun |
| `true` | `false` / ósett | Allir innskráðir notendur sjá Umönnun |
| `true` | `true` | Aðeins þeir sem eru í `feature_access` töflunni |

**Útgáfuleiðin:** Þegar Umönnun er tilbúin fyrir alla: stilla `UMONNUN_FLAG=false` (eða fjarlægja breytuna) á Vercel. Engin deploy þarf.

Admin á /admin stýrir `feature_access` töflunni í gegnum server actions.

---

## 1. SQL migration: `sql/52_feature_access.sql`

Ný tafla til að geyma per-user feature-aðgang:

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.feature_access (
  email       text        NOT NULL CHECK (email = lower(trim(email))),
  feature_key text        NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, feature_key)
);

CREATE INDEX IF NOT EXISTS feature_access_feature_key_idx
  ON public.feature_access (feature_key);

ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;

-- No policies: service_role only
REVOKE ALL ON public.feature_access FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.feature_access TO service_role;

COMMIT;
```

**Engin breyting á `auth_mvp_allowlist`.** Taflan er aðskilin -- login-aðgangur
og feature-aðgangur eru óháð hvort öðru.

**Ekki keyra migration nema Stebbi biðji sérstaklega.**

---

## 2. Uppfæra `checkFeatureAccess` í `lib/loans/guard.ts`

Núverandi:
```ts
if (featureKey === 'umonnun') return process.env.UMONNUN_ENABLED === 'true'
```

Nýtt:
```ts
if (featureKey === 'umonnun') {
  if (process.env.UMONNUN_ENABLED !== 'true') return false
  // Ef FLAG er ekki 'true' (false eða ósett) -> opið öllum notendum
  if (process.env.UMONNUN_FLAG !== 'true') return true
  // FLAG=true -> per-user DB check
  try {
    const { data } = await getAdmin()
      .from('feature_access')
      .select('email')
      .eq('email', email.toLowerCase())
      .eq('feature_key', 'umonnun')
      .maybeSingle()
    return data !== null
  } catch {
    return false
  }
}
```

`_email` færist í `email` (var ónotað áður, notað núna).
`_userId` helst `_userId` (enn ónotað).

`getAdmin()` er þegar í `lib/loans/guard.ts` (import-less, notað í
`guardLoanAccess`). Þarf að bæta við import ef hann er ekki þegar þar.

Ef DB-query mistekst (catch) á fallbackið að vera `false` -- eðlilegt verndarlag.
Ef `UMONNUN_FLAG` er ósett eða `false` er DB aldrei sótt.

---

## 3. Nýjar server actions: `app/(admin)/admin/feature-access-actions.ts`

```ts
'use server'
// Admin-only server actions -- aðeins kallaðar frá /admin með ADMIN_EMAILS guard

import { getAdmin } from '@/lib/supabase/admin'

export async function listFeatureAccess(
  featureKey: string,
): Promise<{ email: string; granted_at: string }[]> { ... }

export async function grantFeatureAccess(
  email: string,
  featureKey: string,
): Promise<{ ok: boolean; error?: string }> { ... }

export async function revokeFeatureAccess(
  email: string,
  featureKey: string,
): Promise<{ ok: boolean }> { ... }
```

Þessar actions eru EKKI guard-aðar af `guardLoanAccess`. Þær eru í `/admin`
route-group sem layout.tsx ver með `ADMIN_EMAILS` check. Þetta er sama
öryggismynstur og allt annað á `/admin`.

Email-validate á server: trim + lowercase + basic format-check áður en
það fer í DB.

---

## 4. Admin UI: nýr hluti á `app/(admin)/admin/page.tsx`

Bæta við `FeatureAccessSection` component (innri, ekki sér skrá) í
`admin/page.tsx`.

Útlit:

```
[ Umönnun-aðgangur ]
─────────────────────────────
stebbi@example.com    [Fjarlægja]
ariel@example.com     [Fjarlægja]
─────────────────────────────
[ netfang@dæmi.is ]  [Gefa aðgang]
```

Component:
- Sækir lista með `listFeatureAccess('umonnun')` við mount
- `useTransition` fyrir bæta-við og fjarlægja
- Staðfestingarskilaboð eða villa ef aðgerð mistekst
- Email-input validates format á client áður en server action er kölluð

Hlutinn ætti að vera í lok admin-síðunnar eða undir sérstakri fyrirsögn,
ekki blandin við hugmyndir/analytics.

---

## 5. Breytt/ný skrá í þessum pakka

SQL (ekki keyrð):
- `sql/52_feature_access.sql` (ný)

Logic:
- `lib/loans/guard.ts` -- `checkFeatureAccess` uppfærð, `_email` → `email`

Admin:
- `app/(admin)/admin/feature-access-actions.ts` (ný)
- `app/(admin)/admin/page.tsx` -- nýr `FeatureAccessSection` hluti

Prófanir (lágmark):
- `lib/__tests__/guard.test.ts` -- umönnun-prófin þurfa mock á `getAdmin`
- `lib/__tests__/sql-migration.test.ts` -- static próf fyrir sql/52
- Hugsanlega `lib/__tests__/feature-access-actions.test.ts` (ný)

---

## 6. Áhættumat

**Heildaráhætta: Miðlungs.**

Helstu áhættur:

### A. `checkFeatureAccess` verður DB-dependent (aðeins þegar FLAG=true)

Núna er þetta hreinn env-var check. Eftir breytinguna er DB-call aðeins þegar
`UMONNUN_FLAG=true`. Ef `UMONNUN_FLAG` er ósett eða `false` er engin DB-query og
`checkFeatureAccess` skilar `true` strax (eins og env-var check).

Mótvægisaðgerðir:
- `try/catch` sem skilar `false` ef DB er niðri -- notandi sér bara ekki Umönnun
- `getAdmin()` er þegar notað á `/heim` (fyrir pending invitations og recent
  events) svo extra query er lítil viðbót

### B. Admin actions nota ekkert sérstaklega guard utan layout

`ADMIN_EMAILS` layout-guard verndar `/admin` route-group en server actions
í `feature-access-actions.ts` hafa enga innbyggða check. Ef einhver
fær beinan aðgang að server action URL (sem er nánast ómögulegt með Next.js
server actions) er varnarlagið veikara.

Mögulegt viðbótarlag: bæta við `verifyAdminSession()` helper sem les
`ADMIN_EMAILS` og kallar `createClient()` í hverri action. Sama mynstur
og `/admin` layout gerir. Codex getur metið hvort þetta sé nauðsynlegt.

### C. Email-format validation

Email í `feature_access` töflunni er `CHECK (email = lower(trim(email)))`.
Server action þarf að normalize email áður en INSERT til að forðast
CHECK constraint villur sem leka sem 500-villa.

### D. Migration er idempotent (CREATE TABLE IF NOT EXISTS)

Safe að keyra oftar en einu sinni. Engin gagna-breyting. Engin RLS-policy
breyting á öðrum töflum.

Ekki sett risk:
- Engin breyting á `auth_mvp_allowlist`
- Engin breyting á login-flæði
- Engin breyting á RLS á `loan_items` eða `loan_invitations`
- `lanad-og-skilad` feature flag breytist ekki

---

## 7. Spurningar til Codex-yfirferðar

1. **Admin action guard:** Á `verifyAdminSession()` helper að vera í hverri
   feature-access server action, eða er layout-guard nóg?

2. **DB-villa á `/heim`:** Á `checkFeatureAccess` að log-a villu þegar DB-call
   mistekst, eða vera þögult (skilar bara `false`)?

3. **`listFeatureAccess` pagination:** Umönnun-listinn er líklega < 20 manns.
   Þarf pagination? Mælt er með að sleppa því í Phase A.

4. **`lanad-og-skilad` á eftir:** Þegar við bætum `lanad-og-skilad` við
   `feature_access` þarf `checkFeatureAccess` að uppfærast. Er það í scope
   þessa pakka eða sér TODO?

---

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Migration er EKKI keyrð á localhost án
sérstaks samþykkis.

### Setup (eftir migration)

1. Keyra `sql/52_feature_access.sql` á local Supabase.
2. Hafa `UMONNUN_ENABLED=true` og `UMONNUN_FLAG=true` í `.env.local` til að prófa per-user farveg.

### Test 0 -- UMONNUN_FLAG ósett eða false: allir sjá Umönnun

Skref:

1. Hafa `UMONNUN_ENABLED=true` en **ekki** `UMONNUN_FLAG` (eða `UMONNUN_FLAG=false`).
2. Innskrá sem hvaða notandi sem er.

Vaent:

- Umönnun birtist öllum innskráðum notendum. Engin DB-query á `feature_access`.

### Test 1 -- FLAG=true og enginn í feature_access: enginn sér Umönnun

Skref:

1. Ganga úr skugga um að `feature_access` taflan sé tóm fyrir `umonnun`.
2. Innskrá og fara á `/heim`.

Vaent:

- Umönnun birtist ekki þótt `UMONNUN_ENABLED=true`.

### Test 2 -- Bæta við email á /admin

Skref:

1. Fara á `/admin`.
2. Finna Umönnun-hlutann.
3. Slá inn email Stebba og smella á `Gefa aðgang`.

Vaent:

- Email birtist í lista.
- Fara á `/heim` sem sá notandi: Umönnun birtist.

### Test 3 -- Fjarlægja email á /admin

Skref:

1. Smella á `Fjarlægja` við hliðina á email.

Vaent:

- Email hverfur úr lista.
- Fara á `/heim` sem sá notandi: Umönnun birtist ekki lengur.

### Test 4 -- Global flag slökkt

Skref:

1. Setja `UMONNUN_ENABLED` ekki `true`.
2. Jafnvel með email í `feature_access`.

Vaent:

- Umönnun birtist aldrei.

### Test 5 -- Beint á /auth-mvp/umonnun með flag slökktu

Vaent:

- Redirect á `/` (guardFeatureAccess kallar checkFeatureAccess sem skilar false).

### Test 6 -- Regression: /heim hraði

Vaent:

- Síðan hleðst eðlilega. Extra DB-query ætti ekki að vera merkjanleg.

### Hvað á ekki að prófa kæruleysislega

- Ekki setja Umönnun API lykla eða secrets í `.env.local`.
- Ekki keyra migration á production án sérstakrar leyfisbeiðni.
- Ekki deploya fyrr en Stebbi og Codex hafa samþykkt.

---

## Tillaga að næsta skrefi

1. Codex yfirfer þessa handoff-skrá.
2. Stebbi gefur Claude Code grænt ljós.
3. Claude Code framkvæmir í þessari röð:
   a. `sql/52_feature_access.sql`
   b. `lib/loans/guard.ts` (`checkFeatureAccess` uppfærsla)
   c. `app/(admin)/admin/feature-access-actions.ts`
   d. `app/(admin)/admin/page.tsx` (FeatureAccessSection)
   e. Uppfærir próf
4. Stebbi keyrir migration á local Supabase og prófar.
5. Ef allt er gott: commit og deploy.
