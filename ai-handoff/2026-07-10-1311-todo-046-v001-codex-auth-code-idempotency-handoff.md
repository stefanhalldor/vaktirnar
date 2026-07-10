# Codex handoff: TODO #46 v001 - gera innskráningarkóða idempotent og mæla tafir

Created: 2026-07-10 13:11
Timezone: Atlantic/Reykjavik
Tengist: TODO #46 `User+pass fallback þegar kóði berst ekki` og auth reliability pakka.

## Samhengi

Stebbi prófaði innskráningu í raun og fékk kóða eftir um 40 sekúndur. Þegar hann sló kóðann inn fékk hann `Rangur eða útrunninn kóði`.

Read-only SQL á `public.auth_email_codes` sýndi margar kóðaraðir fyrir sama netfang á stuttum tíma:

```text
created_at                  expires_at                  used_at                    attempts
2026-07-10 13:07:45.80285   2026-07-10 13:17:45.545     2026-07-10 13:09:06.41652  4
2026-07-10 13:05:59.794074  2026-07-10 13:15:59.731     NULL                       1
2026-07-10 13:04:28.522837  2026-07-10 13:14:28.436     NULL                       0
2026-07-10 13:03:19.053331  2026-07-10 13:13:18.788     NULL                       0
```

Þetta bendir sterkt til þess að fleiri en einn `request-code` hafi keyrst áður en notandi fékk eða sló inn réttan kóða. Núverandi verify-RPC velur alltaf nýjasta kóðann fyrir netfangið:

- `sql/38_atomic_otp_verification.sql`: `ORDER BY created_at DESC, id DESC LIMIT 1`
- Þetta er rétt öryggislega: eldri kóðar eiga ekki að verða gildir aftur.
- En UX vandinn er að sein email geta komið í rangri röð. Þá getur notandinn slegið inn kóða sem var réttur þegar hann var búinn til, en er orðinn ógildur vegna nýrri kóða.

## Rót vandans

Núverandi `/api/auth-mvp/request-code` er ekki idempotent:

- Client bíður á `fetch('/api/auth-mvp/request-code')` áður en hann fer í code-step:
  - `components/teskeid/TeskeidLoginForm.tsx:46-80`
- Server route býr til nýjan kóða og bíður eftir email sendingu áður en hann svarar:
  - `app/api/auth-mvp/request-code/route.ts:20-49`
- `createUserCode()` gerir nokkur raðtengd DB skref:
  - cleanup delete
  - rate-limit select
  - insert nýs kóða
  - `lib/auth/user-codes.ts:19-58`
- Ef Messenger/in-app browser, refresh, tvísmellur, network retry eða resend veldur mörgum requestum, þá býr hver request til nýjan kóða og eldri email verða ónothæf.

## Markmið

1. Ekki ógilda kóða sem er þegar á leiðinni til notanda vegna duplicate/retry requesta.
2. Mæla nákvæmlega hvar tafir verða án þess að logga netföng, plaintext kóða eða secrets.
3. Halda öryggisreglunni að aðeins nýjasti kóðinn sé gildur, en koma í veg fyrir að margir nýir kóðar verði til innan stutts glugga.
4. Ekki geyma plaintext OTP í DB.
5. Ekki veikja RLS, auth, service-role mörk eða verification atomicity.

## Tillaga að lausn

### Phase 1 - instrumenta tafir

Bæta við structured timing logs í `app/api/auth-mvp/request-code/route.ts`.

Logga má:

- `requestId` eða stutt random id, ekki netfang
- `ipRateLimitMs`
- `createCodeMs`
- `sendEmailMs`
- `totalMs`
- hvort niðurstaða var:
  - `created_and_sent`
  - `recent_active_suppressed`
  - `rate_limited`
  - `db_error`
  - `email_error`

Ekki logga:

- netfang
- plaintext kóða
- `code_hash`
- IP eða raw request headers
- Resend API key
- Supabase service key

Þetta þarf að hjálpa Stebba að sjá hvort 40 sek. tafan er:

- Supabase RPC/DB
- Resend/API/email sending
- Vercel cold start/dynamic import
- client/browser retry hegðun

### Phase 2 - server-side idempotency fyrir request-code

Útfæra server-side vörn þannig að ef ónotaður, óútrunninn kóði var búinn til mjög nýlega fyrir sama netfang, þá verði **ekki** búinn til nýr kóði.

Mælt er með 90-120 sekúndna dedupe glugga í fyrstu útgáfu. Ástæða:

- Stebbi sá 40 sek. email tafir.
- Núverandi resend countdown er 60 sek.
- Ef glugginn er aðeins 30-60 sek. gæti notandi enn ógilt fyrsta emailið áður en það kemur.

Hegðun:

- Fyrsti request innan glugga:
  - býr til nýjan kóða
  - sendir email
  - skilar success
- Annar/þriðji request innan glugga:
  - býr **ekki** til nýjan kóða
  - sendir **ekki** nýtt email, þar sem plaintext eldri kóða er ekki geymdur
  - skilar success til client til að leka ekki hvort kóði/email sé til
  - loggar `recent_active_suppressed`

Athugið: Ekki reyna að "endursenda sama kóða" nema hönnunin breytist til að geyma plaintext eða endurheimtanlegan kóða. Það er ekki mælt með í þessum áfanga.

### Phase 3 - gera þetta atomic í DB

Ekki treysta eingöngu á TS `select` síðan `insert`, því tveir requestar geta keyrt samtímis og báðir séð "engan nýlegan kóða".

Öruggari leið:

1. Búa til nýja migration, líklega `sql/72_auth_email_code_request_idempotency.sql`.
2. Búa til service-role-only RPC, t.d.:

```sql
public.create_user_otp_code_if_allowed(
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_dedupe_seconds int,
  p_max_per_hour int
)
```

RPC gerir í einni transaction:

- normaliserar email
- tekur per-email advisory transaction lock, t.d. út frá hash af normaliseruðu emaili
- athugar hvort nýlegur active unused kóði sé til:
  - `used_at IS NULL`
  - `expires_at > now()`
  - `created_at >= now() - make_interval(secs => p_dedupe_seconds)`
- ef til:
  - skilar status `recent_active`
  - insertar ekki nýjum kóða
- annars:
  - athugar per-email hourly rate limit
  - insertar nýjum `auth_email_codes` row með `p_code_hash`
  - skilar status `inserted`
- ef rate-limited:
  - skilar status `rate_limited` og `retry_after`

RPC má ekki skila `code_hash`, plaintext code eða email til client.

TypeScript `createUserCode()` verður þá:

- generate-a plaintext code í app layer
- hash-a kóðann með `AUTH_CODE_SECRET`
- kalla RPC með hash
- ef `inserted`: skila plaintext code til route svo hægt sé að senda email
- ef `recent_active`: skila sérstökum result sem þýðir "ekki senda nýtt email, ekki búa til nýjan kóða"
- ef `rate_limited`: skila rate-limit result
- ef villa: skila null / error eins og nú

### Phase 4 - client UX

Í `components/teskeid/TeskeidLoginForm.tsx`:

- Halda núverandi `loading` disabled state.
- Bæta við `useRef` in-flight guard svo sami tab geti ekki sent tvo requesta áður en React state nær að disable-a hnappinn.
- Ef request tekur lengur en t.d. 8 sek. má sýna rólegan texta:
  - `Kóðinn getur tekið smá stund að berast. Ekki biðja um nýjan kóða strax.`
- Endurskoða `RESEND_COOLDOWN`:
  - ef server dedupe gluggi er 120 sek., þá ætti client ekki að bjóða `Senda aftur` eftir 60 sek. án útskýringar.
  - Setja annaðhvort countdown í 120 sek. eða sýna texta sem útskýrir að fyrri kóði sé enn á leiðinni.

## Mikilvæg öryggisatriði

- Ekki geyma plaintext OTP í DB.
- Ekki logga plaintext OTP.
- Ekki logga netfang í server logs. Ef þarf correlation, nota HMAC/fingerprint sem er ekki reversable án secrets, eða sleppa alveg.
- Ekki breyta verify-RPC þannig að eldri kóðar verði gildir aftur. Vandinn á að leysast með því að koma í veg fyrir óþarfa nýja kóða, ekki með því að leyfa eldri kóða.
- Ekki veikja `attempts >= 5`, `used_at`, `expires_at`, row lock eða `ORDER BY created_at DESC, id DESC`.
- RPC og töflur eiga áfram að vera service-role-only.
- Ekki opna `auth_email_codes` fyrir `anon` eða `authenticated`.

## Edge cases sem þarf að hanna fyrir

1. **Tveir requestar samtímis**
   - Aðeins einn má insert-a nýjan kóða.
   - Hinn á að fá `recent_active`.

2. **Email sending hæg en tekst**
   - Duplicate request má ekki búa til nýjan kóða á meðan fyrri email er á leiðinni.

3. **Email sending failar eftir að kóði var insert-aður**
   - Route má skila generic error fyrir fyrsta request.
   - Ef notandi reynir aftur innan dedupe glugga þarf ákvörðun:
     - annaðhvort bíða út gluggann,
     - eða nota email-send-status í DB í stærri útgáfu.
   - Fyrir fyrsta áfanga er ásættanlegt að þetta sé sjaldgæfur tradeoff, en það þarf að vera nefnt í handoff.

4. **Notandi fær mörg gömul email**
   - Eftir fix ætti þetta að gerast mun sjaldnar.
   - Ef notandi slær inn gamlan kóða á verify áfram að hafna honum.

5. **Messenger/in-app browser**
   - Gera ráð fyrir retry/double submit/app switching.
   - Client-side guard hjálpar en server-side idempotency er aðalvörnin.

6. **Rate limit**
   - Ný idempotency má ekki leyfa unlimited requesta til að fara í kringum rate limit.
   - Duplicate suppressed requestar mega annaðhvort telja ekki sem nýr kóði, en mega samt loggast í metrics síðar.

## Mælt implementation plan fyrir Claude Code

1. Lesa:
   - `WORKFLOW.md`
   - `Design.md` auth/mobile/navigation relevant kafla
   - `app/api/auth-mvp/request-code/route.ts`
   - `lib/auth/user-codes.ts`
   - `lib/auth/codes.ts`
   - `lib/auth/email.ts`
   - `sql/27_auth_email_codes.sql`
   - `sql/38_atomic_otp_verification.sql`
   - `sql/42_ip_rate_limit.sql`
   - auth tests: `lib/__tests__/otp-verification.test.ts`, `lib/__tests__/ip-rate-limit.test.ts`, `lib/__tests__/login-form.test.tsx`, `lib/__tests__/innskraning-page.test.tsx`

2. Búa til migration plan fyrir `sql/72_auth_email_code_request_idempotency.sql`.
   - Ekki keyra migration.
   - Idempotent SQL.
   - Transaction.
   - Explicit grants/revokes.
   - Rollback comment.

3. Útfæra RPC með per-email advisory transaction lock.
   - Skila JSON eða typed scalar fields sem TS getur túlkað.
   - Ekki skila sensitive values.

4. Uppfæra `createUserCode()`.
   - Bæta result type við, t.d.
     - `string`
     - `{ rateLimited: true; retryAfter: string }`
     - `{ recentActive: true }`
     - `null`
   - Halda hashing í TS.

5. Uppfæra `/api/auth-mvp/request-code`.
   - Timing logs.
   - `recentActive` skilar `{ success: true }` til client.
   - Ekki senda email þegar `recentActive`.
   - Halda generic response pattern.

6. Uppfæra `TeskeidLoginForm`.
   - in-flight ref guard.
   - betri delayed-feedback texti ef request tekur lengi.
   - samræma resend countdown við server dedupe window.
   - Allur texti í `messages/is.json` og `messages/en.json`.

7. Tests.
   - SQL static tests fyrir nýja RPC.
   - Unit tests fyrir `createUserCode()`:
     - inserted skilar plaintext code
     - recentActive skilar ekki plaintext code
     - rateLimited heldur retryAfter
     - RPC error skilar null
   - API tests fyrir request-code:
     - recentActive skilar success og kallar ekki `sendUserLoginCode`
     - inserted kallar `sendUserLoginCode`
     - email error skilar 500 eins og áður
   - UI tests ef til eru:
     - double submit kallar requestCode bara einu sinni í sama tab
     - delayed helper text birtist ekki strax en birtist eftir threshold

8. Keyra:
   - `npm run type-check`
   - viðeigandi targeted tests
   - ef breytingar snerta víða: `npm run test:run`

## Localhost checks for Stebbi

Ekki keyra SQL í production fyrr en Stebbi samþykkir migration sérstaklega.

Eftir að Claude Code hefur útfært og local DB/migration-state er rétt:

1. Opna `/innskraning` á localhost.
2. Slá inn netfang.
3. Smella einu sinni á `Áfram`.
4. Vænt:
   - hnappur fer í loading og ekki er hægt að tvísmella.
   - ef request tekur lengur en threshold birtist róleg skýring um að kóðinn geti tekið smá stund.
   - ekki verður til fjöldi kóða í DB vegna eins submit.
5. Á meðan beðið er, prófa refresh/app-switch/in-app-browser-líka hegðun eins og hægt er.
6. Prófa að smella `Senda aftur` strax þegar hann verður virkur.
7. Vænt:
   - innan server dedupe glugga verður ekki til nýr kóði.
   - eftir að gluggi líður má nýr kóði verða til.
8. Í Supabase local/prod-read-only athugun:

```sql
select created_at, expires_at, used_at, attempts
from public.auth_email_codes
where email = lower(trim('NETFANG_HER'))
order by created_at desc
limit 10;
```

9. Vænt eftir duplicate submit:
   - ekki margar raðir innan nokkurra sekúndna.
   - kóðinn sem barst er enn nýjasti virki kóðinn.
10. Slá inn kóðann.
11. Vænt:
   - login tekst.
   - `used_at` fyllist á einni röð.
   - attempts helst eðlilegt, helst 1 ef réttur kóði var sleginn inn fyrst.

## Production verification eftir deploy

Þetta þarf að gerast varlega og ekki með hráum netföngum í logs.

1. Stebbi biður um einn kóða í production.
2. Skoða Vercel logs fyrir timing summary:
   - `totalMs`
   - `createCodeMs`
   - `sendEmailMs`
   - `result`
3. Skoða read-only SQL fyrir eigið netfang.
4. Staðfesta að aðeins ein ný row varð til við eina innskráningartilraun.
5. Ef email delivery er enn 30-40 sek. en API svarar fljótt, þá er næsta mál Resend/domain/email deliverability, ekki OTP idempotency.

## Ekki gera í þessum áfanga

- Ekki innleiða password fallback í sama PR. Það er stærra TODO #46 atriði.
- Ekki breyta verify-RPC til að samþykkja eldri kóða.
- Ekki geyma plaintext kóða.
- Ekki keyra migration án sérstaks samþykkis.
- Ekki breyta Supabase Auth provider settings í sama áfanga.
- Ekki deploya án sérstakrar heimildar.

## Spurningar fyrir Codex review eftir Claude útfærslu

1. Er idempotency atomic gegn concurrent requestum?
2. Er dedupe glugginn samræmdur client resend countdown?
3. Getur nýja RPC óvart lekið upplýsingum um hvort netfang/kóði sé til?
4. Eru logs gagnleg án þess að geyma raw email eða kóða?
5. Veikir migration RLS/grants/function privileges?
6. Er cleanup úr hot path eða enn mögulegur latency bottleneck?
7. Eru tests að fanga simultaneous/retry hegðun, ekki bara happy path?

## Óvissa / þarf að staðfesta

- Við vitum enn ekki hvort 40 sek. tafan er Resend delivery, Vercel/serverless, Supabase latency eða in-app browser retry. Timing logs eiga að skera úr um það.
- Núverandi gögn sýna margar raðir í `auth_email_codes`, sem styður duplicate/retry skýringuna mjög sterkt.
- Ef Resend tók 40 sek. að skila email eftir að API svaraði hratt, þarf sérstakt deliverability mál.
