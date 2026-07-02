# TODO #51 - Claude Code v009 - Revised Facebook OAuth implementation plan

Created: 2026-07-02 16:55
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Type: Revised implementation plan til Stebba og Codex
Refs:
- ai-handoff/2026-07-02-1646-todo-051-v008-codex-v007-review-handoff.md
- ai-handoff/2026-07-02-0716-todo-051-v007-claude-phase0-nidustadur.md

Þetta er plan, ekki framkvæmd. Engin kóðabreyting, SQL, commit, push, deploy
eða production breyting hefur átt sér stað.

---

## Leiðréttingar frá v007

- **SECURITY DEFINER villa leiðrétt.** `get_my_loans` og `get_invitation_for_claim`
  eru ekki SECURITY DEFINER. Plan notar `profiles` töflu í stað auth.identities
  beint í loan RPCum.
- **Feature flag takmarkun skjalfest.** Flag er soft control á UI og badge,
  ekki hard block á Supabase `linkIdentity` kall.
- **Callback design nákvæmara.** Existing OTP flow er varðveitt.
- **Schema migration split skýrara.** Profile-only vs. badge scope aðgreint.
- **Profile page architecture leiðrétt.** Notum API extension, ekki server wrapper.

---

## 1. Scope ákvörðun

### Tveir möguleikar

**Option A - Profile-only**
Notandinn getur tengt og aftengt Facebook í minn-profill. Sér eigin stöðu.
Engin badge í lánaboði. Engin SQL migration á loan RPCum.

**Option B - Profile + badge í lánaboði (mælt)**
Eins og A, auk þess að viðtakandi lánaboðs sér hvort sendandinn sé staðfestur
með Facebook. Krefst SQL migration.

### Mæling: Option B

Upprunaleg forsenda TODO #51 er einmitt badginn í lánaboðssamhengi - að
viðtakandi geti staðfest hverjir er sendandi áður en hann samþykkir. Profile-only
leysir ekki þá þörf.

Sequencing: Codex mælir með að klára profile linking/status (A) fyrst og bæta
badge (B) við þegar A er prófað. Þetta er skynsamlegt - Plan skiptist í
Phase 1 (A) og Phase 2 (B) en báðar eru í v1 scope.

---

## 2. Auth/RPC strategy - leiðrétt

### Vandamálið við v007 nálgun

v007 lagði til að lesa `auth.identities` beint í `get_invitation_for_claim`
og `get_my_loans`. Þetta er rangt vegna:

- Þessar föll eru ekki SECURITY DEFINER (staðfest í sql/56).
- `service_role` hefur ekki sjálfkrafa SELECT á `auth.identities` (sama villa
  og SQL65 uppgötvaði).
- Að gera þær SECURITY DEFINER til að lesa auth schema er of breiður grant
  fyrir þetta þrönga verkefni.

### Leiðrétt nálgun: `profiles.facebook_verified_at`

Bæta `facebook_verified_at TIMESTAMPTZ DEFAULT NULL` við `profiles` töfluna.

- Þegar notandi tengir Facebook, setur server action dálkinn.
- Þegar notandi aftengir Facebook, hreinsar server action dálkinn.
- Loan RPCar lesa `profiles.facebook_verified_at` fyrir viðkomandi user_id.

**Af hverju þetta virkar með núverandi grants:**

`sql/41_profiles_select_own.sql` staðfestir:
- `authenticated` role: SELECT aðeins á eigin röð (USING id = auth.uid())
- `service_role`: BYPASSRLS - getur lesið allar raðir

Loan RPCar eru kallaðar í gegnum `getAdmin()` (service_role). Service_role
bypassar RLS og getur lesið `profiles.facebook_verified_at` fyrir hvaða
user_id sem er. Engar nýjar grants eða SECURITY DEFINER þarf á loan RPCum.

**Privacy surface:**
- Client fær aðeins boolean `creator_facebook_verified` / `other_facebook_verified`.
- Engar Facebook IDs, email, avatar URLs, tokens eða identity metadata fara til client.

### Sync mynstur

`facebook_verified_at` er sett/hreinsað með server action sem:
1. Kallar `supabase.auth.getUser()` með server client (les `user.identities`).
2. Athugar hvort `provider === 'facebook'` sé til í identities array.
3. Kalla `getAdmin().from('profiles').update({ facebook_verified_at: now/null })`.

Þetta er kallað:
- Þegar profile page hleðst og `?facebook=linked` eða `?facebook=unlinked`
  er í URL (eftir OAuth return).
- Þegar notandi smellir "Aftengja Facebook" (sync eftir `unlinkIdentity`).

---

## 3. Feature flag truth table

Keyring `checkFeatureAccess(userId, email, 'facebook-oauth')`:

| FACEBOOK_OAUTH_ENABLED | FACEBOOK_OAUTH_FLAG | Notandi í feature_access | Niðurstaða |
|---|---|---|---|
| unset eða false | hvað sem er | hvað sem er | false - allt falið |
| true | unset eða false | hvað sem er | true - allir innskráðir fá aðgang |
| true | true | já | true - notandinn hefur aðgang |
| true | true | nei | false - notandinn hefur ekki aðgang |

### Hvað false þýðir í reynd

- Facebook section sést ekki í minn-profill.
- `/api/teskeid/profile` GET skilar `facebook_oauth_allowed: false`,
  `facebook_connected: false`.
- Server action fyrir link/unlink er blocked.
- `creator_facebook_verified` og `other_facebook_verified` eru alltaf `false`
  í loan RPC output þegar flag er af - badge birtist aldrei.

### Þekkt takmarkun: ekki hard block á Supabase level

Þegar Facebook provider er globally virkt í Supabase Dashboard og
`manual_linking_enabled: true`, getur tæknilega færinn innskráður notandi
kallað `supabase.auth.linkIdentity({ provider: 'facebook' })` beint í browser
console, óháð feature flag. Teskeið feature flag veldur því að:

- Slíkur notandi sér ekkert Facebook UI.
- Server action syncar ekki `profiles.facebook_verified_at` fyrir þann notanda.
- Badge birtist ekki í lánaboðssamhengi.

Þetta er ásættanleg takmarkun fyrir v1.

---

## 4. Callback design

### Núverandi hegðun (varðveitt)

```
GET /auth/callback?code=XXX&next=/some/path
  → exchangeCodeForSession(code)
  → success: redirect til next (eða /)
  → failure: redirect til /login
```

OTP login notar þessa route einnig. Hún hlýtur að virka áfram.

### Facebook linking viðbót

`linkIdentity` er kallað með:
```ts
supabase.auth.linkIdentity({
  provider: 'facebook',
  options: {
    redirectTo: `${window.location.origin}/auth/callback` +
      `?next=${encodeURIComponent('/auth-mvp/minn-profill?facebook=linked')}`,
  },
})
```

Callback route þarf litla viðbót til að meðhöndla Facebook-specific failure:

```
GET /auth/callback?code=XXX&next=/auth-mvp/minn-profill%3Ffacebook%3Dlinked
  → exchangeCodeForSession(code)
  → success: redirect til /auth-mvp/minn-profill?facebook=linked
  → failure: ef next byrjar á /auth-mvp/minn-profill:
      redirect til /auth-mvp/minn-profill?facebook=error
    annars (OTP eða óþekkt):
      redirect til /login (núverandi hegðun óbreytt)
```

### next validation

`next` parameter er validated:
- Verður að byrja á `/` (relative path aðeins).
- Má ekki innihalda `://` (kemur í veg fyrir open redirect).
- Ef validation mistekst: redirect á `/` (safe fallback).

### Edge cases

- **OAuth cancel:** Facebook sendir `error=access_denied` - code exchange
  mistekst - fallback til `/auth-mvp/minn-profill?facebook=error`.
- **Expired callback:** code exchange mistekst - sama fallback.
- **Already linked:** `linkIdentity` skilar villu á browser side áður en
  redirect byrjar - UI meðhöndlar þetta, callback route þarf ekki að sjá um það.
- **Provider error:** sama og cancel.

### Engin Facebook login leið

`linkIdentity` virkar aðeins þegar notandi er þegar innskráður. Ef
`linkIdentity` er kallað með session-less notanda skilar Supabase villu.
Facebook er eingöngu á minn-profill, ekki á `/innskraning` eða `TeskeidLoginForm`.

---

## 5. Skrár sem verða snerttar

### Phase 1 - Profile linking/status (Option A)

| Skrá | Breyting |
|---|---|
| `.env.example` | Bæta við `FACEBOOK_OAUTH_ENABLED` og `FACEBOOK_OAUTH_FLAG` |
| `lib/loans/guard.ts` | Bæta `'facebook-oauth'` case við `checkFeatureAccess` |
| `app/api/teskeid/profile/route.ts` | GET skilar `facebook_oauth_allowed` + `facebook_connected`; ný POST action til sync |
| `app/auth-mvp/minn-profill/page.tsx` | Facebook section: status row, link/unlink button, pending/error states |
| `app/auth/callback/route.ts` | Viðbót: Facebook-specific fallback á minn-profill |
| `messages/is.json` | Nýjar strengir fyrir Facebook UI |
| `messages/en.json` | Nýjar strengir fyrir Facebook UI |

### Phase 2 - Badge í lánaboði (Option B viðbót)

| Skrá | Breyting |
|---|---|
| SQL migration 66 | `profiles.facebook_verified_at`, uppfærðar RPCar |
| `lib/loans/types.ts` | `creator_facebook_verified: boolean` í `ClaimInvitationDetails`; `other_facebook_verified: boolean` í `LoanItem` |
| `app/auth-mvp/lanad-og-skilad/claim/[id]/page.tsx` | `Staðfest með Facebook` badge við sendanda |
| `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` | `other_facebook_verified` badge þegar við á |

---

## 6. Migration plan - Phase 2 (SQL 66)

Þetta er tillaga að efni migrations. **SQL er skrifað aðeins, ekki keyrt,
nema Stebbi gefi sérstakt leyfi síðar.**

### Migration 66: `66_facebook_oauth.sql`

**Aðgerðir:**

1. `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS facebook_verified_at TIMESTAMPTZ DEFAULT NULL;`

2. Uppfæra `get_invitation_for_claim` til að skila `creator_facebook_verified BOOLEAN`:
   - Bæta JOIN við `profiles` töflu á `creator_user_id`.
   - Skila `(p.facebook_verified_at IS NOT NULL) AS creator_facebook_verified`.
   - Þar sem fallið er ekki SECURITY DEFINER og keyrir via service_role,
     er RLS bypassað - þarf engar nýjar grants.

3. Uppfæra `get_my_loans` á sama hátt til að skila `other_facebook_verified BOOLEAN`.

**RLS áhrif:**
- `authenticated` notendur geta ekki lesið aðrar raðir í `profiles` (sql/41).
- Service_role BYPASSRLS - getur lesið `facebook_verified_at` fyrir hvaða user sem er í RPCum.
- Ekkert í kóðagrunni les `profiles.facebook_verified_at` beint með `authenticated` client.

**Grants/revokes:**
- Engar nýjar grants þarf á `profiles` töflunni.
- `authenticated` update grant (sql/26) þarf að ná til nýja dálksins sjálfkrafa.

**Rollback:**
```sql
ALTER TABLE public.profiles DROP COLUMN IF EXISTS facebook_verified_at;
-- Restore get_invitation_for_claim frá sql/56
-- Restore get_my_loans frá sql/56
```

**Migration safety:**
- `ADD COLUMN IF NOT EXISTS` er örugt á live töflu.
- Engar gögn eru breytt eða eytt.
- `DEFAULT NULL` þýðir engar existing raðir fá gildi.
- Loan RPCar þurfa DROP+CREATE (sama mynstur og SQL56 notaði fyrir get_my_loans).

---

## 7. Sequencing - örugg röð

Þetta er mælt framkvæmdarröð þegar Stebbi gefur leyfi til hvers skrefs:

**Phase 1 (code - engar ytri stillingar):**
1. Feature flag í `lib/loans/guard.ts` og `.env.example`
   (disabled by default - núll áhætta).
2. `/api/teskeid/profile` GET extension + sync POST action.
3. Minn-profill UI á bak við disabled flag.
4. Callback route viðbót.
5. Messages strings.

**Ytri stillingar (Stebbi gerir þetta - sérstakt samþykki þarf):**
6. Virkja `manual_linking_enabled` í Supabase Dashboard.
7. Stofna Facebook Developer App.
8. Setja Facebook provider í Supabase Dashboard.
9. Bæta test users við Facebook app.
10. Setja `FACEBOOK_OAUTH_ENABLED=true` og eiga netfang í `feature_access`.

**Prófun á Phase 1:**
11. Prófa link, unlink, cancel, error á localhost.
12. Staðfesta OTP login regression.

**Phase 2 (SQL migration - sérstakt samþykki þarf):**
13. Skrifa SQL 66.
14. Stebbi yfirfer og keyrir SQL 66.
15. TypeScript type breytingar.
16. Badge UI í claim og loan detail.
17. Prófun á Phase 2.

**Production (sérstakt samþykki þarf):**
18. Meta App Review undirbúningur (privacy policy, domain, screencast).
19. Senda App Review.
20. Eftir samþykki: kveikja á feature flag fyrir fleiri notendur.

---

## 8. Test plan

### Automated (Phase 1)

- Unit test: `checkFeatureAccess('facebook-oauth')` í öllum fjórum
  flag-state combinations.
- Rendering test: Facebook section í minn-profill - connected / disconnected /
  loading / error / flag-disabled states.
- `/api/teskeid/profile` GET: skilar réttum `facebook_oauth_allowed` og
  `facebook_connected` gildum.
- Callback route: `next` validation - relative paths pass, external URLs fail.

### Automated (Phase 2)

- Type check: `ClaimInvitationDetails.creator_facebook_verified` er boolean.
- Rendering test: `ClaimPage` með `creator_facebook_verified: true` sýnir badge.
- Rendering test: `ClaimPage` með `creator_facebook_verified: false` sýnir ekki badge.
- Regression: `ClaimForm` `Þekki málið` / `Kannast ekki við þetta` virka
  óháð badge state.

### Manual (krefst Facebook Developer App og Supabase stillingar)

- Tengja Facebook sem innskráður notandi á feature flag.
- Hætta við OAuth consent - staðfesta graceful villa á minn-profill.
- Invalid/expired callback - staðfesta graceful villa.
- Aftengja Facebook - staðfesta að staðan hreinsar sig.
- Endurræsa session og staðfesta að staðan haldist yfir refresh.
- Staðfesta að `/innskraning` hefur engan Facebook valkost.
- Staðfesta að notandi **utan** feature flag sér ekkert Facebook UI.
- Staðfesta að notandi utan flag getur ekki keyrt sync server action.
- Phase 2: Badge birtist aðeins viðtakanda með raunverulegt samhengi.
- Phase 2: Óviðkomandi notandi sér engan badge.
- Phase 2: Engin Facebook metadata (ID, email, token) er sýnileg í client payload.
- OTP login regression: email kóðar virka áfram eftir callback breytingu.

### Mobile prófun

- 360, 390 og 460 px breiddir.
- Facebook status row í minn-profill: enginn zoom, overlap eða overflow.
- OAuth pending state: takkinn breytist ekki í breidd.
- Badge í lánaboði: passar við 360 px.

---

## 9. Localhost checks for Stebbi (Phase 1)

Þegar Phase 1 code er lokið og ytri stillingar eru tilbúnar:

1. Setja `FACEBOOK_OAUTH_ENABLED=true` og `FACEBOOK_OAUTH_FLAG=true` í `.env.local`.
2. Setja eigið netfang í `feature_access` með `feature_key = 'facebook-oauth'`.
3. Opna `/auth-mvp/minn-profill` - staðfesta Facebook row með `Facebook ekki tengt`.
4. Smella `Tengja Facebook` - staðfesta pending state og að takkinn breytist
   ekki í breidd.
5. Klára OAuth sem Facebook test user - staðfesta return á minn-profill
   með `Staðfest með Facebook`.
6. Refresh og staðfesta að staðan haldist.
7. Smella `Aftengja Facebook` - staðfesta að status fari aftur á `Facebook ekki tengt`.
8. Prófa OAuth cancel - staðfesta skýr, non-blocking villa á minn-profill.
9. Opna `/innskraning` - staðfesta engan Facebook valkost.
10. Skrá inn sem annar notandi **án** feature flag - staðfesta engan Facebook section.
11. Prófa mobile 360, 390 og 460 px.

### Localhost checks (Phase 2)

12. Opna lánaboð (`/auth-mvp/lanad-og-skilad/claim/[id]`) þar sem sendandi
    er Facebook-staðfestur - staðfesta `Staðfest með Facebook` badge.
13. Opna sama boð sem annar notandi - staðfesta ekkert badge eða
    Facebook information lekur.
14. Staðfesta `Þekki málið` og `Kannast ekki við þetta` virka áfram.

**Ekki prófa:**
- Ekki nota production Supabase secrets í local debug output.
- Ekki virkja production Facebook provider eða breyta production redirect URLs
  nema Stebbi samþykki sérstaklega.
- Ekki nota raunverulega notendur eða viðkvæm Facebook aðgangsgögn.

---

## Óvissa / þarf að staðfesta

- `manual_linking_enabled` staða í Supabase Dashboard: óþekkt - Stebbi þarf
  að kanna áður en Phase 1 prófun hefst.
- Supabase `user.identities` structure í þessum project: óprófað - Phase 1
  sync action mun uppgötva þetta við fyrstu prófun.
- `unlinkIdentity` hegðun með email OTP + Facebook: óprófað - manual prófun
  í Phase 1.
- Meta App Review tímalína: óþekkt - þarf undirbúning sem sérstakt verkefni.
- Confidence á SQL 66 plan: medium - rétt á paper en þarf Codex review á
  nákvæmu SQL áður en Stebbi keyrir.
