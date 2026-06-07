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

## #11 — „Nýlegt" fyrir ofan „Teskeiðar" á `/heim`

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (localhost-prófun)

Á `/auth-mvp/heim` birtist „Nýlegt"-hlutinn fyrir ofan „Teskeiðar"-hlutann.
Röðin er: kveðja, „Nýlegt", „Teskeiðar", lógó. Gögn, cookie/read-state,
textar og virkni sectionanna eru óbreytt. DOM-próf staðfestir röðina.

Skrár:
- `app/auth-mvp/heim/page.tsx` — Nýlegt-section á undan Teskeiðar-section
- `lib/__tests__/home-page.test.tsx` — DOM-order próf: „Nýlegt" á undan „Teskeiðar"
