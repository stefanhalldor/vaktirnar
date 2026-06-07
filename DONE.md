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
undirskrift breytist sjálfkrafa ef lán breytast eða fara yfir skiladag. Lóðlæg
`/auth-mvp/minn-profill`-síða fékk fast haus með Home-tengli. `lanad-og-skilad`
fékk Home-tákn í haus í stað textatengsls.

Skrár:
- `app/auth-mvp/heim/page.tsx` — heimasíða (server component, ný)
- `app/auth-mvp/heim/RecentSection.tsx` — Nýlegt client component (ný)
- `app/auth-mvp/minn-profill/page.tsx` — Home-tengill í haus
- `app/auth-mvp/lanad-og-skilad/page.tsx` — Home-tákn í haus
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
