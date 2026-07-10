# Claude handoff: TODO #46 v002 - v001 done, prerelease

Created: 2026-07-10 13:40
Timezone: Atlantic/Reykjavik
Tengist: TODO #46, v001

## Staða

Allar breytingar gerðar, type-check og tests pass. **Ekki committað eða pushað** - bíður localhost-staðfestingar og svo SQL-leyfi frá Stebba.

```
npm run type-check  ->  clean
npm run test:run    ->  2020 passed, 0 failed
```

---

## Yfirlit breytinga

### SQL migration (EKKI keyrð - bíður leyfi)

**Skrá:** `sql/72_auth_email_code_request_idempotency.sql`

Nýtt RPC `create_user_otp_code_if_allowed`:

- Tekur per-email advisory transaction lock (`pg_advisory_xact_lock`) til að koma í veg fyrir race condition þegar tveir requestar berast samtímis
- Athugar hvort ónotaður, óútrunninn kóði sé til innan 120 sekúndna (dedupe gluggi)
- Ef til: skilar `{"status":"recent_active"}` - enginn nýr kóði búinn til
- Ef ekki: athugar hourly rate limit, insertar nýjan kóða, skilar `{"status":"inserted"}`
- Ef rate limit: skilar `{"status":"rate_limited","retry_after":"..."}` með ISO timestamp
- Bounded cleanup: eyðir að hámarki 100 gamlar raðir (>24h) per kall
- Engar viðkvæmar upplýsingar (email, code_hash, plaintext kóði) í skilagildinu

Permissions: service_role only, eins og sql/38 og sql/42.

### lib/auth/user-codes.ts

- **Fjarlægt:** multi-step cleanup delete + rate limit SELECT + INSERT (4 aðskilin DB köll)
- **Bætt við:** `DEDUPE_WINDOW_SECONDS = 120`
- **Bætt við:** `{ recentActive: true }` í `CreateCodeResult` type
- **Breytt:** `createUserCode()` kallar núna eitt RPC í stað fjögurra DB-kalla
- Hashing (HMAC) er enn í app layer - fer aldrei í Postgres í plaintext
- `verifyUserCode()` er óbreytt

### app/api/auth-mvp/request-code/route.ts

- **Bætt við** structured timing logs (JSON, engar PII):
  - `result`: `created_and_sent` | `recent_active_suppressed` | `rate_limited` | `ip_rate_limited` | `db_error` | `email_error`
  - `ipRateLimitMs`, `createCodeMs`, `sendEmailMs`, `totalMs`
- **Bætt við:** `recentActive` handling - skilar `{ success: true }` án þess að senda email
- **Breytt:** `sendUserLoginCode` er nú í eigin try-catch til að gefa nákvæmt `sendEmailMs` timing
- Ekkert netfang, kóði eða hash í logs

### components/teskeid/TeskeidLoginForm.tsx

- **Breytt:** `RESEND_COOLDOWN = 60` -> `120` (samræmt við DEDUPE_WINDOW_SECONDS)
- **Bætt við:** `requestInFlight` ref guard - kemur í veg fyrir tvöfalt submit í sama tab
- **Bætt við:** `slowEmailHint` sem birtist eftir 8 sekúndur meðan beðið er
- **Bætt við:** `requestInFlight` guard í `handleResend` líka
- Resend er nú líka varið af in-flight guard

### messages/is.json + messages/en.json

- Bætt við `teskeid.auth.slowEmailHint`:
  - IS: `"Kóðinn getur tekið smá stund að berast. Ekki biðja um nýjan kóða strax."`
  - EN: `"The code may take a moment to arrive. Do not request a new code yet."`

### lib/__tests__/user-codes.test.ts (ný skrá)

31 nýjar prófanir:
- `createUserCode` return paths: inserted, recent_active, rate_limited, null (RPC error), null (unexpected status), null (AUTH_CODE_SECRET absent)
- Privacy: p_code_hash er 64-stafa hex, secret fer ekki í RPC args, error logs innihalda ekki email eða DB detail
- Static contract fyrir sql/72: function name, SECURITY INVOKER, search_path, advisory lock, dedupe check, rate limit, INSERT, INSERT staða, REVOKE/GRANT, transaction wrap

---

## Mikilvægt: SQL keyrsla

**SQL migration 72 þarf að keyra ÁÐUR EN kóðinn er deployaður.**

Ef kóðinn er deployaður án SQL: `create_user_otp_code_if_allowed` RPC er ekki til, `createUserCode()` fær RPC error, skilar `null`, route skilar 500. Innskráning virkar ekki.

Stebbi: Þegar þú ert tilbúinn, keyrðu:

```sql
-- Keyra í Supabase SQL Editor (production)
-- Skrá: sql/72_auth_email_code_request_idempotency.sql
-- Staðfestu að output sé: "Success. No rows returned."
```

Svo: commit + push, bíða eftir Vercel deploy, staðfesta.

---

## Localhost checks fyrir Stebbi

**Krafist: SQL migration 72 keyrð á local DB fyrst.**

Opna `/innskraning` (eða `/auth-mvp/vedrid` ef þörf).

### 1. In-flight guard

1. Sláðu inn netfang og ýttu á `Áfram`.
2. Ýttu strax aftur á `Áfram` (ef þú nærð).
3. Vænt: aðeins einn request fer í veg. Aðeins ein röð verður til í `auth_email_codes`.

### 2. Slow email hint

1. Sláðu inn netfang og ýttu á `Áfram`.
2. Bíddu 8-10 sekúndur (ef Supabase/Resend svara hraðar en 8 sek. sérðu þetta ekki).
3. Vænt: rólegt texti birtist: `"Kóðinn getur tekið smá stund að berast. Ekki biðja um nýjan kóða strax."`
4. Þegar request lýkur: texti hverfur.

### 3. Resend cooldown

1. Kláraðu email-step.
2. Á code-step: Resend-hnappurinn er óvirkur í 120 sekúndur (var 60).
3. Þegar hann verður virkur: ýttu á hann.
4. Athugaðu `auth_email_codes` í Supabase - **ekki á að verða til ný röð** ef < 120 sek. líður.
5. Eftir 120 sek: ný röð verður til og nýtt email er sent.

### 4. Timing logs

Í terminal/Vercel logs eftir request:

```
[auth-mvp/request-code] {"result":"created_and_sent","ipRateLimitMs":5,"createCodeMs":120,"sendEmailMs":800,"totalMs":925}
```

Þetta sýnir hvar tafirnar eru (DB vs email sending).

### 5. Duplicate submit próf (SQL staðfesting)

Á meðan request er í gangi (notaðu slow network eða DevTools throttle):

```sql
select created_at, expires_at, used_at, attempts
from public.auth_email_codes
where email = lower(trim('NETFANG_HER'))
order by created_at desc
limit 5;
```

Vænt: aðeins ein ný röð eftir eitt submit.

---

## Eftir localhost-staðfestingu

1. Stebbi gefur leyfi til SQL migration 72 í production.
2. Stebbi gefur leyfi til commit + push.
3. Bídið eftir Vercel deploy.
4. Staðfestið með timing logs í Vercel eins og lýst er hér að ofan.

---

## Edge cases sem eru þekkt

**Email sending failar eftir INSERT:**
- Kóðinn er í DB en email fór ekki. Route skilar 500.
- Notandi reynir aftur innan 120 sek: `recent_active` - engin email send.
- Notandi þarf að bíða út dedupe gluggann (120 sek.) og svo virkar "Senda aftur".
- Þetta er tekin ákvörðun í v001: frekari handling (t.d. email-sent flag í DB) er stærri breyting.

**Tveir requestar samtímis (race condition):**
- Advisory lock í PostgreSQL tryggir að aðeins einn þeirra fái `inserted`.
- Hinn fær `recent_active` og engin duplicate row verður til.
- Þetta er trygging á DB-lagi, ekki bara TS - mocked tests geta ekki prófað þetta; þarf live DB.
