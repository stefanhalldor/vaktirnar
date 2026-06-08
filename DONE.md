# DONE

Saga kláraðra og staðfestra atriða.

---

## #1 — Lendingarsíða fyrir innskráðan notanda

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (handvirk prófun)

Authenticated heimasíða á `/auth-mvp/heim`. Heilsar notanda með `display_name`,
sýnir alltaf „Teskeiðar"-hluta með virku „Lánað og skilað"-tengli (badge með
fjölda opinna boða) og sjö óvirka „Væntanlegt"-hnappa í fastri röð. „Nýlegt"
sýnir þrjú nýjustu lán raðað eftir `loaned_at DESC, id DESC`; SHA-256-undirritað
kaka gerir notanda kleift að merkja lista sem lesinn og sjá staðfestingarbanner;
undirskrift breytist sjálfkrafa ef lán breytast eða fara yfir skiladag.
Home-leiðsögn var bætt við `/auth-mvp/minn-profill` og `lanad-og-skilad`;
báðar síður voru endurhannaðar í mobile-first skipulag sem hluti af #6.

Skrár:
- `app/auth-mvp/heim/page.tsx` — heimasíða (server component, ný)
- `app/auth-mvp/heim/RecentSection.tsx` — Nýlegt client component (ný)
- `app/auth-mvp/minn-profill/page.tsx` — Home-leiðsögn bætt við (endurhannaður í #6)
- `app/auth-mvp/lanad-og-skilad/page.tsx` — Home-leiðsögn bætt við (endurhannaðar allar lánasíður með `LoanShell` sem hluti af #6)
- `lib/loans/sort.ts` — `sortLoansForHome` (ný)
- `lib/__tests__/home-page.test.tsx` — 41 próf (ný)
- `lib/__tests__/profile-page.test.tsx` — 3 próf (ný)
- `messages/is.json`, `messages/en.json` — þýðingar

---

## #2 — Admin opnar tölfræðiflipa sjálfkrafa

**Lokið:** 2026-06-07
**Staðfest af Codex:** já (eftir race-condition fix)

Admin síðan opnar `stats` tab sjálfkrafa. `resolveInitialPeriod(stored, now)`
velur period: fyrsta heimsókn og öll villutilfelli (ógilt, framtíðar-timestamp,
localStorage ekki aðgengilegt) → `5min`; gildur tími → `pickPeriod(elapsed)`.
`setPeriod` og `setPeriodReady(true)` eru bæði kölluð í `finally` þannig að
React sameinar state-uppfærslurnar; analytics-fetch sér alltaf réttan period þegar
`periodReady` flippast.

Skrár:
- `lib/admin/period.ts` — `pickPeriod` helper
- `app/(admin)/admin/page.tsx` — default tab, localStorage effect, periodReady guard
- `lib/__tests__/admin-period.test.ts` — 18 unit tests (boundary cases)

---

## #3 — Samræma Teskeið-innskráningarslóðir

**Lokið:** 2026-06-07
**Staðfest af Codex:** já

Canonical Teskeið-innskráningarslóð: `/auth-mvp/innskraning`.
Aliases `/auth-mvp/innskráning`, `/innskraning`, `/innskráning` og
percent-encoded útgáfur (via `decodeURIComponent`) redirecta til canonical í
middleware. Alias-blokk er á eftir feature-flag athugun þannig að slökktur
`AUTH_MVP_ENABLED` sendir `/auth-mvp/innskráning` á `/` í stað canonical.
`BottomNav` í `NavBar.tsx` uppfærður til að nota canonical URL beint.
`app/innskraning/page.tsx` óhreyfð (eytt ekki).

Skrár:
- `middleware.ts` — alias redirect block + `decodeURIComponent` normalization
- `components/teskeid/NavBar.tsx` — `/innskraning` → `/auth-mvp/innskraning`
- `lib/__tests__/middleware.test.ts` — 8 regression tests (aliases, encoded,
  feature-flag priority, query string, /login fallback, no loop)

---

## #6 — Canonical lógó Teskeiðar

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (localhost-prófun)

Canonical `TeskeidLogo` SVG-component útbúinn og staðfestur á öllum skjám.
Lógóið er smellanlegt á authenticated síðum og tengir á `/auth-mvp/heim`.
SVG er decorative þar sem Link hefur aðgengilegt `aria-label`. Engar gamlar
lógóútgáfur eru sýnilegar. Build og prófanir standast.

**Production-notkun og samþykktar staðsetningar:**

- `components/teskeid/NavBar.tsx` — `<TeskeidLogo size={80} decorative />` í aðal-header (`h-28 sm:h-32`) á opinberum síðum
- `app/auth-mvp/heim/page.tsx` — `<TeskeidLogo size={160/200} decorative />` neðst, í `Link` á `/auth-mvp/heim`
- `app/auth-mvp/minn-profill/page.tsx` — sama mynstur neðst
- `components/loans/LoanShell.tsx` — sama mynstur neðst á öllum `lanad-og-skilad`-síðum
- `app/hugmyndir/[slug]/page.tsx` — `<TeskeidLogo size={140/170} showBackground={false} decorative />` miðjað efst í article

**Favicon og app-icons:**

- `app/icon.svg` — andlitsfavicon
- `public/icon-192.png` — PWA-icon (192×192 px)
- `public/icon-512.png` — PWA-icon (512×512 px)

**Component-skrár:**

- `components/teskeid/TeskeidLogo.tsx` — canonical production-component
- `components/teskeid/teskeidLogoPaths.ts` — `TESKEID_VIEWBOX`, `TESKEID_GREEN_PATH`, `TESKEID_CREAM_DETAILS_PATH`

**Prófanir:**

- `lib/__tests__/teskeid-logo.test.tsx` — 14 próf
- `lib/__tests__/loan-pages.test.tsx` — lógótengill og decorative SVG prófuð
- `lib/__tests__/profile-page.test.tsx` — lógótengill og decorative SVG prófuð

---

## #14 — Öryggisforsendur fyrir opna beta

**Lokið:** 2026-06-08
**Staðfest af Codex:** v017 (14C), v021 (14B), v026 (14D lokafrágangi) — sql/42 keyrt af Stebbi 2026-06-08

Sex launch-blockers leystir, prófaðir og rýndir:

**1. Einangrun Teskeiðar frá eldri app-flötum (`LEGACY_ENABLED`)**
Middleware framfylgir `LEGACY_ENABLED`-flaggi. Legacy-slóðir (`/home`, `/children`, `/contacts`, `/chat`, `/settings` o.fl.) og API-slóðir þeirra skila 404 eða redirect til `/` þegar `LEGACY_ENABLED !== 'true'`. Teskeið-slóðir eru óhreyfðar. 38 regression-próf í `lib/__tests__/legacy-guard.test.ts`.

**2. Herðing `profiles_select` (sql/41)**
`profiles_select` policy breytt úr `USING (true)` í `USING (id = auth.uid())`. Nýr Teskeið-notandi les bara eigin prófíl. Defensive optional chaining bætt við `app/(app)/children/[id]/page.tsx` til að koma í veg fyrir crash þegar co-parent prófíll er ekki sýnilegur. 10 static regression-próf í `lib/__tests__/profiles-14a.test.ts`. SQL keyrt í production.

**3. IP/abuse rate-limit á `/api/auth-mvp/request-code` (sql/42)**
Nýtt `otp_ip_rate_limit`-tafla og `check_and_increment_ip_rate_limit` RPC (SECURITY DEFINER, bounded cleanup, service_role only). IP er HMAC-hash — engin hrátt IP geymd. `checkIpRateLimit()` í `lib/auth/ip-rate-limit.ts` er fail-open þegar AUTH_CODE_SECRET vantar/er of stutt, þegar IP-header vantar, eða þegar RPC mistekst. 27 próf í `lib/__tests__/ip-rate-limit.test.ts` ásamt sql/42 static contract. SQL keyrt í production af Stebba 2026-06-08.

**4. Atomic OTP-staðfesting (sql/38)**
`verify_user_otp_code` og `verify_admin_otp_code` RPC framkvæma attempt-talningu, `used_at`-uppfærslu og HMAC-samanburð í einni atóm Postgres-færslu með `FOR UPDATE` lás. Concurrent og replay-árásir blokkast. 30+ próf og sql/38 static contract í `lib/__tests__/otp-verification.test.ts`. SQL keyrt í production.

**5. Aðskilnaður session-aðgangs og feature-aðgangs (Phase 14C)**
`guardTeskeidSession()` (session-only) og `guardTeskeidAccess()` (session + allowlist) aðskilin í `lib/auth/guard.ts`. `checkFeatureAccess()` og `guardFeatureAccess()` bætt við `lib/loans/guard.ts`. `/auth-mvp/heim` notar `guardTeskeidSession()` + `checkFeatureAccess()`. `/auth-mvp/minn-profill` fær server-side layout-guard. `/api/teskeid/profile` framfylgir `AUTH_MVP_ENABLED`, session og email-presence. 40+ próf í `guard.test.ts`, `home-page.test.tsx`, `teskeid-profile-route.test.ts`.

**6. PII úr production-logs fjarlægt**
Netföng, OTP-kóðar og tokens eru ekki í `console.error`/`warn` í neinum server-side skrám. AST-scanner í `lib/__tests__/log-safety.test.ts` yfirferð yfir 50+ skrár við hverja keyrslu — þar á meðal `lib/auth/ip-rate-limit.ts` og `lib/loans/guard.ts` sem bætt var við í þessum fasa. Handvirkir próf í `lib/__tests__/auth-log.test.ts`.

**Lokastaða prófa:**

```
Test Files  28 passed (28)
Tests       813 passed | 22 skipped | 8 todo (843)
```

**Deployment:**
- `sql/41_profiles_select_own.sql` — keyrt í production.
- `sql/42_ip_rate_limit.sql` — keyrt í production (Stebbi, 2026-06-08).

Skrár:
- `sql/41_profiles_select_own.sql` — keyrt
- `sql/42_ip_rate_limit.sql` — keyrt í production af Stebba 2026-06-08
- `lib/auth/guard.ts` — `guardTeskeidSession()` + refactored `guardTeskeidAccess()`
- `lib/auth/ip-rate-limit.ts` — `hashIp()`, `checkIpRateLimit()` (ný)
- `lib/loans/guard.ts` — `checkFeatureAccess()`, `guardFeatureAccess()`, uppfærður `guardLoanAccess()`
- `lib/legacy/guard.ts` — `legacyGuard()` (ný)
- `app/(app)/children/[id]/page.tsx` — optional chaining
- `app/auth-mvp/heim/page.tsx` — session-only guard + `checkFeatureAccess()`
- `app/auth-mvp/minn-profill/layout.tsx` — server-side layout guard (ný)
- `app/api/auth-mvp/request-code/route.ts` — IP rate-limit check bætt við
- `app/api/teskeid/profile/route.ts` — `AUTH_MVP_ENABLED` + email-presence guard
- `lib/__tests__/legacy-guard.test.ts` — 38 próf (ný)
- `lib/__tests__/profiles-14a.test.ts` — 10 próf (ný)
- `lib/__tests__/otp-verification.test.ts` — 30+ próf (ný)
- `lib/__tests__/auth-log.test.ts` — 7 próf (ný)
- `lib/__tests__/log-safety.test.ts` — AST-scanner, 50+ skrár (ný)
- `lib/__tests__/guard.test.ts` — viðbætur
- `lib/__tests__/home-page.test.tsx` — viðbætur
- `lib/__tests__/request-code.test.ts` — viðbætur
- `lib/__tests__/ip-rate-limit.test.ts` — 27+ próf ásamt sql/42 contract (ný)
- `lib/__tests__/teskeid-profile-route.test.ts` — 13 próf (ný)

---

## #11 — „Nýlegt" fyrir ofan „Teskeiðar" á `/heim`

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (localhost-prófun)

Á `/auth-mvp/heim` birtist „Nýlegt"-hlutinn fyrir ofan „Teskeiðar"-hlutann.
Röðin er: kveðja, „Nýlegt", „Teskeiðar", lógó. Gögn, cookie/read-state,
textar og virkni sectionanna eru óbreytt. DOM-próf staðfestir röðina.

Skrár:
- `app/auth-mvp/heim/page.tsx` — Nýlegt-section á undan Teskeiðar-section
- `lib/__tests__/home-page.test.tsx` — DOM-order próf: „Nýlegt" á undan „Teskeiðar"

---

## #4 — Minimal opnunarstýring fyrir fyrstu public Teskeið

**Lokið:** 2026-06-08
**Staðfest af Codex:** já (post-release review eftir commit `c1f98ac`)

Fyrsta public opnun Teskeiðar notar áfram einfalt feature-flag mynstur í stað
stórs release-stage kerfis. `AUTH_MVP_ENABLED` lokar `/auth-mvp/*` síðum og
`/api/auth-mvp/*` endpoints þegar flaggið er ekki virkt, og `LOANS_ENABLED`
stýrir `Lánað og skilað`. Óþekkt feature keys faila lokuð og server-side
`guardLoanAccess()` er áfram defense-in-depth á öllum lánasíðum og server
actions.

`sql/43_open_loans.sql` fjarlægði allowlist-kröfur úr loan RPC föllum án þess að
veikja service-role mörk, self-email vörn eða invitation rate limits. Codex
keyrði ekki SQL; staða byggir á útgáfu frá Claude Code/Stebba og post-release
kóða- og SQL-rýni.

Skrár:
- `lib/loans/guard.ts` — `Lánað og skilað` opið öllum innskráðum notendum þegar `LOANS_ENABLED=true`
- `sql/43_open_loans.sql` — allowlist fjarlægð úr `create_loan`, `add_loan_invitation` og `reserve_invitation_send`
- `lib/__tests__/guard.test.ts` — feature-flag og guard regression-próf
- `lib/__tests__/home-page.test.tsx` — sýnir/felur `Lánað og skilað` eftir feature-aðgangi

Staðfest:
- `npm run type-check` — exit 0
- `npm run test:run` — exit 0
- `npm run build` — exit 0, með fyrirliggjandi lint warnings sem tengjast ekki þessari opnun

---

## #5A — Mobile login baseline: iOS auto-zoom og lógó-hlekkur

**Lokið:** 2026-06-08
**Staðfest af Stebbi:** já (Vercel build gekk í gegn, localhost handprófun eftir útgáfu)

Email input á `/innskraning` notaði `text-sm` (14 px) sem veldur iOS/Safari
sjálfvirkri aðdrætti. Breytt í `text-base sm:text-sm` (16 px á mobile) í samræmi
við `Design.md:148-149`.

Neðsta lógó á `/innskraning` er nú wrapped í `Link`. Serverhlutinn (page.tsx)
sendir `logoHref="/"` til forms; óinnskráður notandi fer á `/` við smelli.
`TeskeidLoginForm` fær `logoHref` prop (default `"/"`) til að forðast
hydration-misræmi.

Skrár:
- `components/teskeid/TeskeidLoginForm.tsx` — `logoHref` prop, `text-base sm:text-sm`, `Link` um neðsta lógó
- `app/innskraning/page.tsx` — `logoHref="/"` sent til forms
- `lib/__tests__/login-form.test.tsx` — mobile font-size próf, lógó-link próf (3 próf)
- `lib/__tests__/innskraning-page.test.tsx` — `logoHref` prop próf

Staðfest:
- `npm run type-check` — exit 0
- `npm run test:run` — 28 skrár, allt grín
- Vercel build — tókst

---

## #9 — Opin innskráning og public `Lánað og skilað`

**Lokið:** 2026-06-08
**Staðfest af Codex:** já (post-release review eftir commit `c1f98ac`)

Teskeiðarinnskráning er ekki lengur bundin við `auth_mvp_allowlist`. Allir
notendur með gilt netfang geta óskað eftir kóða, staðfest hann og fengið session.
Generic auth-svör, IP rate-limit, per-email OTP rate-limit, atomic OTP verify og
log-safety eru áfram varðveitt.

`Lánað og skilað` er public fyrir alla innskráða notendur þegar bæði
`AUTH_MVP_ENABLED=true` og `LOANS_ENABLED=true`. Loan RPC föllin leyfa einnig
boðum til netfanga sem eru ekki á allowlist, en eru áfram aðeins keyranleg af
`service_role`.

Sýnilegar `/auth-mvp/*` notendaslóðir voru meðvitað geymdar til að minnka
útgáfuáhættu. Sú eftirvinna er skráð sem TODO #22.

Skrár:
- `app/api/auth-mvp/request-code/route.ts` — opin OTP beiðni með generic response og IP rate-limit
- `app/api/auth-mvp/verify-code/route.ts` — staðfesting án allowlist-checks
- `app/innskraning/page.tsx` — innskráður notandi fer á `/auth-mvp/heim`
- `components/teskeid/TeskeidLoginForm.tsx` — public beta login copy
- `messages/is.json`, `messages/en.json` — uppfærðir login/public beta textar
- `sql/43_open_loans.sql` — public loan RPC opnun

Staðfest:
- `npm run type-check` — exit 0
- `npm run test:run` — exit 0
- `npm run build` — exit 0, með fyrirliggjandi lint warnings sem tengjast ekki þessari opnun
