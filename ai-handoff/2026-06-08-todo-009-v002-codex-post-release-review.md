# TODO #9 - Codex post-release review eftir public opnun

Dagsetning: 2026-06-08
Agent: Codex
Tengd TODO atriði: #9, #4, #16, #22
Commit rýnt: `c1f98ac feat: opna Teskeið public beta`

## Findings

### Engin P0/P1 blocker fundust

Codex fann ekki útgáfustoppandi auth/RLS/Supabase vanda í public-opnuninni.
`Lánað og skilað` er enn varið með session og `LOANS_ENABLED`, loan RPC grants
eru áfram `service_role`-only, og SQL 43 fjarlægir allowlist-kröfur án þess að
fjarlægja self-email vörn eða invitation rate limits.

### P3 - `/innskraning` er ekki hard-hidden þegar `AUTH_MVP_ENABLED=false`

Skrár:
- `middleware.ts:34-39`
- `app/innskraning/page.tsx:10-22`
- `lib/__tests__/innskraning-page.test.tsx:91`

Middleware lokar `/auth-mvp/*` og `/api/auth-mvp/*` þegar
`AUTH_MVP_ENABLED !== 'true'`, en canonical `/innskraning` síða renderar áfram
formið þegar flaggið er slökkt. API-endpoints ættu þá að skila 404, þannig að
þetta lítur ekki út eins og gagnaleki eða session-bypass, en flag-off UX er ekki
alveg hreint.

Mat Codex: ekki release-blocker þar sem public beta krefst
`AUTH_MVP_ENABLED=true`, en gott low-hanging follow-up ef Stebbi vill að flaggið
feli allt login-flæðið fullkomlega.

### P3 - Stale allowlist orðalag er eftir í comments/tests

Skrár:
- `app/auth-mvp/lanad-og-skilad/layout.tsx:3-4`
- `lib/auth/ip-rate-limit.ts:31-33`
- `lib/__tests__/loans.test.ts:338-339`
- `lib/__tests__/middleware.test.ts:202`

Þetta virðist ekki vera hegðunarvilla, heldur texti sem talar enn eins og
allowlist sé primary gate fyrir public login/loans. Eftir SQL 43 er það rangt.

Mat Codex: low-risk cleanup. Best að laga þegar næsta litla cleanup er tekið,
svo framtíðarrýni og tests lesist ekki eins og allowlist sé enn launch gate.

## Hvað var staðfest

- `sql/43_open_loans.sql` fjarlægir `auth_mvp_allowlist` checks úr:
  - `create_loan`
  - `add_loan_invitation`
  - `reserve_invitation_send`
- `sql/43_open_loans.sql` heldur `REVOKE EXECUTE ... FROM PUBLIC, anon,
  authenticated` og `GRANT EXECUTE ... TO service_role`.
- `lib/loans/guard.ts` opnar `lanad-og-skilad` fyrir alla innskráða notendur
  þegar `LOANS_ENABLED=true`; óþekkt feature keys faila lokuð.
- `/auth-mvp/heim` sækir loan gögn aðeins þegar `checkFeatureAccess(...,
  'lanad-og-skilad')` skilar true.
- OTP request heldur generic response, IP rate-limit og safe logging.
- OTP verify heldur generic `invalid_code` fyrir ógilt/útrunnið/rangt code og
  notar áfram server-side session creation.

## Skipanir sem Codex staðfesti

Codex keyrði ekki SQL, commit-aði ekki, push-aði ekki og deployaði ekki.

Staðfestar local skipanir:

```text
npm run type-check -> exit 0
npm run test:run  -> exit 0
npm run build     -> exit 0
```

Build sýndi aðeins fyrirliggjandi lint warnings sem tengjast ekki public-opnun:
- `app/s/[sessionId]/page.tsx` vantar dependency í tveimur `useEffect` köllum.
- `components/landing/Avatar.tsx` notar `<img>`.

## TODO/DONE staða

Codex færði í `DONE.md`:
- #4 - Minimal opnunarstýring fyrir fyrstu public Teskeið
- #9 - Opin innskráning og public `Lánað og skilað`

Codex lét eftir í `TODO.md`:
- #16 - enn vantar skýra mobile-first/minimal væntingastýringu, þótt open beta
  login copy sé komin.
- #22 - hreinsa sýnilegar `/auth-mvp/*` notendaslóðir í sér, síðar og með
  redirect/query-param prófum.

## Næsta tillaga Codex

Taka fyrst öruggu low-hanging cleanup atriðin:

1. Laga stale allowlist comments/test copy.
2. Ákveða hvort `/innskraning` eigi að redirecta á `/` þegar
   `AUTH_MVP_ENABLED=false`; ef já, bæta litlu regression-prófi.
3. Taka #16 sem copy/UI atriði áður en stærri routing cleanup #22 hefst.

Codex myndi geyma stóru `/auth-mvp/` canonical route breytinguna (#22) þar til
opnunin hefur verið handprófuð, því sú breyting snertir redirects, email links,
claim links, client router pushes og middleware.
