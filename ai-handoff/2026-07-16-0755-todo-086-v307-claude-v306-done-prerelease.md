# 2026-07-16 07:55 - TODO-086 v307 - Claude: v306 done, prerelease

Created: 2026-07-16 07:55
Timezone: Atlantic/Reykjavik

Commit: ekki enn — Stebbi prófar localhost fyrst.

## Breytingar

### 1. `lib/auth/loginNext.ts` (ný skrá)

`resolveSafeLoginNext(next)` — validates `?next` redirect parameter.

- Leyfir: `/auth-mvp/...`, `/vedrid...`
- Hafnar: external URLs (`http://`, `https://`, `//`), relative paths, óþekktar internal paths
- Never throws, returns null for invalid input

### 2. `app/innskraning/page.tsx`

- Tekur `searchParams: Promise<{ next?: string }>` sem prop
- Les og staðfestir `?next` með `resolveSafeLoginNext`
- Ef innskráður: redirect til `safeNext` eða `/auth-mvp/heim`
- Sendir `nextHref={safeNext}` til `TeskeidLoginForm`

### 3. `components/teskeid/TeskeidLoginForm.tsx`

- Bætti við `nextHref?: string` prop
- Eftir OTP verify + profile complete: `router.push(nextHref ?? '/auth-mvp/heim')`
- Profile incomplete: fer enn í `/auth-mvp/minn-profill` (next er ekki varðveitt í gegnum profile-skil — acceptable for now)

### 4. `messages/is.json` + `messages/en.json`

Nýr lykill í `teskeid.vedrid.eltaVedrid`:
- IS: `"pulseLoginCta": "Sjá fleiri skilaboð eða segja frá aðstæðum"`
- EN: `"pulseLoginCta": "See more messages or report conditions"`

### 5. `components/weather/VedurstofanPulseInline.tsx`

- Reiknar `loginNextHref` = full pulse URL (með returnTo ef til staðar)
- Reiknar `loginHref` = `/innskraning?next=${encodeURIComponent(loginNextHref)}`
- `needs-login` link notar nú `loginHref` og `t('pulseLoginCta')` í stað `/innskraning` og `pulseNeedsLogin`

### 6. `components/weather/VedurstofanPointCard.tsx`

- Bætti við `returnTo?: string` prop
- Sendir `returnTo={returnTo}` til `VedurstofanPulseInline`

### 7. `app/auth-mvp/vedrid/FerdalagidClient.tsx`

**sessionStorage restore (mount effect):**
- Athugar `window.location.search` á mount (forðast Suspense requirement af `useSearchParams`)
- Ef `?restore=1`: les `sessionStorage.getItem(ROUTE_RESTORE_KEY)`, endurheimt state (origin, destination, trailerKind, thresholdOverrides, selectedRouteId, result, vedurstofanLayer, showVedurstofan, showMetno, selectedHeatmapIdx, step='result')
- Hreinsar sessionStorage og fjarlægir `restore` param úr URL með `history.replaceState`

**sessionStorage save (effect):**
- Þegar `step === 'result'` og `result !== null`: skrifar öll result-state í sessionStorage undir `ROUTE_RESTORE_KEY`
- Uppfærist sjálfkrafa þegar notandi breytir fílter-stöðu o.fl.

**`vedurstofanReturnTo`:**
- `= (step === 'result' && result) ? '/auth-mvp/vedrid?restore=1' : undefined`
- Sent til `VedurstofanPointCard` sem `returnTo`

### 8. Tests

- **Ný skrá:** `lib/__tests__/loginNext.test.ts` — 17 tests fyrir `resolveSafeLoginNext`
- **Uppfærð:** `lib/__tests__/innskraning-page.test.tsx` — allar `InnskraningPage()` kallars uppfærð með `searchParams: Promise.resolve({})`, 4 ný tests (safe next, unsafe next, already-authenticated redirect)

**145 tests passing. Type-check clean.**

---

## Localhost checks fyrir Stebbi

Env:
```env
WEATHER_ENABLED=All
WEATHER_AUTH_ACCESS_REQUIRED=true
TESKEID_CHAT_ENABLED=true
```
(WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED og WEATHER_PULSE_ACCESS_REQUIRED fjarverandi)

1. `/vedrid` óinnskráður — reikna leið með Veðurstofan sýnilegan
2. Á Veðurstofan spjaldi: CTA á að segja **"Sjá fleiri skilaboð eða segja frá aðstæðum"** (ekki "Skráðu þig inn...")
3. Smella á CTA — ætti að opna `/innskraning?next=/auth-mvp/vedrid/puls/stod/...`
4. Klára login (með notanda sem hefur complete profile)
5. Ætti að landa á full pulse URL fyrir sömu stöðvina
6. Smella "Til baka" — ætti að opna `/auth-mvp/vedrid?restore=1` og sýna sömu leiðarniðurstöður (origin, destination, Veðurstofan spjöld osfrv.)
7. Fara á `/innskraning?next=https://evil.example` sem innskráður — ætti að redirecta á `/auth-mvp/heim`, ekki evil
8. Fara á `/innskraning?next=/auth-mvp/vedrid` sem innskráður — ætti að redirecta á `/auth-mvp/vedrid`

---

## Óvissa

- Ég sá ekki alla `FerdalagidClient.tsx` — þar eru margar effects. Restore-effect er `[]` dep-array (mount only) og notar `window.location.search` í stað `useSearchParams`. Þetta ætti að vera safe en Stebbi þarf að prófa.
- First-time users (incomplete profile) fara í `/auth-mvp/minn-profill` og `nextHref` er ekki varðveitt þangað. Þeir lenda á `/auth-mvp/heim` eftir profile-skil. Þetta er þekkt takmörkun.
- Ekkert commit eða push gert — Stebbi prófar fyrst.

## Pending eftir localhost-staðfestingu

- Commit og push þegar Stebbi gefur leyfi
- Low (v290): unit tests fyrir `/access` endpoint
- "Sjá fleiri skilaboð" á travel route cards þegar route state er URL-backed (partially addressed — returnTo er nú til staðar)
- Phase 4B.2: station/weather context á full pulse route
