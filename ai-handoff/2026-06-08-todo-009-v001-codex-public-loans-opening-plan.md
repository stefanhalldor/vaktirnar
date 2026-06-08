# TODO #9 - V001 Codex plan: open login and public loans

Dagsetning: 2026-06-08
Tengt TODO: #9 - Opin innskráning og public `Lánað og skilað`
Tengd atriði: #16, #4
Höfundur: Codex
Fyrir: Claude Code

## Niðurstaða Codex

Já, Stebbi getur tekið #16, #4 og #9 saman hratt og örugglega ef scope-ið er
skorið niður í eina opnunarsneið:

- App-level væntingastýring úr #16.
- Minimal opnunarstýring úr #4, ekki fullbúið release-stage kerfi.
- Opin innskráning og public `Lánað og skilað` úr #9.

Ekki byggja DB-stýrt `off`/`beta`/`public` kerfi núna. Engin önnur Teskeið er
raunverulega í vinnslu og `Lánað og skilað` á að vera public fyrir alla
innskráða notendur.

## Scope

In scope:

- Öll gild netföng geta beðið um login-kóða.
- Öll gild netföng geta staðfest kóða og fengið session.
- Allir innskráðir notendur geta séð `/auth-mvp/heim`.
- Allir innskráðir notendur geta séð `/auth-mvp/minn-profill`.
- Allir innskráðir notendur geta notað `Lánað og skilað` þegar
  `LOANS_ENABLED === 'true'`.
- `AUTH_MVP_ENABLED` og `LOANS_ENABLED` halda áfram að vera server-side kill
  switches.
- Óþekktir eða framtíðar feature keys skulu áfram fail-closed.
- Stuttur mobile-first væntingastýringartexti fer í messages og UI.

Out of scope for this fast/safe slice:

- Fullt DB-stýrt release-stage kerfi.
- Beta allowlist fyrir future features.
- Admin whitelist UI.
- Stór route rename frá `/auth-mvp/*` yfir í `/heim`, `/minn-profill` og
  `/lanad-og-skilad`, nema Claude Code sýni að það sé pínulítið og áhættulítið.
- CAPTCHA nema mælingar eftir opnun sýni misnotkun eða kostnaðarvandamál.

## Code areas to inspect/change

Known current allowlist gates:

- `app/api/auth-mvp/request-code/route.ts`
  - Núna: non-allowlisted email fer í `login_waitlist`, enginn kóði sendur.
  - Breyta: valid email fær kóða óháð allowlist, með sömu generic response.
  - Fjarlægja venjulegan waitlist insert úr login-flæði nema Stebbi ákveði annað.

- `app/api/auth-mvp/verify-code/route.ts`
  - Núna: non-allowlisted email fær `invalid_code` áður en kóði er staðfestur.
  - Breyta: verify-a kóða óháð allowlist; búa til session ef kóði er réttur.

- `app/innskraning/page.tsx`
  - Núna: innskráður notandi redirectast aðeins á `/auth-mvp/heim` ef hann er
    allowlisted.
  - Breyta: innskráður notandi með session fer á `/auth-mvp/heim` þegar
    `AUTH_MVP_ENABLED === 'true'`, án allowlist-athugunar.

- `lib/loans/guard.ts`
  - Núna: `checkFeatureAccess('lanad-og-skilad')` krefst `LOANS_ENABLED` og
    allowlist.
  - Breyta: `lanad-og-skilad` skilar true þegar `LOANS_ENABLED === 'true'`;
    session-vörnin kemur frá `guardTeskeidSession()` / `guardLoanAccess()`.
  - Óþekktir feature keys halda áfram að skila false.
  - `guardLoanAccess()` heldur áfram að verja allar loan pages/actions
    server-side.

- `app/auth-mvp/heim/page.tsx`
  - Líklega þarf lítið eða ekkert að breyta ef `checkFeatureAccess()` verður
    public fyrir loans.

- `messages/is.json` og `messages/en.json`
  - Bæta við stuttum #16 texta á réttum stað.

## Safety requirements

- Ekki veikja RLS eða grants.
- Ekki breyta SQL nema Claude Code finni skýra ástæðu og skili sérstöku plani.
- Ekki logga netföng, kóða, tokens eða allowlist/waitlist stöðu.
- Halda API-svörum generic:
  - request-code svarar áfram `{ success: true }`.
  - verify-code svarar áfram generic `invalid_code` fyrir rangt/útrunnið/óvirkt.
- Halda IP-rate-limit og per-email OTP rate-limit.
- Loan RPC calls mega aðeins nota actor id úr staðfestri server-side session.
- `LOANS_ENABLED=false` verður að loka direct routes og server actions, ekki bara
  fela link á heimaskjá.

## Recommended implementation order

1. Uppfæra tests fyrst eða samhliða:
   - request-code: outside old allowlist creates code/sends email.
   - verify-code: outside old allowlist with valid code creates session.
   - innskraning page: logged-in outside old allowlist redirects to heim.
   - checkFeatureAccess: loans true when `LOANS_ENABLED=true`, unknown false.
   - guardLoanAccess: outside old allowlist allowed when session + loans enabled.
   - kill switches: `AUTH_MVP_ENABLED=false` and `LOANS_ENABLED=false`.

2. Fjarlægja allowlist checks úr auth login endpoints and login page redirect.

3. Breyta `lib/loans/guard.ts` í minimal public-loans logic.

4. Bæta #16 texta í messages og UI með litlu, rólegu framsetningarvali.

5. Keyra:
   - `npm run type-check`
   - `npm run test:run`
   - `npm run build`

## Manual checks for Stebbi

- Netfang utan gamla allowlist getur fengið kóða.
- Sama netfang getur staðfest kóða og séð `/auth-mvp/heim`.
- Sama netfang sér og opnar `Lánað og skilað`.
- Tóm loan-upplifun brotnar ekki fyrir nýjan notanda.
- Útskráður notandi kemst ekki beint á heim/profile/loans.
- Bottom-bar `Innskráning` opnar login á fyrsta tap ef #20 er snert óvart; annars
  skrá að #20 sé áfram sér atriði.

## Codex recommendation

Claude Code má framkvæma þetta sem einn lítinn áfanga, en Codex mælir með að
route cleanup úr #9 verði ekki tekin með í sama áfanga nema breytingin reynist
mjög lítil. Opnun auth + public loans er nóg fyrir þessa umferð.
