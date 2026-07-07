# Handoff: todo-067 v141 - Claude v140 auth redirect fix

**Date:** 2026-07-07 19:50
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Branch:** main (uncommitted)

---

## Hvað var gert

Framkvæmt v140 High/Medium findings: middleware API redirect fix og FerdalagidClient fetch hardening.

---

### 1. Middleware: API routes fá 401 JSON í stað 307 redirect

**Skrá:** `middleware.ts`

Catch-all unauthed redirect (línur 168-172) var uppfærð:

```ts
// Fyrir:
if (!user && !isPublic && !isAuthCallback) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

// Eftir:
if (!user && !isPublic && !isAuthCallback) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
```

Þetta þýðir:
- `/api/teskeid/weather/travel` (unauthed) → 401 JSON, ekki 307
- `/api/place/search` (unauthed) → 401 JSON, ekki 307
- `/home` (unauthed) → áfram 307 → `/login` (óbreytt)
- `/auth-mvp/heim` (unauthed) → áfram 307 → `/innskraning` (óbreytt)

---

### 2. FerdalagidClient: fetch hardening

**Skrá:** `app/auth-mvp/vedrid/FerdalagidClient.tsx`

Bætt við `credentials: 'same-origin'` og content-type/status check áður en `res.json()` er kallað:

```ts
const res = await fetch('/api/teskeid/weather/travel', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
})

// Guard: 401 eða non-JSON (middleware intercept, CDN error page, redirect)
const contentType = res.headers.get('content-type') ?? ''
if (res.status === 401 || !contentType.includes('application/json')) {
  setError(tf('errorAuthExpired'))
  return
}

const data = await res.json()
```

Þetta verndar gegn:
- Middleware 401 JSON (eftir lagfæringu 1)
- Gamla redirect-hegðun (ef eitthvað annað redirect-ar)
- CDN HTML error pages
- Óvæntar server responses

---

### 3. Messages: errorAuthExpired

Bætt við í `ferdalagid` hluta:

**IS** (`messages/is.json`):
```json
"errorAuthExpired": "Innskráningin rann út. Skráðu þig inn aftur og prófaðu svo ferðina."
```

**EN** (`messages/en.json`):
```json
"errorAuthExpired": "Your session expired. Sign in again and try the trip."
```

---

### 4. Tests

**`lib/__tests__/middleware.test.ts`** - 2 nýjar tests:
- Unauthenticated `/api/teskeid/weather/travel` → 401 JSON
- Unauthenticated `/api/place/search` → 401 JSON

**`lib/__tests__/legacy-guard.test.ts`** - 1 test uppfærð:
- `/api/sessions` (exact, unauthed): var 307 → /login, nú 401 JSON (réttara)

---

## Test niðurstöður

```
npm run type-check  -> exit 0
npm run test:run    -> 1772 passed / 27 skipped / 8 todo (54 files)
```

Fyrri baseline: 1770. +2 nýjar tests.

---

## Skrár breyttar

```
middleware.ts                                   - API routes fá 401 JSON í stað UI redirect
app/auth-mvp/vedrid/FerdalagidClient.tsx        - credentials + content-type guard áður en res.json()
messages/is.json                                - errorAuthExpired bætt við
messages/en.json                                - errorAuthExpired bætt við
lib/__tests__/middleware.test.ts                - 2 nýjar API 401 tests
lib/__tests__/legacy-guard.test.ts              - /api/sessions test uppfærð til 401
```

---

## Localhost checks fyrir Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi með `vedrid` access
2. Velja leið (`Reykjavík → Selfoss`) og reikna
3. Expected: `/api/teskeid/weather/travel` skilar `200 JSON` í DevTools Network - ekkert `307`
4. Expected: Veðurniðurstaða birtist, ekki `Eitthvað fór úrskeiðis`
5. Prófa í Private/Incognito glugga (ekkert session):
   - `/api/teskeid/weather/travel` á að skila `401 JSON`
   - UI á að sýna "Innskráningin rann út. Skráðu þig inn aftur og prófaðu svo ferðina."
   - EKKI `Eitthvað fór úrskeiðis`
6. Staðfesta að óinnskráður notandi á `/auth-mvp/heim` fær áfram redirect á `/innskraning`
7. Staðfesta að place search virkar enn (leit, ekkert Google - server fallback)

---

## Athugasemd: PlaceSearch

`PlaceSearch.tsx:searchViaServer` notar `try/catch` og `if (!res.ok) return { ok: false }`. Þetta meðhöndlar 401 JSON rétt (skilar `ok: false`) og sýnir `errorAllProviders`. Þetta er ásættanlegt - ekki jafn skýrt og `errorAuthExpired` en ekki heldur rautt svo sem veðurniðurstaðan er.

Ef Codex telur þetta þurfa uppfærslu má bæta sama 401-check við `searchViaServer` í næstu lotu.

---

## Næstu fasar (óbreyttar)

| v142 | Phase B: Route alternatives (computeAlternativeRoutes, text-first picker) |
| v143 | Phase C: Vestmannaeyjar/Herjólfur |
| v144 | Phase D: Saved places |
| v145 | Phase E: Login UI clarity |
