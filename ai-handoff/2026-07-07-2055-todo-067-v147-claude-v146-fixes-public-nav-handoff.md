# Handoff: todo-067 v147 - Claude v146 fixes + public top nav

**Date:** 2026-07-07 20:55
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Commit:** `6ae11af` á main

---

## Hvað var gert

Framkvæmt öll findings úr v146 Codex review (High #1, High #2, Medium #3, Medium #4) ásamt public top nav úr v145 handoff.

Notandi staðfesti: raða eftir **styrstum keyrslutíma** (durationS) - High finding #2 leyst með label-leiðréttingu, ekki sortbreytingu.

---

## Skrár breyttar

```
lib/weather/google.server.ts                    - stöðug route id fingerprint
messages/is.json                                - "Fljótlegasta leið", fallback keys
messages/en.json                                - "Fastest route", fallback keys
components/weather/RouteSelectionStep.tsx       - routeFallback props + UI
app/auth-mvp/vedrid/FerdalagidClient.tsx        - routeFallback state + wiring
components/teskeid/NavBar.tsx                   - public variant: hamburger fjarlægt
components/teskeid/PublicTopNav.tsx             - NYR sticky top nav
app/page.tsx                                    - PublicTopNav, BottomNav fjarlægð
app/senda-hugmynd/page.tsx                      - PublicTopNav
app/innskraning/page.tsx                        - PublicTopNav í stað floating hamburger
lib/__tests__/weather-google.test.ts            - stöðugleikafrost bætt við
lib/__tests__/innskraning-page.test.tsx         - PublicTopNav mock bætt við
```

---

## High #1 - Stöðug route id (google.server.ts)

**Vandinn:** `google-${idx}` id var index-bundið. Google gat skilað sömu leiðum í annarri röð á milli `/routes` kalls og `/travel` kalls, þannig að `google-1` í `/travel` gæti verið önnur leið en notandinn valdi.

**Leiðrétting:** Id er nú fingerprint af route-eiginleikum:

```ts
const fp = first && last
  ? `${route.distanceMeters}-${durationS}-${first[1].toFixed(4)},${first[0].toFixed(4)}-${last[1].toFixed(4)},${last[0].toFixed(4)}`
  : `${route.distanceMeters}-${durationS}-${idx}`
const id = `google-${fp}`
```

Dæmi: `google-80234-3541-64.1350,-21.8950-63.9330,-21.0000`

Þetta er stöðugt þótt Google skili leiðunum í annarri röð. `travel/route.ts` matching með `find(r => r.id === selectedRouteId)` virkar rétt þegar id er fingerprint.

**Hvenær gæti þetta enn farið úrskeiðis:** Ef Google breytir distanceMeters eða duration störlega á milli tveggja kalla (mjög sjaldgæft) eða skilar engum first/last coordinate (fallback notar index). Í þeim tilvikum skilar travel endpoint `selected_route_unavailable` og notandinn fær villa. Þetta er ásættanlegt fyrir beta.

---

## High #2 - Label leiðrétt (messages)

**Vandinn:** Raðað eftir `durationS` (keyrslutími) en fyrsta kort kallaðist "Stysta leið" (styst að fjarlægð).

**Leiðrétting:** Notandi staðfesti að hann vill raða eftir *styrstum keyrslutíma*. Sort er óbreytt (durationS asc). Label leiðrétt:

| Lykill | Var | Er nú |
|--------|-----|-------|
| `routeOptionShortest` IS | Stysta leið | Fljótlegasta leið |
| `routeOptionShortest` EN | Shortest route | Fastest route |

---

## Medium #3 - Fallback þegar leiðir bila

**Vandinn:** Ef `/routes` endpoint bilaði var notandinn hertur, með disabled confirm.

**Leiðrétting:** Nýr `routeFallback` state í `FerdalagidClient`. Villupallur sýnir nú tvo hnappa:

```
Ekki tókst að sækja leiðir. Reyndu aftur.
[Reyna aftur]  [Nota sjálfgefna leið]
```

Þegar notandi smellir á "Nota sjálfgefna leið":
- `routeFallback = true`
- Confirm hnappurinn virkjast ("Nota sjálfgefna leið")
- `handleSubmit` sendir engan `selectedRouteId`
- Travel endpoint notar `getRouteGeometry` fallback (upprunalegt hegðun)
- Notandinn fær veðurmat á sjálfgefnari Google leið

`routeFallback` hreinsar sig þegar origin eða destination breytist (eða retry klakar).

Nýir message keys:
- `routeOptionsFallback` = "Nota sjálfgefna leið"
- `routeOptionsFallbackNote` = "Leiðir fundust ekki. Nota sjálfgefna Google-leið."
- `routeConfirmFallback` = "Nota sjálfgefna leið"

---

## Medium #4 - Tests uppfærðar

**`weather-google.test.ts`:**

Gamla test `'assigns stable ids with provider prefix and index'` uppfærð til:
- Staðfestir að id inniheldur `google-` prefix
- Staðfestir að id er EKKI `google-0` eða `google-1` (ekki index-bundið)

Tvær nýjar tests:
- `'same route produces same id regardless of order in response'`: Kallar `getRouteOptions` tvisvar með sömu leiðir í öfugri röð, staðfestir að routeA fær sama id í báðum köllum
- (Gamla test um provider = 'google' heldur)

**`innskraning-page.test.tsx`:**
- Mock bætt við fyrir `@/components/teskeid/PublicTopNav` (nauðsynlegt þar sem `usePathname` er í nav-mock)

---

## Public top nav (v145 addendum)

### Nýr component: `components/teskeid/PublicTopNav.tsx`

Client component. Sticky að ofan. Þrír hlutir: Hugmyndir (`/`), Ný hugmynd (`/senda-hugmynd`), Innskráning (`/innskraning`). Active state með grænni bakgrunn (`#2d5a27`).

Hönnunarreglar:
- `sticky top-0 z-50` - klístrar að efri brún, er fyrir ofan allt
- `min-h-[44px] min-w-[72px]` - touch targets
- `aria-current="page"` á virka hlut
- `aria-label="Aðalleiðsögn"` á nav element
- Engin horizontal overflow, engin mobile zoom risk

### NavBar.tsx

Hamburger (`TeskeidMenu`) sýnt **aðeins** þegar `variant === 'authenticated'`. Public variant: tómt svæði til hægri.

```tsx
{variant === 'authenticated' && <TeskeidMenu variant="authenticated" />}
```

### app/page.tsx

- Import: `BottomNav` fjarlægt, `PublicTopNav` bætt við
- `PublicTopNav` sýnt þegar `!user` (óinnskráður)
- `pb-32` fjarlægt af `<main>` (var padding fyrir BottomNav sem er nú horfin)
- `<BottomNav />` fjarlægt

### app/senda-hugmynd/page.tsx

- `PublicTopNav` bætt við sem fyrsti hluti þegar `!user`

### app/innskraning/page.tsx

- `TeskeidMenu` import fjarlægt
- Floating hamburger div (fixed top-right) fjarlægt
- `<PublicTopNav />` bætt við í stað þess

---

## Test niðurstöður

```
npm run type-check  -> exit 0
npm run test:run    -> 1793 passed / 27 skipped / 8 todo (55 files)
git diff --check    -> exit 0 (LF warning á is.json, óskaðlegt)
```

Fyrri baseline: 1792. +1 ný test (stöðugleikafrost).

---

## Localhost checks fyrir Stebbi

### Route alternatives

1. Opna `/auth-mvp/vedrid` innskráður með `vedrid` aðgang.
2. Velja `Reykjavík → Selfoss`.
3. Staðfesta að fyrsta leið sé merkt **"Fljótlegasta leið"** (ekki "Stysta leið").
4. Ganga úr skugga um að keyrslutími (mín.) ráði röðun - fljótlegasta efst.
5. Velja aðra leið → blá lína á korti breytist, map hreyfist ekki.
6. Halda áfram í eftirvagn → þröskuldar → niðurstaða.
7. Staðfesta að niðurstaðan passi við valda leið.

### Fallback

1. Til að prófa fallback: slökktu tímabundið á `WEATHER_MAP_PROVIDER` env (aðeins á localhost).
2. Veldu origin og destination.
3. Búist við: "Ekki tókst að sækja leiðir. Reyndu aftur." með tveimur hnappar.
4. Smelltu á "Nota sjálfgefna leið".
5. Búist við: "Leiðir fundust ekki. Nota sjálfgefna Google-leið." og "Nota sjálfgefna leið" confirm hnappurinn virkur.
6. Kláraðu ferðina. Búist við: veðurniðurstaða (með sjálfgefnari leið).
7. Kveiktu aftur á `WEATHER_MAP_PROVIDER`.

### Public top nav

1. Opna `/` í incognito glugga (óinnskráður).
2. Staðfesta: sticky top nav sést með þremur hlutar (Hugmyndir, Ný hugmynd, Innskráning).
3. Staðfesta: engin hamburger menu.
4. Smella á "Ný hugmynd" → fara á `/senda-hugmynd`. Active state breytist.
5. Smella á "Innskráning" → fara á `/innskraning`. Active state breytist.
6. Staðfesta: nav er sticky þegar scrollað (sér sér á langan content eins og hugmynda-lista).
7. Prófa á 360px, 390px, 460px. Engin horizontal overflow, engin zoom.

### Afturvirk samhæfni

1. Skrá sig inn. Staðfesta að hamburger menu birtist enn í `/auth-mvp/heim` og öðrum authenticated síðum.
2. Staðfesta að `NavBar` á `/senda-hugmynd` sýnir hamburger ef innskráður (authenticated variant).
3. Staðfesta að `Lánað og skilað` virkar enn.

---

## Hvað Codex má fara yfir

1. **Fallback UX**: Er "Nota sjálfgefna leið" label nógu skýr? Þarf kannski "Nota Google sjálfgefna leið án leiðavals" eða svipað.
2. **PublicTopNav á auth-mvp/innskraning**: `/auth-mvp/innskraning` er sérstök innskráningarsíða með öðru útliti. Ætti hún að fá PublicTopNav einnig? Eða er `/innskraning` nóg?
3. **BottomNav**: Er eftir í NavBar.tsx (exported en ekki notað). Má það vera eða á það að fara?

---

## Næstu fasar

| Phase C | Vestmannaeyjar/Herjólfur ferry detection (coordinate-based) |
| Phase D | Saved places (SQL migration + RLS) |
| Phase E | Login UI clarity (auto-submit, no magic link) |

---

## Hvað Claude Code gerði EKKI

Engin SQL. Engar migrations. Ekkert commit áður en allt passaði. Ekkert production key, Supabase policy, Vercel env, eða billing.
